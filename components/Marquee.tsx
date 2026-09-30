'use client';

/**
 * 来回滚动的条（技术栈、工具都用它）。
 *
 * 【原理】把同一份内容渲染 repeat 份，每份都跑一条「向左移动自身宽度 + 一个间距」的
 * 无限动画（app/globals.css 里的 @keyframes marquee）。两份首尾相接，视觉上就是无缝循环。
 * reverse 走另一条反向的 keyframes，于是相邻两排方向相反 —— 这是「来回滚动」的观感来源。
 *
 * 【两端淡出】用 CSS mask，不是叠一层渐变遮罩。遮罩层会挡住下面的点击，mask 不会。
 *
 * 【系统开了「减少动态效果」会怎样】globals.css 里那条全局规则会把 animation-duration
 * 压到 0.001ms、iteration-count 压到 1，动画瞬间跑完并停在非动画态（translateX(0)），
 * 所以这一排变成静止列表，内容照常可读 —— 不会空白，也不会疯狂抖动。
 */

interface MarqueeProps {
  children: React.ReactNode;
  /** 反向滚动（用来让相邻两排方向相反） */
  reverse?: boolean;
  /** 鼠标悬停时停住，方便看清某一条 */
  pauseOnHover?: boolean;
  /** 一轮多少秒，如 '46s'。内容越长给越大 */
  duration?: string;
  /** 条目间距，默认 0.75rem */
  gap?: string;
  /** 内容重复几份，默认 2（够铺满一屏宽就够，多了白烧 CPU） */
  repeat?: number;
  className?: string;
}

export default function Marquee({
  children,
  reverse = false,
  pauseOnHover = true,
  duration = '40s',
  gap = '0.75rem',
  repeat = 2,
  className = '',
}: MarqueeProps) {
  return (
    <div
      className={`group flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] ${className}`}
      style={{ ['--duration' as string]: duration, ['--gap' as string]: gap }}
    >
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0 ? true : undefined}
          className={`flex shrink-0 items-stretch justify-around gap-[var(--gap)] ${
            reverse ? 'animate-marquee-reverse' : 'animate-marquee'
          } ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
