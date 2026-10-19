'use client';

/** 项目编辑器。项目列表页（ProjectAdmin）与详情页（ProjectDetailHead）共用同一份实现。 */

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import EditorPanel from './EditorPanel';
import MirrorEditor from './MirrorEditor';
import type { ProjectForm } from './project-form';
import type { ParsedMarkdownFile } from '@/lib/parse-md-file';

const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';
const HINT = 'mt-1 text-[11px] leading-snug text-muted-foreground';

/**
 * 编辑器本体。父组件在需要时渲染它，并用 key 保证换目标时重新初始化。
 * @param props.initial 初始表单态
 * @param props.isNew   true = 新建（slug 可编辑）
 * @param props.onClose 取消
 * @param props.onSaved 保存成功后
 */
export function ProjectEditor({
  initial,
  isNew,
  onClose,
  onSaved,
}: {
  initial: ProjectForm;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { d } = useI18n();
  const [form, setForm] = useState<ProjectForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * 拖入 .md：正文原样保留，只把 frontmatter 填进对应字段。
   * @param r parseMarkdownFile 的结果
   */
  const importFile = (r: ParsedMarkdownFile) => {
    if (form.body.trim() && !window.confirm(d.admin.importOverwrite)) return;
    setForm((f) => ({
      ...f,
      titleZh: r.title || f.titleZh,
      summaryZh: r.summary || f.summaryZh,
      // 项目日期只到月
      date: r.date ? r.date.slice(0, 7) : f.date,
      body: r.body,
    }));
  };

  const save = async () => {
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
      onSaved();
    } catch {
      setError(errText('network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditorPanel
      full
      title={isNew ? d.admin.newProject : d.admin.edit}
      onClose={onClose}
      footer={
        <>
          {error && (
            <span className="max-w-[28ch] truncate text-xs font-semibold text-destructive">{error}</span>
          )}
          <button type="button" onClick={onClose} className="btn-soft">
            {d.admin.cancel}
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary">
            {busy ? d.admin.saving : d.admin.save}
          </button>
        </>
      }
    >
      {/* 撑满面板剩余高度：元信息固定，正文吃掉剩下的空间 */}
      <div className="flex flex-auto flex-col">
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className={HINT}>{d.admin.slugHint}</p>
          </div>

          <div>
            <label className={LABEL} htmlFor="p-url">
              {d.admin.url}
            </label>
            <input
              id="p-url"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://github.com/...（可留空）"
              className={FIELD}
            />
            <p className={HINT}>{d.admin.urlHint}</p>
          </div>

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
            <p className={HINT}>{d.admin.listHint}</p>
          </div>

          <div>
            <label className={LABEL} htmlFor="p-summary-zh">
              {d.admin.summaryZh}
            </label>
            <textarea
              id="p-summary-zh"
              value={form.summaryZh}
              onChange={(e) => set('summaryZh', e.target.value)}
              rows={2}
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
              rows={2}
              className={FIELD}
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
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
            <label className="flex shrink-0 items-center gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set('featured', e.target.checked)}
                className="size-4 cursor-pointer"
              />
              {d.admin.featured}
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-auto flex-col">
          <span className={LABEL}>{d.admin.body}</span>
          <MirrorEditor
            value={form.body}
            onChange={(v) => set('body', v)}
            onImport={importFile}
            onSave={() => {
              if (!busy) void save();
            }}
            className="min-h-[240px] flex-auto"
          />
          <p className={HINT}>{d.admin.bodyHint}</p>
        </div>
      </div>
    </EditorPanel>
  );
}
