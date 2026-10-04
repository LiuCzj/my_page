/**
 * 发送邮箱验证码（注册 / 注销共用）。
 *
 * 【两种用途的准入条件不同，这是关键】
 *   · register：这个邮箱**必须还没注册**。否则等于给一个已有账号发注册码，白费一封邮件。
 *   · delete  ：**必须已登录**，且码只发给「当前登录用户自己的邮箱」——
 *              绝不让请求体指定收件邮箱，否则就成了「拿别人的邮箱当发信靶子」。
 *
 * 【限流为什么要两层】
 *   同 IP：挡脚本批量刷（每个邮箱一封）。
 *   同邮箱：挡「盯着一个邮箱狂点发送」。60 秒冷却，和常见网站一致。
 * 两层都在进程内存里（重启清零、多实例各算各的）—— 个人站单进程够用。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canReceiveMail, isDisposableEmail, isEmailShapeOk } from '@/lib/email-guard';
import { issueCode, type CodePurpose } from '@/lib/codes';
import { isMailConfigured, sendCodeEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 错误码（前端翻成中英文案） */
type SendCodeErrorCode =
  | 'bad_request'
  | 'invalid_email'
  | 'disposable_email'
  | 'undeliverable_email'
  | 'email_taken'
  | 'not_logged_in'
  | 'mail_not_configured'
  | 'mail_failed'
  | 'rate_limited';

const RATE_WINDOW_MS = 10 * 60 * 1000;
/** 同一 IP 十分钟内最多发几次 */
const IP_ALLOW = 8;
/** 同一邮箱两次发送的最小间隔 */
const EMAIL_COOLDOWN_MS = 60 * 1000;

const ipHits = new Map<string, number[]>();
const emailLast = new Map<string, number>();

/**
 * 判断是否超出配额（并在未超时记一次）。
 *
 * @param ip 客户端 IP
 * @param email 归一化后的邮箱
 * @returns true 表示应拒绝
 */
function rateLimited(ip: string, email: string): boolean {
  const now = Date.now();

  const list = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= IP_ALLOW) {
    ipHits.set(ip, list);
    return true;
  }

  const last = emailLast.get(email) ?? 0;
  if (now - last < EMAIL_COOLDOWN_MS) return true;

  list.push(now);
  ipHits.set(ip, list);
  emailLast.set(email, now);
  return false;
}

/**
 * 处理发码请求。
 *
 * @param request 请求体 JSON：{ email, purpose }（purpose 为 'delete' 时忽略 email，用登录用户的）
 * @returns 成功 { ok: true }；失败 { ok: false, code }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const fail = (code: SendCodeErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  let body: { email?: string; purpose?: string };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const purpose = body.purpose;
  if (purpose !== 'register' && purpose !== 'delete') return fail('bad_request');

  const db = getDb();
  let email: string;
  let displayName = '';

  if (purpose === 'delete') {
    /*
      注销：邮箱只认「当前登录用户自己的」，不接受请求体里指定的邮箱。
      接受的话，任何登录用户都能让本站给任意邮箱发信 —— 那是一个现成的骚扰工具。
    */
    const me = await getCurrentUser();
    if (!me) return fail('not_logged_in', 401);
    email = me.email.toLowerCase();
    displayName = me.displayName;
  } else {
    email = (body.email ?? '').trim().toLowerCase();
    if (!isEmailShapeOk(email)) return fail('invalid_email');
    // 注册：这个邮箱必须还没被注册
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return fail('email_taken', 409);
  }

  // 与注册接口同样的两道邮箱检查：黑名单 + 能不能收信
  if (isDisposableEmail(email)) return fail('disposable_email');
  if (!(await canReceiveMail(email))) return fail('undeliverable_email');

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  if (rateLimited(ip, email)) return fail('rate_limited', 429);

  // 和注册接口同一条原则：输入都合法之后，才判服务端有没有能力发信
  if (!isMailConfigured()) return fail('mail_not_configured', 503);

  const code = issueCode(email, purpose as CodePurpose);

  try {
    const sent = await sendCodeEmail(email, code, purpose, displayName);
    if (!sent) return fail('mail_not_configured', 503);
  } catch (err) {
    // 发失败就把码删掉，别留下一个用户永远收不到的码
    db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[send-code] 验证码邮件发送失败 →', detail);
    return fail('mail_failed', 502);
  }

  return NextResponse.json({ ok: true });
}
