/** 邮箱验证链接的落点 —— **遗留兼容层，不是现役流程**。 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { VERIFY_TTL_MS } from '@/lib/auth-ttl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 处理验证链接。
 * @param request 请求（从 query 取 token）
 * @returns 重定向到首页，带 verified=ok / expired / invalid 之一
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  // 重定向目标：优先用配置的站点地址，否则用请求自身的 origin（本地开发不配也能用）
  const base = (process.env.SITE_URL || url.origin).replace(/\/+$/, '');

  if (!token) {
    return NextResponse.redirect(`${base}/?verified=invalid`);
  }

  const db = getDb();
  const row = db
    .prepare('SELECT id, verify_sent_at FROM users WHERE verify_token = ?')
    .get(token) as { id: number; verify_sent_at: number | null } | undefined;

  if (!row) {
    // token 不存在，或已经被用过（用过后会被清空）
    return NextResponse.redirect(`${base}/?verified=invalid`);
  }

  const sentAt = row.verify_sent_at ?? 0;
  if (Date.now() - sentAt > VERIFY_TTL_MS) {
    /* 过期：把 token 和它的时间戳一起清掉，让这条链接彻底作废。 */
    db.prepare('UPDATE users SET verify_token = NULL, verify_sent_at = NULL WHERE id = ?').run(
      row.id,
    );
    return NextResponse.redirect(`${base}/?verified=expired`);
  }

  // 通过：标记已激活并清空 token（一次性使用）
  db.prepare(
    'UPDATE users SET email_verified = 1, verify_token = NULL, verify_sent_at = NULL WHERE id = ?',
  ).run(row.id);

  return NextResponse.redirect(`${base}/?verified=ok`);
}
