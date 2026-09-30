'use client';

/**
 * 点阵地球（cobe / WebGL）+ 第二张 overlay canvas 画「站在邵阳跳舞的小人」。
 *
 * 【为什么小人要自己画，不用 cobe 的 markers】
 * cobe 的 markers 在这套配置下画不出东西（给显式 color、mapSamples 提到 16000、
 * size 加到覆盖整个可见半球，都不出现）。可用的做法是把 markers 留空，
 * 标记画在**第二张 canvas** 上，按 cobe 自己的旋转矩阵投影：
 *   先绕 Y 轴转 phi，再绕 X 轴转 theta；屏幕上半径 = 半幅 × 0.8（cobe 的球占 0.64 的平方根）；
 *   z < 0 表示转到球背面了，小人必须不画，否则会「飘」在球前面穿帮。
 * 小人本身是一堆按总高比例给的线段，见 drawDancer。
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
 * 一轮舞蹈多少毫秒。整套姿势的左右交替周期是它的一半（两条腿、两只手各差 π），
 * 所以 1200ms 实际是每 600ms 换一个动作 —— 约 100 BPM，合着拍子晃，不会抖成抽风。
 */
const DANCE_MS = 1200;

/**
 * 站在邵阳那一点上跳舞的小人。
 *
 * 【轮廓为什么长这样】要的是年轻男性：肩比胯宽（SHO_HALF > HIP_HALF）、
 * 短发（头顶一个实心半帽 + 一圈描边，不画长发也不画裙摆），四肢是等长的两段线。
 * 用 canvas 现画而不是贴图：本站不请求任何外部资源，一张动图也得自己扛带宽。
 *
 * 【尺寸全按总高 h 的比例给】球裁多大、人多大，容器一变他不会脱离球面。
 * 关节角用「屏幕角」：0 = 指向右，π/2 = 正下，-π/2 = 正上（canvas 的 y 轴朝下）。
 *
 * 【为什么全是连续正弦】腿和手各带一个 π 的相位差，支撑与腾空的切换落在正弦过零点上，
 * 是连续变化的。写成「sin>0 画 A 姿势、否则画 B 姿势」会在每次切换的那一帧硬跳一下，
 * 看着像抽风而不是跳舞。
 */
function drawDancer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  /** 双脚踩的那一点（也就是标记本身的位置） */
  feetY: number,
  /** 全身高 */
  h: number,
  /** 0..1，一轮舞蹈的进度 */
  phase: number,
  color: string,
) {
  const w = phase * Math.PI * 2;
  const at = (x: number, y: number, ang: number, len: number) => ({
    x: x + Math.cos(ang) * len,
    y: y + Math.sin(ang) * len,
  });

  /** bob 用 |sin|：一轮里落地两次，节奏才密 */
  const bob = Math.abs(Math.sin(w)) * 0.05 * h;
  const lean = Math.sin(w) * 0.055 * h;
  const hip = { x: cx + lean, y: feetY - 0.46 * h + bob };
  const sho = { x: cx - lean * 0.7, y: hip.y - 0.27 * h };
  const headR = 0.09 * h;
  // 脖子留 0.06h 的空隙：之前只留 0.035h，头几乎坐在肩上，
  // 举起来的两条手臂正好从头两侧穿过，小尺寸下糊成一团星芒
  const head = { x: sho.x + lean * 0.4, y: sho.y - headR - 0.06 * h };

  const THIGH = 0.215 * h;
  const SHIN = 0.215 * h;
  const UPPER = 0.155 * h;
  const FORE = 0.15 * h;
  // 胯宽与站距一起放大：0.05h + 0.17rad 时两条腿在 35px 的高度上并成一根竖杠，
  // 下半身看着像裙摆。现在腿是一个清楚的倒 V。
  const HIP_HALF = 0.11 * h;
  const SHO_HALF = 0.09 * h;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  // 线宽给到 h 的 7.5%：再细，这个尺寸下两条腿会并成一条杠，看着像个星号而不是人
  ctx.lineWidth = Math.max(1.4, h * 0.075);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const stroke = (...pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  };

  // 躯干 + 脖子
  stroke(hip, sho);
  stroke({ x: sho.x, y: sho.y }, { x: head.x, y: head.y + headR * 0.8 });

  // 两条腿：相位差 π，一条摆到前面时另一条正好在后面撑地
  for (const side of [-1, 1] as const) {
    const s = side === -1 ? 0 : Math.PI;
    const thigh = Math.PI / 2 + side * 0.45 + Math.sin(w + s) * 0.45;
    const knee = at(hip.x + side * HIP_HALF, hip.y, thigh, THIGH);
    // 膝盖往外顶（两侧镜像），弯曲度跟着摆动走
    const shin = thigh + side * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(w + s + 1.4)));
    const foot = at(knee.x, knee.y, shin, SHIN);
    stroke(hip, knee, foot);
  }

  // 两只手轮流「举顶 / 摊开」：raise 到 1 时这条手臂几乎竖直向上、手肘外翻，
  // 到 0 时整条手臂横着伸出去。两条手臂的 raise 差半个周期，
  // 所以永远是一只举着一只摊着 —— 这个不对称才是「在跳舞」，
  // 两只手对称举起只会读成做操或者投降。
  for (const side of [-1, 1] as const) {
    const s = side === -1 ? Math.PI : 0;
    const raise = 0.5 + 0.5 * Math.sin(w + s);
    const upper = -Math.PI / 2 + side * (0.25 + 1.0 * (1 - raise));
    const elbow = at(sho.x + side * SHO_HALF, sho.y, upper, UPPER);
    const fore = upper + side * (0.2 + 0.7 * raise);
    const hand = at(elbow.x, elbow.y, fore, FORE);
    stroke(sho, elbow, hand);
  }

  // 头：描边圆 + 上半个实心帽（短发）
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR * 1.04, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
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

    /** 第二张画布：站在邵阳那一点上跳舞的小人。转到球背面时不画 */
    const t0 = performance.now();
    const drawMark = () => {
      const ctx = markCanvas.getContext('2d');
      const now = performance.now();
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
          const phase = reduceMotion ? 0.22 : ((now - t0) / DANCE_MS) % 1;

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
          drawDancer(ctx, sx, sy, h, phase, pal.dot);
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
