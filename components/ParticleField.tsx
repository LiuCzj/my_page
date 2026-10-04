'use client';

/**
 * 全站的粒子连线背景层（canvas）——一张会动的网：
 * 点缓慢漂浮，互相靠近到一定距离就连线；鼠标伸进去把附近的点推开，
 * 被推开那片区域的连线变成白色，其余保持紫色 —— 手一走开就自己恢复。
 *
 * 【为什么画在 layout 而不是某个 section 里】
 * 它挂在整个视口的 fixed 层上、内容包在 z-10 里，所以滚到哪儿都在。
 * 这一层自己不填背景色，底色由 globals.css 的 --background 提供：
 * canvas 保持透明，将来换底色只改令牌一处，不用动这里的代码。
 *
 * 【几个实现上的取舍】
 * · 绝对定位铺满 + pointer-events-none：不挡任何点击。
 * · 碰边界反弹而不是穿墙从对面冒出来：反弹要把速度取反并把位置夹回边界内，
 *   只改速度不夹位置的话点会粘在边上抖。
 * · 连线距离按画布面积折算，宽屏点多、手机点少，固定一个距离值会让手机屏幕上
 *   要么全是线要么一根没有。
 * · resize 时重设尺寸并重新初始化粒子。
 * · 卸载时清掉 requestAnimationFrame 和所有监听，否则路由切换会留下幽灵循环。
 * · devicePixelRatio 让线条和点在高分屏上不糊，上限压到 2：
 *   3 倍屏多出的那一倍像素是 2.25 倍的填充量，肉眼看不出差别。
 *
 * 【两条为这台机器和这群访客定的约束】
 * 1. 系统要求「减少动效」时画一帧静态网就停 —— 不是整层不渲染，
 *    否则减动效下背景变成一片空。
 * 2. 鼠标推开只在真鼠标设备上绑（pointer: fine）。触屏没有 hover，
 *    绑 pointermove 只会在滚动时白烧 CPU。
 */

import { useEffect, useRef } from 'react';

interface Dot {
  x: number;
  y: number;
  /** 自己的漂移速度（px / 60fps 帧） */
  vx: number;
  vy: number;
  /** 鼠标推出来的额外速度，靠阻尼自己收回去 */
  pushVx: number;
  pushVy: number;
  r: number;
}

/**
 * 两套配色，跟着主题的 .dark 类切。
 *
 * 【2026-10-04 双色分工后改色】原来是紫，现在换成冷蓝灰 ——
 * 让紫回到品牌标识那两处（logo 的「AI」、首屏名字）；
 * 粒子网是铺满全屏的大面积层，它一紫整页就「一片紫」，
 * 所以改走交互蓝的冷色族。键名 line 就是普通连线（原 purple）。
 * 亮色档要比暗色档深一档：浅色点画在近白底上几乎看不见，
 * 而「鼠标附近变亮」那几根线在亮色档下必须往深走 —— 否则白画在白纸上。
 */
const PALETTE = {
  dark: { dot: 'rgba(130, 170, 250, 0.7)', line: '135, 170, 240', near: '255, 255, 255', nearBoost: 1.5 },
  light: { dot: 'rgba(56, 96, 180, 0.55)', line: '96, 130, 200', near: '18, 40, 90', nearBoost: 1.6 },
};
/** 用法：rgba(135, 170, 240, 透明度) —— 透明度每根线按距离算 */

const MOUSE_RADIUS = 150;      // 鼠标影响半径
const MOUSE_FORCE = 0.55;      // 推开力度
const PUSH_DAMP = 0.94;        // 推出来的速度每帧衰减一点，手一走开就自己收回
const LINK_BASE = 128;         // 基准连线距离（按面积折算，见 linkDistance）
const MAX_SPEED = 0.55;        // 漂移速度上限，超过就看着像虫子爬而不是漂浮

