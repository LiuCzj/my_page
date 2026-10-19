'use client';

/** 笔记详情页顶部的阅读进度条。 */

import { useEffect, useRef } from 'react';

/**
 * 阅读进度条。
 * @param props.className 外部追加的类名，默认 undefined
 * @returns 一条固定在顶栏下沿的细线；减少动态效果时不渲染任何东西
 */
export default function ReadingProgress({ className }: { className?: string }) {
  /** 直接操作 DOM 的 transform：进度每帧都变，走 React state 会让整棵子树每帧重渲染 */
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    /** 减少动态效果下直接不装监听。 */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /** 一帧只跑一次的闸门：非 0 表示这一帧已经排过队了 */
    let raf = 0;

    /** 把「这篇文章读了百分之几」写进 transform。 */
    const update = () => {
      raf = 0;
      const target = document.querySelector<HTMLElement>('[data-reading-progress]');
      if (!target) {
        bar.style.transform = 'scaleX(0)';
        return;
      }
      const startY = target.getBoundingClientRect().top + window.scrollY;
      const span = target.offsetHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, (window.scrollY - startY) / span)) : 0;
      bar.style.transform = `scaleX(${progress})`;
    };

    /** scroll / resize 的入口：只在没有排队时排一帧 */
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    // 先算一次：刷新页面时可能停在页面中间（浏览器会恢复滚动位置），
    // 不初始化的话进度条会从 0 开始，直到用户再滚一下才跳到正确位置。
    update();

    // passive: true —— 监听器不调用 preventDefault，交给浏览器优化滚动性能
    window.addEventListener('scroll', schedule, { passive: true });
    // resize 也要跟：视口高度变了，可滚动总距离就变了，进度会算错
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <span
      ref={barRef}
      aria-hidden="true"
      /* 定位与配色。 */
      className={`pointer-events-none fixed inset-x-0 z-[60] h-0.5 origin-left bg-accent motion-reduce:hidden ${className ?? ''}`}
      style={{ top: 'var(--header-h-total)', transform: 'scaleX(0)' }}
    />
  );
}
