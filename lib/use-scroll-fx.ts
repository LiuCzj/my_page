'use client';

/**
 * 滚动特效的两个原语（整站共用）。
 *
 * 【共同前提：这些值必须走 MotionValue，不能走 state】
 * 滚动是每帧发生的。用 useState 记进度会让整棵 React 子树每帧重渲染，
 * 十几张卡片一起重排，低端手机上直接掉帧。
 * MotionValue 的变化由 framer 直接写 DOM style，一次 React 渲染都不触发。
 *
 * 【共同前提：reduced-motion】
 * 系统开了「减少动态效果」时，两个 hook 都退成常量（高光恒为 0、视差恒为 0）。
 * 这是「静态呈现」而不是「不渲染」—— 元素照常出现在页面上，只是不动。
 * 和 lib/use-reveal.ts 的处理方式一致。
 *
 * 【为什么不用 CSS scroll-driven animations】
 * animation-timeline: view() 目前只有 Chromium 系支持，Safari / Firefox 都不认，
 * 用了就是「一半访客看到特效、一半看到静止」。framer 的 useScroll 是 JS 测量，
 * 所有浏览器行为一致，代价是每个元素一个滚动监听 —— 本站卡片一共十来张，付得起。
 */

import { useRef } from 'react';
import {
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';

/**
 * 元素「穿过视口」的进度：0 = 顶边刚碰到视口下沿，1 = 底边刚离开视口上沿。
 * 0.5 附近就是元素大致居中、正被阅读的时刻。
 *
 * 返回的 ref 挂到要测量的元素上（通常是最外层那张卡片）。
 */
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

/**
 * 焦点曲线：把「穿过视口的进度」换算成「被点亮的程度」。
 * 抽成函数是因为下面两个 hook 要用同一条曲线 ——
 * 分开写的话，卡片高光和列表高光迟早会漂成两种亮度。
 */
function focusFromProgress(p: number, reduceMotion: boolean | null): number {
  if (reduceMotion) return 0;
  /** 中心为 0、边缘为 1 */
  const offCenter = Math.abs(p - 0.5) * 2;
  /** 0.72 是「亮着」的窗口宽度：再宽就有两张卡同时亮，再窄光就一闪而过 */
  return Math.max(0, 1 - offCenter / 0.72);
}

/**
 * 「焦点值」：元素越靠近视口中心越接近 1，进出视口边缘时衰减到 0。
 *
 * 用它做**卡片之间的高光接力**：往下滚，高光依次落在每张卡上，
 * 离开的卡自己暗下去 —— 视线被这条光带着往下走，不需要任何箭头或序号。
 *
 * 曲线是三角波而不是线性：0.25~0.75 这段是「正在读」，两端快速收敛到 0，
 * 这样两张相邻卡片不会同时亮着（同时亮就没有「接力」，只剩一片紫）。
 *
 * 返回值直接挂到覆盖层的 style={{ opacity: focus }} 上。
 * 刻意不改 transform：卡片上往往已经有一条入场动画在写 transform，
 * 两条 transform 挂一处会互相覆盖。
 */
export function useScrollFocus<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  focus: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useReducedMotion();

  const raw = useTransform(progress, (p: number) => focusFromProgress(p, reduceMotion));

  /**
   * 弹簧跟一层：滚动停下时高光不会硬切，而是缓一拍到位。
   * 这也是为什么高光读起来像「被点亮的」而不是「被计算出来的」。
   */
  const focus = useSpring(raw, { stiffness: 110, damping: 28, mass: 0.4 });
  return { ref, focus };
}

/**
 * 视差位移：元素穿过视口时，从 +distance 平滑移到 -distance（px）。
 *
 * 【方向为什么是这样】进入视口时元素偏下、离开时偏上 ——
 * 相对页面的滚动方向它是「慢半拍」的，读起来是内容浮在页面上，
 * 而不是被钉死在滚动里。反过来写会变成「抢在页面前面跑」，看着发飘。
 *
 * 【ref 挂谁、y 挂谁，必须是两个不同元素】
 * ref 挂的是被测量的元素（通常是外层 li），y 挂它的**子元素**。
 * 同一个元素上同时有这条 y 和入场动画的 y 会互相覆盖 ——
 * lib/use-reveal.ts 的入场已经在写 transform 了。
 *
 * 幅度不要超过 12px：再大就会在相邻卡片之间看到明显的错位，
 * 网格看着像没对齐。
 */
export function useScrollParallax<T extends HTMLElement>(distance: number): {
  ref: React.RefObject<T | null>;
  y: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useReducedMotion();

  const raw = useTransform(progress, (p: number) =>
    reduceMotion ? 0 : (0.5 - p) * distance * 2,
  );
  const y = useSpring(raw, { stiffness: 80, damping: 26, mass: 0.5 });
  return { ref, y };
}

/**
 * 上面两条的组合版：一张卡片既要高光接力、又要视差时用这个。
 *
 * 【为什么单开一个 hook 而不是连着调上面两个】
 * 那两个 hook 各自建一个 useScroll，同一张卡上就是两套滚动测量：
 * 每帧对同一个元素做两次 getBoundingClientRect，白付一倍代价。
 * 这里只测一次，两条曲线共用同一个 progress。
 *
 * parallax 传 0 就等于只要高光（卡片是 overflow-hidden 时位移会露边，
 * 那种卡就传 0 —— 例：Dashboard 的磁贴）。
 */
export function useScrollCard<T extends HTMLElement>(parallax = 0): {
  ref: React.RefObject<T | null>;
  focus: MotionValue<number>;
  y: MotionValue<number>;
} {
  const { ref, progress } = usePassThrough<T>();
  const reduceMotion = useReducedMotion();

  const rawFocus = useTransform(progress, (p: number) => focusFromProgress(p, reduceMotion));
  const rawY = useTransform(progress, (p: number) =>
    reduceMotion ? 0 : (0.5 - p) * parallax * 2,
  );

  const focus = useSpring(rawFocus, { stiffness: 110, damping: 28, mass: 0.4 });
  const y = useSpring(rawY, { stiffness: 80, damping: 26, mass: 0.5 });
  return { ref, focus, y };
}
