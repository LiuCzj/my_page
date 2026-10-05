/**
 * 邮箱验证链接的落点 —— **遗留兼容层，不是现役流程**。
 *
 * ══ 现状（2026-10-05 核对）══
 * 2026-10-04 的注册流程改造把「点邮件里的链接激活」换成了「填 6 位验证码」：
 * 注册时先调 /api/auth/send-code 拿码，码校验通过就直接建成 `email_verified = 1`
 * （见 app/api/auth/register/route.ts 的头部说明）。
 * 也就是说：**新注册不会再产生 verify_token**，本路由对它们永远查不到行。
 *
 * 那为什么留着它？只为一种情况 —— 2026-10-04 之前注册、当时没点链接、
 * 至今仍是 `email_verified = 0` 且 `verify_token` 非空的账号。
 * 他们收件箱里那封老邮件的链接还有效，点开应当能正常激活，而不是 404。
 *
 * 【它现在实际上服务不到任何人】截至 2026-10-05，开发库与线上库都只有 1 个用户，
 * 且 `email_verified = 1`、`verify_token` 全为空 → 没有遗留未激活账号。
 * 保留它的理由不是「有人在用」，而是「删掉会让老邮件里的链接变成 404」，
 * 以及留一个明确的落点比留一片空白更好。属于**有意保留的休眠代码**。
 *
 * 【遗留账号现在有别的自救路了】2026-10-05 起，`app/api/auth/reset/route.ts` 在重置
 * 密码成功时顺带置 `email_verified = 1`（能收到重置邮件就证明了邮箱归属）。
 * 所以即便这封老邮件早就过期或被删，遗留账号也能靠「忘记密码」重新拿回账号 ——
 * 本路由因此从「唯一出路」降级为「顺手还能用的老链接」。
 * 真要彻底退役它，先确认这个兜底路径已经上线。
 *
 * ══ 若要复活链接验证流程，必须补齐这三件事（缺一不可）══
 * 1. 注册 / 重发时写回 `verify_token` + `verify_sent_at`（当前无人写入这两个字段）；
 * 2. 用 `lib/mailer.ts` 的 `buildVerifyUrl` / `sendVerificationEmail` 把链接发出去
 *    （这两个函数同样处于「保留但无调用方」状态）；
 * 3. 前端消费重定向回来的 `?verified=ok|expired|invalid`。
 *    **当前没有任何代码读这个查询参数** —— dictionaries 里的
 *    `verifiedOk` / `verifiedExpired` / `verifiedInvalid` 三条文案也是死的。
 *    也就是说现在点老链接回到首页，用户**看不到任何提示**。
 *
 * ══ 历史注释勘误（2026-10-05）══
 * 本文件曾写着「验证链接有效期：24 小时（与 register 里的 VERIFY_TTL 保持一致）」，
 * 但 register 里从来就没有过 VERIFY_TTL 这个常量（全仓库仅此一处）——
 * 那句注释是错的，已删。有效期常量现统一在 `lib/auth-ttl.ts`。
 * 过期分支原本的注释还写着「重新申请一封（重新登录后可在评论框处触发）」，
 * 同样不成立：**全站没有任何重发验证邮件的入口**。
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
import { VERIFY_TTL_MS } from '@/lib/auth-ttl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 处理验证链接。
 *
 * @param request 请求（从 query 取 token）
 * @returns 重定向到首页，带 verified=ok / expired / invalid 之一
 *          （注意：这三个状态当前没有前端消费者，见文件头说明）
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
    /*
      过期：把 token 和它的时间戳一起清掉，让这条链接彻底作废。

      两个字段必须一起清（2026-10-05 修）：只清 verify_token 会留下一个孤立的
      verify_sent_at。它本身不参与任何查询，但会让「这个账号申请过验证」在库表里
      看起来仍然为真，排查问题时误导人。reset 路由清 reset_token 时就是两个字段
      一起清的，这里与之对齐。
    */
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
