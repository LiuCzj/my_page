'use client';

/** 点阵地球（cobe / WebGL）+ 第二张 overlay canvas 画「站在邵阳的小人」。 */

import createGlobe from 'cobe';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/** [纬度, 经度]，单位「度」，北纬/东经为正 */
export type LatLng = [number, number];

interface DottedGlobeProps {
  coordinates: LatLng;
  /** 尺寸由外层 class 决定（本组件自带 aspect-square） */
  className?: string;
}

/** 两套调色板。 */
const PALETTE = {
  light: {
    dark: 1,
    baseColor: [0.36, 0.88, 0.58] as [number, number, number],
    glowColor: [0.55, 0.78, 1] as [number, number, number],
    markerColor: [0.08, 0.357, 0.72] as [number, number, number],
    dot: 'rgb(21, 99, 184)',
  },
  dark: {
    dark: 1,
    baseColor: [0.36, 0.88, 0.58] as [number, number, number],
    glowColor: [0.45, 0.72, 1] as [number, number, number],
    markerColor: [0.44, 0.71, 0.98] as [number, number, number],
    dot: 'rgb(113, 181, 250)',
  },
};

/** 海洋底衬：深蓝径向渐变 + 球面明暗 + 大气外发光。 */
const OCEAN: Record<'light' | 'dark', string> = {
  light: 'radial-gradient(circle at 32% 26%, #2f7fd6 0%, #1a549f 36%, #0c2c60 68%, #051331 100%)',
  dark: 'radial-gradient(circle at 32% 26%, #1d4f9c 0%, #123a7a 34%, #0a2450 62%, #04122c 100%)',
};

/** 球面明暗与外发光。inset 阴影压出右下暗面（昼夜分界），外发光当大气层 */
const OCEAN_SHADOW =
  'inset -24px -18px 36px rgba(2, 8, 23, 0.62), inset 10px 8px 24px rgba(186, 230, 253, 0.18), 0 0 38px rgba(59, 130, 246, 0.22)';

const THETA = 0.4;
/** 上下拖动的倾角范围（弧度）。 */
const THETA_MIN = -1.15;
const THETA_MAX = 1.15;
/** 每帧自转角（弧度）。0.005 约 21 秒一圈，慢到不抢注意力 */
const SPIN = 0.005;
/** 拖拽灵敏度：指针走这么多像素，球转一整圈。 */
const DRAG_DAMPING = 300;

/** 经纬度 → 单位球面上的点（沿用 cobe 的约定：lng=0 落在 +X 轴上） */
function toVec([lat, lng]: LatLng) {
  const la = (lat * Math.PI) / 180;
  const ln = (lng * Math.PI) / 180;
  const cosLat = Math.cos(la);
  return { x: cosLat * Math.cos(ln), y: Math.sin(la), z: -cosLat * Math.sin(ln) };
}

/** 与 cobe 一致的旋转：先绕 Y 转 phi，再绕 X 转 theta。 */
function project(p: { x: number; y: number; z: number }, phi: number, theta: number) {
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const x1 = cosP * p.x + sinP * p.z;
  const z1 = -sinP * p.x + cosP * p.z;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    x: x1,
    y: cosT * p.y - sinT * z1,
    z: sinT * p.y + cosT * z1,
  };
}

/** 只做一次能力探测用的 canvas，绝不复用要交给 cobe 的那块 */
function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl') ?? probe.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/** 站在邵阳那一点上的人像。 */

