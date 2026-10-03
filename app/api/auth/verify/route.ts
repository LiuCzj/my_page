/**
 * 邮箱验证：用户点开邮件里的链接后落到这里。
 *
 * 【为什么用 GET 而不是 POST】
 * 这个链接是用户从邮件里点开的，只能是 GET —— 邮件客户端没法帮你发 POST。
 *
 * 【为什么校验时间戳而不只校验 token】
 * token 本身是 32 字节随机数，猜不到。但如果用户注册后一直没点，
 * 那封邮件会永远躺在收件箱里 —— 几年后被人翻出来点一下，照样能激活。
 * 加 24 小时的有效期，让链接「过期即废」，减少这类陈旧链接被利用的机会。
 *
 * 【处理完为什么重定向而不是渲染一个页面】
 * 用户点完链接，最自然的期待是「回到站点继续用」，而不是停在一个孤零零的
 * 「验证成功」静态页上。重定向回首页并带上状态参数，由首页决定怎么提示。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 验证链接有效期：24 小时（与 register 里的 VERIFY_TTL 保持一致） */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 处理验证链接。
 *
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
    // 过期：清掉 token，让用户重新申请一封（重新登录后可在评论框处触发）
    db.prepare('UPDATE users SET verify_token = NULL WHERE id = ?').run(row.id);
    return NextResponse.redirect(`${base}/?verified=expired`);
  }

  // 通过：标记已激活并清空 token（一次性使用）
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(row.id);

  return NextResponse.redirect(`${base}/?verified=ok`);
}
