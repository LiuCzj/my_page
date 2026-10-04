/**
 * 管理端：单篇笔记的读取与删除。
 *
 * 【为什么需要 GET】列表页（/notes）只传元数据（标题/日期/摘要/标签），不带正文 ——
 * 正文可能很长，全部塞进列表页的 HTML 是浪费。编辑器点「编辑」时才按 slug 取全文。
 *
 * 【删除会连带评论】见 lib/content.ts 的 deleteNote。
 */

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
