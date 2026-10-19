/** 内容层：笔记与项目的读写。 */

import { getDb } from './db';
import type { LocalizedText, SkillSection } from '@/config/site';

/** 一篇笔记的完整记录（含正文） */
export interface NoteRecord {
  slug: string;
  title: string;
  /** 'YYYY-MM-DD'，不做 Date 转换，避免时区问题 */
  date: string;
  summary: string;
  tags: string[];
  /** true 时生产环境不收录（本地开发仍可见，方便预览） */
  draft: boolean;
  /** Markdown 正文（不含 frontmatter） */
  body: string;
  updatedAt: number;
}

/** 列表/搜索只需要元数据，不带正文 —— 正文可能很长，别白读 */
export type NoteMeta = Omit<NoteRecord, 'body' | 'updatedAt'> & { readingMinutes: number };

/** 一个项目的完整记录 */
export interface ProjectRecord {
  slug: string;
  /** 双语。英文留空时展示层回落到中文 */
  title: LocalizedText;
  summary: LocalizedText;
  /** Markdown 正文。空串 = 没有详情页，卡片直接跳 url */
  body: string;
  url: string;
  stack: string[];
  /** 'YYYY-MM'，可空 */
  date?: string;
  /** true 时优先出现在首页摘要里 */
  featured: boolean;
  /** 排序权重，小的在前 */
  sort: number;
  updatedAt: number;
}

/** 数据库里的行（列名是 snake_case） */
interface NoteRow {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string;
  draft: number;
  body: string;
  updated_at: number;
}
interface ProjectRow {
  slug: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  body: string;
  url: string;
  stack: string;
  date: string | null;
  featured: number;
  sort: number;
  updated_at: number;
}

/** slug 白名单：小写字母、数字、连字符，且必须以字母或数字开头。 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** 宽松地把 JSON 数组字符串解析成字符串数组；解析失败一律当空数组，不抛错 */
function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** 估算阅读时长（分钟）。 */
export function estimateReadingMinutes(body: string): number {
  const cjkCount = (body.match(/[\u3400-\u9fff]/g) ?? []).length;
  // 先把汉字挖成空格，再按词切，避免中文被当成拉丁词
  const latinWords = (body.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjkCount / 300 + latinWords / 200));
}

function toNoteRecord(r: NoteRow): NoteRecord {
  return {
    slug: r.slug,
    title: r.title,
    date: r.date,
    summary: r.summary,
    tags: parseList(r.tags),
    draft: r.draft === 1,
    body: r.body,
    updatedAt: r.updated_at,
  };
}

function toNoteMeta(r: NoteRow): NoteMeta {
  return {
    slug: r.slug,
    title: r.title,
    date: r.date,
    summary: r.summary,
    tags: parseList(r.tags),
    draft: r.draft === 1,
    readingMinutes: estimateReadingMinutes(r.body),
  };
}

function toProjectRecord(r: ProjectRow): ProjectRecord {
  return {
    slug: r.slug,
    title: { zh: r.title_zh, en: r.title_en || r.title_zh },
    summary: { zh: r.summary_zh, en: r.summary_en || r.summary_zh },
    body: r.body,
    url: r.url,
    stack: parseList(r.stack),
    date: r.date ?? undefined,
    featured: r.featured === 1,
    sort: r.sort,
    updatedAt: r.updated_at,
  };
}

/** 草稿在什么情况下可见：开发环境可见（方便边写边看），生产环境隐藏 */
function draftVisible(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * 笔记元数据列表，按日期倒序（新的在前）。
 * @param includeDrafts 是否包含草稿。默认：开发环境 true、生产 false。
 */
export function listNoteMetas(includeDrafts: boolean = draftVisible()): NoteMeta[] {
  const rows = getDb()
    .prepare('SELECT * FROM notes ORDER BY date DESC, updated_at DESC')
    .all() as NoteRow[];
  return rows.map(toNoteMeta).filter((n) => includeDrafts || !n.draft);
}

/**
 * 取一篇笔记的完整记录。
 * @param slug 已通过 SLUG_RE 校验的短名
 * @returns 不存在时返回 null，由调用方决定 404
 */
export function getNoteRecord(slug: string): NoteRecord | null {
  if (!SLUG_RE.test(slug)) return null;
  const row = getDb().prepare('SELECT * FROM notes WHERE slug = ?').get(slug) as NoteRow | undefined;
  return row ? toNoteRecord(row) : null;
}

/** 项目列表，按 sort 升序（首页摘要的「前 N 条」就是这个顺序） */
export function listProjects(): ProjectRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY sort ASC, updated_at ASC')
    .all() as ProjectRow[];
  return rows.map(toProjectRecord);
}

