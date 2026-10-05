/**
 * 注册：校验邮箱验证码 → 建账号（直接是已激活）→ 直接登录。
 *
 * 【2026-10-04 流程改造】原来是「建账号 + 发验证链接 + 点链接才激活」。
 * 现在改成常见网站的流程：先调 /api/auth/send-code 拿 6 位码，
 * 再把「邮箱 + 码 + 密码 + 确认密码 + 昵称」一起提交到这里。
 * 码本身已经证明了邮箱归属，所以建出来的账号 **email_verified = 1**，
 * 不再需要点链接那一步（verify 路由保留，给历史未激活账号用）。
 *
 * 【为什么错误码要这么细】前端要把这些码翻成当前语言显示。
 * 细分的码能把「邮箱已注册」「昵称被占」「验证码错了」「验证码过期」分开 ——
 * 这几种情况用户该做的事完全不同，混成一句「注册失败」等于没说。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword, createSession, toPublicUser, type UserRow } from '@/lib/auth';
import { canReceiveMail, isDisposableEmail, isEmailShapeOk } from '@/lib/email-guard';
import { verifyCode, consumeCode } from '@/lib/codes';
import { verifyCaptcha, consumeCaptcha } from '@/lib/captcha';

/** Node 运行时：要用 node:crypto / node:dns / better-sqlite3，都不能跑在 Edge 上 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 密码最短长度。不设上限（超长密码交给 scrypt 也无妨），但挡住 1 位密码 */
const MIN_PASSWORD_LEN = 8;
/** 昵称长度范围 */
const NAME_MIN = 1;
const NAME_MAX = 24;

/** 注册接口的错误码 */
export type RegisterErrorCode =
  | 'bad_request'
  | 'invalid_email'
  | 'disposable_email'
  | 'undeliverable_email'
  | 'weak_password'
  | 'password_mismatch'
  | 'invalid_name'
  | 'invalid_code'
  | 'expired_code'
  | 'too_many_attempts'
  | 'captcha_invalid'
  | 'captcha_expired'
  | 'captcha_too_many'
  | 'email_taken'
  | 'name_taken'
  | 'rate_limited';

/**
 * 极简限流：同一 IP 十分钟内最多注册 5 次。
 *
 * 【为什么注册也要限流】不限的话，脚本可以拿一份邮箱列表批量注册。
 * 个人站单进程部署够用；要更严就换 Redis。
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
 * @param request 请求体 JSON：{ email, code, password, confirmPassword, displayName }
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

  let body: {
    email?: string;
    code?: string;
    password?: string;
    confirmPassword?: string;
    displayName?: string;
    captchaId?: string;
    captchaText?: string;
  };
  try {
    body = await request.json();
  } catch {
    return fail('bad_request');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();
  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  const displayName = (body.displayName ?? '').trim();
  const captchaId = (body.captchaId ?? '').trim();
  const captchaText = (body.captchaText ?? '').trim();

  /*
    ── 图形验证码：放在最前面 ──────────────────────────────────
    【为什么排第一】它是这一整条链路上唯一专门用来挡脚本的一环。
    后面的邮箱 DNS 查询（canReceiveMail）会真的往外发 DNS 请求，
    是被刷时最贵的操作 —— 让它排在验证码后面，脚本连这一关都过不去。
    【对正常用户的影响】他本来就要读图再填，先报这一项不额外增加负担。
  */
  const captchaVerdict = verifyCaptcha(captchaId, captchaText);
  if (captchaVerdict === 'expired') return fail('captcha_expired');
  if (captchaVerdict === 'too_many') return fail('captcha_too_many');
  if (captchaVerdict !== 'ok') return fail('captcha_invalid');

  if (!isEmailShapeOk(email)) return fail('invalid_email');

  // 第一道：域名黑名单（含子域名），命中直接拒
  if (isDisposableEmail(email)) return fail('disposable_email');

  // 第二道：域名能不能收信。查询失败时放行（见 email-guard 的说明）
  if (!(await canReceiveMail(email))) return fail('undeliverable_email');

  if (password.length < MIN_PASSWORD_LEN) return fail('weak_password');
  // 两次密码必须一致 —— 这是防「手滑打错一个字符，之后再也登不上」
  if (password !== confirmPassword) return fail('password_mismatch');
  if (displayName.length < NAME_MIN || displayName.length > NAME_MAX) return fail('invalid_name');
  if (!/^\d{6}$/.test(code)) return fail('invalid_code');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return fail('email_taken', 409);

  /*
    昵称唯一。用 COLLATE NOCASE 让 "Tom" 和 "tom" 算同一个 —— 否则评论区里
    会出现两个肉眼分不清的昵称，读者根本认不出谁是谁。

    这里提前查一次是为了给出**准确的错误码**。真正的保证来自 lib/db.ts 的唯一索引：
    并发下两个请求可能同时通过这次查询，那时由索引兜底（见下面的 catch）。
  */
  const nameTaken = db
    .prepare('SELECT id FROM users WHERE display_name = ? COLLATE NOCASE')
    .get(displayName);
  if (nameTaken) return fail('name_taken', 409);

  /*
    校验验证码。

    【为什么放在最后】验证码是「用户刚去邮箱抄回来的东西」，前面那些（邮箱格式、
    临时邮箱、密码强度、昵称）都是他手上就能改的。先报那些，用户一轮就能改完；
    先报验证码的话，他改完密码还得再输一遍码（而码可能已经过期了）。
  */
  const verdict = verifyCode(email, 'register', code);
  if (verdict === 'expired') return fail('expired_code');
  if (verdict === 'too_many') return fail('too_many_attempts');
  if (verdict !== 'ok') return fail('invalid_code');

  const now = Date.now();
  let userId: number;
  try {
    // 码已证明邮箱归属 → 直接建成已激活
    const info = db
      .prepare(
        `INSERT INTO users (email, display_name, password_hash, email_verified, created_at)
         VALUES (?, ?, ?, 1, ?)`,
      )
      .run(email, displayName, hashPassword(password), now);
    userId = Number(info.lastInsertRowid);
  } catch (err) {
    /*
      唯一索引兜底：并发下两个请求可能同时通过了上面那两次查询。
      靠错误信息里提到的索引名区分是邮箱冲突还是昵称冲突 —— 两者对用户的提示完全不同。
    */
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('idx_users_name')) return fail('name_taken', 409);
    return fail('email_taken', 409);
  }

  // 码用完即弃：同一枚码不该能注册第二个账号
  consumeCode(email, 'register');

  /*
    图形验证码也在这里才销毁（不是校验通过就销毁）。
    上面任何一步失败都不会走到这里，所以用户「图形码填对了、邮箱码填错了」时，
    重试不用重新读图 —— 见 lib/captcha.ts 文件头对这个取舍的说明。
  */
  consumeCaptcha(captchaId);

  // 注册即登录：省掉「注册完还得再登一次」
  await createSession(userId);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  return NextResponse.json({ ok: true, user: toPublicUser(row) }, { status: 201 });
}
