/**
 * 管理端：新建 / 更新一篇笔记（upsert）。
 *
 * 【为什么新建和更新是同一个接口】编辑器对「写一篇新的」和「改一篇已有的」用的是同一张表单、
 * 同一个保存动作。slug 是主键，天然就是 upsert 的键，没必要拆成两个端点。
 *
 * 【权限】requireAdmin()：未登录 401、非管理员 403。
 * 前端不渲染编辑入口只是体验，这里才是真正的闸门。
 */

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
