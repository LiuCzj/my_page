'use client';

/**
 * 点阵地球（cobe / WebGL）+ 第二张 overlay canvas 画城市标记。
 *
 * 【为什么标记要自己画，不用 cobe 的 markers】
 * 我先试过 cobe 自带的 markers：显式给 color、mapSamples 提到 16000、size 加到 2.0
 * （2.0 等于覆盖整个可见半球）—— 四种组合截图里都没有出现任何点。
 * 参考站自己的实现给了答案：它的 markers 也是空数组，
 * 城市和航线是在**第二张 canvas** 上按 cobe 的旋转矩阵自己投影画上去的。
 * 下面的 toVec / project 就是那个思路：
 *   先绕 Y 轴转 phi，再绕 X 轴转 theta；屏幕上半径 = 半幅 × 0.8（cobe 的球占 0.64 的平方根）；
 *   z < 0 表示转到球背面了，标记必须不画，否则会「飘」在球前面穿帮。
 *
 * 【参数照参考站调】mapSamples 22000、diffuse 0.5、theta 0.4、每帧 phi += 0.005。
 * 颜色不是抄它的白/黑，而是从本站令牌换算，保证深浅色都和站点同色系。
 *
 * 【可以拖】按住左右拖动能手动转球，拖的时候自动停 —— 参考站那个地球最好玩的地方，
 * 也让「邵阳」这个点变得可寻：拖到正面就看得见。
 *
 * 【三条不能省的边界】
 * 1. SSR 只输出两个空 canvas，不含任何主题相关的 class 或内联样式 → 无 hydration 报错。
 * 2. resolvedTheme 为 undefined 时不建 WebGL 实例，否则会按错的调色板闪一下。
 * 3. 系统要求「减少动态效果」时不自动转（仍可拖），标记照常画 —— 静态呈现，不是不画。
 */

import createGlobe from 'cobe';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useReducedMotion } from 'framer-motion';

/** [纬度, 经度]，单位「度」，北纬/东经为正 */
export type LatLng = [number, number];

interface DottedGlobeProps {
  coordinates: LatLng;
  /** 尺寸由外层 class 决定（本组件自带 aspect-square） */
  className?: string;
}

/**
 * 两套调色板，数值是 app/globals.css 里颜色令牌的 0..1 RGB 镜像：
 *   light.base = --muted-foreground 215 28% 33%   dark.base = --foreground 210 40% 96%
 *   marker/dot = --accent（明亮 214 80% 40%、暗黑 213 88% 64%）
 * WebGL uniform 读不到 CSS 变量，只能写死数值 —— 这是本设计唯一的固有重复：
 * 改了 globals.css 里那几个 token，这里必须同步改。
 */
const PALETTE = {
  light: {
    dark: 0,
    baseColor: [0.238, 0.315, 0.422] as [number, number, number],
    glowColor: [0.08, 0.357, 0.72] as [number, number, number],
    markerColor: [0.08, 0.357, 0.72] as [number, number, number],
    dot: 'rgb(30, 111, 194)',
  },
  dark: {
    dark: 1,
    baseColor: [0.944, 0.96, 0.976] as [number, number, number],
    glowColor: [0.323, 0.608, 0.957] as [number, number, number],
    markerColor: [0.323, 0.608, 0.957] as [number, number, number],
    dot: 'rgb(82, 155, 244)',
  },
};

const THETA = 0.4;
/** 每帧自转角（弧度）。0.005 约 21 秒一圈，慢到不抢注意力 */
const SPIN = 0.005;
/** 拖拽灵敏度：指针移动 1400px 相当于球转一整圈 */
const DRAG_DAMPING = 1400;

/** 经纬度 → 单位球面上的点（沿用 cobe 的约定：lng=0 落在 +X 轴上） */
function toVec([lat, lng]: LatLng) {
  const la = (lat * Math.PI) / 180;
  const ln = (lng * Math.PI) / 180;
  const cosLat = Math.cos(la);
  return { x: cosLat * Math.cos(ln), y: Math.sin(la), z: -cosLat * Math.sin(ln) };
}

