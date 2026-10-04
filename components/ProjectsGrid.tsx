'use client';

/**
 * 项目卡片网格。
 *
 * 【为什么抽成独立组件】
 * 首页的「项目」摘要区块和 `/projects` 页展示的是同一批数据、同一套卡片，
 * 只是条数不同。样式写在两处早晚会漂移（改了一边忘了另一边），
 * 所以卡片本身只写一遍，两处都用它。
 *
 * 【卡片为什么整张可点，而不是「标题是链接、其他地方不是」】
 * 和笔记列表同一个理由：手机上没有悬停，只有标题那几个字能点的话手指要瞄得很准。
 * 整张卡可点之后，点哪儿都行，且卡片高度天然超过 44px。
 *
 * 【为什么不用 next/link 而是原生 <a>】
 * 项目卡指向的是站外（GitHub / 演示地址），不是站内路由。
 * next/link 的价值在站内导航的预取，外链用不上，用 <a> 更直白。
 * target="_blank" 必须配 rel="noopener noreferrer"：
 * 只写 target 的话，被打开的页面能通过 window.opener 反向操控本站标签页。
 *
 * 【绝不要给卡片写 transition-all】
 * 入场动画由 framer-motion 每帧写内联 transform。transition-all 会让 CSS
 * 去补间那些 transform，滚动入场会被拖出残影。
 * 卡面样式走 globals.css 的 .card / .card-hoverable（那里也只过渡指定属性）。
 */

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import { useScrollCard } from '@/lib/use-scroll-fx';

/**
 * 单张项目卡。
 *
 * 【为什么抽成组件】两张特效各需要一个 hook，而 hook 不能在 map 里调用
 * —— 所以每张卡必须是自己的组件，不能把特效直接写进下面的 map。
 *
 * 【三条动画为什么分挂在两个元素上】
 * - li  ：入场位移（useReveal 写 transform）
 * - a   ：视差位移（随滚动上下 8px）
 * 各占一个元素，因为两条都是 transform，挂一处会互相覆盖。
 * 高光那层只写 opacity，挂哪儿都不冲突，就放在 a 里。
 *
 * 【视差为什么只给卡片、不给磁贴】
 * 磁贴（Dashboard 的 Tile）是 overflow-hidden 的，卡片内容一旦位移就会在边缘露出缝；
 * 项目卡没有裁切，位移只会让相邻两张卡之间错开一点，正是想要的手感。
 *
 * 【编号（2026-10-04 新增）】
 * 参考 huyml.co 那类获奖作品集：给每件作品一个 01 / 02 / 03 的序号。
 * 它补上了卡片原来缺的「视觉锚点」—— 没有封面图时，一个等宽编号 + 一行标题
 * 就是这张卡的眼睛，也让卡片之间有了一种「清单」的秩序感。
 * index 从父组件传进来，而不是在卡里自增，因为两张卡分属两个 li、没有共享状态。
 */
function ProjectCard({
  project,
  delay,
  index,
}: {
  project: (typeof site.projects)[number];
  delay: number;
  index: number;
}) {
  const { pick } = useI18n();
  const reveal = useReveal();
  const { ref, focus, y } = useScrollCard<HTMLLIElement>(8);

  return (
    <motion.li ref={ref} {...reveal(delay)}>
      <motion.a
        href={project.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ y }}
        className="card card-hoverable group relative flex h-full flex-col p-4 sm:p-5"
      >
        {/* 焦点接力高光：这张卡离视口中心越近越亮，见 lib/use-scroll-fx.ts。
            同一行两张卡的进度不同，往下滚时高光在卡片之间依次传递 */}
        <motion.span
          aria-hidden="true"
          style={{
            opacity: focus,
            boxShadow:
              'inset 0 0 0 1px hsl(var(--accent) / 0.45), 0 0 30px -12px hsl(var(--accent) / 0.4)',
          }}
          className="pointer-events-none absolute inset-0 rounded-xl"
        />

        {/* 顶部一行：编号（左）+ 外链箭头（右） */}
        <span className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs font-bold tracking-[0.2em] text-muted-foreground/60">
            {String(index + 1).padStart(2, '0')}
          </span>
          {/* 箭头悬停时向右上「推出去」一点，暗示「点了会跳走」；
              颜色同时转 accent，和标题的变化对齐 */}
          <ArrowUpRight
            size={17}
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none"
            aria-hidden="true"
          />
        </span>

        <span className="text-lg font-bold leading-snug break-words text-foreground transition-colors group-hover:text-accent">
          {pick(project.title)}
        </span>

        <span className="mt-2 text-sm leading-relaxed break-words text-muted-foreground">
          {pick(project.summary)}
        </span>

        {/* 技术栈标签。flex-wrap 是必须的：窄屏上一行放不下三个长标签 */}
        {project.stack.length > 0 && (
          <span className="mt-3 flex flex-wrap gap-1.5">
            {project.stack.map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
              >
                {s}
              </span>
            ))}
          </span>
        )}

        {/* mt-auto 把日期推到卡片底部：同一行的两张卡高度不同时，日期仍然对齐 */}
        {project.date && (
          <span className="mt-auto pt-3 text-xs font-semibold text-muted-foreground">
            {project.date}
          </span>
        )}
      </motion.a>
    </motion.li>
  );
}

export default function ProjectsGrid({ items }: { items: typeof site.projects }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {items.map((p, i) => (
        <ProjectCard key={p.slug} project={p} delay={0.06 * (i + 1)} index={i} />
      ))}
    </ul>
  );
}
