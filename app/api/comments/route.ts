/** 评论：读取（GET）与发表（POST）。 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 单条评论长度上限 */
const BODY_MAX = 1000;
/**
 * 评论挂载键：笔记用 slug，项目用 `project:<slug>`。
 * 除字母数字与连字符外还要放行冒号，否则项目评论会被判成 invalid_slug。
 */
const SLUG_RE = /^[\w:-]+$/;

/** 返回给前端的评论形状 */
export interface PublicComment {
  id: number;
  noteSlug: string;
  body: string;
  createdAt: number;
  authorName: string;
  /** 是不是当前请求者自己写的 —— 前端据此决定要不要显示删除按钮 */
  mine: boolean;
  /** 父评论 id；顶层评论为 null。前端据此决定缩进到第几层 */
  parentId: number | null;
  /** 当前请求者能不能删这条 —— 自己的，或管理员。 */
  canDelete: boolean;
}

/** 评论接口的错误码 */
export type CommentErrorCode =
  | 'bad_request'
  | 'invalid_slug'
  | 'not_logged_in'
  | 'email_not_verified'
  | 'empty_body'
  | 'too_long'
  | 'invalid_parent'
  | 'rate_limited';

/** 限流：同一用户/IP 一分钟内最多 3 条。 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_ALLOW = 3;
const hits = new Map<string, number[]>();

/**
 * 判断是否超出发表频率。
 * @param key 限流键（优先用用户 id，未登录时用 IP）
 * @returns true 表示应拒绝
 */
function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_ALLOW) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}

/**
 * 取某篇笔记的评论列表（按时间正序，早的在前）。
 * @param request 请求，query 里带 slug
 * @returns { ok: true, comments }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') ?? '').trim();

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ ok: false, code: 'invalid_slug' satisfies CommentErrorCode }, { status: 400 });
  }

  const me = await getCurrentUser();

  const rows = getDb()
    .prepare(
      `SELECT c.id, c.note_slug, c.body, c.created_at, c.user_id, c.parent_id, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.note_slug = ?
       ORDER BY c.created_at ASC`,
    )
    .all(slug) as Array<{
    id: number;
    note_slug: string;
    body: string;
    created_at: number;
    user_id: number;
    parent_id: number | null;
    display_name: string;
  }>;

  /** 当前请求者是不是管理员（算一次，循环里复用） */
  const admin = isAdmin(me?.email);

  const comments: PublicComment[] = rows.map((r) => ({
    id: r.id,
    noteSlug: r.note_slug,
    body: r.body,
    createdAt: r.created_at,
    authorName: r.display_name,
    mine: me?.id === r.user_id,
    parentId: r.parent_id,
    canDelete: admin || me?.id === r.user_id,
  }));

  return NextResponse.json(
    { ok: true, comments },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * 发表一条评论。
 * @param request 请求体 JSON：{ slug, body }
 * @returns 成功 { ok: true, comment }；失败 { ok: false, code }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const fail = (code: CommentErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const me = await getCurrentUser();
  if (!me) return fail('not_logged_in', 401);
  if (!me.emailVerified) return fail('email_not_verified', 403);

  if (rateLimited(`u${me.id}`)) return fail('rate_limited', 429);

  let body: { slug?: string; body?: string; parentId?: number | null };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const slug = (body.slug ?? '').trim();
  const text = (body.body ?? '').trim();

  if (!SLUG_RE.test(slug)) return fail('invalid_slug');
  if (!text) return fail('empty_body');
  if (text.length > BODY_MAX) return fail('too_long');

  const db = getDb();

  /* 回复：校验父评论。 */
  let parentId: number | null = null;
  if (body.parentId != null) {
    const pid = Number(body.parentId);
    if (!Number.isInteger(pid) || pid <= 0) return fail('bad_request');

    const parent = db
      .prepare('SELECT id FROM comments WHERE id = ? AND note_slug = ?')
      .get(pid, slug);
    if (!parent) return fail('invalid_parent');

    parentId = pid;
  }

  const now = Date.now();
  const info = db
    .prepare(
      'INSERT INTO comments (note_slug, user_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(slug, me.id, parentId, text, now);

  const comment: PublicComment = {
    id: Number(info.lastInsertRowid),
    noteSlug: slug,
    body: text,
    createdAt: now,
    authorName: me.displayName,
    mine: true,
    parentId,
    canDelete: true,
  };

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
