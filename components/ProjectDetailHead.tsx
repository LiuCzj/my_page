'use client';

/** 项目详情页的头部：返回、标题、摘要、元信息、仓库与编辑入口。 */

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Github, Pencil } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ProjectRecord } from '@/lib/content';
import { formFromRecord } from './admin/project-form';

/** 只有真的点开「编辑」才下载编辑器 */
const ProjectEditor = dynamic(() => import('./admin/ProjectEditor').then((m) => m.ProjectEditor), {
  ssr: false,
});

/**
 * @param props.project 当前项目的完整记录
 * @param props.canEdit 服务端已按管理员身份算好；false 时 DOM 里没有编辑按钮
 */
export default function ProjectDetailHead({
  project,
  canEdit,
}: {
  project: ProjectRecord;
  canEdit: boolean;
}) {
  const { d, pick } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/projects"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-accent"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {d.projects.back}
        </Link>
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="btn-soft">
            <Pencil size={15} aria-hidden="true" />
            {d.admin.edit}
          </button>
        )}
      </div>

      <h1 className="mt-5 font-song text-2xl leading-tight font-black tracking-tight break-words text-foreground sm:text-4xl">
        {pick(project.title)}
      </h1>

      {pick(project.summary) && (
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          {pick(project.summary)}
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-semibold text-muted-foreground">
        {project.date && (
          <>
            <time dateTime={project.date}>{project.date}</time>
            <span aria-hidden="true">·</span>
          </>
        )}
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
      </p>

      {project.url && (
        <div className="mt-4">
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="btn-soft">
            <Github size={15} aria-hidden="true" />
            {d.projects.repo}
          </a>
        </div>
      )}

      {open && (
        <ProjectEditor
          initial={formFromRecord(project)}
          isNew={false}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </header>
  );
}
