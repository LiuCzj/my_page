'use client';

/**
 * 编辑式区块头：编号 + 大标题 + 副标题。
 *
 * 【为什么要有这个组件】
 * 改之前，区块标题在各处各写一遍（Projects / NotesList / ProjectsPageBody 三份），
 * 都是 `text-2xl sm:text-3xl font-black`，字号与正文的差不够，长页面读下来缺节奏；
 * 而且三份样式早晚会漂移。抽成一个组件后，标题只有一处定义。
 *
 * 【为什么加「编号」】
 * 参考 huyml.co 一类获奖作品集的做法：给区块一个 01 / 02 的章节号，
 * 配合首页那几条 FlowLink 流光连接线，整页就有了「第几章」的顺序感 ——
 * 编号本身不承载信息，它承担的是「这是一份被编排过的文档」这个印象。
 * 编号可选：独立页（/projects、/notes）只有一节，编号就没有意义，传空即不渲染。
 *
 * 【为什么编号旁要跟一条渐隐横线】
 * 光一个数字飘在标题上方会显得孤零零；一条从 accent 渐隐到透明的细线把它和标题连起来，
 * 既定了「这是章节号」的读法，也顺带给区块之间补了一道视觉分隔。
 *
 * 【大标题为什么要拉到 text-4xl】
 * 层级感来自尺度差，不是来自字重。正文 16px 不动，标题从 30px 提到 36px，
 * 读者扫一眼就知道「这里换章了」，不必逐字读。
 */

import { motion } from 'framer-motion';
import { useReveal } from '@/lib/use-reveal';

interface SectionHeaderProps {
  /** 章节编号（如 "01"）。留空则不渲染编号那一行 */
  index?: string;
  title: string;
  /** 副标题。留空则不渲染 */
  lead?: string;
  /** 标题的 id，供外层 section 的 aria-labelledby 指向 */
  id?: string;
  /** 标题标签级。一个页面只能有一个 h1：首页区块用 h2，独立页用 h1 */
  as?: 'h1' | 'h2';
}

export default function SectionHeader({ index, title, lead, id, as = 'h2' }: SectionHeaderProps) {
  const reveal = useReveal();
  const headingClass = 'text-3xl font-black tracking-tight text-foreground sm:text-4xl';
  const headingDelay = index ? 0.04 : 0;

  return (
    <div>
      {index && (
        <motion.div {...reveal(0)} className="mb-3 flex items-center gap-3">
          <span className="font-mono text-xs font-bold tracking-[0.22em] text-warm">{index}</span>
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-gradient-to-r from-warm/55 via-accent/35 to-transparent"
          />
        </motion.div>
      )}

      {/* 显式分两支而不是把 motion.h1 / motion.h2 存进变量：两者的 props 类型不同，
          存成联合类型后 TS 会在展开 {...reveal()} 时报错 */}
      {as === 'h1' ? (
        <motion.h1 {...reveal(headingDelay)} id={id} className={headingClass}>
          {title}
        </motion.h1>
      ) : (
        <motion.h2 {...reveal(headingDelay)} id={id} className={headingClass}>
          {title}
        </motion.h2>
      )}

      {lead && (
        <motion.p
          {...reveal(0.08)}
          className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground"
        >
          {lead}
        </motion.p>
      )}
    </div>
  );
}