export default function DottedGlobe({ coordinates, className = '' }: DottedGlobeProps) {
  const globeRef = useRef<HTMLCanvasElement>(null);
  const markRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  /** 探测结果放 state，才能在渲染阶段决定要不要走降级图形 */
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  /** 拖拽中的指针位置；null 表示没在拖。 */
  const dragging = useRef<{ x: number; y: number } | null>(null);
  /** 拖拽量走 motion value + 弹簧，而不是直接累加到 phi。 */
  const dragTarget = useMotionValue(0);
  const dragAngle = useSpring(dragTarget, { mass: 1, damping: 50, stiffness: 500 });
  /** 纵向（倾角）的拖动量，**存的是相对 THETA 的偏移**，不是绝对倾角。 */
  const tiltTarget = useMotionValue(0);
  const tiltAngle = useSpring(tiltTarget, { mass: 1, damping: 50, stiffness: 500 });
  /** cobe 每帧把当前 phi 写到这里，overlay 用它投影，两张画布才严格同步 */
  const phiRef = useRef(0);
  /** 当前倾角（THETA + 拖动偏移）。理由同 phiRef：overlay 必须用同一时刻的值投影 */
  const thetaRef = useRef(THETA);

  useEffect(() => {
    setWebglOk(hasWebGL());
  }, []);

  useEffect(() => {
    if (resolvedTheme === undefined || webglOk !== true) return;
    const globeCanvas = globeRef.current;
    const markCanvas = markRef.current;
    const box = boxRef.current;
    if (!globeCanvas || !markCanvas || !box) return;

    const pal = resolvedTheme === 'dark' ? PALETTE.dark : PALETTE.light;
    const point = toVec(coordinates);
    let width = box.offsetWidth;
    // 第一次显示时让籍贯标记朝向观察者，避免需要盲拖才能找到所标位置。
    let phi = Math.atan2(-point.x, point.z);
    let raf = 0;

    const measure = () => {
      width = box.offsetWidth;
    };

    const globe = createGlobe(globeCanvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: THETA,
      dark: pal.dark,
      diffuse: 0.5,
      mapSamples: 22000,
      mapBrightness: 1.4,
      baseColor: pal.baseColor,
      markerColor: pal.markerColor,
      glowColor: pal.glowColor,
      markers: [],
      onRender: (state) => {
        if (!reduceMotion && dragging.current === null) phi += SPIN;
        /* 倾角 = 基准值 + 拖动偏移。基准值 THETA 是初始视角（略俯视北半球），偏移由弹簧给出，所以松手后那一下回弹也一并带走。 */
        const theta = THETA + tiltAngle.get();
        state.phi = phi + dragAngle.get();
        state.theta = theta;
        state.width = width * 2;
        state.height = width * 2;
        phiRef.current = state.phi;
        thetaRef.current = theta;
      },
    });

    /** 第二张画布：站在邵阳那一点上的 3D 小人（静止站立）。转到球背面时不画 */
    // 3D 站姿人像贴图（已离线抠成透明背景）。加载完成后 actorReady 置真，
    // 每帧直接 drawImage 一张透明 PNG —— 不用再逐帧抠色。
    const actor = new Image();
    let actorReady = false;
    actor.onload = () => {
      actorReady = true;
    };
    actor.src = '/images/avatar-stand.png';
    const drawMark = () => {
      const ctx = markCanvas.getContext('2d');
      if (ctx && width > 0) {
        const dpr = 2;
        if (markCanvas.width !== width * dpr) {
          markCanvas.width = width * dpr;
          markCanvas.height = width * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, width);

        const pr = project(point, phiRef.current, thetaRef.current);
        if (pr.z > -0.02) {
          const radius = (width / 2) * 0.8;
          const sx = width / 2 + pr.x * radius;
          const sy = width / 2 - pr.y * radius;
          // 越靠正面越实，接近边缘淡出，读起来才像贴在球面上
          const alpha = Math.max(0.25, Math.min(1, pr.z + 0.4));
          // 转到侧面时整个人也随球面缩小一点，不然像贴纸浮在球外。
          // 0.24 × 球半径 ≈ 44px：第一版给 0.115（21px），截图里他已经糊成一粒蓝点，
          // 分辨不出是人在动 —— 这个效果的全部意义就是看得清他在跳。
          const h = Math.max(24, radius * 0.24) * (0.85 + 0.15 * Math.min(1, pr.z));

          // 脚下那圈扁光：圆点不画了，但「这里有一个被标出来的位置」这层意思
          // 得留下 —— 压成椭圆、透明度给低，读起来是他站着的一块地面影，
          // 而不是又一层光晕（光晕太亮会把整个人盖成一团蓝雾）
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.45);
          glow.addColorStop(0, pal.dot);
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = alpha * 0.22;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(sx, sy, h * 0.45, h * 0.13, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = alpha;
          // 站姿人像：脚底锚定在标记点，高度 h
          if (actorReady) {
            const aspect = actor.naturalWidth / actor.naturalHeight;
            const dw = h * aspect;
            ctx.drawImage(actor, sx - dw / 2, sy - h, dw, h);
          }
          ctx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(drawMark);
    };
    raf = requestAnimationFrame(drawMark);

    const ro = new ResizeObserver(measure);
    ro.observe(box);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe.destroy();
    };
  }, [resolvedTheme, webglOk, reduceMotion, coordinates, dragAngle, tiltAngle]);

  /** 拖拽转球。不做成键盘操作 —— 它只是好玩，不承载信息 */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  /** 拖动：横向改经度（phi），纵向改倾角（theta）。 */
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const from = dragging.current;
    if (!from) return;
    dragTarget.set(dragTarget.get() + (e.clientX - from.x) / DRAG_DAMPING);
    const nextTilt = tiltTarget.get() + (e.clientY - from.y) / DRAG_DAMPING;
    tiltTarget.set(Math.max(THETA_MIN - THETA, Math.min(THETA_MAX - THETA, nextTilt)));
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    dragging.current = null;
  };

  if (webglOk === false) {
    /** 拿不到 WebGL（老 Android WebView、微信/QQ 内置浏览器、驱动被拉黑）时的降级。 */
    return (
      <div ref={boxRef} className={`relative isolate aspect-square ${className}`} aria-hidden="true">
        <span
          className="absolute inset-[10%] rounded-full border border-sky-200/40"
          style={{ background: OCEAN.light, boxShadow: OCEAN_SHADOW }}
        />
        <svg viewBox="0 0 120 120" className="relative h-full w-full">
          <circle cx="60" cy="60" r="46" className="fill-none stroke-emerald-200/75" strokeWidth="2" strokeDasharray="1 2" />
          <circle cx="60" cy="60" r="30" className="fill-none stroke-sky-100/35" strokeWidth="1" strokeDasharray="2 6" opacity="0.6" />
          <circle cx="86" cy="44" r="4" className="fill-accent" />
        </svg>
      </div>
    );
  }

  /** 挂载标记：hydration 那一帧必须和服务器渲染的一模一样，主题颜色只能等挂载之后再上。 */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** 海洋底衬颜色，**挂载之前必须是「没有」**。 */
  const ocean = mounted
    ? resolvedTheme === 'dark'
      ? OCEAN.dark
      : OCEAN.light
    : null;

  return (
    /* isolate 不能省：它让地球画布的 mix-blend-mode 只在球盒内部合成，不会把卡片背景、粒子网一起卷进混合（那会让球边出现脏边）。 */
    <div ref={boxRef} className={`relative isolate aspect-square ${className}`}>
      {/* ① 海洋。z-0 必须显式写 —— canvas 是静态元素，绝对定位的 span 默认会盖在它上面，上一版的「一颗纯蓝球」就是这么来的（详见文件头）。 */}
      <span
        aria-hidden="true"
        className="absolute inset-[10%] z-0 rounded-full border border-sky-200/40"
        /* 主题没解析出来时只给阴影、不给渐变 —— 服务端与客户端首帧必须一模一样，见上面 ocean 的说明 */
        style={ocean ? { background: ocean, boxShadow: OCEAN_SHADOW } : { boxShadow: OCEAN_SHADOW }}
      />
      {/* ② 球面高光。和海洋渐变同一个光源方向（左上 28%/22%），压在海面之上、点阵之下 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10%] z-0 rounded-full bg-[radial-gradient(ellipse_at_28%_22%,rgba(255,255,255,0.3),transparent_32%)]"
      />
      {/* ③ 地球本体。lighten 让近黑的海洋底色让位给下面的蓝底衬，只把亮起来的绿色陆地点阵「取大」叠上去 —— 蓝海与绿陆两个色相就此分离。 */}
      <canvas
        ref={globeRef}
        aria-hidden="true"
        className="relative z-10 h-full w-full cursor-grab touch-none mix-blend-lighten active:cursor-grabbing"
        style={{ visibility: webglOk === true ? 'visible' : 'hidden' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {/* ④ 小人。必须在地球画布之上（z-20），否则会被 lighten 混掉 */}
      <canvas
        ref={markRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />
    </div>
  );
}
