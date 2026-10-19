'use client';

/** ── 跨页与章首页 ────────────────── */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useReveal } from '@/lib/use-reveal';

/** 五个跨页的名字。新增一页要同时在这里、globals.css 的底色令牌、以及页面上各加一处 */
export type BandTone = 'cover' | 'about' | 'works' | 'notes' | 'colophon';

interface ToneSpec {
  /** 底色令牌名。在 globals.css 里按深浅两档各定义一次，这里只记名字 */
  band: string;
  /** 这一页的主导色令牌名 */
  accent: string;
  /** 这一页的背景光：整条 radial-gradient。 */
  light: string;
}

/** 五个跨页各自的底色、主导色、背景光。 */
const TONES: Record<BandTone, ToneSpec> = {
  cover: {
    band: '--band-cover',
    accent: '--brand',
    /* 光在最上方、铺得最宽：这一页的主角（名字）就在上面，光要托着它 */
    light: 'radial-gradient(88% 62% at 50% -8%, hsl(var(--brand) / var(--band-light)), transparent 72%)',
  },
  about: {
    band: '--band-about',
    accent: '--accent',
    /* 光在左下：这一页最大的东西（地球）在左边，光从它背后起 */
    light: 'radial-gradient(58% 62% at 6% 104%, hsl(var(--accent) / var(--band-light)), transparent 70%)',
  },
  works: {
    band: '--band-works',
    accent: '--warm',
    /* 光在右上：作品是「向外」的一页，光从右边缘扫进来 */
    light: 'radial-gradient(62% 70% at 104% 18%, hsl(var(--warm) / var(--band-light)), transparent 70%)',
  },
  notes: {
    band: '--band-notes',
    accent: '--accent-2',
    /* 光在左上：笔记是「向内读」的一页，光收在标题那一角 */
    light: 'radial-gradient(52% 52% at -4% -6%, hsl(var(--accent-2) / var(--band-light)), transparent 70%)',
  },
  colophon: {
    band: '--band-colophon',
    accent: '--muted-foreground',
    /* 光从底部升起：收口页，像地平线 */
    light: 'radial-gradient(86% 66% at 50% 132%, hsl(var(--accent) / var(--band-light)), transparent 74%)',
  },
};

/**
 * 取某一页的底色 / 主导色，返回可直接写进 style 的 CSS 值。
 * @param tone 跨页名
 * @returns `hsl(var(--...))` 形式的字符串
 */
export const bandBg = (tone: BandTone): string => `hsl(var(${TONES[tone].band}))`;
export const bandAccent = (tone: BandTone): string => `hsl(var(${TONES[tone].accent}))`;

/**
 * 通栏底色容器。
 * @param tone 跨页名，决定底色、页眉线颜色与背景光
 * @param id 页内锚点（如 projects），首屏那颗「查看我的项目」按钮指向它
 * @param innerClassName 内层居中容器的附加类。跨页之间的上下留白**故意不统一**：
 * @param grid 是否铺一层透视网格。**只有封面开**（见下面的说明）
 * @param children 页面内容。由服务端组件传进来，因此这个组件本身可以保持很薄
 * @returns 一个铺满视口宽度的 section
 */
export function Band({
  tone,
  id,
  innerClassName = 'py-16 sm:py-24',
  grid = false,
  children,
}: {
  tone: BandTone;
  id?: string;
  innerClassName?: string;
  grid?: boolean;
  children: ReactNode;
}) {
  const spec = TONES[tone];

  return (
    <section
      id={id}
      /* scroll-mt 用全站统一的锚点补偿量（--anchor-offset）：锚点跳转后标题要停在 */
      className="relative scroll-mt-[var(--anchor-offset)]"
      style={{ backgroundColor: bandBg(tone) }}
    >
      {/* 这一页自己的背景光。pointer-events-none + 无 z-index（不建层叠上下文）——它天然画在 section 背景之上、正文之下，正文不需要再抬层级。 */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: spec.light }} />

      {/* ── 透视网格（只给封面）──────────────────────────────────── */}
      {grid && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] overflow-hidden">
          <span
            className="animate-grid-travel absolute inset-0 opacity-[0.5] dark:opacity-[0.85]"
            style={{
              backgroundImage:
                'linear-gradient(to right, hsl(var(--brand) / 0.32) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--brand) / 0.32) 1px, transparent 1px)',
              backgroundSize: '58px 58px',
              transform: 'perspective(340px) rotateX(64deg)',
              transformOrigin: '50% 100%',
              maskImage: 'linear-gradient(to top, #000 12%, transparent 76%)',
              WebkitMaskImage: 'linear-gradient(to top, #000 12%, transparent 76%)',
            }}
          />
        </span>
      )}

      {/* 页眉线：2px 实色，铺满整条视口宽。 */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: bandAccent(tone) }}
      />
      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${innerClassName}`}>{children}</div>
    </section>
  );
}

/**
 * 章首页的头部：编号 + 章节名 + 英文小标 + 可选引言 + 可选右侧插槽。
 * @param tone 跨页名，决定编号的颜色
 * @param index 章节编号（如 "02"）。不传则不渲染编号
 * @param title 章节名。走宋体（见文件头的字体说明）
 * @param latin 英文小标（如 "ABOUT"）。窄屏不渲染 —— 那点宽度留给标题
 * @param lead 引言。留空则不渲染
 * @param aside 标题行右侧的插槽（如一张小像）。和 latin 上下排列，一起靠右
 */
export default function SectionBand({
  tone,
  index,
  title,
  latin,
  lead,
  aside,
  id,
  as = 'h2',
}: {
  tone: BandTone;
  index?: string;
  title: string;
  latin?: string;
  lead?: string;
  aside?: ReactNode;
  id?: string;
  as?: 'h1' | 'h2';
}) {
  const reveal = useReveal();
  const accent = bandAccent(tone);
  /* 章节名走宋体 + font-bold 而不是 font-black。 */
  const headingClass = 'font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl';

  return (
    <header id={id} className="scroll-mt-[var(--anchor-offset)]">
      {/* 编号与标题同一基线并排。 */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-baseline gap-3 sm:gap-4">
          {index && (
            <motion.span
              {...reveal(0)}
              aria-hidden="true"
              className="font-mono text-sm font-bold tabular-nums"
              style={{ color: accent }}
            >
              {index}
            </motion.span>
          )}

          {/* 显式分两支而不是把 motion.h1 / motion.h2 存进变量：
              两者的 props 类型不同，存成联合类型后 TS 会在展开 {...reveal()} 时报错 */}
          {as === 'h1' ? (
            <motion.h1 {...reveal(0.04)} className={headingClass}>
              {title}
            </motion.h1>
          ) : (
            <motion.h2 {...reveal(0.04)} className={headingClass}>
              {title}
            </motion.h2>
          )}
        </div>

        {(latin || aside) && (
          <div className="flex shrink-0 flex-col items-end gap-3">
            {latin && (
              <motion.span
                {...reveal(0.08)}
                aria-hidden="true"
                className="hidden font-mono text-[11px] font-semibold tracking-[0.3em] text-muted-foreground sm:block"
              >
                {latin}
              </motion.span>
            )}
            {aside && <motion.div {...reveal(0.12)}>{aside}</motion.div>}
          </div>
        )}
      </div>

      {lead && (
        <motion.p
          {...reveal(0.1)}
          className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground"
        >
          {lead}
        </motion.p>
      )}
    </header>
  );
}
