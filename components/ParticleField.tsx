'use client';

/**
 * 全站的星尘背景层（canvas）—— 2026-10-05 从「粒子连线网」改成「星尘」。
 *
 * 【为什么换掉连线】原版是「点 + 互相靠近就连线」的一张网。它是十年前科技风的标配，
 * 一眼就把页面拉回「模板感」；而且它铺满整站、在深色底上非常显眼，
 * 和「锦创AI」想给人的印象（安静、有品味）是反的。
 * 现在只留点：更小、更暗、带一点点色相变化、各自有明暗呼吸。
 * 读起来是「深空里的尘埃」，不再是「一张网」。
 *
 * 【为什么保留鼠标推开】星尘也需要「手伸进去有反应」，
 * 只是力度比原来低（没有连线，推得太猛会显得整片在抖）。
 * 推开的结果是光标周围出现一小块「被拨开的空处」，很轻，但确实在动。
 *
 * 【画在 layout 而不是某个 section 里】它挂在整个视口的 fixed 层上、内容包在 z-10 里，
 * 所以滚到哪儿都在。这一层自己不填背景色，底色由 globals.css 的 --background 提供：
 * canvas 保持透明，将来换底色只改令牌一处，不用动这里的代码。
 *
 * 【几个实现上的取舍】
 * · 绝对定位铺满 + pointer-events-none：不挡任何点击。
 * · 碰边界反弹而不是穿墙从对面冒出来：反弹要把速度取反并把位置夹回边界内，
 *   只改速度不夹位置的话点会粘在边上抖。
 * · resize 时重设尺寸并重新初始化。
 * · 卸载时清掉 requestAnimationFrame 和所有监听，否则路由切换会留下幽灵循环。
 * · devicePixelRatio 上限压到 2：3 倍屏多出的那一倍像素是 2.25 倍的填充量，肉眼看不出差别。
 *
 * 【两条为这台机器和这群访客定的约束】
 * 1. 系统要求「减少动效」时画一帧静态星尘就停 —— 不是整层不渲染，
 *    否则减动效下背景变成一片空。
 * 2. 鼠标推开只在真鼠标设备上绑（pointer: fine）。触屏没有 hover，
 *    绑 pointermove 只会在滚动时白烧 CPU。
 *
 * 【闪烁为什么放在这里而不是 CSS】每颗星有自己的相位，属于「逐元素随机」，
 * CSS 做不了（要么写 N 条 keyframes，要么逐点注入 CSS 变量）。
 * 在 canvas 里就是 sin(time + phase) 一个乘数，零额外成本。
 */

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  /** 自己的漂移速度（px / 60fps 帧） */
  vx: number;
  vy: number;
  /** 鼠标推出来的额外速度，靠阻尼自己收回去 */
  pushVx: number;
  pushVy: number;
  r: number;
  /** 色相索引，指向 PALETTE 里那三个颜色之一（0/1/2） */
  tone: number;
  /** 明暗呼吸的相位（弧度），让每颗星不同步 */
  phase: number;
  /** 明暗呼吸的速度（每毫秒的弧度增量） */
  twinkle: number;
  /** 属于哪一层景深：0 远 / 1 中 / 2 近。见下面的 LAYERS */
  layer: number;
}

/**
 * 星尘的三支色相，跟着主题的 .dark 类切。
 *
 * 【为什么是三支而不是一支】原来整层只有一种冷蓝，铺满全屏之后就是「一层蓝灰噪点」。
 * 三支（蓝 / 紫 / 青）取自站点既有的装饰色板（--tint-sky / --tint-violet / --tint-teal 的同族色值），
 * 每颗星随机分配 —— 远看仍是一层冷色星尘，近看才有颜色的层次。
 *
 * 【亮色档要深一档】浅色底上白点是看不见的，所以亮色档整体往深走、透明度也压低，
 * 否则浅色主题下会变成一层脏点。
 */
const PALETTE: { dark: string[]; light: string[] } = {
  dark: ['130, 170, 250', '168, 142, 250', '108, 208, 216'],
  light: ['56, 96, 180', '112, 74, 190', '34, 138, 148'],
};

/**
 * 星尘的基础不透明度（再乘上每颗星自己的呼吸系数）。
 *
 * 【为什么比想象中要亮】星点半径只有 1~2px，又一直在明暗呼吸（最低只剩 35%），
 * 第一版取 0.62 时实测截图里几乎找不到星星 —— 小面积 + 低亮度 + 呼吸低谷三重衰减。
 * 提到 0.9 之后，峰值够亮、低谷也还剩三成，整片才读得出「星尘」。
 * 浅色底压到 0.5：白底上同样的透明度会显脏。
 */
const BASE_ALPHA: { dark: number; light: number } = { dark: 0.9, light: 0.5 };

