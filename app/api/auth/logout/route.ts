/**
 * 登出：删掉服务端的会话行 + 清 cookie。
 *
 * 【为什么两件事都要做】只清 cookie 的话，那个 token 在数据库里依然有效 ——
 * 谁要是之前截获过它（比如共用电脑的浏览器历史、被抓包的请求），照样能用它登录。
 * 删掉行才是真的失效。反过来只删行不清 cookie，用户浏览器会一直带着一个无效 token
 * 发请求，虽然登出成功了，但每次都白跑一次查询。
 */

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 处理登出。
 *
 * @returns 恒定返回 { ok: true } —— 未登录时调用也算成功（幂等）
 */
export async function POST(): Promise<NextResponse> {
  await destroySession();
  return NextResponse.json({ ok: true });
}
