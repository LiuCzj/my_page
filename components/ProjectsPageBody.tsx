'use client';

/**
 * 项目页的内容体。
 *
 * 【为什么要拆成「服务端壳 + 客户端体」两个文件】
 * 项目数据来自数据库（lib/content.ts，依赖 better-sqlite3），需要服务端能力；
 * 但 Next.js 不允许客户端组件导出 metadata。想让 /projects 有自己的浏览器标题，
 * 就必须让 page.tsx 保持服务端组件只导出 metadata，读好数据后再渲染这个客户端体。
 *
 * 【管理员看得到编辑入口，访客看不到】canEdit 由服务端算出（getCurrentUser + isAdmin），
 * 为 true 时才渲染 ProjectAdmin（带「新建 / 编辑 / 删除」）。访客的 HTML 里根本没有这些按钮 ——
 * 不是靠 CSS 藏起来。真正的权限闸门在服务端接口（见 lib/admin-guard.ts）。
 *
 * 【容器宽度用 5xl 而不是笔记页的 3xl】
 * 这里是两列卡片网格，需要横向空间；笔记列表是竖排文字，需要的是窄栏。
 */

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
      {/*
        独立页只有一节，所以不传编号；但色调仍走 works（珊瑚橘）——
        这样从首页滚到 /projects 页，章节名的颜色是连着的，不会「翻页翻了张不同版式的纸」。
      */}
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