/**
 * 星星的三层景深（2026-10-05 新增）。
 *
 * 【为什么必须分层】第一版所有星一个尺寸、一个亮度，铺满全屏之后是**均匀的噪点** ——
 * 实测截图给用户的观感是「很一般」。真实星空是**有景深**的：远处一大片极小的暗点，
 * 近处几颗又大又亮、还带光晕。有了疏密与大小差，眼睛才会把它读成「星空」，
 * 而不是「背景有点颗粒」。
 *
 * share   —— 占总数量的比例（三层加起来 = 1）
 * rMin/rMax —— 半径范围（px）
 * alpha   —— 这一层的基础亮度系数（再乘 BASE_ALPHA 和每颗星自己的呼吸）
 * speed   —— 这一层的漂移速度系数（越近的星动得越快，这是「视差」的来源）
 */
const LAYERS = [
  { share: 0.72, rMin: 0.5, rMax: 1.0, alpha: 0.38, speed: 0.5 },
  { share: 0.22, rMin: 1.0, rMax: 1.9, alpha: 0.72, speed: 1.0 },
  { share: 0.06, rMin: 1.9, rMax: 3.0, alpha: 1.0, speed: 1.8 },
];

const MOUSE_RADIUS = 130;      // 鼠标影响半径
const MOUSE_FORCE = 0.3;       // 推开力度（比连线版低：没有线可断，推太猛整片会抖）
const PUSH_DAMP = 0.94;        // 推出来的速度每帧衰减一点，手一走开就自己收回
const MAX_SPEED = 0.34;        // 漂移速度上限，超过就看着像虫子爬而不是漂浮

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
    let dots: Star[] = [];

    const count = () => (window.innerWidth < 768 ? mobileDots : desktopDots);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** 重新撒星：resize 之后按新尺寸再来一遍 */
    const init = () => {
      dots = [];
      const total = count();
      /* 先把总数按 share 切成三层，再逐层撒点 ——
         不能「每颗星随机挑一层」：那样每层实际数量会抖动，近处偶尔一次冒出二十颗，
         看着像画面脏了。按配额切，层次才稳定。 */
      const quotas = LAYERS.map((l) => Math.round(total * l.share));
      LAYERS.forEach((layer, li) => {
        for (let i = 0; i < quotas[li]; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (0.05 + Math.random() * 0.22) * layer.speed;
          dots.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.cos(angle) * Math.min(speed, MAX_SPEED),
            vy: Math.sin(angle) * Math.min(speed, MAX_SPEED),
            pushVx: 0,
            pushVy: 0,
            r: layer.rMin + Math.random() * (layer.rMax - layer.rMin),
            tone: Math.floor(Math.random() * 3),
            phase: Math.random() * Math.PI * 2,
            // 0.0006~0.0018 弧度/ms → 一轮明暗约 3.5~10 秒，慢到不会抢注意力
            twinkle: 0.0006 + Math.random() * 0.0012,
            layer: li,
          });
        }
      });
    };

    const step = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const k = dt / 16;                       // 把位移折算到「每 60fps 一帧」的口径
      // 每帧读一次主题类：切深浅色时不用重挂组件，颜色下一帧就跟着换
      const dark = root.classList.contains('dark');
      const pal = dark ? PALETTE.dark : PALETTE.light;
      const base = dark ? BASE_ALPHA.dark : BASE_ALPHA.light;

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

      for (const p of dots) {
        // 明暗呼吸：在基础亮度的 40%~100% 之间来回。每颗星相位不同，
        // 所以整片不会「一起亮一下」——那会变成一次集体的闪烁，很假。
        const breath = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * p.twinkle + p.phase));
        const a = base * LAYERS[p.layer].alpha * breath;
        const rgb = pal[p.tone];

        /* 近处的星先铺一圈大而淡的光晕，再画星点本体 ——
           读起来才是「这颗星在发亮」，而不是「这里有个白点」。
           用两层实心圆模拟光晕而不是 createRadialGradient：每帧给十几颗星
           各建一个渐变对象不划算，两层圆的观感已经够。 */
        if (p.layer === 2) {
          ctx.fillStyle = `rgba(${rgb}, ${(a * 0.2).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3.6, 0, Math.PI * 2);
          ctx.fill();

          /* 十字星芒。真实夜空里的亮星是「带芒」的 —— 这一笔是整片星空
             「一眼看出是星空」而不是「一些白点」的关键。
             只给最近这一层画，而且画得很淡（0.3）：铺满屏的十字线会很吵。 */
          const len = p.r * 6;
          ctx.strokeStyle = `rgba(${rgb}, ${(a * 0.3).toFixed(3)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x - len, p.y);
          ctx.lineTo(p.x + len, p.y);
          ctx.moveTo(p.x, p.y - len);
          ctx.lineTo(p.x, p.y + len);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${rgb}, ${a.toFixed(3)})`;
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
      // 出界就当「鼠标离开了」—— 不判这一步的话，鼠标划到页面边上时
      // 那一小块被拨开的空处会一直留在原地不收回
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
       * 但它只改高度。不加这道判断的话，手机上随便滚一下整片星尘就重撒一次 ——
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
    // 减动效下也画一帧：静态的一片星尘，只是不动
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
