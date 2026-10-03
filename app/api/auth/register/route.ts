/**
 * 注册：建账号 + 发验证邮件。
 *
 * 【注册成功 ≠ 能评论】这个接口只负责把账号建出来并寄出验证信，
 * 用户必须点开邮件里的链接（app/api/auth/verify/route.ts）才被标记为已激活。
 * 未激活的账号登录后可以看到评论框，但提交会被拒绝并提示去验证邮箱。
 *
 * 【为什么错误码要这么细】
 * 前端要把这些码翻译成当前语言（中/英）显示。直接回一句英文报错糊在中文界面上，
 * 用户看不懂，也定位不到问题。细分的码还有一个作用：把「邮箱已被注册」
 * 和「这是临时邮箱」区分开 —— 两者的用户提示完全不同。
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { hashPassword, createSession, toPublicUser, type UserRow } from '@/lib/auth';
import { canReceiveMail, isDisposableEmail, isEmailShapeOk } from '@/lib/email-guard';
import { buildVerifyUrl, isMailConfigured, sendVerificationEmail } from '@/lib/mailer';

/** Node 运行时：要用 node:crypto / node:dns / better-sqlite3，都不能跑在 Edge 上 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 密码最短长度。不设上限（超长密码交给 scrypt 也无妨），但挡住 1 位密码 */
const MIN_PASSWORD_LEN = 8;
/** 昵称长度范围 */
const NAME_MIN = 1;
const NAME_MAX = 24;
/*
 * 验证 token 的 24 小时有效期判断放在 app/api/auth/verify/route.ts 里做 ——
 * 只有那一处会读 token，在这里再定义一份只会变成两处需要同步的常量。
 */

/** 注册接口的错误码 */
export type RegisterErrorCode =
  | 'bad_request'
  | 'invalid_email'
  | 'disposable_email'
  | 'undeliverable_email'
  | 'weak_password'
  | 'invalid_name'
  | 'email_taken'
  | 'name_taken'
  | 'mail_not_configured'
  | 'mail_failed'
  | 'rate_limited';

/**
 * 极简限流：同一 IP 十分钟内最多注册 5 次。
 *
 * 【为什么注册也要限流】不限的话，脚本可以拿一份邮箱列表批量注册，
 * 每次都会触发一封验证邮件 —— 你的 SMTP 账号会被当成垃圾邮件源，
 * 轻则进黑名单，重则被服务商停用。
 *
 * 【已知边界】计数在进程内存里，重启清零；多实例部署时各算各的。
 * 个人站单进程部署够用，要更严就换 Redis。
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_ALLOW = 5;
const hits = new Map<string, number[]>();

/**
 * 判断该 IP 是否超出配额，并在未超时时记一次。
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
 * 处理注册请求。
 *
 * @param request 请求体 JSON：{ email, displayName, password }
 * @returns 成功 { ok: true, user }；失败 { ok: false, code }
 */
export async function POST(request: Request): Promise<NextResponse> {
  /** 统一的失败返回，避免每个分支都写一遍 NextResponse.json */
  const fail = (code: RegisterErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (rateLimited(ip)) return fail('rate_limited', 429);

  let body: { email?: string; displayName?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const displayName = (body.displayName ?? '').trim();
  const password = body.password ?? '';

  if (!isEmailShapeOk(email)) return fail('invalid_email');

  // 第一道：域名黑名单（含子域名），命中直接拒
  if (isDisposableEmail(email)) return fail('disposable_email');

  // 第二道：域名能不能收信。查询失败时放行（见 email-guard 的说明）
  if (!(await canReceiveMail(email))) return fail('undeliverable_email');

  if (password.length < MIN_PASSWORD_LEN) return fail('weak_password');
  if (displayName.length < NAME_MIN || displayName.length > NAME_MAX) return fail('invalid_name');

  /*
    SMTP 检查放在所有输入校验**之后**。

    顺序是有讲究的：用户填了临时邮箱时，应该立刻被告知「这个邮箱不行」，
    而不是先被一句「服务端没配邮件服务」挡住 —— 后者会让他以为是自己填错了，
    去改一个本来就没问题的邮箱。先判输入、再判服务端能力，报错才对得上用户刚做的事。
  */
  if (!isMailConfigured()) return fail('mail_not_configured', 503);

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return fail('email_taken', 409);

  /*
    昵称唯一。用 COLLATE NOCASE 让 "Tom" 和 "tom" 算同一个 —— 否则评论区里
    会出现两个肉眼分不清的昵称，读者根本认不出谁是谁。

    这里提前查一次是为了给出**准确的错误码**（name_taken 而不是笼统的失败）。
    真正的保证来自 lib/db.ts 里的唯一索引：并发下两个请求可能同时通过这次查询，
    那时由索引兜底 —— 所以下面 INSERT 的 catch 里要能区分是邮箱冲突还是昵称冲突。
  */
  const nameTaken = db
    .prepare('SELECT id FROM users WHERE display_name = ? COLLATE NOCASE')
    .get(displayName);
  if (nameTaken) return fail('name_taken', 409);

  // 验证 token：24 小时有效，明文只在邮件里出现，入库存哈希
  const verifyToken = randomBytes(32).toString('base64url');
  const now = Date.now();

  let userId: number;
  try {
    const info = db
      .prepare(
        `INSERT INTO users (email, display_name, password_hash, email_verified, verify_token, verify_sent_at, created_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(email, displayName, hashPassword(password), verifyToken, now, now);
    userId = Number(info.lastInsertRowid);
  } catch (err) {
    /*
      唯一索引兜底：并发下两个请求可能同时通过了上面那两次查询。

      靠错误信息里提到的索引名来区分是邮箱冲突还是昵称冲突 ——
      两者对用户的提示完全不同（「换个邮箱」 vs 「换个昵称」），混为一谈会让用户
      改错字段，反复提交同一个错误。
    */
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('idx_users_name')) return fail('name_taken', 409);
    return fail('email_taken', 409);
  }

  // 拼验证链接时用请求自身的 origin 兜底，本地开发不配 SITE_URL 也能点开
  const origin = new URL(request.url).origin;
  const verifyUrl = buildVerifyUrl(origin, verifyToken);

  try {
    const sent = await sendVerificationEmail(email, verifyUrl, displayName);
    if (!sent) return fail('mail_not_configured', 503);
  } catch (err) {
    // 信发不出去就把刚建的账号删掉 —— 留着一个收不到验证信的账号只会让用户困惑
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    /*
      把真实原因写进服务端日志。

      前端只能看到「确认邮件没发出去」这一句 —— 这是对的，不该把 SMTP 的原始报错
      （可能含服务器地址、账号）暴露给访客。但**服务端必须留痕**：
      没有这行日志，运维只能看到一个笼统的失败，无从判断是密码错、端口被防火墙封了、
      还是被服务商的反垃圾策略拒了。
      2026-10-03 排查时就是因为这里把错误吞了，只能另写脚本单独测 SMTP 才定位到问题。
    */
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[register] 验证邮件发送失败 →', detail);

    return fail('mail_failed', 502);
  }

  // 注册即登录（但未验证）：这样用户点完邮件回来，页面已经是登录态
  await createSession(userId);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  return NextResponse.json({ ok: true, user: toPublicUser(row) }, { status: 201 });
}
