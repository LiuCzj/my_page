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
 * 【2026-10-04 重做：为什么上一版是一颗纯蓝球】
 * 用户反馈「地球做的全是蓝色，真实地球是这样吗」。
 * 用 CDP 单独截 canvas 逐层排查后定位到**绘制顺序**，不是配色问题：
 *   上一版在 canvas 下面铺了一层蓝色海洋 <span>（绝对定位）。
 *   绝对定位元素的绘制层级高于**静态**的 canvas，于是那层蓝把整块画布盖住了 ——
 *   DOM 里有、CSS 也对、cobe 也照常在渲染，只是永远看不到。
 * 把底衬临时隐藏后，cobe 立刻显出清晰的大陆点阵（亚洲、东南亚一眼可辨）。
 *
 * 【重做后的做法：两层，各管一个色相】
 * cobe 只有一个 baseColor，海洋和陆地只能是**同一色相的不同亮度** ——
 * 这正是「全是蓝」的根因：baseColor 是蓝，海洋=蓝×0.1（深蓝），陆地=蓝×1.3（亮蓝），
 * 亮度差再大也还是蓝。要做出「蓝海 + 绿陆」就必须让两层颜色来自两个地方：
 *   ① 海洋 = canvas **下面**的 CSS 径向渐变（深蓝，可自由设计）
 *   ② 陆地 = cobe 点阵（baseColor 设为绿色，mapBrightness 1.4）
 * 两层靠 canvas 的 `mix-blend-mode: lighten` 合成。选 lighten 而不是 screen：
 *   screen 会把两层**都提亮**，深蓝海被冲成浅蓝、绿点被冲成发白的浅蓝（实测对比见
 *   temp/lab-compare.png 的 C/F 与 temp/lab-v2.png 的 J）；
 *   lighten 是逐通道取大值 —— canvas 比底衬暗的地方一律让位给底衬，
 *   于是**海洋严格等于设计的蓝、陆地严格等于 cobe 的绿**，两层互不污染（v2 的 G/H）。
 * 代价是底衬那层 <span> 从「可选装饰」变成「必需品」：删掉它，球会退回一颗近黑的球。
 *
 * 【因此 z 序必须显式写出来，不能靠 DOM 顺序】
 * 底衬 z-0 → 高光 z-0 → 地球画布 z-10 → 小人画布 z-20。
 * 这四条是上面那套混合成立的前提，少写一条就会退回「一颗蓝球」。
 * 外层 div 的 `isolate`（isolation: isolate）让 lighten 只在球盒内部生效，
 * 不会去和卡片背景、粒子网发生混合。
 *
 * 【dark 为什么必须是 1】
 * cobe 的 shader 里明暗两条分支（见 node_modules/cobe/dist/index.esm.js 的 fragment）：
 *   dark=1 → W = p + 0.1        （p 是陆地强度）→ 陆地点亮、海洋近黑
 *   dark=0 → W = (1-p)·g^0.4 + 0.1            → 海洋点亮、陆地近黑
 * 只有 dark=1 能让陆地点阵比海洋亮，lighten 之后绿色才浮得出来；
 * dark=0 会让陆地比底衬暗，被 lighten 直接吃掉，球上什么都看不见。
 *
 * 【参数】mapSamples 22000、mapBrightness 1.4、diffuse 0.5、theta 0.4、每帧 phi += 0.005。
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
 * baseColor 是**陆地**的颜色（乘 mapBrightness 后就是点阵实际亮度），
 * 海洋不在这里 —— 它由下面的 OCEAN 渐变负责，理由见文件头。
 *
 * 两套的 baseColor 相同（同一支绿），差别只在海洋底衬深浅：
 * 深色主题用更深的蓝，让绿点对比更强、整球更「太空」；
 * 浅色主题用中蓝，否则一颗近乎黑蓝的球压在浅色卡片上太重。
 *
 * WebGL uniform 读不到 CSS 变量，所以颜色值只能在这里按主题各写一份。
 */
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

/**
 * 海洋底衬：深蓝径向渐变 + 球面明暗 + 大气外发光。
 *
 * 高光放在左上（circle at 32% 26%），和旁边那层 sheen 高光同一个方向 ——
 * 两处光必须同源，否则会读成「两个光源」，球面立刻变塑料。
 * 中心色不要给到 #7dd3fc 那么亮：lighten 之后亮海会把绿点冲淡，
 * 实测（temp/lab-compare.png 的 C）陆地会糊成一片浅蓝。
 */
const OCEAN: Record<'light' | 'dark', string> = {
  light: 'radial-gradient(circle at 32% 26%, #2f7fd6 0%, #1a549f 36%, #0c2c60 68%, #051331 100%)',
  dark: 'radial-gradient(circle at 32% 26%, #1d4f9c 0%, #123a7a 34%, #0a2450 62%, #04122c 100%)',
};

/** 球面明暗与外发光。inset 阴影压出右下暗面（昼夜分界），外发光当大气层 */
const OCEAN_SHADOW =
  'inset -24px -18px 36px rgba(2, 8, 23, 0.62), inset 10px 8px 24px rgba(186, 230, 253, 0.18), 0 0 38px rgba(59, 130, 246, 0.22)';

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

  /**
   * 主题未解析出来时不铺底衬色 —— 否则会先按浅色画一帧深蓝，再跳成深色版，
   * 而下面那个 effect 也是等 resolvedTheme 有了才建球，两者一起等，闪不出现。
   */
  const ocean = resolvedTheme === 'dark' ? OCEAN.dark : OCEAN.light;

  return (
    /*
      isolate 不能省：它让地球画布的 mix-blend-mode 只在球盒内部合成，
      不会把卡片背景、粒子网一起卷进混合（那会让球边出现脏边）。
    */
    <div ref={boxRef} className={`relative isolate aspect-square ${className}`}>
      {/*
        ① 海洋。z-0 必须显式写 —— canvas 是静态元素，绝对定位的 span 默认会盖在它上面，
        上一版的「一颗纯蓝球」就是这么来的（详见文件头）。这一层现在是必需品：
        删掉它，lighten 之后球会退回一颗近黑的球。
      */}
      <span
        aria-hidden="true"
        className="absolute inset-[10%] z-0 rounded-full border border-sky-200/40"
        style={{ background: ocean, boxShadow: OCEAN_SHADOW }}
      />
      {/* ② 球面高光。和海洋渐变同一个光源方向（左上 28%/22%），压在海面之上、点阵之下 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10%] z-0 rounded-full bg-[radial-gradient(ellipse_at_28%_22%,rgba(255,255,255,0.3),transparent_32%)]"
      />
      {/*
        ③ 地球本体。lighten 让近黑的海洋底色让位给下面的蓝底衬，
        只把亮起来的绿色陆地点阵「取大」叠上去 —— 蓝海与绿陆两个色相就此分离。
        需要 relative 才能让 z-10 生效（z-index 对静态元素无效）。
      */}
      <canvas
        ref={globeRef}
        aria-hidden="true"
        className="relative z-10 h-full w-full cursor-grab touch-pan-y mix-blend-lighten active:cursor-grabbing"
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