/** 与 cobe 一致的旋转：先绕 Y 转 phi，再绕 X 转 theta */
function project(p: { x: number; y: number; z: number }, phi: number) {
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const x1 = cosP * p.x + sinP * p.z;
  const z1 = -sinP * p.x + cosP * p.z;
  return {
    x: x1,
    y: Math.cos(THETA) * p.y - Math.sin(THETA) * z1,
    z: Math.sin(THETA) * p.y + Math.cos(THETA) * z1,
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

export default function DottedGlobe({ coordinates, className = '' }: DottedGlobeProps) {
  const globeRef = useRef<HTMLCanvasElement>(null);
  const markRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  /** 探测结果放 state，才能在渲染阶段决定要不要走降级图形 */
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  /** 拖拽中的指针 x；null 表示没在拖 */
  const dragging = useRef<number | null>(null);
  /** 拖拽累计的角度偏移，与自动旋转相加，所以松手后停在拖到的位置 */
  const dragOffset = useRef(0);
  /** cobe 每帧把当前 phi 写到这里，overlay 用它投影，两张画布才严格同步 */
  const phiRef = useRef(0);

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
    let phi = 0;
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
      mapBrightness: 1.2,
      baseColor: pal.baseColor,
      markerColor: pal.markerColor,
      glowColor: pal.glowColor,
      markers: [],
      onRender: (state) => {
        if (!reduceMotion && dragging.current === null) phi += SPIN;
        state.phi = phi + dragOffset.current;
        state.width = width * 2;
        state.height = width * 2;
        phiRef.current = state.phi;
      },
    });

    /** 第二张画布：城市标记 + 一圈光晕。转到球背面时不画 */
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

        const pr = project(point, phiRef.current);
        if (pr.z > -0.02) {
          const radius = (width / 2) * 0.8;
          const sx = width / 2 + pr.x * radius;
          const sy = width / 2 - pr.y * radius;
          // 越靠正面越实，接近边缘淡出，读起来才像贴在球面上
          const alpha = Math.max(0.25, Math.min(1, pr.z + 0.4));

          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
          glow.addColorStop(0, pal.dot);
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = alpha * 0.45;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(sx, sy, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = alpha;
          ctx.fillStyle = pal.dot;
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
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
  }, [resolvedTheme, webglOk, reduceMotion, coordinates]);

  /** 拖拽转球。不做成键盘操作 —— 它只是好玩，不承载信息 */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current === null) return;
    dragOffset.current += (e.clientX - dragging.current) / DRAG_DAMPING;
    dragging.current = e.clientX;
  };
  const endDrag = () => {
    dragging.current = null;
  };

  if (webglOk === false) {
    /**
     * 拿不到 WebGL（老 Android WebView、微信/QQ 内置浏览器、驱动被拉黑）时的降级：
     * 一枚静态虚线圆 + 一个 accent 点。地名文字在卡片里照常渲染，信息不丢。
     */
    return (
      <div ref={boxRef} className={`relative aspect-square ${className}`} aria-hidden="true">
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <circle cx="60" cy="60" r="46" className="fill-none stroke-border" strokeWidth="1.5" strokeDasharray="3 5" />
          <circle cx="60" cy="60" r="30" className="fill-none stroke-border" strokeWidth="1" strokeDasharray="2 6" opacity="0.6" />
          <circle cx="86" cy="44" r="4" className="fill-accent" />
        </svg>
      </div>
    );
  }

  return (
    <div ref={boxRef} className={`relative aspect-square ${className}`}>
      <canvas
        ref={globeRef}
        aria-hidden="true"
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        style={{ visibility: webglOk === true ? 'visible' : 'hidden' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <canvas ref={markRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
