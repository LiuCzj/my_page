'use client';

/** 来回滚动的条（技术栈、工具共用）。自动走，也可以用手拖着走。 */

import { useEffect, useRef, useState } from 'react';

interface MarqueeProps {
  children: React.ReactNode;
  /** 反向滚动（让相邻两排方向相反） */
  reverse?: boolean;
  /** 鼠标悬停时停住，方便看清某一条 */
  pauseOnHover?: boolean;
  /** 常态自动走完一整条带子多少秒，如 '64s'。内容越长给越大 */
  duration?: string;
  /** 条目间距，默认 0.75rem */
  gap?: string;
  /** 外部强制停住这一排（不只是悬停停）。 */
  paused?: boolean;
  className?: string;
}

/** 按下后走过多远就判定为「在拖」而不是「想点」（px）。 */
const DRAG_THRESHOLD = 8;
/** 松手后惯性速度的时间常数（秒）。太小像拖一张纸，太大像抽风 */
const GLIDE_TAU = 0.85;
/** 惯性降到这个速度以下就不再压制常态滚动，两者开始混合（px/s） */
const FLING_GATE = 90;
/** 甩动速度上限：快速甩一下算出的瞬时速度能到几千 px/s，不夹一下带子会直接飞没 */
const FLING_MAX = 1500;
/** 帧间隔上限。切到后台再回来时 dt 会是几十秒，不夹就一帧跳完整条带子 */
const MAX_DT = 1 / 20;

/** '64s' / '40' → 秒。非数字或非正数回落到 40，不让带子静止或炸飞 */
function toSeconds(value: string) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** 只夹大小、保留方向 */
function clampSpeed(v: number) {
  return Math.max(-FLING_MAX, Math.min(FLING_MAX, v));
}

