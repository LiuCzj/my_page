'use client';

/**
 * 来回滚动的条（技术栈、工具共用）。
 *
 * 【原理】把同一份内容渲染两份，每份跑一条「向左移动自身宽度 + 一个间距」的无限动画
 * （app/globals.css 的 @keyframes marquee）。两份首尾相接，视觉上就是无缝循环。
 * reverse 走反向 keyframes，相邻两排方向相反 —— 「来回滚动」的观感就是这么来的。
 *
 * 【为什么会有"不滚"这条分支 —— 这正是他看到的重复】
 * 一条滚动的、内容比容器窄的带子，**必然**同时露出两份一样的标签：
 * 第二份要接在第一份后面填满屏幕，于是「Power BI / Tableau」在视野里出现两次。
 * 内容越短越明显 —— 「业务分析与可视化」只有 4 个短标签，正好撞上。
 * 判据是确定的：单份宽度 ≥ 容器宽度时，任意时刻视野里最多只有一份，才允许滚。
 * 不满足就退回静态换行排列，而不是硬滚出一个穿帮的效果。
 *
 * 【两端淡出】用 CSS mask，不是叠一层渐变遮罩 —— 遮罩层会挡住下面的点击。
 * 【减少动态效果】全局那条 prefers-reduced-motion 会把 animation-duration 压到 0.001ms，
 * 动画瞬间跑完并回到非动画态，所以这一排变成静止列表，内容照常可读。
 */

import { useEffect, useRef, useState } from 'react';

interface MarqueeProps {
  children: React.ReactNode;
  /** 反向滚动（让相邻两排方向相反） */
  reverse?: boolean;
  /** 鼠标悬停时停住，方便看清某一条 */
  pauseOnHover?: boolean;
  /** 一轮多少秒，如 '46s'。内容越长给越大 */
  duration?: string;
  /** 条目间距，默认 0.75rem */
  gap?: string;
  /**
   * 外部强制停住这一排（不只是悬停停）。
   * 触屏用它：点一下图标把名字钉住的那 2.8 秒里，如果这一排还在走，
   * 名字会跟着图标一起漂到边缘，然后被 overflow-hidden 裁掉半截 ——
   * 正好是他说的「没看清就消失了」。停住才读得完。
   */
  paused?: boolean;
  className?: string;
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
  const copyRef = useRef<HTMLDivElement>(null);
  /** null = 还没量过；true = 可以滚；false = 内容太短，静态换行 */
  const [canLoop, setCanLoop] = useState<boolean | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const copy = copyRef.current;
    if (!outer || !copy) return;

    const measure = () => {
      // 比较时把 gap 算进单份宽度：两份之间也隔着一个 gap
      const loop = copy.offsetWidth >= outer.clientWidth;
      setCanLoop((prev) => (prev === loop ? prev : loop));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(copy);
    return () => ro.disconnect();
  }, []);

  const trackBase = 'flex shrink-0 items-center gap-[var(--gap)]';
  const anim = reverse ? 'animate-marquee-reverse' : 'animate-marquee';
  const hold = `${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''} ${
    paused ? '[animation-play-state:paused]' : ''
  }`;

  // 还没量出结果前先按静态渲染：宁可晚一点动起来，也不要第一帧就露出重复
  if (canLoop !== true) {
    return (
      <div
        ref={outerRef}
        className={`flex flex-wrap items-center gap-[var(--gap)] ${className}`}
        style={{ ['--gap' as string]: gap }}
      >
        <div ref={copyRef} className="flex flex-wrap items-center gap-[var(--gap)]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className={`group flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] ${className}`}
      style={{ ['--gap' as string]: gap, ['--duration' as string]: duration }}
    >
      {/* 第一份要能被量出宽度，所以给它 ref；第二份纯装饰，读屏跳过 */}
      <div ref={copyRef} className={`${trackBase} ${anim} ${hold}`}>
        {children}
      </div>
      <div aria-hidden="true" className={`${trackBase} ${anim} ${hold}`}>
        {children}
      </div>
    </div>
  );
}
