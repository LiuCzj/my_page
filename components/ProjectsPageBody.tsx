'use client';

/**
 * 项目页的内容体。
 *
 * 【为什么要拆成「服务端壳 + 客户端体」两个文件】
 * 项目数据来自 config/site.ts，本身不需要服务端能力，用客户端组件最直接；
 * 但 Next.js 不允许客户端组件导出 metadata（`export const metadata`）。
 * 想让 /projects 有自己的浏览器标题，就必须让 page.tsx 保持服务端组件只导出
 * metadata，再由它渲染这个客户端体。app/projects/page.tsx 里只有 4 行，就是这个原因。
 *
 * 【容器宽度用 5xl 而不是笔记页的 3xl】
 * 这里是两列卡片网格，需要横向空间；笔记列表是竖排文字，需要的是窄栏。
 */

import { motion } from 'framer-motion';
import { FolderOpen } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import ProjectsGrid from './ProjectsGrid';

export default function ProjectsPageBody() {
  const { d } = useI18n();
  const reveal = useReveal();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:pt-14">
      <motion.h1
        {...reveal(0)}
        className="text-2xl font-black tracking-tight text-foreground sm:text-3xl"
      >
        {d.projects.title}
      </motion.h1>

      <motion.p {...reveal(0.06)} className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {d.projects.lead}
      </motion.p>

      {site.projects.length === 0 ? (
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
          <ProjectsGrid items={site.projects} />
        </div>
      )}
    </div>
  );
}
