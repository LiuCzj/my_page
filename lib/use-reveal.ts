'use client';

/**
 * 滚动进入动画的属性包（整站共用）。
 *
 * 用法：<motion.div {...reveal(0.08)}>。延迟只用来做「依次出现」的节奏，
 * 位移固定 8px —— 再大就会在低端手机上看到明显的推屏感。
 *
 * 系统开了「减少动态效果」时返回空对象：元素照常渲染，只是完全不参与动画。
 * 这条是「静态呈现」而不是「不渲染」，和 DottedGlobe 的处理方式一致。
 */

import { useReducedMotion, type MotionProps } from 'framer-motion';

export function useReveal(): (delay: number) => MotionProps {
  const reduceMotion = useReducedMotion();

  return (delay: number): MotionProps =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.4, delay, ease: 'easeOut' },
        };
}
