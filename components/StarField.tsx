'use client';

/**
 * 首屏背景的星点层（canvas）。
 *
 * 【它在做什么】一片缓慢漂移、各自呼吸明灭的点；鼠标靠近时把附近的点推开并带一点旋涡，
 * 移开后靠阻尼自己收回去。中心亮、四周暗（vignette），所以它天然把注意力让给中间的头像和名字。
 *
 * 【从参考站搬来，但改了四处，都是为这台机器和这群访客】
 * 1. 点数 220 / 80（它默认 1500 / 250，首屏传 300 / 75）。点数是这一层唯一的持续开销，
 *    低端安卓上 1500 个点每帧 fill 会直接吃掉主线程。
 * 2. 颜色不再是写死的白 / #1e1e1e，而是本站 --foreground 令牌换算来的同色系值，
 *    深浅色各自一档，和地球、光晕层同一套语言。
 * 3. 鼠标交互只在真鼠标设备上启用（matchMedia pointer:fine）—— 触屏没有 hover，
 *    绑 pointermove 只会在滚动时白烧 CPU。
 * 4. 系统要求「减少动态效果」时**画一帧静态星点就停**，不是整层不渲染。
 *    这一层是氛围，不是信息，但也不该在减动效下变成一片空白。
 */

import { useEffect, useRef } from 'react';

interface Dot {
  x: number;
  y: number;
  baseVx: number;
  baseVy: number;
  pushVx: number;
  pushVy: number;
  radius: number;
  baseOpacity: number;
  phase: number;
  pulseSpeed: number;
}

/** 与 app/globals.css 里 --foreground 对应的 rgb：dark 210 40% 96% / light 222 47% 13% */
const DOT_RGB = { dark: '245, 247, 250', light: '18, 35, 58' };

const MOUSE_RADIUS = 150;
const MOUSE_FORCE = 0.3;

export default function StarField({
  desktopDots = 220,
  mobileDots = 80,
}: {
  desktopDots?: number;
  mobileDots?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTime = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let dots: Dot[] = [];

    const count = () => (window.innerWidth < 768 ? mobileDots : desktopDots);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      dots = [];
      for (let i = 0; i < count(); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.26;
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseVx: Math.cos(angle) * speed,
          baseVy: Math.sin(angle) * speed,
          pushVx: 0,
          pushVy: 0,
          radius: 0.5 + Math.random() * 0.6,
          baseOpacity: 0.45 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.0008 + Math.random() * 0.0015,
        });
      }
    };

    const paint = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;

      const isDark = root.classList.contains('dark');
      const rgb = isDark ? DOT_RGB.dark : DOT_RGB.light;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      for (const dot of dots) {
        if (!reduceMotion) {
          const dmx = dot.x - mouseX;
          const dmy = dot.y - mouseY;
          const distSq = dmx * dmx + dmy * dmy;
          if (distSq < MOUSE_RADIUS * MOUSE_RADIUS && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const falloff = 1 - dist / MOUSE_RADIUS;
            const force = MOUSE_FORCE * falloff * falloff;
            const nx = dmx / dist;
            const ny = dmy / dist;
            // 推开 + 一点点切向分量，看起来才像被"搅动"而不是被"顶开"
            dot.pushVx += (nx * force + ny * force * 0.3) * (dt / 16);
            dot.pushVy += (ny * force - nx * force * 0.3) * (dt / 16);
          }
          dot.pushVx *= 0.97;
          dot.pushVy *= 0.97;
          dot.x += (dot.baseVx + dot.pushVx) * (dt / 16);
          dot.y += (dot.baseVy + dot.pushVy) * (dt / 16);
          if (dot.x < -20) dot.x = width + 20;
          if (dot.x > width + 20) dot.x = -20;
          if (dot.y < -20) dot.y = height + 20;
          if (dot.y > height + 20) dot.y = -20;
          dot.phase += dot.pulseSpeed * dt;
        }

        const pulse = (Math.sin(dot.phase) + 1) / 2;
        const opacity = dot.baseOpacity * (0.3 + pulse * 0.7);
        const dx = (dot.x - cx) / (width / 2);
        const dy = (dot.y - cy) / (height / 2);
        const vignette = Math.max(0, 1 - (dx * dx + dy * dy) * 0.7);

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${opacity * vignette * (isDark ? 0.7 : 1)})`;
        ctx.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(paint);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
        mouseX = -9999;
        mouseY = -9999;
      }
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      const lastWidth = window.innerWidth;
      resizeTimer = setTimeout(() => {
        const changed = window.innerWidth !== lastWidth;
        resize();
        // 只有宽度真的变了才重新洗牌：手机上地址栏收起也会触发 resize，
        // 但那只改高度，重洗会让整片星点突然跳一下
        if (changed) init();
      }, 200);
    };

    resize();
    init();
    // 减动效下也画一帧：静态星点，只是不动
    paint(performance.now());

    window.addEventListener('resize', onResize);
    if (finePointer && !reduceMotion) window.addEventListener('mousemove', onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
    };
  }, [desktopDots, mobileDots]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
