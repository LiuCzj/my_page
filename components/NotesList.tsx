'use client';

/** 笔记列表 —— 期刊式目录。 */

import Link from 'next/link';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import type { NoteMeta } from '@/lib/content';
import SectionBand from './SectionBand';

interface NotesListProps {
  notes: NoteMeta[];
  /** 标题用几级。笔记页自己是 h1，首页的摘要区块是 h2 ——一个页面只能有一个 h1，这个 prop 就是为这条规则存在的。 */
  headingLevel?: 1 | 2;
  /** 传了就渲染「查看全部笔记」入口，指向它 */
  viewAllHref?: string;
  /** 章节编号（如 "03"）。首页的笔记摘要是第三页，传 "03"； */
  index?: string;
  /** 英文小标（如 "NOTES"）。窄屏不渲染 —— 那点宽度留给标题 */
  latin?: string;
  /** 管理员才传：传了就在每条右侧渲染「编辑」按钮 */
  onEdit?: (note: NoteMeta) => void;
  /** 管理员才传：传了就在每条右侧渲染「删除」按钮 */
  onDelete?: (note: NoteMeta) => void;
}

export default function NotesList({
  notes,
  headingLevel = 2,
  viewAllHref,
  index,
  latin,
  onEdit,
  onDelete,
}: NotesListProps) {
  const { d, fill } = useI18n();
  const reveal = useReveal();

  return (
    <section aria-labelledby="notes-title">
      <SectionBand
        tone="notes"
        as={headingLevel === 1 ? 'h1' : 'h2'}
        index={index}
        latin={latin}
        id="notes-title"
        title={d.notes.title}
        lead={d.notes.lead}
      />

      {notes.length === 0 ? (
        /* 空态：明确说「这里还空着」并给出下一步，而不是留一个看起来坏掉的洞 */
        <motion.div
          {...reveal(0.12)}
          role="status"
          className="mt-6 rounded-lg border border-dashed border-border bg-card p-6 text-center sm:p-8"
        >
          <p className="text-base font-semibold text-foreground">{d.notes.empty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {d.notes.emptyHint}
          </p>
        </motion.div>
      ) : (
        <>
          {/* data-protect：非管理员不能选中/复制 */}
          <ul data-protect className="mt-10 divide-y divide-border border-y border-border">
            {notes.map((n, i) => (
              <motion.li
                key={n.slug}
                {...reveal(0.06 * (i + 1))}
                className="flex items-start gap-2"
              >
                {/* ── 期刊式目录 ────────────────── */}
                <Link
                  href={`/notes/${n.slug}`}
                  className="group grid min-w-0 flex-1 gap-x-6 gap-y-2 rounded-xl py-6 no-underline transition-colors hover:bg-foreground/[0.04] sm:grid-cols-[7rem_1fr] sm:px-3 sm:py-8"
                >
                  {/* 左栏：日期 + 阅读时长 */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] font-semibold text-muted-foreground sm:flex-col sm:items-start sm:gap-1">
                    <time dateTime={n.date} className="tabular-nums">
                      {n.date}
                    </time>
                    <span className="text-muted-foreground/60">
                      {fill(d.notes.readTime, { minutes: n.readingMinutes })}
                    </span>
                  </span>

                  {/* 右栏：标题 + 摘要 + 标签 */}
                  <span className="flex min-w-0 flex-col gap-2">
                    <span className="font-song text-2xl font-bold leading-snug break-words text-foreground transition-colors group-hover:text-accent sm:text-3xl">
                      {n.title}
                    </span>

                    <span className="text-sm leading-relaxed break-words text-muted-foreground">
                      {n.summary}
                    </span>

                    {/* 标签：从灰底胶囊改成「#标签」的纯文字 —— 它是元数据，不该长得像按钮 */}
                    {(n.tags.length > 0 || n.draft) && (
                      <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {n.draft && (
                          <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[13px] font-semibold text-accent">
                            {d.admin.draftBadge}
                          </span>
                        )}
                        {n.tags.map((t) => (
                          <span key={t} className="text-[13px] text-muted-foreground/80">
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </Link>

                {(onEdit || onDelete) && (
                  <div className="flex shrink-0 flex-col gap-2 pt-5 sm:flex-row">
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(n)} className="btn-soft">
                        <Pencil size={15} aria-hidden="true" />
                        {d.admin.edit}
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(n)} className="btn-danger">
                        <Trash2 size={15} aria-hidden="true" />
                        {d.admin.delete}
                      </button>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </ul>

          {viewAllHref && (
            /* 文字链接必须自己撑到 44px：它没有卡片的天然高度，手机上就是一行 20 来像素的字，很难点中。 */
            <motion.div {...reveal(0.12)} className="mt-4">
              <Link
                href={viewAllHref}
                className="link-underline inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-accent"
              >
                {d.notes.viewAll}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </motion.div>
          )}
        </>
      )}
    </section>
  );
}
