'use client';

/**
 * 项目管理：工具条（新建）+ 带编辑/删除按钮的卡片网格 + 编辑浮层。
 *
 * 【为什么编辑不需要额外请求】项目的字段都是短结构化数据（不像笔记有整篇正文），
 * 列表拿到的 ProjectRecord 已经包含全部字段，直接填进表单即可。
 *
 * 【slug 为什么建好后锁住】改 slug 等于换了一条记录的键：
 * upsert 会新建一行，旧的那行留在库里变成孤儿。锁住它最省事，也符合直觉
 * （项目的短名本来就不该变，外链可能已经引用了它）。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ProjectRecord } from '@/lib/content';
import ProjectsGrid from '@/components/ProjectsGrid';
import EditorPanel from './EditorPanel';

/** 表单态：stack 用逗号串，sort 用字符串（input 只能给字符串） */
interface ProjectForm {
  slug: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  url: string;
  stack: string;
  date: string;
  featured: boolean;
  sort: string;
}

const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

export default function ProjectAdmin({ projects }: { projects: ProjectRecord[] }) {
  const { d, fill } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const openNew = () => {
    setForm({
      slug: '',
      titleZh: '',
      titleEn: '',
      summaryZh: '',
      summaryEn: '',
      url: '',
      stack: '',
      date: '',
      featured: false,
      // 新项目排到最后：现有最大 sort + 1
      sort: String(projects.reduce((max, p) => Math.max(max, p.sort), -1) + 1),
    });
    setIsNew(true);
    setError(null);
  };

  const openEdit = (p: ProjectRecord) => {
    setForm({
      slug: p.slug,
      titleZh: p.title.zh,
      titleEn: p.title.en,
      summaryZh: p.summary.zh,
      summaryEn: p.summary.en,
      url: p.url,
      stack: p.stack.join(', '),
      date: p.date ?? '',
      featured: p.featured,
      sort: String(p.sort),
    });
    setIsNew(false);
    setError(null);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sort: Number(form.sort) || 0,
          stack: form.stack
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; code?: string };
      if (!data.ok) {
        setError(errText(data.code ?? 'generic'));
        return;
      }
      setForm(null);
      router.refresh();
    } catch {
      setError(errText('network'));
    } finally {
      setBusy(false);
    }
  };

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
        <button
          type="button"
          onClick={openNew}
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          <Plus size={15} aria-hidden="true" />
          {d.admin.newProject}
        </button>
      </div>

      <ProjectsGrid items={projects} onEdit={openEdit} onDelete={remove} />

      {form && (
        <EditorPanel
          title={isNew ? d.admin.newProject : d.admin.edit}
          onClose={() => setForm(null)}
          footer={
            <>
              {error && <span className="mr-auto text-xs font-semibold text-destructive">{error}</span>}
              <button
                type="button"
                onClick={() => setForm(null)}
                className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {d.admin.cancel}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? d.admin.saving : d.admin.save}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="p-slug">
                  {d.admin.slug}
                </label>
                <input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value)}
                  disabled={!isNew}
                  placeholder="my-project"
                  className={`${FIELD} disabled:opacity-60`}
                />
                <p className="mt-1 text-xs text-muted-foreground">{d.admin.slugHint}</p>
              </div>
              <div>
                <label className={LABEL} htmlFor="p-url">
                  {d.admin.url}
                </label>
                <input
                  id="p-url"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://github.com/..."
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="p-title-zh">
                  {d.admin.titleZh}
                </label>
                <input
                  id="p-title-zh"
                  value={form.titleZh}
                  onChange={(e) => set('titleZh', e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="p-title-en">
                  {d.admin.titleEn}
                </label>
                <input
                  id="p-title-en"
                  value={form.titleEn}
                  onChange={(e) => set('titleEn', e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="p-summary-zh">
                  {d.admin.summaryZh}
                </label>
                <textarea
                  id="p-summary-zh"
                  value={form.summaryZh}
                  onChange={(e) => set('summaryZh', e.target.value)}
                  rows={3}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="p-summary-en">
                  {d.admin.summaryEn}
                </label>
                <textarea
                  id="p-summary-en"
                  value={form.summaryEn}
                  onChange={(e) => set('summaryEn', e.target.value)}
                  rows={3}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="p-stack">
                  {d.admin.stack}
                </label>
                <input
                  id="p-stack"
                  value={form.stack}
                  onChange={(e) => set('stack', e.target.value)}
                  placeholder="Next.js, React"
                  className={FIELD}
                />
                <p className="mt-1 text-xs text-muted-foreground">{d.admin.listHint}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL} htmlFor="p-date">
                    {d.admin.date}
                  </label>
                  <input
                    id="p-date"
                    type="month"
                    value={form.date}
                    onChange={(e) => set('date', e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className={LABEL} htmlFor="p-sort">
                    {d.admin.sort}
                  </label>
                  <input
                    id="p-sort"
                    type="number"
                    value={form.sort}
                    onChange={(e) => set('sort', e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set('featured', e.target.checked)}
                className="size-4 cursor-pointer"
              />
              {d.admin.featured}
            </label>
          </div>
        </EditorPanel>
      )}
    </>
  );
}
