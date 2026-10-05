'use client';

/**
 * 项目列表 —— 「目录行」，不是卡片（2026-10-05 第二期改）。
 *
 * 【改前是什么】每张项目卡是一个圆角盒子：边框 + 底色 + 投影 + 顶部一条暖色渐变线，
 * 排成两列网格，第一张横跨两列当「头号项目」。
 *
 * 【为什么改成目录行】这一页是**作品清单**。清单最适合的形态是目录，不是卡片墙 ——
 * 一列一列的盒子排下来，读者要「进到每个盒子里」才知道里面是什么；
 * 目录行是一列排开、行与行之间一条细线，扫一眼就能横向比较。
 * 更要紧的是：卡片墙正是整页「通用模板感」最大的来源（十几张同款盒子）。
 *
 * 【编号为什么放到 48px】原来编号是标题左边一枚 6px 的小圆点 + 12px 数字，扫过去看不见。
 * 编号放大到和标题同一量级之后，「第一个项目」自然成为这一节的落点，
 * 不需要再靠「跨两列」来强调主次 —— 这也是把 featured 从「占两列」改成「标题大一号」的原因。
 *
 * 【悬停为什么不抬升】站里的规矩是「抬一下」只给真正可点的元素 —— 这里整行可点，
 * 所以可以抬。但目录行更适合**底色变浅**而不是位移：一行 8px 的位移在长列表里
 * 会让整列文字跟着晃，底色变化则是安静的。
 *
 * 【字体】项目标题走 font-song（系统宋体栈），不是 font-display。
 * 标题是站长在后台随手写的**动态内容**，自托管子集覆盖不到，混排会出现半行换字。
 * 详见 globals.css 里 --font-song 的说明。
 *
 * 【数据从哪来】项目存在数据库里，由服务端组件读好当 props 传进来。
 * 本文件是客户端组件，`import type` 进来的 ProjectRecord 编译后会被完全擦除，
 * 不会把 better-sqlite3 带进浏览器包。
 *
 * 【为什么不用 next/link 而是原生 <a>】项目卡指向的是站外（GitHub / 演示地址），
 * next/link 的价值在站内导航的预取，外链用不上。
 * target="_blank" 必须配 rel="noopener noreferrer"：只写 target 的话，
 * 被打开的页面能通过 window.opener 反向操控本站标签页。
 *
 * 【管理员的编辑/删除按钮为什么在 <a> 外面】<a> 里塞 <button> 是非法嵌套
 * （交互元素套交互元素），各浏览器点击行为不一致。所以放在兄弟位置。
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useReveal, CARD_STAGGER } from '@/lib/use-reveal';
import type { ProjectRecord } from '@/lib/content';

/** 管理员操作按钮的统一外观（小、轻、不抢内容） */
const ACTION =
  'inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground';

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

  return (
    <motion.li {...reveal(delay)} className="flex flex-col">
      <a
        href={project.url}
        target="_blank"
        rel="noopener noreferrer"
        /*
          三栏：编号（固定 4rem）｜主体（吃掉剩余宽度）｜日期 + 箭头（贴右）。
          窄屏退化成一栏纵向排 —— 4rem 的编号列在 390px 上会把标题挤成两三个字一行。
          -mx-3 px-3 让悬停底色比正文宽出一点点，读起来是「这一行被指到了」
          而不是「文字块变了色」。
        */
        className="group -mx-3 grid gap-x-6 gap-y-3 rounded-xl px-3 py-6 transition-colors duration-200 hover:bg-foreground/[0.04] sm:grid-cols-[4rem_1fr_auto] sm:py-8"
      >
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

          <span
            className={`leading-relaxed break-words text-muted-foreground ${
              featured ? 'max-w-2xl text-base' : 'text-sm sm:text-base'
            }`}
          >
            {pick(project.summary)}
          </span>

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
          <ArrowUpRight
            size={18}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-warm motion-reduce:transition-none"
          />
        </span>
      </a>

      {/* 管理员操作。只有传了回调才渲染 —— 访客的 DOM 里根本不会有这两个按钮 */}
      {(onEdit || onDelete) && (
        <div className="mb-4 flex gap-2">
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
    /* 行与行之间一条细线（divide-y），整体上下各一条边 —— 目录的样子 */
    <ul className="divide-y divide-border border-y border-border">
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
