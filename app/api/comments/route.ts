/**
 * 评论：读取（GET）与发表（POST）。
 *
 * 【为什么读要单独开放、写才要登录】
 * 评论是给所有人看的 —— 访客不该为了看别人聊了什么而先注册。
 * 只有「写」这一步需要身份，这是常见的取舍，也符合直觉。
 *
 * 【发表的两道闸】
 *   1. 必须登录（有会话）
 *   2. 必须已验证邮箱（email_verified = 1）
 * 第 2 条是挡临时邮箱的实际执行点 —— 注册接口只是把信寄出去，
 * 用户不点链接就永远停在这一步，发不了评论。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 单条评论长度上限 */
const BODY_MAX = 1000;
/** 笔记 slug 只允许字母数字和连字符（与 lib/content.ts 的 SLUG_RE 保持一致） */
const SLUG_RE = /^[\w-]+$/;

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
  /**
   * 当前请求者能不能删这条 —— 自己的，或管理员。
   *
   * 【为什么后端算好再给前端，而不是前端自己判断】
   * 「我是不是管理员」这件事前端不知道（管理员名单在服务端环境变量里，
   * 故意不下发）。所以由后端把「能不能删」算成一个布尔值发下来，
   * 前端只负责显示/隐藏按钮。**真正的拦截在 DELETE 接口里** ——
   * 这里的值只影响按钮显不显示，改它也没用。
   */
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

/**
 * 限流：同一用户/IP 一分钟内最多 3 条。
 * 防的是「同一个人刷屏」，不是防陌生人 —— 陌生人连登录都过不了。
 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_ALLOW = 3;
const hits = new Map<string, number[]>();

/**
 * 判断是否超出发表频率。
 *
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
 *
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
 *
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

  /*
    回复：校验父评论。

    【为什么要校验「父评论属于同一篇笔记」】
    不校验的话，A 篇的评论可以被挂到 B 篇的父评论下 —— 前端按 parentId 建树时，
    那条回复会找不到父节点而凭空消失（或者挂到错误的位置）。这是数据完整性问题，
    必须在写入时挡住，不能指望前端不乱传。
  */
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
