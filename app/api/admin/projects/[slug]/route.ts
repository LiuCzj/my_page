/**
 * 管理端：删除一个项目。
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { deleteProject } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { slug } = await ctx.params;
  if (!deleteProject(slug)) {
    return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
