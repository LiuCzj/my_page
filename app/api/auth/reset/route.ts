/**
 * 重置密码：用邮件里的 token 换一个新密码。
 *
 * 【为什么重置成功后要踢掉所有登录态】
 * 触发重置的常见原因是「账号可能被人登了」。这时候如果只改密码、
 * 保留原有会话，那个已经登进去的人**依然保持登录**——改密码等于没改。
 * 所以这里把该用户的所有 session 行删干净，逼所有设备重新登录。
 *
 * 【为什么 token 用完就清】
 * 重置链接在邮件里，可能被转发、被同步到多台设备。一次性使用是最低要求。
 *
 * 【为什么重置成功要顺带把邮箱标记为已验证】（2026-10-05 新增）
 * 能走完这一步，前提是用户**收到了发往该邮箱的邮件并点开了里面的链接** ——
 * 这和「填对 6 位验证码」是同一等级的证据，都证明了邮箱归属。
 * 所以顺手置 `email_verified = 1` 是逻辑自洽的，并没有降低任何门槛：
 * 能读这个邮箱的人本来就能通过重置改掉密码，再给他「已验证」不增加任何新权限。
 *
 * 这么做的另一个作用是给**遗留未激活账号**一条自救路。2026-10-04 之前注册、
 * 当时没点激活链接的账号，现在既不能重注册（邮箱已被占用）、也没有重发验证邮件的入口
 * （见 app/api/auth/verify/route.ts 的说明）。让他们通过「忘记密码」重新拿回账号，
 * 是比专门再开一套「重发验证邮件」更省事、也更符合用户直觉的做法。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { RESET_TTL_MS } from '@/lib/auth-ttl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 新密码最短长度（与注册一致） */
const MIN_PASSWORD_LEN = 8;

/** 重置接口的错误码 */
export type ResetErrorCode = 'bad_request' | 'weak_password' | 'invalid_token' | 'expired_token';

/**
 * 处理重置请求。
 *
 * @param request 请求体 JSON：{ token, password }
 * @returns 成功 { ok: true }；失败 { ok: false, code }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const fail = (code: ResetErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const token = (body.token ?? '').trim();
  const password = body.password ?? '';

  if (!token) return fail('invalid_token');
  if (password.length < MIN_PASSWORD_LEN) return fail('weak_password');

  const db = getDb();
  const row = db
    .prepare('SELECT id, reset_sent_at FROM users WHERE reset_token = ?')
    .get(token) as { id: number; reset_sent_at: number | null } | undefined;

  if (!row) return fail('invalid_token');

  const sentAt = row.reset_sent_at ?? 0;
  if (Date.now() - sentAt > RESET_TTL_MS) {
    // 过期就把 token 清掉，让它彻底作废（而不是留着等用户再点一次）
    db.prepare('UPDATE users SET reset_token = NULL, reset_sent_at = NULL WHERE id = ?').run(row.id);
    return fail('expired_token');
  }

  // 四件事必须在同一个事务里：改密码、清 token、激活邮箱、踢掉所有会话。
  // 分开写的话，中间任何一步失败都会留下不一致的状态
  // （例如密码改了但旧会话还在 —— 那正是最危险的组合）。
  const apply = db.transaction((userId: number) => {
    db.prepare(
      `UPDATE users
          SET password_hash = ?, reset_token = NULL, reset_sent_at = NULL, email_verified = 1
        WHERE id = ?`,
    ).run(hashPassword(password), userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  });

  apply(row.id);

  return NextResponse.json({ ok: true });
}
