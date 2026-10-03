/**
 * 登录。
 *
 * 【为什么「邮箱不存在」和「密码错误」返回同一个错误码】
 * 分开返回等于送人一个账号枚举接口：攻击者拿一份邮箱列表挨个试，
 * 就能问出「哪些邮箱在这个站注册过」。统一回 `bad_credentials`，
 * 让这两种情况在外部看起来完全一样。
 *
 * 【为什么未验证也能登录】
 * 登录和「能否评论」是两件事。允许未验证用户登录，是为了让他能看到
 * 评论框上的「请先验证邮箱 / 重新发送验证信」提示 —— 直接拒绝登录的话，
 * 用户只会看到一个「登录失败」，完全不知道卡在哪一步。
 * 真正拦截评论的是 comments 接口。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createSession, toPublicUser, verifyPassword, type UserRow } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 登录接口的错误码 */
export type LoginErrorCode = 'bad_request' | 'bad_credentials' | 'rate_limited';

/**
 * 限流：同一 IP 十分钟内最多 10 次登录尝试。
 *
 * 【为什么比注册宽松】正常用户会打错密码，重试几次是常态；
 * 卡太死会把真人挡在外面。10 次足够挡住脚本的暴力猜测
 * （配合 scrypt 每次约 100ms 的计算成本，十分钟 10 次的猜测量毫无意义）。
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_ALLOW = 10;
const hits = new Map<string, number[]>();

/**
 * 判断该 IP 是否超出配额。
 *
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
 *
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
