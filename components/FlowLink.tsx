'use client';

/** 区块之间的「流光连接线」。 */

import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

export default function FlowLink({ className = '' }: { className?: string }) {
  /** 必须是 hydration-safe 版本：下面那条 `if (reduceMotion) return <div/>` 返回的是 */
  const reduceMotion = useHydrationSafeReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  /** 进度窗口：元素顶边从「视口 92% 处」走到「视口 42% 处」的这段距离。 */
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.92', 'start 0.42'],
  });

  /** 弹簧跟一层：滚动停下时线头不会硬停，而是缓一拍收住 */
  const grow = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  /** 光点走在线的头部。用 top 百分比而不是 translateY：百分比的 translateY 是相对自身尺寸 */
  const dotTop = useTransform(grow, [0, 1], ['0%', '100%']);

  if (reduceMotion) {
    return (
      <div aria-hidden="true" className={`mx-auto w-px bg-accent/30 ${className || 'h-14'}`} />
    );
  }

  return (
    <div ref={ref} aria-hidden="true" className={`relative ${className || 'h-14'}`}>
      {/* 轨道 */}
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />

      {/* 光迹：从顶端随滚动长到低端。origin-top 决定它「往下长」而不是从中间向两头撑开 */}
      <motion.span
        style={{ scaleY: grow }}
        className="absolute inset-y-0 left-1/2 w-px origin-top -translate-x-1/2 bg-gradient-to-b from-accent/70 via-accent to-accent/30"
      />

      {/* 光点。opacity 也跟着进度走：线还没开始长的时候，一个亮点孤零零挂在半空中，会读成「有个东西没加载出来」。 */}
      <motion.span
        style={{ top: dotTop, opacity: grow }}
        className="absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_2px_hsl(var(--accent)/0.45)]"
      />
    </div>
  );
}
