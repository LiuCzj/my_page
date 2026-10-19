'use client';

/** 项目管理：工具条（新建）+ 带编辑/删除按钮的卡片网格 + 编辑浮层。 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ProjectRecord } from '@/lib/content';
import ProjectsGrid from '@/components/ProjectsGrid';
import { blankForm, formFromRecord, type ProjectForm } from './project-form';
import { ProjectEditor } from './ProjectEditor';

export default function ProjectAdmin({ projects }: { projects: ProjectRecord[] }) {
  const { d, fill } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<{ form: ProjectForm; isNew: boolean } | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const openNew = () =>
    setEditing({
      // 新项目排到最后：现有最大 sort + 1
      form: blankForm(projects.reduce((max, p) => Math.max(max, p.sort), -1) + 1),
      isNew: true,
    });

  const openEdit = (p: ProjectRecord) => setEditing({ form: formFromRecord(p), isNew: false });

  const remove = async (p: ProjectRecord) => {
    if (!window.confirm(fill(d.admin.confirmDelete, { name: p.title.zh }))) return;
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(p.slug)}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok?: boolean; code?: string };
      if (!data.ok) {
        window.alert(errText(data.code ?? 'generic'));
        return;
      }
      router.refresh();
    } catch {
      window.alert(errText('network'));
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={openNew} className="btn-primary">
          <Plus size={15} aria-hidden="true" />
          {d.admin.newProject}
        </button>
      </div>

      <ProjectsGrid items={projects} onEdit={openEdit} onDelete={remove} />

      {editing && (
        <ProjectEditor
          /* 换目标时重新初始化表单态 */
          key={editing.form.slug || 'new'}
          initial={editing.form}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
