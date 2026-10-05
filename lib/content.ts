/**
 * 内容层：笔记与项目的读写。
 *
 * 【为什么从「文件/常量」改成「数据库」】
 * 改造前笔记是 content/notes/*.mdx（构建期用 node:fs 读）、项目是 config/site.ts 里的常量 ——
 * 两者都是**构建期静态**内容，网页上改不了。要让站长能在线编辑，内容就必须搬进运行时数据库。
 * 现有内容由 lib/seed.ts 在首次启动时迁进来，一条不丢。
 *
 * 【正文存原文，不做结构化拆解】
 * 笔记正文整段存 Markdown 源文，读出来交给 lib/markdown.ts 现渲染。
 * 项目字段是短结构化数据，直接一列一个。
 *
 * 【tags / stack 存 JSON 字符串】
 * 它们只用于展示与搜索匹配，不需要按元素查询（没有「找出所有带 AI 标签的笔记」这类需求），
 * 所以不值得单开关联表。读的时候 parse，写的时候 stringify。
 *
 * 【只有服务端能 import 本文件】它依赖 better-sqlite3（原生模块），
 * 客户端组件一旦引到会直接构建失败。客户端需要数据时，由服务端组件读好当 props 传下去。
 */

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
  url: string;
  stack: string;
  date: string | null;
  featured: number;
  sort: number;
  updated_at: number;
}

/**
 * slug 白名单：小写字母、数字、连字符，且必须以字母或数字开头。
 *
 * 【为什么必须校验】slug 会进 URL 与数据库主键。放行 `../` 之类等于把路径拼接交给输入；
 * 放行空格 / 大写会让同一篇笔记出现多个地址。这里从源头堵住。
 */
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

/**
 * 估算阅读时长（分钟）。
 *
 * 【为什么不用现成的 reading-time 包】它按空白字符切词，而中文句子没有空格 ——
 * 一整段中文会被算成「一个词」，于是任何中文笔记都是「1 分钟」。这个数字不但没用，还是错的。
 * 所以按字数算：中文 300 字/分钟、拉丁 200 词/分钟，最少给 1（避免「0 分钟阅读」）。
 */
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
 *
 * @param includeDrafts 是否包含草稿。默认：开发环境 true、生产 false。
 *                      管理端要看到全部，显式传 true。
 */
export function listNoteMetas(includeDrafts: boolean = draftVisible()): NoteMeta[] {
  const rows = getDb()
    .prepare('SELECT * FROM notes ORDER BY date DESC, updated_at DESC')
    .all() as NoteRow[];
  return rows.map(toNoteMeta).filter((n) => includeDrafts || !n.draft);
}

/**
 * 取一篇笔记的完整记录。
 *
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
 *
 * 【为什么用 upsert 而不是分 create/update】编辑器对「新建」和「改一篇已有的」是同一张表单，
 * 保存时也只需要一个动作。slug 是主键，天然就是 upsert 的键。
 *
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
 *
 * 【顺带删掉它的评论】评论表用 note_slug 关联，但没有外键约束
 * （笔记原先不是数据库记录，没有可引用的主键）。现在笔记进了库，
 * 这里显式清理，避免留下一堆指向不存在笔记的孤儿评论。
 *
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
         (slug, title_zh, title_en, summary_zh, summary_en, url, stack, date, featured, sort, updated_at)
       VALUES
         (@slug, @title_zh, @title_en, @summary_zh, @summary_en, @url, @stack, @date, @featured, @sort, @updated_at)
       ON CONFLICT(slug) DO UPDATE SET
         title_zh = excluded.title_zh, title_en = excluded.title_en,
         summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
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

/** 删除一个项目 */
export function deleteProject(slug: string): boolean {
  if (!SLUG_RE.test(slug)) return false;
  return getDb().prepare('DELETE FROM projects WHERE slug = ?').run(slug).changes > 0;
}

// ── 技术栈分组（2026-10-04 新增：站长可在网页上自己编辑）──────────────────

/**
 * 分组在**存储层**的形状。
 *
 * 【为什么不直接用 config 的 SkillGroup】那个是「人写配置」的形状（没有 sort / updatedAt）；
 * 这个是从库里读出来的形状。混用会让「配置里的初始值」和「库里的当前值」在类型上无法区分，
 * 编辑时很容易写错数据来源。
 */
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

/**
 * 宽松解析 sections 那个 JSON 列。
 *
 * 【为什么不像 parseList 那样只接受字符串数组】这里存的是**嵌套对象**，
 * 必须逐层取值再校验。库里万一躺着一份半截坏 JSON（手工改过库、旧版本写进去的），
 * 渲染层一旦读到 undefined 就会崩在 .map 上 —— 整个磁贴区白屏。
 * 所以解析失败或字段缺失一律降级成空值，宁可少显示，也不要让页面打不开。
 */
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

/**
 * 一个小节（编辑界面的输入形状）。
 *
 * 【为什么中英各给一串字符串，而不是「每项一对」】
 * 编辑界面用两个多行文本域（中文条目一行一个 / 英文条目一行一个），
 * 比让管理员逐条填「中英对照」的表单快得多，条目多的时候差别很明显。
 * 代价是两串长度可能不一致 —— 按下标配对，英文缺行时回落到中文（见 replaceSkillGroups）。
 */
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
 *
 * 【为什么是「整份替换」而不是逐组增删改】编辑界面本来就把所有分组放在同一张面板里、
 * 一次性提交；分组只有个位数。整份替换让「调顺序、删一组、加一组」全部退化成
 * 「换掉整张表」，不需要 diff，也不会出现「先删后插」中途失败留下的排序错乱。
 * 整个替换包在一个事务里，失败时回滚，不会出现"删干净了但没插进去"的空表。
 *
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
