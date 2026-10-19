'use client';

/** 滚动特效的两个原语（整站共用）。 */

import { useRef } from 'react';
import {
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

/* 裸的 useReducedMotion() 在服务端只能返回 null（→ false），浏览器首轮却可能是 true。 */

/** 元素「穿过视口」的进度：0 = 顶边刚碰到视口下沿，1 = 底边刚离开视口上沿。 */
export function usePassThrough<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  progress: MotionValue<number>;
} {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // 'start end'：元素起始边对齐视口结束边（刚从下面露头）
    // 'end start'：元素结束边对齐视口起始边（刚从上面走完）
    offset: ['start end', 'end start'],
  });
  return { ref, progress: scrollYProgress };
}

/** 焦点曲线：把「穿过视口的进度」换算成「被点亮的程度」。 */
function focusFromProgress(p: number, reduceMotion: boolean | null): number {
  if (reduceMotion) return 0;
  /** 中心为 0、边缘为 1 */
  const offCenter = Math.abs(p - 0.5) * 2;
  /** 0.72 是「亮着」的窗口宽度：再宽就有两张卡同时亮，再窄光就一闪而过 */
  return Math.max(0, 1 - offCenter / 0.72);
}

/** 「焦点值」：元素越靠近视口中心越接近 1，进出视口边缘时衰减到 0。 */
export function useScrollFocus<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  focus: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useHydrationSafeReducedMotion();

  const raw = useTransform(progress, (p: number) => focusFromProgress(p, reduceMotion));

  /** 弹簧跟一层：滚动停下时高光不会硬切，而是缓一拍到位。 */
  const focus = useSpring(raw, { stiffness: 110, damping: 28, mass: 0.4 });
  return { ref, focus };
}

/** 视差位移：元素穿过视口时，从 +distance 平滑移到 -distance（px）。 */
export function useScrollParallax<T extends HTMLElement>(distance: number): {
  ref: React.RefObject<T | null>;
  y: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useHydrationSafeReducedMotion();

  const raw = useTransform(progress, (p: number) =>
    reduceMotion ? 0 : (0.5 - p) * distance * 2,
  );
  const y = useSpring(raw, { stiffness: 80, damping: 26, mass: 0.5 });
  return { ref, y };
}

/** 上面两条的组合版：一张卡片既要高光接力、又要视差时用这个。 */
export function useScrollCard<T extends HTMLElement>(parallax = 0): {
  ref: React.RefObject<T | null>;
  focus: MotionValue<number>;
  y: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useHydrationSafeReducedMotion();

  const rawFocus = useTransform(progress, (p: number) => focusFromProgress(p, reduceMotion));
  const rawY = useTransform(progress, (p: number) =>
    reduceMotion ? 0 : (0.5 - p) * parallax * 2,
  );

  const focus = useSpring(rawFocus, { stiffness: 110, damping: 28, mass: 0.4 });
  const y = useSpring(rawY, { stiffness: 80, damping: 26, mass: 0.5 });
  return { ref, focus, y };
}
