/**
 * 当前登录用户。
 *
 * 前端在页面加载时调一次，用来决定评论框显示哪种状态：
 * 未登录 → 显示登录/注册表单；已登录未验证 → 显示「去邮箱点确认链接」；
 * 已登录已验证 → 显示发表框。
 *
 * 【未登录为什么返回 200 而不是 401】
 * 「没登录」对评论组件来说是一种**正常状态**，不是错误。
 * 返回 401 会让浏览器控制台每次访问都红一条，而这条红字没有任何意义。
 * 用 200 + user: null 表达，前端判断更直白。
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 取当前用户。
 *
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
