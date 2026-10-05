/**
 * 图形验证码：发一张新的给前端。
 *
 * 【为什么是 JSON 而不是直接返回 image/svg+xml】
 * 返回图片的话，前端要先拿到 id 才能构造 `<img src>`，那就是两次往返；
 * 而 id 和图片必须是同一次生成的（id 指向服务端存的那份答案）。
 * 一次 JSON 把两样一起给，前端内联渲染即可。
 *
 * 【安全性】返回的 svg 是我们自己用固定模板生成的，不含任何用户输入，
 * 所以前端可以安全地内联（不存在注入面）。答案只存在服务端内存里，不随响应下发。
 *
 * 【Cache-Control: no-store 是必须的】验证码是「每次都必须不一样」的资源。
 * 少写这一行，某些浏览器/中间层可能缓存住，用户点「换一张」却拿到同一张图，
 * 然后陷入「我明明换了图，答案还是说不对」的死循环。
 */

import { NextResponse } from 'next/server';
import { createCaptcha } from '@/lib/captcha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 生成一枚新的图形验证码。
 *
 * @returns `{ ok: true, id, svg }` —— id 由前端随表单回传，svg 内联显示
 */
export async function GET(): Promise<NextResponse> {
  const { id, svg } = createCaptcha();
  return NextResponse.json(
    { ok: true, id, svg },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
