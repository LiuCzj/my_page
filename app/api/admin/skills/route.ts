/**
 * 管理端：保存整份技术栈分组。
 *
 * 【为什么只有一个接口、没有单组增删改】编辑面板把所有分组放在同一张面板里、
 * 一次性提交；分组只有个位数。整份替换让「调顺序 / 删一组 / 加一组」全部退化成
 * 「换掉整张表」，接口不需要 diff，也不会出现中间态（详见 lib/content.ts 的 replaceSkillGroups）。
 *
 * 【为什么没有 GET】读取走服务端组件（app/page.tsx 直接查库当 props 传下去），
 * 多一个 GET 接口只会多一份可以不同步的数据副本 —— 而这里恰恰最怕两份数据不一致。
 *
 * 【权限】第一件事就是 requireAdmin()：未登录 401、非管理员 403。
 * 界面上那个「编辑」按钮只是体验优化，真正的闸门在这里，绕过界面直接打接口同样会被挡。
 */

import { NextResponse } from 'next/server';
import { requireAdmin, parseSkillGroupsInput, readJson } from '@/lib/admin-guard';
import { replaceSkillGroups } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const parsed = parseSkillGroupsInput(await readJson(request));
  if ('error' in parsed) {
    return NextResponse.json({ ok: false, code: parsed.error }, { status: 400 });
  }

  replaceSkillGroups(parsed.value);
  return NextResponse.json({ ok: true, count: parsed.value.length });
}
