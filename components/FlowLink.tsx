'use client';

/**
 * 区块之间的「流光连接线」。
 *
 * 【它解决的是什么】
 * 首页原来是四块内容直接上下相接，块与块之间只有留白 ——
 * 留白只表示「断开」，不表示「接着往下读」。
 * 滚到两个区块的中间地带时，页面上没有任何东西告诉你上面那块和下面那块是一体的。
 * 这条线就是那层关系：它**随着滚动被画出来**，光点走在线的头部，
 * 于是「往下滚」这个动作本身变成「把线往下画」，两块内容被缝在一起。
 *
 * 【为什么是「长出来」而不是「一直画好」】
 * 一直画好的线只是分隔符，跟 hr 没区别。长出来才有因果：
 * 你滚多少，它就画多少 —— 这是滚动驱动的，不是装饰贴片。
 *
 * 【轨道为什么先画一条淡线】
 * 没有轨道的话，那条 accent 线是凭空长出来的，看着像内容在跳。
 * 先有一条 border 色的轨道，表示「路在这儿，光正在走」。
 *
 * 【reduced-motion】退成一条静态的淡 accent 线：
 * 关系还在（两块之间有连接），因果没了（不再随滚动生长）。
 */

import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

export default function FlowLink({ className = '' }: { className?: string }) {
  /**
   * 必须是 hydration-safe 版本：下面那条 `if (reduceMotion) return <div/>` 返回的是
   * **结构不同**的节点（静态档只有一根线，动画档是「轨道 + 光迹 + 光点」三个子节点）。
   * 服务端拿到 null → 渲染动画档，开了减少动态效果的手机首次渲染 → 静态档，
   * React 会判定整棵子树对不上（2026-10-04 与 Hero / TerminalCard 同一批修复）。
   */
  const reduceMotion = useHydrationSafeReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  /**
   * 进度窗口：元素顶边从「视口 92% 处」走到「视口 42% 处」的这段距离。
   * 用顶边定位而不是整段穿过（'start end' → 'end start'）是因为这条线只有 56px 高，
   * 按整段穿过算的话窗口太短，线会在一瞬间画完，看不出「正在画」。
   * 42% 而不是 50%：让线在到达视口中心**之前**就画满，
   * 等下一块内容进入阅读区时，连接已经完成 —— 光走在眼睛前面，不抢内容。
   */
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

      {/*
        光点。opacity 也跟着进度走：线还没开始长的时候，
        一个亮点孤零零挂在半空中，会读成「有个东西没加载出来」。
      */}
      <motion.span
        style={{ top: dotTop, opacity: grow }}
        className="absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_2px_hsl(var(--accent)/0.45)]"
      />
    </div>
  );
}