export default function ParticleField({
  desktopDots = 92,
  mobileDots = 40,
  className = 'pointer-events-none absolute inset-0 h-full w-full',
}: {
  desktopDots?: number;
  mobileDots?: number;
  /**
   * 定位方式由外面给。它现在铺的是**整站**（fixed 一整屏、在内容之下），
   * 保留这个参数是因为组件内部量尺寸用的是 offsetWidth/Height，
   * absolute（跟着某个 section）和 fixed（跟着视口）都能量对，不用改代码。
   */
  className?: string;
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
    let lastTime = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    /** 鼠标在画布内的坐标；-9999 表示「不在这里」（离开窗口后走这个值） */
    let mouseX = -9999;
    let mouseY = -9999;
    let dots: Dot[] = [];

    const count = () => (window.innerWidth < 768 ? mobileDots : desktopDots);

    /**
     * 连线距离按面积开方折算。
     * 固定值不行：同一根 128px 的线，在手机上占半屏、在宽屏上只占一个点，
     * 于是手机要么糊成一团要么根本连不起来。
     */
    const linkDistance = () => {
      const areaScale = Math.sqrt((width * height) / (1440 * 620));
      return LINK_BASE * Math.max(0.62, Math.min(1.25, areaScale));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** 重新撒点：resize 之后按新尺寸算一遍密度，再来一遍 */
    const init = () => {
      dots = [];
      for (let i = 0; i < count(); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.08 + Math.random() * 0.3;
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * Math.min(speed, MAX_SPEED),
          vy: Math.sin(angle) * Math.min(speed, MAX_SPEED),
          pushVx: 0,
          pushVy: 0,
          r: 1 + Math.random() * 1.4,
        });
      }
    };

    const step = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const k = dt / 16;                       // 把位移折算到「每 60fps 一帧」的口径
      const link = linkDistance();
      const linkSq = link * link;
      // 每帧读一次主题类：切深浅色时不用重挂组件，颜色下一帧就跟着换
      const pal = root.classList.contains('dark') ? PALETTE.dark : PALETTE.light;

      /* ── 1. 推进 ─────────────────────────────────────── */
      for (const p of dots) {
        // 鼠标推开：越近越用力，还带一点点切向分量，看着像被拨开而不是被顶开
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dSq = dx * dx + dy * dy;
        if (dSq < MOUSE_RADIUS * MOUSE_RADIUS && dSq > 0.01) {
          const d = Math.sqrt(dSq);
          const falloff = 1 - d / MOUSE_RADIUS;
          const force = MOUSE_FORCE * falloff * falloff;
          const nx = dx / d;
          const ny = dy / d;
          p.pushVx += (nx * force + ny * force * 0.35) * k;
          p.pushVy += (ny * force - nx * force * 0.35) * k;
        }
        p.pushVx *= PUSH_DAMP;
        p.pushVy *= PUSH_DAMP;

        p.x += (p.vx + p.pushVx) * k;
        p.y += (p.vy + p.pushVy) * k;

        // 碰边反弹：速度取反，并把位置夹回边界内 ——
        // 不夹的话下一帧它还在外面，会反复取反粘在边上抖
        if (p.x <= p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
        else if (p.x >= width - p.r) { p.x = width - p.r; p.vx = -Math.abs(p.vx); }
        if (p.y <= p.r) { p.y = p.r; p.vy = Math.abs(p.vy); }
        else if (p.y >= height - p.r) { p.y = height - p.r; p.vy = -Math.abs(p.vy); }
      }

      /* ── 2. 画 ───────────────────────────────────────── */
      ctx.clearRect(0, 0, width, height);

      // 连线先画，点压在上面，交点才干净
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > linkSq) continue;

          const d = Math.sqrt(dSq);
          const alpha = (1 - d / link) * 0.5;

          // 这根线是不是「在鼠标附近」：两个端点任意一个进了半径就算
          const aMx = a.x - mouseX, aMy = a.y - mouseY;
          const bMx = b.x - mouseX, bMy = b.y - mouseY;
          const near =
            aMx * aMx + aMy * aMy < MOUSE_RADIUS * MOUSE_RADIUS ||
            bMx * bMx + bMy * bMy < MOUSE_RADIUS * MOUSE_RADIUS;

          ctx.strokeStyle = `rgba(${near ? pal.near : pal.line}, ${near ? alpha * pal.nearBoost : alpha})`;
          ctx.lineWidth = near ? 0.9 : 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = pal.dot;
      for (const p of dots) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(step);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      // 出界就当「鼠标离开了」，连线立刻恢复全紫 —— 不判这一步的话
      // 鼠标划到页面边上时，那根白线会一直白着不收回
      if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
        mouseX = -9999;
        mouseY = -9999;
      }
    };

    const onLeave = () => { mouseX = -9999; mouseY = -9999; };

    const onResize = () => {
      clearTimeout(resizeTimer);
      /**
       * 【为什么要记住旧宽度】手机上下滚动会让地址栏收起/展开，那也会触发 resize，
       * 但它只改高度。不加这道判断的话，手机上随便滚一下整张网就重撒一次 ——
       * 所有点瞬间跳位，看起来像页面坏了。只有宽度真变了才重新初始化。
       */
      const lastWidth = window.innerWidth;
      resizeTimer = setTimeout(() => {
        resize();
        if (window.innerWidth !== lastWidth) init();
      }, 180);
    };

    resize();
    init();
    // 减动效下也画一帧：静态的一张网，只是不动
    step(performance.now());

    window.addEventListener('resize', onResize);
    if (finePointer && !reduceMotion) {
      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mouseleave', onLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [desktopDots, mobileDots]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
    />
  );
}
