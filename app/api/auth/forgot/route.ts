/**
 * 找回密码：给邮箱发一封重置链接。
 *
 * 【为什么邮箱不存在也返回 ok】
 * 如果「邮箱没注册」回一个专门的错误，这个接口就变成了账号枚举器：
 * 任何人拿一份邮箱列表挨个试，就能问出「谁在这个站注册过」。
 * 所以无论邮箱存不存在，都回同一个成功响应。用户那边看到的是
 * 「如果这个邮箱注册过，重置邮件已经发出」—— 他不需要知道更多。
 *
 * 【为什么重置 token 只存 1 小时】
 * 重置链接的杀伤力比验证链接大（能直接改密码）。有效期越短，
 * 邮件在收件箱里躺久了被人翻出来利用的机会越小。
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { buildResetUrl, isMailConfigured, sendResetEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 重置 token 有效期：1 小时 */
const RESET_TTL_MS = 60 * 60 * 1000;

/** 忘记密码接口的错误码 */
export type ForgotErrorCode = 'bad_request' | 'mail_not_configured' | 'rate_limited';

/**
 * 限流：同一 IP 十分钟内最多 3 次。
 *
 * 【为什么比注册更严】这个接口每次调用都会发一封邮件到「别人填的邮箱」。
 * 不限流的话，它可以被用来往任意邮箱灌邮件（拿别人的邮箱当地址簿轰炸），
 * 你的 SMTP 账号也会因此被服务商标记。
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_ALLOW = 3;
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
 * 处理找回密码请求。
 *
 * @param request 请求体 JSON：{ email }
 * @returns 恒定返回 { ok: true }（不泄漏邮箱是否注册过）
 */
export async function POST(request: Request): Promise<NextResponse> {
  const fail = (code: ForgotErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (rateLimited(ip)) return fail('rate_limited', 429);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) return fail('bad_request');

  // SMTP 没配就没法发信。这个错误必须告诉用户（否则他会一直等一封永远不会来的邮件），
  // 但它和「邮箱是否注册过」无关，不构成信息泄漏。
  if (!isMailConfigured()) return fail('mail_not_configured', 503);

  const db = getDb();
  const row = db
    .prepare('SELECT id, display_name FROM users WHERE email = ?')
    .get(email) as { id: number; display_name: string } | undefined;

  // 邮箱不存在：什么都不做，但仍然回成功（防枚举）
  if (!row) {
    return NextResponse.json({ ok: true });
  }

  const token = randomBytes(32).toString('base64url');
  const now = Date.now();

  db.prepare('UPDATE users SET reset_token = ?, reset_sent_at = ? WHERE id = ?').run(
    token,
    now,
    row.id,
  );

  const origin = new URL(request.url).origin;
  const resetUrl = buildResetUrl(origin, token);

  try {
    await sendResetEmail(email, resetUrl, row.display_name);
  } catch (err) {
    // 发信失败要把 token 清掉 —— 否则库里留着一个用户永远收不到的 token，
    // 下次再点「忘记密码」会把它覆盖，但期间那串 token 在库外是「有效」的
    db.prepare('UPDATE users SET reset_token = NULL, reset_sent_at = NULL WHERE id = ?').run(row.id);

    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[forgot] 重置邮件发送失败 →', detail);
    return fail('mail_not_configured', 502);
  }

  // 同样回 ok，不区分「邮箱存在」与「不存在」
  return NextResponse.json({ ok: true });
}
