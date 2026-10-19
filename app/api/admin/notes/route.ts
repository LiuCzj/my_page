/** 管理端：新建 / 更新一篇笔记（upsert）。 */

import { NextResponse } from 'next/server';
import { requireAdmin, parseNoteInput, readJson } from '@/lib/admin-guard';
import { saveNote } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const parsed = parseNoteInput(await readJson(request));
  if ('error' in parsed) {
    return NextResponse.json({ ok: false, code: parsed.error }, { status: 400 });
  }

  const note = saveNote(parsed.value);
  return NextResponse.json({ ok: true, slug: note.slug });
}
