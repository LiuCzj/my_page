'use client';

/**
 * 首页的「项目」区块 —— 现在是**摘要**，不是全量列表。
 *
 * 【为什么改成摘要】
 * 项目多起来之后，首页把每一条都铺开会把页面拉得很长，
 * 而首页的职责是「让人快速知道你是谁、在做什么」，不是当索引。
 * 所以这里只放前 N 条（N 见 config/site.ts 的 homePreview），
 * 剩下的交给 /projects 页；条数超出时才出现「查看全部项目」。
 *
 * 【为什么条数不超过 N 时不显示入口】
 * 只有 2 条项目却挂一个「查看全部」，点进去看到的还是这 2 条 ——
 * 这种入口比没有更让人困惑。
 *
 * 【卡片本身复用 ProjectsGrid】
 * 和 /projects 页展示的是同一套卡片，样式只写一遍，避免两边漂移。
 *
 * 【id="projects" 必须保留】首屏那颗「查看我的项目」按钮指向 #projects，
 * 是这个区块的页内锚点。scroll-mt-[var(--anchor-offset)] 是让滚动的落点
 * 停在固定顶栏下方 —— 少了它，标题会被顶栏盖住。
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, FolderOpen } from 'lucide-react';
import { site, homePreview } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import ProjectsGrid from './ProjectsGrid';

export default function Projects() {
  const { d } = useI18n();
  const reveal = useReveal();

  /**
   * 挑出首页要展示的几条：先排 featured 的，再用其余的补齐，最后截到上限。
   * 这样即使没有一条标 featured，首页也不会空着 —— 会按原顺序取前几条。
   */
  const shown = [
    ...site.projects.filter((p) => p.featured),
    ...site.projects.filter((p) => !p.featured),
  ].slice(0, homePreview.projects);

  const hasMore = site.projects.length > shown.length;

  return (
    <section
      id="projects"
      className="scroll-mt-[var(--anchor-offset)] pb-2"
      aria-labelledby="projects-title"
    >
      <motion.h2
        {...reveal(0)}
        id="projects-title"
        className="text-2xl font-black tracking-tight text-foreground sm:text-3xl"
      >
        {d.projects.title}
      </motion.h2>

      {shown.length === 0 ? (
        /* 空态：明确说「这里还空着」并给出下一步，而不是留一个看起来坏掉的洞 */
        <motion.div
          {...reveal(0.06)}
          role="status"
          className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-center sm:p-8"
        >
          <FolderOpen size={22} className="mx-auto text-accent" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">{d.projects.empty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {d.projects.emptyHint}
          </p>
        </motion.div>
      ) : (
        <>
          <div className="mt-4">
            <ProjectsGrid items={shown} />
          </div>

          {hasMore && (
            /* 文字链接必须自己撑到 44px —— 手机上没有卡片高度可借 */
            <motion.div {...reveal(0.12)} className="mt-4">
              <Link
                href="/projects"
                className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-accent no-underline transition-opacity hover:opacity-80"
              >
                {d.projects.viewAll}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </motion.div>
          )}
        </>
      )}
    </section>
  );
}
