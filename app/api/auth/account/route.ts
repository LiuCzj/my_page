/**
 * 账号注销：图形验证码 + 当前密码 + 邮箱验证码，三层都过才彻底删除账号及其全部数据。
 *
 * 【2026-10-04：加了邮箱验证码这一步】用户要求注销也要收验证码确认。
 * 这是对的 —— 注销不可逆，光靠一个已登录的会话（可能是别人趁你离开电脑时点的）不够。
 * 码发到账号自己的邮箱，等于「只有能收这封信的人才能注销这个账号」。
 *
 * 【2026-10-05：再加两层 —— 图形验证码 + 当前密码】
 * 站长要求。三层挡的是三种不同的东西，不是重复劳动：
 *   · 图形验证码 → 挡**脚本**（批量提交、拿泄漏的会话列表去撞）
 *   · 当前密码   → 挡**拿到会话但不知道密码的人**（共用电脑、会话被偷）
 *   · 邮箱验证码 → 挡**连邮箱也一起被拿到的情况**，同时留一条「你确定吗」的缓冲
 * 顺序按「验证成本从低到高」排：图形码最便宜（看一眼就填），密码次之，
 * 邮箱码最贵（要切到邮箱去抄）。这个顺序下，用户不会填完最贵的邮箱码才发现图形码写错了。
 *
 * 【删掉的是什么】用户行 + 他的所有会话 + 他的所有评论。
 * 后两项靠数据库的外键 ON DELETE CASCADE，这里也显式删一道（不把数据完整性押在 PRAGMA 开关上）。
 *
 * 【为什么是真删，不是标记为已注销】
 * 用户点「注销」的语义就是「把我的东西从你的系统里拿掉」。
 * 只标记 deleted、把评论改成「已注销用户」，数据还在库里，和用户的预期不符。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { destroySession, getCurrentUser, verifyPassword } from '@/lib/auth';
import { consumeCode, verifyCode } from '@/lib/codes';
import { verifyCaptcha, consumeCaptcha } from '@/lib/captcha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 注销接口的错误码 */
export type DeleteAccountErrorCode =
  | 'not_logged_in'
  | 'bad_request'
  | 'invalid_code'
  | 'expired_code'
  | 'too_many_attempts'
  | 'captcha_invalid'
  | 'captcha_expired'
  | 'captcha_too_many'
  | 'wrong_password'
  | 'not_found';

/**
 * 注销当前账号。
 *
 * @param request 请求体 JSON：{ code, password, captchaId, captchaText }
 * @returns 成功 { ok: true, removedComments }；失败 { ok: false, code }
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const fail = (code: DeleteAccountErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const me = await getCurrentUser();
  if (!me) return fail('not_logged_in', 401);

  let body: {
    code?: string;
    password?: string;
    captchaId?: string;
    captchaText?: string;
  };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const code = (body.code ?? '').trim();
  const password = body.password ?? '';

  // ── 第一层：图形验证码 ──
  const captchaVerdict = verifyCaptcha((body.captchaId ?? '').trim(), (body.captchaText ?? '').trim());
  if (captchaVerdict === 'expired') return fail('captcha_expired');
  if (captchaVerdict === 'too_many') return fail('captcha_too_many');
  if (captchaVerdict !== 'ok') return fail('captcha_invalid');

  // ── 第二层：当前密码 ──
  /*
    从库里取完整的用户行拿 password_hash —— getCurrentUser() 返回的是 PublicUser，
    刻意不含哈希（那是给前端用的）。这里需要比对，所以单独查一次。
  */
  const row = getDb()
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(me.id) as { password_hash: string } | undefined;
  if (!row) return fail('not_found', 404);
  if (!password) return fail('wrong_password');
  if (!verifyPassword(password, row.password_hash)) return fail('wrong_password');

  // ── 第三层：邮箱验证码 ──
  if (!/^\d{6}$/.test(code)) return fail('invalid_code');

  /*
    码只认「当前登录用户自己的邮箱」—— 不接受请求体里指定邮箱。
    否则一个登录用户就能拿别人的邮箱去验证，注销掉别人的账号。
  */
  const verdict = verifyCode(me.email.toLowerCase(), 'delete', code);
  if (verdict === 'expired') return fail('expired_code');
  if (verdict === 'too_many') return fail('too_many_attempts');
  if (verdict !== 'ok') return fail('invalid_code');

  const db = getDb();

  // 先数一下会连带删掉多少评论，返回给前端做提示（用户有权知道自己删掉了什么）
  const before = db
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?')
    .get(me.id) as { n: number };

  const removed = db.transaction((userId: number) => {
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return info.changes;
  })(me.id);

  if (removed === 0) return fail('not_found', 404);

  // 用完即弃（账号已经没了，这行其实也会被下面的清理带走，但语义上该显式写）
  consumeCode(me.email.toLowerCase(), 'delete');

  /*
    图形验证码也在这里才销毁。上面三层任何一层没过都不会走到这儿，
    所以用户「图形码对了、邮箱码填错」时重试不用重新读图。
    见 lib/captcha.ts 文件头对这个取舍的说明。
  */
  consumeCaptcha((body.captchaId ?? '').trim());

  // 清 cookie。数据库那边用户已经没了，这一步只是别让浏览器继续带着无效 token
  await destroySession();

  return NextResponse.json({ ok: true, removedComments: before.n });
}
