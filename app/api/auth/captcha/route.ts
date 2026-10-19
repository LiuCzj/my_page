/** 图形验证码：发一张新的给前端。 */

import { NextResponse } from 'next/server';
import { createCaptcha } from '@/lib/captcha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 生成一枚新的图形验证码。
 * @returns `{ ok: true, id, svg }` —— id 由前端随表单回传，svg 内联显示
 */
export async function GET(): Promise<NextResponse> {
  const { id, svg } = createCaptcha();
  return NextResponse.json(
    { ok: true, id, svg },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
