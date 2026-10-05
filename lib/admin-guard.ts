/**
 * 管理端接口的公共守卫与输入校验。
 *
 * 【权限是这次改动的核心约束】用户明确要求：内容与项目的编辑权限**只给管理者**，
 * 「其他任何人或者 AI 都没有这权限」。所以：
 *   · 每个写接口进来第一件事就是 requireAdmin()，未登录 401、非管理员 403；
 *   · 前端把编辑入口渲染成「只有管理员看得到」，但那只是体验优化 ——
 *     真正的闸门在这里，绕过界面直接打接口同样会被挡。
 *   · 站内那个 AI 分身（/api/assistant）是只读的，它没有任何写数据的路径。
 *
 * 【为什么单独一个文件】五个管理端路由都要做同样的两件事（验身份、验输入），
 * 抄五遍迟早会漏掉一处。集中在这里，改规则只改一个地方。
 *
 * 【为什么不用 `{ ok: true } | { ok: false }` 那种判别式联合】本项目 tsconfig 里
 * `strict: false`，布尔字面量判别式在收窄时不生效（实测 `if (!x.ok)` 之后类型仍是联合）。
 * 所以这里统一改成「返回 null / 用 in 判字段」的写法，不依赖判别式收窄。
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from './auth';
import { SLUG_RE, type NoteInput, type ProjectInput, type SkillGroupInput, type SkillSectionInput } from './content';

/** 错误响应：{ ok: false, code }，状态码按需给 */
function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * 校验当前请求是不是管理员发的。
 *
 * @returns 通过返回 `null`；不通过返回**该直接回给客户端的响应**（调用方 `if (deny) return deny`）
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const me = await getCurrentUser();
  if (!me) return fail('not_logged_in', 401);
  // 403 而不是 401：身份有效，只是没有这个权限
  if (!isAdmin(me.email)) return fail('forbidden', 403);
  return null;
}

/** 校验结果：成功带 value，失败带 error（用 `'error' in r` 判断） */
export type Parsed<T> = { value: T } | { error: string };

/** 取一个字符串字段，顺带 trim */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 取一个字符串数组字段（去空、去重、保持顺序） */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
}

/**
 * 校验并规整笔记的提交体。
 *
 * 【必填与格式】slug 必须过白名单（它进 URL 与主键）；date 必须是 YYYY-MM-DD；
 * title / summary / body 不能为空 —— 空标题或空正文的笔记出现在列表里只会让人以为页面坏了。
 */
export function parseNoteInput(raw: unknown): Parsed<NoteInput> {
  if (!raw || typeof raw !== 'object') return { error: 'bad_request' };
  const b = raw as Record<string, unknown>;

  const slug = str(b.slug);
  if (!SLUG_RE.test(slug)) return { error: 'invalid_slug' };

  const title = str(b.title);
  if (!title) return { error: 'invalid_title' };

  const date = str(b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'invalid_date' };

  const summary = str(b.summary);
  if (!summary) return { error: 'invalid_summary' };

  const markdown = typeof b.body === 'string' ? b.body : '';
  if (!markdown.trim()) return { error: 'invalid_body' };

  return {
    value: {
      slug,
      title,
      date,
      summary,
      tags: strList(b.tags),
      draft: b.draft === true,
      body: markdown,
    },
  };
}

/**
 * 校验并规整项目的提交体。
 *
 * 【英文可空】title_en / summary_en 允许留空 —— 展示层会回落到中文（见 lib/content.ts 的 toProjectRecord）。
 * 中文的标题与摘要必填。
 */
export function parseProjectInput(raw: unknown): Parsed<ProjectInput> {
  if (!raw || typeof raw !== 'object') return { error: 'bad_request' };
  const b = raw as Record<string, unknown>;

  const slug = str(b.slug);
  if (!SLUG_RE.test(slug)) return { error: 'invalid_slug' };

  const titleZh = str(b.titleZh);
  if (!titleZh) return { error: 'invalid_title' };

  const summaryZh = str(b.summaryZh);
  if (!summaryZh) return { error: 'invalid_summary' };

  const date = str(b.date);
  if (date && !/^\d{4}-\d{2}$/.test(date)) return { error: 'invalid_date' };

  const sortRaw = typeof b.sort === 'number' ? b.sort : Number(b.sort);
  const sort = Number.isFinite(sortRaw) ? Math.trunc(sortRaw) : 0;

  return {
    value: {
      slug,
      titleZh,
      titleEn: str(b.titleEn),
      summaryZh,
      summaryEn: str(b.summaryEn),
      url: str(b.url),
      stack: strList(b.stack),
      date: date || null,
      featured: b.featured === true,
      sort,
    },
  };
}

/** 把 JSON 请求体读出来；解析失败给 null（由调用方判成 bad_request） */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** 把提交体里的小节数组规整成 SkillSectionInput[]（缺字段一律给空值，不抛错） */
function skillSections(v: unknown): SkillSectionInput[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    return {
      labelZh: str(s.labelZh),
      labelEn: str(s.labelEn),
      itemsZh: strList(s.itemsZh),
      itemsEn: strList(s.itemsEn),
    };
  });
}

/**
 * 校验并规整技术栈的提交体。
 *
 * 【为什么整份提交，而不是一次改一组】编辑面板把所有分组放在同一张面板里、一次性提交，
 * 所以提交体天然就是一个数组；接口据此做「整体替换」
 * （见 lib/content.ts 的 replaceSkillGroups）。
 *
 * 【必填与拒收规则，以及为什么】
 * · 组标题（中文）必填 —— 空标题在页面上就是一个空白分组，看起来像坏了。
 * · 分组 id 必须过 SLUG_RE —— 它要当数据库主键、也会当 React key，
 *   放行任意字符串等于把主键交给输入。
 * · id 不许重复 —— 主键冲突会让整份保存失败在半路。
 * · 每个分组至少要有一个「有条目」的小节 —— 只有标题、没有任何内容的分组没有意义。
 * · 空小节（文本域留空）**直接丢掉、不报错** —— 管理员清空一个文本域是很自然的动作，
 *   为这个弹错误只会烦人。
 */
export function parseSkillGroupsInput(raw: unknown): Parsed<SkillGroupInput[]> {
  if (!Array.isArray(raw)) return { error: 'bad_request' };

  const groups: SkillGroupInput[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const b = (item ?? {}) as Record<string, unknown>;

    const id = str(b.id);
    if (!SLUG_RE.test(id)) return { error: 'invalid_skill_id' };
    if (seen.has(id)) return { error: 'duplicate_skill_id' };
    seen.add(id);

    const titleZh = str(b.titleZh);
    if (!titleZh) return { error: 'invalid_skill_title' };

    const sections = skillSections(b.sections).filter((s) => s.itemsZh.length > 0);
    if (sections.length === 0) return { error: 'empty_skill_group' };

    groups.push({ id, titleZh, titleEn: str(b.titleEn), sections });
  }

  if (groups.length === 0) return { error: 'empty_skill_group' };
  return { value: groups };
}
