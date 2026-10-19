/** 登出：删掉服务端的会话行 + 清 cookie。 */

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 处理登出。
 * @returns 恒定返回 { ok: true } —— 未登录时调用也算成功（幂等）
 */
export async function POST(): Promise<NextResponse> {
  await destroySession();
  return NextResponse.json({ ok: true });
}
