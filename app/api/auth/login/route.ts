/** 登录。 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createSession, toPublicUser, verifyPassword, type UserRow } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 登录接口的错误码 */
export type LoginErrorCode = 'bad_request' | 'bad_credentials' | 'rate_limited';

/** 限流：同一 IP 十分钟内最多 10 次登录尝试。 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_ALLOW = 10;
const hits = new Map<string, number[]>();

/**
 * 判断该 IP 是否超出配额。
 * @param ip 客户端 IP
 * @returns true 表示应拒绝
 */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_ALLOW) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

/**
 * 处理登录请求。
 * @param request 请求体 JSON：{ email, password }
 * @returns 成功 { ok: true, user }；失败 { ok: false, code }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const fail = (code: LoginErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (rateLimited(ip)) return fail('rate_limited', 429);

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) return fail('bad_request');

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

  // 注意这里的写法：即使邮箱不存在也照常走一次 verifyPassword（用一份假哈希），
  // 让两条路径的耗时接近。否则「邮箱存在」比「不存在」慢 100ms，
  // 攻击者靠计时就能反推出账号是否存在 —— 前面统一错误码的努力就白费了。
  const stored = row?.password_hash ?? 'scrypt$00$00';
  const ok = verifyPassword(password, stored);

  if (!row || !ok) return fail('bad_credentials', 401);

  await createSession(row.id);
  return NextResponse.json({ ok: true, user: toPublicUser(row) });
}
