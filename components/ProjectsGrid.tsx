'use client';

/**
 * 项目卡片网格。
 *
 * 【为什么抽成独立组件】
 * 首页的「项目」摘要区块和 `/projects` 页展示的是同一批数据、同一套卡片，
 * 只是条数不同。样式写在两处早晚会漂移（改了一边忘了另一边），
 * 所以卡片本身只写一遍，两处都用它。
 *
 * 【数据从哪来】项目存在数据库里，由服务端组件读好当 props 传进来。
 * 本文件是客户端组件，`import type` 进来的 ProjectRecord 编译后会被完全擦除，
 * 不会把 better-sqlite3 带进浏览器包。
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
 * 【管理员的编辑/删除按钮为什么放在卡片外面】
 * 卡片本身是一个 <a>。把 <button> 塞进 <a> 里是非法嵌套（交互元素套交互元素），
 * 点击行为在各浏览器上表现不一致。所以按钮放在 <a> 的**兄弟位置**，排在卡片下方。
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useReveal, CARD_REVEAL, CARD_STAGGER } from '@/lib/use-reveal';
import { useScrollCard } from '@/lib/use-scroll-fx';
import type { ProjectRecord } from '@/lib/content';

/** 管理员操作按钮的统一外观（小、轻、不抢卡片） */
const ACTION =
  'inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground';

function ProjectCard({
  project,
  delay,
  index,
  onEdit,
  onDelete,
}: {
  project: ProjectRecord;
  delay: number;
  index: number;
  onEdit?: (p: ProjectRecord) => void;
  onDelete?: (p: ProjectRecord) => void;
}) {
  const { pick } = useI18n();
  const reveal = useReveal(CARD_REVEAL);
  const { ref, focus, y } = useScrollCard<HTMLLIElement>(8);

  return (
    /*
      【布局】li 是 flex 列：卡片 flex-1 撑满，管理员按钮排在下面。
      踩过的坑：原来卡片写 h-full、按钮直接跟在后面，于是卡片先占满整个格子高度、
      按钮再往下挤出去，压到了下一行的卡片上（用户实测反馈）。
      改成「li 定高、卡片 flex-1」，按钮自然待在格子内。
    */
    <motion.li ref={ref} {...reveal(delay)} className="flex flex-col">
      <motion.a
        href={project.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ y }}
        className="card card-hoverable group relative flex flex-1 flex-col p-4 sm:p-5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-warm via-accent/70 to-transparent opacity-65 transition-opacity duration-300 group-hover:opacity-100 sm:inset-x-5"
        />
        {/* 焦点接力高光：这张卡离视口中心越近越亮，见 lib/use-scroll-fx.ts */}
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
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[0.2em] text-warm">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warm shadow-[0_0_10px_hsl(var(--warm)/0.5)]" />
            {String(index + 1).padStart(2, '0')}
          </span>
          <ArrowUpRight
            size={17}
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-accent motion-reduce:transition-none"
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
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[13px] font-semibold text-secondary-foreground"
              >
                {s}
              </span>
            ))}
          </span>
        )}

        {/* mt-auto 把日期推到卡片底部：同一行的两张卡高度不同时，日期仍然对齐 */}
        {project.date && (
          <span className="mt-auto pt-3 text-[13px] font-semibold text-muted-foreground">
            {project.date}
          </span>
        )}
      </motion.a>

      {/* 管理员操作。只有传了回调才渲染 —— 访客的 DOM 里根本不会有这两个按钮 */}
      {(onEdit || onDelete) && (
        <div className="mt-2 flex gap-2">
          {onEdit && (
            <button type="button" onClick={() => onEdit(project)} className={ACTION}>
              <Pencil size={13} aria-hidden="true" />
              编辑
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(project)} className={ACTION}>
              <Trash2 size={13} aria-hidden="true" />
              删除
            </button>
          )}
        </div>
      )}
    </motion.li>
  );
}

export default function ProjectsGrid({
  items,
  onEdit,
  onDelete,
}: {
  items: ProjectRecord[];
  onEdit?: (p: ProjectRecord) => void;
  onDelete?: (p: ProjectRecord) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {items.map((p, i) => (
        <ProjectCard
          key={p.slug}
          project={p}
          delay={CARD_STAGGER * (i + 1)}
          index={i}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