/** 取单个项目 */
export function getProject(slug: string): ProjectRecord | null {
  if (!SLUG_RE.test(slug)) return null;
  const row = getDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined;
  return row ? toProjectRecord(row) : null;
}

// ── 写入（仅由管理端接口调用，调用前必须已校验管理员身份）────────────────

/** 保存笔记的输入。slug 已存在则更新，不存在则新建（upsert） */
export interface NoteInput {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  draft: boolean;
  body: string;
}

/**
 * 新建或更新一篇笔记。
 * @returns 保存后的完整记录
 * @throws slug 不合规时
 */
export function saveNote(input: NoteInput): NoteRecord {
  if (!SLUG_RE.test(input.slug)) throw new Error('invalid_slug');
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO notes (slug, title, date, summary, tags, draft, body, updated_at)
       VALUES (@slug, @title, @date, @summary, @tags, @draft, @body, @updated_at)
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title, date = excluded.date, summary = excluded.summary,
         tags = excluded.tags, draft = excluded.draft, body = excluded.body,
         updated_at = excluded.updated_at`,
    )
    .run({
      slug: input.slug,
      title: input.title,
      date: input.date,
      summary: input.summary,
      tags: JSON.stringify(input.tags),
      draft: input.draft ? 1 : 0,
      body: input.body,
      updated_at: now,
    });
  const saved = getNoteRecord(input.slug);
  if (!saved) throw new Error('save_failed');
  return saved;
}

/**
 * 删除一篇笔记。
 * @returns 是否真的删到了（false 表示 slug 不存在）
 */
export function deleteNote(slug: string): boolean {
  if (!SLUG_RE.test(slug)) return false;
  const d = getDb();
  const tx = d.transaction(() => {
    const info = d.prepare('DELETE FROM notes WHERE slug = ?').run(slug);
    if (info.changes > 0) d.prepare('DELETE FROM comments WHERE note_slug = ?').run(slug);
    return info.changes > 0;
  });
  return tx();
}

/** 保存项目的输入 */
export interface ProjectInput {
  slug: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  /** Markdown 正文，可空 */
  body: string;
  url: string;
  stack: string[];
  date: string | null;
  featured: boolean;
  sort: number;
}

/** 新建或更新一个项目（同 saveNote 的 upsert 逻辑） */
export function saveProject(input: ProjectInput): ProjectRecord {
  if (!SLUG_RE.test(input.slug)) throw new Error('invalid_slug');
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO projects
         (slug, title_zh, title_en, summary_zh, summary_en, body, url, stack, date, featured, sort, updated_at)
       VALUES
         (@slug, @title_zh, @title_en, @summary_zh, @summary_en, @body, @url, @stack, @date, @featured, @sort, @updated_at)
       ON CONFLICT(slug) DO UPDATE SET
         title_zh = excluded.title_zh, title_en = excluded.title_en,
         summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
         body = excluded.body,
         url = excluded.url, stack = excluded.stack, date = excluded.date,
         featured = excluded.featured, sort = excluded.sort,
         updated_at = excluded.updated_at`,
    )
    .run({
      slug: input.slug,
      title_zh: input.titleZh,
      title_en: input.titleEn,
      summary_zh: input.summaryZh,
      summary_en: input.summaryEn,
      body: input.body,
      url: input.url,
      stack: JSON.stringify(input.stack),
      date: input.date,
      featured: input.featured ? 1 : 0,
      sort: input.sort,
      updated_at: now,
    });
  const saved = getProject(input.slug);
  if (!saved) throw new Error('save_failed');
  return saved;
}

