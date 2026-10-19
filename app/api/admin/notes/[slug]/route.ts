/** 管理端：单篇笔记的读取与删除。 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getNoteRecord, deleteNote } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Next 15 里 params 是 Promise，必须 await 之后才能取字段 */
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { slug } = await ctx.params;
  const note = getNoteRecord(slug);
  if (!note) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, note });
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { slug } = await ctx.params;
  if (!deleteNote(slug)) {
    return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
