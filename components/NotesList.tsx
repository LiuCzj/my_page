'use client';

/**
 * 笔记列表 —— 期刊式目录（2026-10-05 第二期改）。
 *
 * 【形态】每一项 = 左栏「日期 + 阅读时长」（等宽字，像卷期号）+ 右栏「标题 / 摘要 / 标签」。
 * 两栏各有用途：想按时间找就只扫左栏，想按内容找就只扫右栏 —— 这是目录才有的读法。
 * 改前四行叠在一个竖排块里，每条都长得一样、没有可比较的抓手。
 *
 * 【为什么不用卡片（不用 border + 圆角 + 背景）而用分割线】
 * 笔记列表是「一串条目」，每项都做成卡片会让页面变成一堆方块，
 * 反而看不清哪一条是哪一条。轻卡（只有分割线）是这套三级卡片语言里的第三级。
 *
 * 【标题为什么走 font-song 而不是 font-display】
 * 标题是站长在后台随手写的**动态内容**，自托管宋体子集覆盖不到，
 * 混排会出现「半行是自托管宋体、半行是系统宋体」。详见 globals.css 的 --font-song。
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
import SectionBand from './SectionBand';

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
   * 章节编号（如 "03"）。首页的笔记摘要是第三页，传 "03"；
   * /notes 独立页只有一节，不传即不渲染编号。
   */
  index?: string;
  /** 英文小标（如 "NOTES"）。窄屏不渲染 —— 那点宽度留给标题 */
  latin?: string;
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
          <ul className="mt-10 divide-y divide-border border-y border-border">
            {notes.map((n, i) => (
              <motion.li
                key={n.slug}
                {...reveal(0.06 * (i + 1))}
                className="flex items-start gap-2"
              >
                {/*
                  ── 期刊式目录（2026-10-05 第二期）──────────────────
                  【改前】日期和标题挤在同一个竖排块里，四行叠着（标题／日期·时长／摘要／标签）。
                  读起来是「一串条目」，但每条都长得一样、没有可比较的抓手。
                  【改后】左边一栏专放日期和阅读时长（等宽字，像期刊的卷期号），
                  右边一栏放标题和摘要。视线可以只扫左栏来找时间，或者只扫右栏来找标题 ——
                  两栏各有各的用途，这是目录才有的读法。
                  【为什么整条仍然是链接】手机上没有悬停，只有标题能点的话手指要瞄得很准。
                  所以 <a> 是这两栏的容器，点哪儿都行，整条高度也天然超过 44px。
                  【标题走 font-song】笔记标题是动态内容（站长在后台写的），
                  自托管宋体子集覆盖不到，混排会出现半行换字 —— 详见 globals.css 的 --font-song。
                */}
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
                  <div className="flex shrink-0 flex-col gap-1 pt-6 sm:flex-row">
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
