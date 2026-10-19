'use client';

/** 笔记编辑器。笔记列表页（NoteAdmin）与笔记详情页（NoteEditButton）共用同一份实现。 */

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import EditorPanel from './EditorPanel';
import MirrorEditor from './MirrorEditor';
import type { NoteForm } from './note-form';
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
export function NoteEditor({
  initial,
  isNew,
  onClose,
  onSaved,
  onImport,
}: {
  initial: NoteForm;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** 把拖进编辑区的 .md 整体填进表单（由列表页提供，详情页可省略） */
  onImport?: (r: ParsedMarkdownFile) => void;
}) {
  const { d } = useI18n();
  const [form, setForm] = useState<NoteForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const set = <K extends keyof NoteForm>(key: K, value: NoteForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags: form.tags
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
      title={isNew ? d.admin.newNote : d.admin.edit}
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
          <label className={LABEL} htmlFor="note-slug">
            {d.admin.slug}
          </label>
          <input
            id="note-slug"
            value={form.slug}
            onChange={(e) => set('slug', e.target.value)}
            disabled={!isNew}
            placeholder="my-first-note"
            className={`${FIELD} disabled:opacity-60`}
          />
          <p className={HINT}>{d.admin.slugHint}</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="note-date">
            {d.admin.date}
          </label>
          <input
            id="note-date"
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="note-tags">
            {d.admin.tags}
          </label>
          <input
            id="note-tags"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="AI, Next.js"
            className={FIELD}
          />
          <p className={HINT}>{d.admin.listHint}</p>
        </div>

        <div className="lg:col-span-2">
          <label className={LABEL} htmlFor="note-title">
            {d.admin.title}
          </label>
          <input
            id="note-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className={FIELD}
          />
        </div>

        <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={form.draft}
            onChange={(e) => set('draft', e.target.checked)}
            className="size-4 cursor-pointer"
          />
          {d.admin.draft}
        </label>

        <div className="lg:col-span-3">
          <label className={LABEL} htmlFor="note-summary">
            {d.admin.summary}
          </label>
          <input
            id="note-summary"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-auto flex-col">
        <span className={LABEL}>{d.admin.body}</span>
        <MirrorEditor
          value={form.body}
          onChange={(v) => set('body', v)}
          /* Ctrl+S 走这里，和底部「保存」按钮是同一个函数 */
          onSave={() => {
            if (!busy) void save();
          }}
          onImport={onImport}
          className="min-h-[240px] flex-auto"
        />
      </div>
      </div>
    </EditorPanel>
  );
}
