'use client';

/**
 * 点阵地球（cobe / WebGL）+ 第二张 overlay canvas 画「站在邵阳的小人」。
 *
 * 【为什么小人要自己画，不用 cobe 的 markers】
 * cobe 的 markers 在这套配置下画不出东西（给显式 color、mapSamples 提到 16000、
 * size 加到覆盖整个可见半球，都不出现）。可用的做法是把 markers 留空，
 * 标记画在**第二张 canvas** 上，按 cobe 自己的旋转矩阵投影：
 *   先绕 Y 轴转 phi，再绕 X 轴转 theta；屏幕上半径 = 半幅 × 0.8（cobe 的球占 0.64 的平方根）；
 *   z < 0 表示转到球背面了，小人必须不画，否则会「飘」在球前面穿帮。
 * 小人本体是一张真空透明底的站姿人像贴图（public/images/avatar-stand.png，64×224、8 KB），
 * 在 overlay 上按投影点贴图，脚底锚定，静止站立。
 *
 * 【参数】mapSamples 22000、diffuse 0.5、theta 0.4、每帧 phi += 0.005。
 * 深浅两档分别走「亮底暗陆」和「暗底亮点」，理由见下面 PALETTE 的注释 ——
 * 这一颗球在浅色页上必须先能看清。
 *
 * 【可以拖】按住左右拖动能手动转球，拖的时候自动停，松手后弹簧把余速走完。
 * 这也让「邵阳」这个点变得可寻：拖到正面就看得见。
 * 手机上只吃掉横向手势（touch-pan-y），竖着划仍然照常滚页面 ——
 * 这颗球占掉首屏近一屏高，把它做成整块不可滚动区域会让人以为网页卡住了。
 *
 * 【三条不能省的边界】
 * 1. SSR 只输出两个空 canvas，不含任何主题相关的 class 或内联样式 → 无 hydration 报错。
 * 2. resolvedTheme 为 undefined 时不建 WebGL 实例，否则会按错的调色板闪一下。
 * 3. 系统要求「减少动态效果」时不自动转（仍可拖），标记照常画 —— 静态呈现，不是不画。
 */

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

/**
 * 两套调色板。
 *
 * 【cobe 的 dark 参数不是「换个颜色」，是换一种画法】读它的片元着色器：
 *   亮度 W = mix( (1-陆地)×受光, 陆地, dark ) + 0.1，然后整块圆盘以 alpha=1 填色。
 * 所以 dark=1 时陆地亮、海洋暗 —— 是「暗底亮点」，适合深色页；
 * dark=0 时正好反过来：海洋亮、陆地暗 —— 是「亮底暗陆」。
 * 之前浅色档我给的是 dark:0 + baseColor 深墨，等于把整块圆盘涂成深色、
 * 大陆再往更黑里走，于是一张白卡片上出现一团没有层次的深色糊影 ——
 * 这就是他说的「亮色时根本看不清」。
 * 现在浅色档把 baseColor 交回纯白：圆盘近白、大陆呈深色剪影、边缘因受光衰减自然收暗，
 * 白卡片上也一样读得出球体。深色档保持「暗底亮点」。
 *
 * 全球唯一的饱和蓝留给邵阳那一点上的小人 —— 那才是这块要说的信息。
 * 数值是 CSS 令牌的镜像系（不是直接取 token），因为 WebGL uniform 读不到 CSS 变量。
 */
const PALETTE = {
  light: {
    dark: 0,
    /**
     * 不给纯白。dark=0 这条路径上亮度 W 从球心的 ~1.1 衰减到边缘的 0.1，
     * 所以 baseColor 就是「最亮处」的颜色 —— 给 1 的话球心连边带海洋全被削平成卡片白，
     * 只剩一圈大陆点阵，右侧那半边几乎化进背景里。
     * 给一组略低于白的冷灰，球心落到浅灰，整颗球的轮廓和受光才立得住，
     * 陆地（0.1 × 本值）仍然是清楚的暗色。
     */
    baseColor: [0.82, 0.86, 0.92] as [number, number, number],
    glowColor: [1, 1, 1] as [number, number, number],
    markerColor: [0.08, 0.357, 0.72] as [number, number, number],
    dot: 'rgb(21, 99, 184)',
  },
  dark: {
    dark: 1,
    baseColor: [0.8, 0.9, 1.2] as [number, number, number],
    glowColor: [1, 1, 1] as [number, number, number],
    markerColor: [0.44, 0.71, 0.98] as [number, number, number],
    dot: 'rgb(113, 181, 250)',
  },
};

const THETA = 0.4;
/** 每帧自转角（弧度）。0.005 约 21 秒一圈，慢到不抢注意力 */
const SPIN = 0.005;
/**
 * 拖拽灵敏度：指针走这么多像素，球转一整圈。
 * 这颗球被裁得只剩上半条，可拖的横向距离很短，
 * 数值给到 1400 那种量级时几乎感觉不到转动 —— 所以给 300：
 * 拖过球面宽度的一半约转 40°，一次拖动能把邵阳从球背拉到正面。
 */
const DRAG_DAMPING = 300;

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

/**
 * 站在邵阳那一点上的人像。
 *
 * 一张真空透明底的站姿贴图（public/images/avatar-stand.png），绘制时**脚底锚定在标记点**：
 *   - 高度 h 就是整张贴图的总高（人物紧裁过，脚底≈贴图底部）；
 *   - 静止站立，只随球旋转、转到背面隐藏、按深度缩放与淡出。
 */

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
  /**
   * 拖拽量走 motion value + 弹簧，而不是直接累加到 phi：
   * 直接改的话手一停球就硬停，手感像在拖一张图；弹簧会在松手后把余速走完，
   * 球自己滑一小段才停 —— 「能自由拨」的观感来自这里，不是来自阻尼数值。
   */
  const dragTarget = useMotionValue(0);
  const dragAngle = useSpring(dragTarget, { mass: 1, damping: 50, stiffness: 500 });
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
        state.phi = phi + dragAngle.get();
        state.width = width * 2;
        state.height = width * 2;
        phiRef.current = state.phi;
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

        const pr = project(point, phiRef.current);
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
  }, [resolvedTheme, webglOk, reduceMotion, coordinates, dragAngle]);

  /** 拖拽转球。不做成键盘操作 —— 它只是好玩，不承载信息 */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current === null) return;
    dragTarget.set(dragTarget.get() + (e.clientX - dragging.current) / DRAG_DAMPING);
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
        className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
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
