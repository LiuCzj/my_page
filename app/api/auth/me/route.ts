/** 当前登录用户。 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 取当前用户。
 * @returns { ok: true, user } —— user 为 null 表示未登录
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  return NextResponse.json(
    { ok: true, user },
    // 这个响应**必须**不缓存：登录态随 cookie 变，缓存了会让用户看到别人的状态
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
