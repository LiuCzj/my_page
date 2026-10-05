'use client';

/**
 * ── 跨页与章首页（2026-10-05 新增，同日第二版）──────────────────
 *
 * 【它解决什么】
 * 改前整页是一层底色 + 一串区块标题，从上到下是「一条很长的线」。
 * 现在首页被拆成五个**跨页**：每一页有自己的底色、自己的主导色、自己的背景光、自己的章节名。
 * 滚动时底色和光一直在变，眼睛读到的就是「翻页」而不是「往下滑」。
 *
 * 【一个跨页 = 三样东西】
 *   ① `Band`        —— 通栏底色容器 + 顶部 2px 主导色页眉线 + 这一页自己的背景光（+ 可选的透视网格）
 *   ② `SectionBand` —— 章首页的头部：编号 + 章节名 + 英文小标 + 可选引言 + 可选右侧插槽
 *
 * 【为什么底色和页眉线要做成「通栏」】
 * 正文是 max-w-6xl 居中的，两侧本来就有大片留白。如果底色和线只铺在正文宽度里，
 * 读起来就是「一个宽一点的卡片」，跨页感立刻消失。所以 `Band` 自己铺满整个视口宽，
 * 里面再放居中容器 —— 线从屏幕左边缘一直拉到右边缘，这才是「页」的边界。
 *
 * 【五支主导色分别是谁】见下面的 TONES。每支只出现在三个地方：
 * 页眉线、章节编号、以及该页里的一处强调。其余一律走中性色 —— 这是「颜色多但不花」的全部秘密：
 * **颜色靠「面积」被记住，不靠「数量」**。
 *
 * 【背景光的三条纪律（重要，违反就立刻变模板）】
 * 1. **落点、形状、大小都要跟着页面变**，不能「同一个位置换五种颜色」。
 *    封面光在顶部（名字在上）／关于我在左下（地球在左）／项目在右侧／笔记在左上／版权页从底部升起。
 * 2. **强度只由 `--band-light` 一个变量控制**，深浅两档各取一个值（浅色底上光一浓就发脏）。
 * 3. **光必须挂在 Band 内部**。整页那层 `body::before` 已经被不透明的跨页底色整个盖住、
 *    所以撤掉了 —— 任何全屏 fixed 的装饰层在这里都是无效的。
 *
 * 【字体】章节名走 `--font-display`（自托管的思源宋体子集）。
 * ⚠️ 那份子集是**按页面用字手工裁的**，只含固定的几十个字形。
 * 往这里传新的中文标题之前，必须先把字加进子集并重新生成（命令见 DOWNLOADS.md），
 * 否则会静默退回系统宋体 —— 不报错，但手机和电脑长得不一样。
 * （反过来，**动态内容**（项目标题、笔记标题）必须走 `font-song` 那支纯系统栈，理由见 globals.css。）
 */

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
  /**
   * 这一页的背景光：整条 radial-gradient。
   * 用 `var(--band-light)` 当透明度 —— 深浅两档的强度差别只在 globals.css 里那一个数。
   */
  light: string;
}

/**
 * 五个跨页各自的底色、主导色、背景光。
 *
 * 【为什么复用现有色令牌而不是新开五支色】
 * 页面本来就有品牌紫、交互青、珊瑚橘、薄荷绿、琥珀五支（见 globals.css 的色板说明）。
 * 改前的问题是**它们全挤在小图标上**，几平方厘米的面积谁也记不住。
 * 现在让每支负责一整页 —— 色值一个没加，观感从「杂」变成「有秩序」。
 */
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
 *
 * @param tone 跨页名，决定底色、页眉线颜色与背景光
 * @param id 页内锚点（如 projects），首屏那颗「查看我的项目」按钮指向它
 * @param innerClassName 内层居中容器的附加类。跨页之间的上下留白**故意不统一**：
 *   封面是一整屏，留白要最大；中间的正文页用默认档就够。均匀的留白会把翻页感抹平。
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
      /*
        scroll-mt 用全站统一的锚点补偿量（--anchor-offset）：锚点跳转后标题要停在
        固定顶栏下方，不能藏在栏后面。这个值在 globals.css 里由 --header-h 算出来。
      */
      className="relative scroll-mt-[var(--anchor-offset)]"
      style={{ backgroundColor: bandBg(tone) }}
    >
      {/*
        这一页自己的背景光。pointer-events-none + 无 z-index（不建层叠上下文）——
        它天然画在 section 背景之上、正文之下，正文不需要再抬层级。
      */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: spec.light }} />

      {/*
        ── 透视网格（只给封面）────────────────────────────────────
        【为什么只给一页】这是全站唯一的「招牌元素」。招牌的价值在于**稀有** ——
        五页都铺就是壁纸，一页铺才是记号。
        【怎么做出来的】两条 1px 的 linear-gradient 交叉成方格，再用
        perspective + rotateX 把这块方格「放倒」成一个地板，配 transform-origin 在底边，
        于是横线朝消失点收拢。顶部用 mask 渐隐，免得网格硬切在标题上。
        【为什么是 transform 而不是别的】transform 不触发重排，纯合成层，滚动时不掉帧。
        【它在动】格线朝观察者方向持续推进（animate-grid-travel，见 globals.css），
        6 秒走一格。这是全站唯一的「背景在动」—— 它让封面有「一直往前」的感觉，
        而且因为它动得慢、对比低，不会跟正文抢注意力。
        【深浅两档的透明度差别很大】浅色底上网格稍浓一点就变「工程图纸」，深色底上太淡又完全看不见，
        所以两档分开给（见下面的 opacity 类）。
      */}
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

      {/*
        页眉线：2px 实色，铺满整条视口宽。
        【为什么是实线而不是渐隐线】渐隐线读起来像「装饰」，实线读起来像「页的边界」——
        这五个跨页要的是后者。宽度也别往下调：1px 在 1 倍屏和缩略图里不足一个像素。
      */}
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
 *
 * @param tone 跨页名，决定编号的颜色
 * @param index 章节编号（如 "02"）。不传则不渲染编号
 * @param title 章节名。走宋体（见文件头的字体说明）
 * @param latin 英文小标（如 "ABOUT"）。窄屏不渲染 —— 那点宽度留给标题
 * @param lead 引言。留空则不渲染
 * @param aside 标题行右侧的插槽（如一张小像）。和 latin 上下排列，一起靠右
 * @param id 标题的 id，供外层 section 的 aria-labelledby 指向
 * @param as 标题标签级。一个页面只能有一个 h1：首页区块用 h2，独立页用 h1
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
  /*
    章节名走宋体 + font-bold 而不是 font-black。
    【为什么不用最粗】宋体的好看在于横细竖粗的对比，压到 900 会把横画也撑厚，
    那点书卷气就没了。体量交给字号（36→48px），粗细只到 bold。
  */
  const headingClass = 'font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl';

  return (
    <header id={id} className="scroll-mt-[var(--anchor-offset)]">
      {/*
        编号与标题**同一基线并排**（改前是「编号在上、标题在下」两行）。
        并排读起来是「第 02 章 · 关于我」一个整体；分两行读起来是两条互不相干的信息。
        右侧用 items-start：插槽（小像）顶部对齐标题行顶，不会被标题的基线拖下去。
      */}
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
