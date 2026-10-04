/**
 * 管理端：新建 / 更新一个项目（upsert）。
 *
 * 字段形状与校验见 lib/admin-guard.ts 的 parseProjectInput。
 * 英文标题 / 摘要允许留空，展示层会回落到中文。
 */

import { NextResponse } from 'next/server';
import { requireAdmin, parseProjectInput, readJson } from '@/lib/admin-guard';
import { saveProject } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const parsed = parseProjectInput(await readJson(request));
  if ('error' in parsed) {
    return NextResponse.json({ ok: false, code: parsed.error }, { status: 400 });
  }

  const project = saveProject(parsed.value);
  return NextResponse.json({ ok: true, slug: project.slug });
}