/** 删除一个项目（连同它的评论） */
export function deleteProject(slug: string): boolean {
  if (!SLUG_RE.test(slug)) return false;
  const d = getDb();
  // 项目评论落在 comments.note_slug，键名是 `project:<slug>`；不一起删会留下孤儿评论
  const tx = d.transaction(() => {
    const info = d.prepare('DELETE FROM projects WHERE slug = ?').run(slug);
    if (info.changes > 0) d.prepare('DELETE FROM comments WHERE note_slug = ?').run(`project:${slug}`);
    return info.changes > 0;
  });
  return tx();
}

// ── 技术栈分组 ──────────────────

/** 分组在**存储层**的形状。 */
export interface SkillGroupRecord {
  id: string;
  title: LocalizedText;
  sections: SkillSection[];
  /** 页面上的显示顺序 */
  sort: number;
  updatedAt: number;
}

/** 数据库里的行 */
interface SkillGroupRow {
  id: string;
  title_zh: string;
  title_en: string;
  sections: string;
  sort: number;
  updated_at: number;
}

/** 宽松解析 sections 那个 JSON 列。 */
function parseSections(json: string): SkillSection[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return (v as Array<Record<string, unknown>>).map((s) => {
      const label = (s?.label ?? {}) as Record<string, unknown>;
      const rawItems = Array.isArray(s?.items) ? (s.items as Array<Record<string, unknown>>) : [];
      return {
        label: { zh: String(label.zh ?? ''), en: String(label.en ?? '') },
        items: rawItems
          .map((it) => ({ zh: String(it?.zh ?? ''), en: String(it?.en ?? '') }))
          .filter((it) => it.zh || it.en),
      };
    });
  } catch {
    return [];
  }
}

function toSkillGroupRecord(r: SkillGroupRow): SkillGroupRecord {
  return {
    id: r.id,
    title: { zh: r.title_zh, en: r.title_en || r.title_zh },
    sections: parseSections(r.sections),
    sort: r.sort,
    updatedAt: r.updated_at,
  };
}

/** 技术栈分组列表，按 sort 升序 —— 这个顺序就是页面上的显示顺序 */
export function listSkillGroups(): SkillGroupRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM skill_groups ORDER BY sort ASC, updated_at ASC')
    .all() as SkillGroupRow[];
  return rows.map(toSkillGroupRecord);
}

/** 一个小节（编辑界面的输入形状）。 */
export interface SkillSectionInput {
  labelZh: string;
  labelEn: string;
  itemsZh: string[];
  itemsEn: string[];
}

/** 一个分组（编辑界面的输入形状） */
export interface SkillGroupInput {
  id: string;
  titleZh: string;
  titleEn: string;
  sections: SkillSectionInput[];
}

/**
 * 整体替换技术栈分组。
 * @param groups 已由 lib/admin-guard.ts 校验过的输入
 */
export function replaceSkillGroups(groups: SkillGroupInput[]): void {
  const d = getDb();
  const now = Date.now();
  const insert = d.prepare(
    `INSERT INTO skill_groups (id, title_zh, title_en, sections, sort, updated_at)
     VALUES (@id, @title_zh, @title_en, @sections, @sort, @updated_at)`,
  );

  d.transaction(() => {
    d.prepare('DELETE FROM skill_groups').run();
    groups.forEach((g, i) => {
      // 中英条目按下标配对；英文那串短了就回落到中文，绝不留下空标签
      const sections: SkillSection[] = g.sections.map((s) => ({
        label: { zh: s.labelZh, en: s.labelEn || s.labelZh },
        items: s.itemsZh.map((zh, idx) => ({ zh, en: s.itemsEn[idx] || zh })),
      }));
      insert.run({
        id: g.id,
        title_zh: g.titleZh,
        title_en: g.titleEn || g.titleZh,
        sections: JSON.stringify(sections),
        sort: i,
        updated_at: now,
      });
    });
  })();
}
