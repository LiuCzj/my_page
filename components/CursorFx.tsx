'use client';

/** 全站鼠标层：拖尾 + 十字准线。 */

import { useEffect, useRef } from 'react';

const TAIL_LIFE = 300;          // 每个点多活 0.3 秒：短，甩起来是一条利落的线而不是一摊
const MAX_POINTS = 260;
const CORE_MAX = 3.6;           // 最粗处（靠头）的半宽
const HALO_MAX = 7.2;           // 外晕的半宽
/** 两套颜色，跟主题的 .dark 类切。 */
const PAL = {
  dark: {
    halo: 'rgba(130, 170, 250, 0.16)',
    core: 'rgba(130, 170, 250, 0.5)',
    cross: 'rgba(130, 170, 250, 0.22)',
    glow: 'rgba(130, 170, 250, 0.28)',
    head: 'rgba(196, 218, 255, 0.95)',
  },
  light: {
    halo: 'rgba(56, 96, 180, 0.14)',
    core: 'rgba(56, 96, 180, 0.45)',
    cross: 'rgba(56, 96, 180, 0.2)',
    glow: 'rgba(56, 96, 180, 0.22)',
    head: 'rgba(24, 72, 160, 0.95)',
  },
};

export default function CursorFx() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduce) return;         // 开关见文件头第 1、2 条

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, raf = 0;
    let mx = -9999, my = -9999, live = false;
    const pts: { x: number; y: number; t: number; v: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const px = mx, py = my;
      mx = e.clientX; my = e.clientY;
      live = true;
      if (px < -5000) return;
      // 一次事件可能跨几十像素，中间补几个点，尾巴才是曲线而不是折线
      const d = Math.hypot(mx - px, my - py);
      const steps = Math.min(6, Math.max(1, Math.round(d / 10)));
      const now = performance.now();
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        pts.push({ x: px + (mx - px) * k, y: py + (my - py) * k, t: now, v: d });
      }
      if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
    };

    /** 这一帧的「现在」。ribbon 要知道每个点多老，所以得先于 ribbon 声明 */
    let refT = 0;

    /** 把点串放大成左右两条边再填成一张闭合多边形 */
    function ribbon(n: number, scale: number, style: string) {
      ctx!.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[Math.min(i + 1, n - 1)], r = pts[Math.max(i - 1, 0)];
        let dx = q.x - r.x, dy = q.y - r.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const age = (refT - p.t) / TAIL_LIFE;
        const k = 1 - Math.min(1, Math.max(0, age));
        const vv = 0.4 + Math.min(p.v, 40) / 40 * 0.6;   // 快的时候粗一点，慢下来收细
        const wd = (0.35 + k * k * scale) * vv;
        const lx = p.x - dy * wd, ly = p.y + dx * wd;
        if (i === 0) ctx!.moveTo(lx, ly); else ctx!.lineTo(lx, ly);
      }
      for (let i = n - 1; i >= 0; i--) {
        const p = pts[i];
        const q = pts[Math.min(i + 1, n - 1)], r = pts[Math.max(i - 1, 0)];
        let dx = q.x - r.x, dy = q.y - r.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const age = (refT - p.t) / TAIL_LIFE;
        const k = 1 - Math.min(1, Math.max(0, age));
        const vv = 0.4 + Math.min(p.v, 40) / 40 * 0.6;
        const wd = (0.35 + k * k * scale) * vv;
        ctx!.lineTo(p.x + dy * wd, p.y - dx * wd);
      }
      ctx!.closePath();
      ctx!.fillStyle = style;
      ctx!.fill();
    }

    const frame = (now: number) => {
      refT = now;
      ctx!.clearRect(0, 0, w, h);

      if (live && mx > -5000) {
        while (pts.length && now - pts[0].t > TAIL_LIFE) pts.shift();
        const pal = document.documentElement.classList.contains('dark') ? PAL.dark : PAL.light;

        // 十字准线：两条 1px，很淡，跟着鼠标走
        ctx!.strokeStyle = pal.cross;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(0, Math.round(my) + 0.5); ctx!.lineTo(w, Math.round(my) + 0.5);
        ctx!.moveTo(Math.round(mx) + 0.5, 0); ctx!.lineTo(Math.round(mx) + 0.5, h);
        ctx!.stroke();

        if (pts.length > 3) {
          ribbon(pts.length, HALO_MAX, pal.halo);   // 外晕
          ribbon(pts.length, CORE_MAX, pal.core);   // 内芯
        }

        // 头：一小圈光 + 一个实心点
        const g = ctx!.createRadialGradient(mx, my, 0, mx, my, 16);
        g.addColorStop(0, pal.glow);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx!.fillStyle = g;
        ctx!.beginPath(); ctx!.arc(mx, my, 16, 0, Math.PI * 2); ctx!.fill();
        ctx!.fillStyle = pal.head;
        ctx!.beginPath(); ctx!.arc(mx, my, 2.1, 0, Math.PI * 2); ctx!.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onLeave = () => { live = false; mx = -9999; my = -9999; };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  );
}
