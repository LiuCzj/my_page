'use client';

/**
 * 笔记管理：工具条（新建）+ 带编辑/删除按钮的列表 + 编辑浮层。
 *
 * 【为什么是一个客户端组件包住列表】列表项里的「编辑」「删除」按钮要回调到编辑器状态，
 * 而列表本身（NotesList）要能同时给首页摘要用（那边不带按钮）。
 * 所以把「管理能力」整个收在这一层：只有管理员登录的 /notes 页会渲染它，
 * 首页渲染的是不带回调的 NotesList。
 *
 * 【保存后为什么要 router.refresh()】页面是按需渲染的，refresh 会让服务端重新取数据并重绘，
 * 改完立刻就能在列表里看到结果，不用手动刷新整页。
 *
 * 【删除为什么弹 confirm】内容删了就没了（笔记还会连带删掉它的评论），
 * 值得多一次确认；用原生 confirm 而不是自绘弹窗，是因为这条路径极短、不值得再写一套。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { NoteMeta, NoteRecord } from '@/lib/content';
import NotesList from '@/components/NotesList';
import EditorPanel from './EditorPanel';
import MarkdownEditor from './MarkdownEditor';
import MarkdownImport from './MarkdownImport';
import type { ParsedMarkdownFile } from '@/lib/parse-md-file';

/** 表单态：tags 用逗号串，提交前再切回数组 */
interface NoteForm {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string;
  draft: boolean;
  body: string;
}

/** 输入框统一样式 */
const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

/**
 * 从标题生成合法的 slug。
 *
 * 【为什么纯中文标题要兜底】「我的第一篇笔记」里一个 ASCII 字符都没有，过滤完是空串 ——
 * 空 slug 通不过 SLUG_RE，保存会被拒。所以退化成 note-<时间戳>，站长再手改短名即可。
 */
function slugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || `note-${Date.now().toString(36)}`;
}

export default function NoteAdmin({ notes }: { notes: NoteMeta[] }) {
  const { d, fill } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<NoteForm | null>(null);
  /** true = 新建（slug 可编辑）；false = 改已有的（slug 锁住，避免改名后留下孤儿行） */
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  const set = <K extends keyof NoteForm>(key: K, value: NoteForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const openNew = () => {
    setForm({
      slug: '',
      title: '',
      date: new Date().toISOString().slice(0, 10),
      summary: '',
      tags: '',
      draft: false,
      body: '',
    });
    setIsNew(true);
    setError(null);
  };

  /**
   * 上传的 .md 文件解析完后把内容填进表单。
   *
   * 【为什么打开编辑器再填】填完之后站长要能一眼检查（标题对不对、日期对不对），
   * 直接静默保存一篇笔记太激进 —— 万一传错文件就多了一条垃圾内容。
   * 所以这里只填表、不保存，并把 slug 一并按标题生成好（新建时 slug 才是可编辑的）。
   */
  const applyImport = (r: ParsedMarkdownFile) => {
    // 原来没打开编辑器 → 按「新建」处理（slug 可改）；正在改一篇旧笔记就保留它的 slug
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

  const openEdit = async (meta: NoteMeta) => {
    setError(null);
    try {
      // 列表只有元数据，正文要单独取
      const res = await fetch(`/api/admin/notes/${encodeURIComponent(meta.slug)}`);
      const data = (await res.json()) as { ok?: boolean; code?: string; note?: NoteRecord };
      if (!data.ok || !data.note) {
        setError(errText(data.code ?? 'generic'));
        return;
      }
      const n = data.note;
      setForm({
        slug: n.slug,
        title: n.title,
        date: n.date,
        summary: n.summary,
        tags: n.tags.join(', '),
        draft: n.draft,
        body: n.body,
      });
      setIsNew(false);
    } catch {
      setError(errText('network'));
    }
  };

  const save = async () => {
    if (!form) return;
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
      setForm(null);
      router.refresh();
    } catch {
      setError(errText('network'));
    } finally {
      setBusy(false);
    }
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
        <button
          type="button"
          onClick={openNew}
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          <Plus size={15} aria-hidden="true" />
          {d.admin.newNote}
        </button>

        {/*
          上传本地写好的 .md 文件：解析出 frontmatter + 正文直接填进编辑器。
          放在这里而不是编辑器内部，是因为「先选文件、再检查、最后保存」这条路径
          对已经写好的长文最省事 —— 不用在空编辑器里手工重打一遍。
        */}
        <MarkdownImport onParsed={applyImport} />
      </div>

      <NotesList notes={notes} headingLevel={1} onEdit={openEdit} onDelete={remove} />

      {form && (
        <EditorPanel
          title={isNew ? d.admin.newNote : d.admin.edit}
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
                <p className="mt-1 text-xs text-muted-foreground">{d.admin.slugHint}</p>
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
            </div>

            <div>
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

            <div>
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
              <p className="mt-1 text-xs text-muted-foreground">{d.admin.listHint}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.draft}
                onChange={(e) => set('draft', e.target.checked)}
                className="size-4 cursor-pointer"
              />
              {d.admin.draft}
            </label>

            <div>
              <span className={LABEL}>{d.admin.body}</span>
              <MarkdownEditor value={form.body} onChange={(v) => set('body', v)} />
            </div>
          </div>
        </EditorPanel>
      )}
    </>
  );
}
