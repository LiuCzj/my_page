'use client';

/** 笔记管理：新建入口 + 带编辑/删除按钮的列表。编辑表单在 NoteEditor 里，与详情页共用。 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { NoteMeta, NoteRecord } from '@/lib/content';
import NotesList from '@/components/NotesList';
import MarkdownImport from './MarkdownImport';
import { NoteEditor } from './NoteEditor';
import { blankForm, formFromRecord, slugFromTitle, type NoteForm } from './note-form';
import type { ParsedMarkdownFile } from '@/lib/parse-md-file';

export default function NoteAdmin({ notes }: { notes: NoteMeta[] }) {
  const { d, fill } = useI18n();
  const router = useRouter();
  /** 正在编辑的表单态。null = 编辑器关闭 */
  const [form, setForm] = useState<NoteForm | null>(null);
  /** true = 新建（slug 可编辑） */
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const openNew = () => {
    setForm(blankForm());
    setIsNew(true);
    setError(null);
  };

  /**
   * 打开一篇已有笔记。列表只有元数据，正文要单独取。
   * @param meta 列表项
   */
  const openEdit = async (meta: NoteMeta) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/notes/${encodeURIComponent(meta.slug)}`);
      const data = (await res.json()) as { ok?: boolean; code?: string; note?: NoteRecord };
      if (!data.ok || !data.note) {
        setError(errText(data.code ?? 'generic'));
        return;
      }
      setForm(formFromRecord(data.note));
      setIsNew(false);
    } catch {
      setError(errText('network'));
    }
  };

  /** 上传的 .md 解析完只填表、不自动保存 */
  const applyImport = (r: ParsedMarkdownFile) => {
    const treatAsNew = !form;
    setForm({
      slug: form?.slug || slugFromTitle(r.title),
      title: r.title,
      date: r.date,
      summary: r.summary,
      tags: r.tags.join(', '),
      draft: r.draft,
      body: r.body,
    });
    setIsNew(treatAsNew || isNew);
    setError(null);
  };

  const remove = async (meta: NoteMeta) => {
    if (!window.confirm(fill(d.admin.confirmDelete, { name: meta.title }))) return;
    try {
      const res = await fetch(`/api/admin/notes/${encodeURIComponent(meta.slug)}`, { method: 'DELETE' });
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={openNew} className="btn-primary">
          <Plus size={15} aria-hidden="true" />
          {d.admin.newNote}
        </button>

        <MarkdownImport onParsed={applyImport} />

        {error && <span className="text-xs font-semibold text-destructive">{error}</span>}
      </div>

      <NotesList notes={notes} headingLevel={1} onEdit={openEdit} onDelete={remove} />

      {/* key 保证换一篇笔记时表单重新初始化，而不是沿用上一篇的输入 */}
      {form && (
        <NoteEditor
          key={form.slug || 'new'}
          initial={form}
          isNew={isNew}
          onClose={() => setForm(null)}
          /* 拖进编辑区的 .md 走与「上传 Markdown 文件」完全相同的路径 */
          onImport={applyImport}
          onSaved={() => {
            setForm(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
