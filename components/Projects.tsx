'use client';

/** 首页的「项目」区块 —— 是**摘要**，不是全量列表。 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, FolderOpen } from 'lucide-react';
import { homePreview } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import type { ProjectRecord } from '@/lib/content';
import ProjectsGrid from './ProjectsGrid';
import SectionBand from './SectionBand';

export default function Projects({ projects }: { projects: ProjectRecord[] }) {
  const { d } = useI18n();
  const reveal = useReveal();

  /** 挑出首页要展示的几条：先排 featured 的，再用其余的补齐，最后截到上限。 */
  const shown = [
    ...projects.filter((p) => p.featured),
    ...projects.filter((p) => !p.featured),
  ].slice(0, homePreview.projects);

  const hasMore = projects.length > shown.length;

  return (
    /* 首屏那颗「查看我的项目」按钮指向的锚点必须落在**跨页的顶端**，留在这里会让跳转后上面露出半截「关于我」页。 */
    <section aria-labelledby="projects-title">
      <SectionBand
        tone="works"
        index="02"
        latin="WORKS"
        id="projects-title"
        title={d.projects.title}
        lead={d.projects.lead}
      />

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
                className="link-underline inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-accent"
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