export default function Marquee({
  children,
  reverse = false,
  pauseOnHover = true,
  duration = '40s',
  gap = '0.75rem',
  paused = false,
  className = '',
}: MarqueeProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  /** null = 还没量过；true = 可以滚；false = 内容太短，静态换行 */
  const [canLoop, setCanLoop] = useState<boolean | null>(null);

  /** 循环周期 L（px）= 单份宽度 + 轨道间距；也是「滚完一轮」的距离，用来换算速度 */
  const lenRef = useRef(0);
  /** 常态速度（px/s，已带方向） */
  const ambientRef = useRef(0);
  /** 当前位移（px，每帧折回 (-L, 0]） */
  const offsetRef = useRef(0);
  /** 惯性速度（px/s）：拖拽时由指针喂，松手后按 GLIDE_TAU 衰减 */
  const velRef = useRef(0);
  /** 这台设备有没有真正会悬停的指针 —— 触屏没有，:hover 会在点完之后赖着不走 */
  const canHoverRef = useRef(false);
  const pausedRef = useRef(paused);
  const dragRef = useRef<{
    id: number;
    lastX: number;
    lastT: number;
    moved: number;
    v: number;
    taken: boolean;
  } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /* 量宽：既决定能不能滚，也决定周期 L —— 常态速度是「L 除以 duration 秒」换算出来的，所以外层仍然只管「一轮多少秒」，不用关心内容有多宽。 */
  useEffect(() => {
    const outer = outerRef.current;
    const track = trackRef.current;
    if (!outer || !track) return;

    const measure = () => {
      const gapPx = parseFloat(getComputedStyle(outer).columnGap) || 0;
      const w = track.offsetWidth;
      lenRef.current = w + gapPx;
      // reverse 的带子往右走，位移为正
      ambientRef.current = ((w + gapPx) / toSeconds(duration)) * (reverse ? 1 : -1);
      const loop = w >= outer.clientWidth;
      setCanLoop((prev) => (prev === loop ? prev : loop));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(track);
    return () => ro.disconnect();
  }, [canLoop, duration, reverse]);

  useEffect(() => {
    if (canLoop !== true) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    canHoverRef.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const outer = outerRef.current;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
      last = now;
      const a = trackRef.current;
      const b = trailRef.current;
      const L = lenRef.current;
      if (a && b && L > 0) {
        // 按住的时候不带任何自动量：位移完全听指针的
        if (!dragRef.current) {
          // 悬停停读的是浏览器自己的 :hover 状态，不挂 enter/leave 事件 ——
          // 事件那套要靠 relatedTarget 推算进出，实测在 React 里收不到；
          // 而 :hover 是浏览器维护的权威状态，鼠标进出、移出窗口都天然正确。
          // 只在真有悬停指针的设备上查：触屏点完 :hover 会赖着不走，等于永久停住。
          const hovering = pauseOnHover && canHoverRef.current && !!outer?.matches(':hover');
          const stopped = reduce || pausedRef.current || hovering;
          const v = clampSpeed(velRef.current * Math.exp(-dt / GLIDE_TAU));
          velRef.current = Math.abs(v) < 1 ? 0 : v;
          // 甩动还远大于常态速度时，常态滚动靠边站；落回 FLING_GATE 以下才逐步并进来。
          // 用平方而不是硬切，交接那一瞬间才不会看见带子猛一下
          const gate = Math.min(1, Math.abs(velRef.current) / FLING_GATE);
          offsetRef.current += (velRef.current + (stopped ? 0 : ambientRef.current * (1 - gate * gate))) * dt;
        }
        // 折回 (-L, 0]：JS 的 % 保留被除数的符号，所以正向要多减一个 L
        let o = offsetRef.current % L;
        if (o > 0) o -= L;
        offsetRef.current = o;
        const t = `translate3d(${o}px, 0, 0)`;
        a.style.transform = t;
        b.style.transform = t;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canLoop, pauseOnHover]);

  /* 拖拽的三个 handler 都挂在最外层。走 capture 这一段是为了不被里面的条目拦掉。 */
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lenRef.current <= 0) return;
    velRef.current = 0;
    dragRef.current = {
      id: e.pointerId,
      lastX: e.clientX,
      lastT: e.timeStamp,
      moved: 0,
      v: 0,
      taken: false,
    };
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.lastX;
    if (!drag.taken) {
      drag.moved += Math.abs(dx);
      // 没过阈值前不动带子：这一段是手指按下难免的抖动，跟着走会让人以为「点一下它就跑」
      if (drag.moved < DRAG_THRESHOLD) return;
      // 认定是在拖了，到这一步才接管指针。早一步接管，pointerup 会被重定向到这里，
      // 里面条目的「点一下钉住名字」就永远收不到了
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.taken = true;
    }
    // 速度取近几步的平滑值：只按最后一步算的话，收尾那一下的抖动会放大成甩飞
    const span = Math.max(8, e.timeStamp - drag.lastT);
    drag.v = drag.v * 0.6 + (dx / span) * 1000 * 0.4;
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    offsetRef.current += dx;
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.taken) return;
    // 按住不动再松手不该甩出去：这时的 v 是几秒前那次移动留下的
    velRef.current = e.timeStamp - drag.lastT > 100 ? 0 : clampSpeed(drag.v);
  };

  // 还没量出结果前先按静态渲染：宁可晚一点动起来，也不要第一帧就露出重复
  if (canLoop !== true) {
    return (
      <div
        ref={outerRef}
        className={`flex flex-wrap items-center gap-[var(--gap)] ${className}`}
        style={{ ['--gap' as string]: gap }}
      >
        <div ref={trackRef} className="flex flex-wrap items-center gap-[var(--gap)]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      onPointerDownCapture={onDown}
      onPointerMoveCapture={onMove}
      onPointerUpCapture={onUp}
      onPointerCancelCapture={onUp}
      onDragStart={(e) => e.preventDefault()}
      className={`flex gap-[var(--gap)] overflow-hidden touch-pan-y cursor-grab select-none active:cursor-grabbing [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] ${className}`}
      style={{ ['--gap' as string]: gap }}
    >
      {/* 第一份要能被量出宽度，所以给它 trackRef；第二份也要被写位移，给它 trailRef。
          两份内容一样，读屏只留第一份（第二份 aria-hidden） */}
      <div ref={trackRef} className="flex shrink-0 items-center gap-[var(--gap)]">
        {children}
      </div>
      <div ref={trailRef} aria-hidden="true" className="flex shrink-0 items-center gap-[var(--gap)]">
        {children}
      </div>
    </div>
  );
}
