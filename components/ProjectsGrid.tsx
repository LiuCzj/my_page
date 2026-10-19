'use client';

/** 项目列表 —— 「目录行」，不是卡片。 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useReveal, CARD_STAGGER } from '@/lib/use-reveal';
import type { ProjectRecord } from '@/lib/content';

function ProjectRow({
  project,
  index,
  delay,
  featured = false,
  onEdit,
  onDelete,
}: {
  project: ProjectRecord;
  index: number;
  delay: number;
  /** 是不是「头号项目」。只有列表里的第一行是，它的标题大一号 */
  featured?: boolean;
  onEdit?: (p: ProjectRecord) => void;
  onDelete?: (p: ProjectRecord) => void;
}) {
  const { pick } = useI18n();
  const reveal = useReveal();

  /** 有正文 = 站内详情页；否则退回外链；两者都没有时整行不可点 */
  const hasBody = project.body.trim().length > 0;
  const baseRow =
    'group -mx-3 grid gap-x-6 gap-y-3 rounded-xl px-3 py-6 transition-colors duration-200 sm:grid-cols-[4rem_1fr_auto] sm:py-8';
  const rowClass = hasBody || project.url ? `${baseRow} hover:bg-foreground/[0.04]` : baseRow;

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`font-mono font-bold leading-none tabular-nums text-warm ${
          featured ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <span className="flex min-w-0 flex-col gap-2">
        <span
          className={`font-song font-bold leading-snug break-words text-foreground transition-colors group-hover:text-warm ${
            featured ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {pick(project.title)}
        </span>

        {/* 摘要可留空：空的时候不占位，卡片只靠标题和技术栈 */}
        {pick(project.summary) && (
          <span
            className={`leading-relaxed break-words text-muted-foreground ${
              featured ? 'max-w-2xl text-base' : 'text-sm sm:text-base'
            }`}
          >
            {pick(project.summary)}
          </span>
        )}

        {/* 技术栈：纯文字用「·」隔开，不再是灰底胶囊（同技术栈那一页的处理）。
            flex-wrap 必须有：窄屏上一行放不下几个长标签。 */}
        {project.stack.length > 0 && (
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px] text-foreground/70">
            {project.stack.map((s, i) => (
              <span key={s} className="break-words">
                {i > 0 && (
                  <span aria-hidden="true" className="mr-2.5 text-muted-foreground/50">
                    ·
                  </span>
                )}
                {s}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
        {project.date && (
          <span className="text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
            {project.date}
          </span>
        )}
        {/* 站内详情页用右箭头，外链用右上箭头 —— 图标本身就是「去哪」的提示 */}
        {hasBody ? (
          <ArrowRight
            size={18}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-warm motion-reduce:transition-none"
          />
        ) : (
          <ArrowUpRight
            size={18}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-warm motion-reduce:transition-none"
          />
        )}
      </span>
    </>
  );

  return (
    <motion.li {...reveal(delay)} className="flex flex-col">
      {hasBody ? (
        <Link href={`/projects/${project.slug}`} className={rowClass}>
          {inner}
        </Link>
      ) : project.url ? (
        <a href={project.url} target="_blank" rel="noopener noreferrer" className={rowClass}>
          {inner}
        </a>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}

      {/* 管理员操作。只有传了回调才渲染 —— 访客的 DOM 里根本不会有这两个按钮 */}
      {(onEdit || onDelete) && (
        <div className="mb-4 flex gap-2">
          {onEdit && (
            <button type="button" onClick={() => onEdit(project)} className="btn-soft">
              <Pencil size={15} aria-hidden="true" />
              编辑
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(project)} className="btn-danger">
              <Trash2 size={15} aria-hidden="true" />
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
    /* 行间细线、上下各一条边 —— 目录的样子。data-protect：非管理员不能选中/复制 */
    <ul data-protect className="divide-y divide-border border-y border-border">
      {items.map((p, i) => (
        <ProjectRow
          key={p.slug}
          project={p}
          index={i}
          delay={CARD_STAGGER * (i + 1)}
          /* 只有第一行当「头号项目」：标题大一号，不再占两列 */
          featured={i === 0}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
