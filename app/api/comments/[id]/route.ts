/** 删除单条评论。 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 删除接口的错误码 */
export type DeleteCommentErrorCode = 'bad_request' | 'not_logged_in' | 'not_found';

/**
 * 删除一条评论。
 * @param _request 未使用（删除不需要请求体）
 * @param ctx 路由上下文，params.id 为评论 id
 * @returns 成功 { ok: true }；失败 { ok: false, code }
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const fail = (code: DeleteCommentErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const me = await getCurrentUser();
  if (!me) return fail('not_logged_in', 401);

  const { id } = await ctx.params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId) || commentId <= 0) return fail('bad_request');

  const db = getDb();
  const admin = isAdmin(me.email);

  /* 这样即使忘了写权限判断，它也**删不到任何东西**（而不是删掉别人的）——把权限写成查询条件，比写成 if 判断更难写错。 */
  if (admin) {
    const exists = db.prepare('SELECT id FROM comments WHERE id = ?').get(commentId);
    if (!exists) return fail('not_found', 404);
    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    return NextResponse.json({ ok: true, byAdmin: true });
  }

  const info = db
    .prepare('DELETE FROM comments WHERE id = ? AND user_id = ?')
    .run(commentId, me.id);

  if (info.changes === 0) return fail('not_found', 404);

  return NextResponse.json({ ok: true });
}
