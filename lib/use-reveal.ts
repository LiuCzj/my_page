'use client';

/** 滚动进入动画的属性包（整站共用，可为卡片单独加强幅度）。 */

import { useEffect, useState } from 'react';
import { useReducedMotion, type MotionProps } from 'framer-motion';

/**
 * 把系统减少动态效果偏好推迟到 hydration 完成后再应用。
 * @returns 服务端和客户端首次渲染均为 false；挂载后返回真实系统偏好。
 * @throws 不主动抛异常；依赖浏览器媒体查询与 Framer Motion 的订阅能力。
 */
export function useHydrationSafeReducedMotion(): boolean {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!reduceMotion;
}

interface RevealOptions {
  /** 入场时纵向偏移的像素数；卡片可略大，文字保持轻微移动 */
  distance?: number;
  /** 入场起始缩放；默认 1（不缩放），卡片可从 0.955 轻轻展开 */
  scale?: number;
  /** 入场动画时长（秒） */
  duration?: number;
}

/** 卡片入场的统一参数。 */
export const CARD_REVEAL: RevealOptions = { distance: 28, scale: 0.955, duration: 0.72 };

/** 卡片之间的错峰间隔（秒）。 */
export const CARD_STAGGER = 0.1;

/**
 * 创建遵从 reduced-motion 的滚动入场属性生成器。
 * @param options 入场距离、缩放起点与时长；不传时采用轻量默认值（给标题、空态用）
 * @returns 接受 stagger 延迟并返回 Framer Motion 属性的函数
 */
export function useReveal(options: RevealOptions = {}): (delay: number) => MotionProps {
  const reduceMotion = useHydrationSafeReducedMotion();
  const { distance = 8, scale = 1, duration = 0.4 } = options;

  return (delay: number): MotionProps =>
    reduceMotion
      ? /*
         * 静态档：显式给一个 duration:0 的终态，**不能**直接返回 {}。
         *
         * ⚠️ 返回 {} 会把 whileInView 一起撤掉，而 framer 挂载时已按 initial 把 opacity:0
         * 写成内联样式 —— 观察器消失后那些「还没滚进视口」的元素永远停在 opacity:0，内容看不见。
         * 必须用 animate 把终值写回去覆盖它。
         */
        {
          initial: false,
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration: 0 },
        }
      : {
          initial: { opacity: 0, y: distance, scale },
          whileInView: { opacity: 1, y: 0, scale: 1 },
          viewport: { once: true, amount: 0.15, margin: '0px 0px -8% 0px' },
          transition: { duration, delay, ease: [0.33, 1, 0.68, 1] },
        };
}
