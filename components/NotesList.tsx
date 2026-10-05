'use client';

/**
 * 笔记列表。
 * 每一项 = 标题 / 日期 + 阅读时长 / 一句话摘要 / 标签，四行竖排。
 * 不用卡片（不用 border + 圆角 + 背景）而用分割线：笔记列表是「一串条目」，
 * 每项都做成卡片会让页面变成一堆方块，反而看不清哪一条是哪一条。
 *
 * 【整项是一条链接，不是只有标题可点】
 * 这是为手机做的决定。触屏上没有悬停，也没有光标提示「这里可点」，
 * 只有标题那几个字能点的话，手指要瞄得很准。整项可点之后，
 * 点哪儿都行，而且整项的高度天然超过 44px 的触控下限，不用额外补。
 *
 * 【管理员的编辑/删除按钮为什么排在链接外面】
 * 列表项本身是一个 <a>。把 <button> 塞进 <a> 里是非法嵌套（交互元素套交互元素），
 * 点击行为在各浏览器上不一致。所以按钮放在 <a> 的**兄弟位置** —— 只有传了回调才渲染，
 * 访客的 DOM 里根本不会有这两个按钮。
 *
 * 【为什么标题要 break-words】
 * 中文标题没有空格，浏览器默认不在汉字之间断行（取决于 word-break 设置）。
 * 一个长标题在 375px 宽的屏上会直接把容器撑宽，连带整页出现横向滚动条。
 *
 * 【NoteMeta 为什么用 import type】
 * lib/content.ts 依赖 better-sqlite3。`import type` 在编译后会被完全擦除，
 * 不会产生运行时 import；写成普通 import 就会把原生模块打进浏览器包并直接报错。
 */

import Link from 'next/link';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import type { NoteMeta } from '@/lib/content';
import SectionHeader from './SectionHeader';

interface NotesListProps {
  notes: NoteMeta[];
  /**
   * 标题用几级。笔记页自己是 h1，首页的摘要区块是 h2 ——
   * 一个页面只能有一个 h1，这个 prop 就是为这条规则存在的。
   */
  headingLevel?: 1 | 2;
  /** 传了就渲染「查看全部笔记」入口，指向它 */
  viewAllHref?: string;
  /**
   * 章节编号（如 "02"）。首页的笔记摘要是第二章，传 "02"；
   * /notes 独立页只有一节，不传即不渲染编号。
   */
  index?: string;
  /** 管理员才传：传了就在每条右侧渲染「编辑」按钮 */
  onEdit?: (note: NoteMeta) => void;
  /** 管理员才传：传了就在每条右侧渲染「删除」按钮 */
  onDelete?: (note: NoteMeta) => void;
}

/** 管理员操作按钮的统一外观 */
const ACTION =
  'inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground';

export default function NotesList({
  notes,
  headingLevel = 2,
  viewAllHref,
  index,
  onEdit,
  onDelete,
}: NotesListProps) {
  const { d, fill } = useI18n();
  const reveal = useReveal();

  return (
    <section aria-labelledby="notes-title">
      <SectionHeader
        as={headingLevel === 1 ? 'h1' : 'h2'}
        index={index}
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
          <ul className="mt-6 divide-y divide-border border-t border-border">
            {notes.map((n, i) => (
              <motion.li
                key={n.slug}
                {...reveal(0.06 * (i + 1))}
                className="flex items-start gap-2"
              >
                <Link
                  href={`/notes/${n.slug}`}
                  className="group flex min-w-0 flex-1 flex-col gap-1.5 py-5 no-underline transition-colors hover:bg-secondary/40 sm:px-2"
                >
                  <span className="text-lg font-bold leading-snug break-words text-foreground transition-colors group-hover:text-accent">
                    {n.title}
                  </span>

                  {/* 日期 + 阅读时长并排。whitespace-nowrap 防止在中间断成两行 */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
                    <time dateTime={n.date}>{n.date}</time>
                    <span aria-hidden="true">·</span>
                    {fill(d.notes.readTime, { minutes: n.readingMinutes })}
                    {/* 草稿只在管理员看得见的列表里出现，所以这里出现就一定要标出来 */}
                    {n.draft && (
                      <span className="rounded-full border border-accent/50 px-2 py-0.5 text-accent">
                        {d.admin.draftBadge}
                      </span>
                    )}
                  </span>

                  <span className="text-sm leading-relaxed break-words text-muted-foreground">
                    {n.summary}
                  </span>

                  {n.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {n.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[13px] font-semibold text-secondary-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>

                {(onEdit || onDelete) && (
                  <div className="flex shrink-0 flex-col gap-1 pt-5 sm:flex-row">
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(n)} className={ACTION}>
                        <Pencil size={13} aria-hidden="true" />
                        {d.admin.edit}
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(n)} className={ACTION}>
                        <Trash2 size={13} aria-hidden="true" />
                        {d.admin.delete}
                      </button>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </ul>

          {viewAllHref && (
            /*
              文字链接必须自己撑到 44px：它没有卡片的天然高度，
              手机上就是一行 20 来像素的字，很难点中。
              inline-flex + min-h 是站里统一的做法（页脚那两栏也是这么做的）。
            */
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
