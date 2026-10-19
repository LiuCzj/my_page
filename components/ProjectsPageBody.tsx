'use client';

/** 项目页的内容体。 */

import { motion } from 'framer-motion';
import { FolderOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import type { ProjectRecord } from '@/lib/content';
import ProjectsGrid from './ProjectsGrid';
import SectionBand from './SectionBand';
import ProjectAdmin from './admin/ProjectAdmin';

export default function ProjectsPageBody({
  projects,
  canEdit,
}: {
  projects: ProjectRecord[];
  canEdit: boolean;
}) {
  const { d } = useI18n();
  const reveal = useReveal();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:pt-14">
      {/* 独立页只有一节，所以不传编号；但色调仍走 works（珊瑚橘）——这样从首页滚到 /projects 页，章节名的颜色是连着的，不会「翻页翻了张不同版式的纸」。 */}
      <SectionBand tone="works" as="h1" title={d.projects.title} lead={d.projects.lead} />

      {projects.length === 0 && !canEdit ? (
        /* 空态：和首页那块同一套写法，说清「这里还空着」而不是留一个破洞 */
        <motion.div
          {...reveal(0.12)}
          role="status"
          className="mt-6 rounded-lg border border-dashed border-border bg-card p-6 text-center sm:p-8"
        >
          <FolderOpen size={22} className="mx-auto text-accent" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">{d.projects.empty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {d.projects.emptyHint}
          </p>
        </motion.div>
      ) : (
        <div className="mt-6">
          {canEdit ? <ProjectAdmin projects={projects} /> : <ProjectsGrid items={projects} />}
        </div>
      )}
    </div>
  );
}
