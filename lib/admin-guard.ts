/** 管理端接口的公共守卫与输入校验。 */

import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from './auth';
import { SLUG_RE, type NoteInput, type ProjectInput, type SkillGroupInput, type SkillSectionInput } from './content';

/** 错误响应：{ ok: false, code }，状态码按需给 */
function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * 校验当前请求是不是管理员发的。
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

/** 校验并规整笔记的提交体。 */
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

/** 校验并规整项目的提交体。 */
export function parseProjectInput(raw: unknown): Parsed<ProjectInput> {
  if (!raw || typeof raw !== 'object') return { error: 'bad_request' };
  const b = raw as Record<string, unknown>;

  const slug = str(b.slug);
  if (!SLUG_RE.test(slug)) return { error: 'invalid_slug' };

  const titleZh = str(b.titleZh);
  if (!titleZh) return { error: 'invalid_title' };

  /* 摘要可留空：列表不显示摘要时，卡片只靠标题和技术栈 */
  const summaryZh = str(b.summaryZh);

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
      // 正文可空：空串表示这个项目只有卡片，没有详情页
      body: typeof b.body === 'string' ? b.body : '',
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

/** 校验并规整技术栈的提交体。 */
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
