/** 管理端：保存整份技术栈分组。 */

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
