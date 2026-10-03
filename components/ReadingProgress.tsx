'use client';

/**
 * 笔记详情页顶部的阅读进度条。
 *
 * 【它是什么】一条 2px 高的紫线，钉在固定顶栏的下沿，随阅读进度从左往右生长。
 * 只挂在 `app/notes/[slug]/page.tsx`，其余页面不出现。
 *
 * 【为什么不用 framer-motion 写】
 * 最初这版是用 framer 的 useScroll + useSpring 写的，代码更短，但实测把笔记详情页的
 * First Load JS 从 113 kB 顶到 156 kB —— 那一页原本完全没有 framer，为了这一条 2px 的线
 * 要把整个动画库拉进来。本站的带宽前提是服务器单连接 10~30 KB/s（见 README），
 * 43 kB 就是额外 1.5~4 秒的等待，为一条装饰线付这个代价不划算。
 * 所以改成原生实现：一个 scroll 监听 + requestAnimationFrame + 写 CSS transform，约 1 KB。
 *
 * 【为什么用 transform 而不是 width】
 * width 会触发 layout 重排（每帧重新计算后面所有元素的盒模型）；
 * transform 只走合成层，不重排也不重绘。进度条每帧都在变，这个差别在低端机上是掉帧与不掉帧的区别。
 *
 * 【为什么 scroll 里套一层 requestAnimationFrame】
 * scroll 事件在一帧内可能触发多次（尤其惯性滚动与触控板）。直接在里面算样式会重复劳动；
 * 用「一帧只跑一次」的闸门（raf 非 0 就跳过）把多次合并成一次，滚动更稳。
 *
 * 【为什么不用 CSS 的 scroll-driven animation（animation-timeline: scroll()）】
 * 目前只有 Chromium 系支持，Safari 与 Firefox 都不认 —— 用了就是「一半访客有进度条、
 * 一半没有」。宁可自己写十几行 JS，也要所有浏览器行为一致。
 *
 * 【减少动态效果时】整个组件不渲染（`motion-reduce:hidden` + effect 里提前 return）。
 * 项目对 reduced-motion 的常规处理是「静态呈现」而不是「不渲染」，但那适用于承载内容的元素；
 * 这条进度条纯装饰，关掉动效后「随滚动生长」的因果就不存在了，留一条静止的紫边只会是干扰。
 *
 * 【无障碍】标 `aria-hidden="true"`。它是进度的视觉复述，读屏用户读的是正文本身，
 * 多播报一个百分比只是噪音。
 */

import { useEffect, useRef } from 'react';

/**
 * 阅读进度条。
 *
 * @param props.className 外部追加的类名，默认 undefined
 * @returns 一条固定在顶栏下沿的细线；减少动态效果时不渲染任何东西
 */
export default function ReadingProgress({ className }: { className?: string }) {
  /** 直接操作 DOM 的 transform：进度每帧都变，走 React state 会让整棵子树每帧重渲染 */
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    /**
     * 减少动态效果下直接不装监听。
     * 视觉上 `motion-reduce:hidden` 已经把它藏了，这里再省掉监听是为了不白烧 CPU
     * —— 藏起来的元素还每帧算进度是没有意义的。
     */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /** 一帧只跑一次的闸门：非 0 表示这一帧已经排过队了 */
    let raf = 0;

    /**
     * 把「已滚动距离 / 可滚动总距离」写进 transform。
     *
     * 用 documentElement（<html>）而不是 body 量高度：body 的 scrollHeight 在部分
     * 浏览器里不包含溢出内容，量出来会偏小，进度条会提前满格。
     * max 为 0 表示这一页根本滚不动（内容比视口短），此时给 0 而不是 NaN。
     */
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
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
      /*
        定位与配色：
        · fixed + top: var(--header-h-total) —— 贴在固定顶栏的下沿。这个变量是全站唯一来源
          （globals.css 里由 --header-h + 1px 边框算出），不写死像素值，顶栏改高度这里自动跟。
        · z-[60] —— 必须高于顶栏（z-50），低于聊天面板（z-80）。
        · origin-left —— scaleX 从左往右长；默认的 center 会变成「从中间往两头撑」。
        · bg-accent —— 全站唯一的强调色（紫）。
        · motion-reduce:hidden —— 减少动态效果下整条不出现。
      */
      className={`pointer-events-none fixed inset-x-0 z-[60] h-0.5 origin-left bg-accent motion-reduce:hidden ${className ?? ''}`}
      style={{ top: 'var(--header-h-total)', transform: 'scaleX(0)' }}
    />
  );
}
