/**
 * 删除单条评论。
 *
 * 【谁能删：权限看环境变量 ADMIN_EMAILS】
 *   · 普通用户：只能删自己的。SQL 里把 user_id 一起写进 WHERE。
 *   · 管理员：可以删任何人的。是否管理员由 lib/auth.ts 的 isAdmin() 判定 ——
 *     把当前登录用户的邮箱拿去和 ADMIN_EMAILS（逗号分隔白名单，大小写不敏感）比对，
 *     命中即为管理员。管理员身份既不是数据库字段、也没有后台界面：
 *     用哪个邮箱注册并登录、且那个邮箱在白名单里，谁就是管理员。
 *     改 ADMIN_EMAILS 后必须重启服务才生效。
 *
 * 【为什么把 user_id 写进 WHERE 而不是先查后比】
 * 前者是原子的（不存在「查到之后、删除之前身份变了」的窗口），
 * 而且**漏写判断时它会删不到任何东西**，而不是删掉别人的。
 * 把权限写成查询条件，比写成 if 判断更难写错。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 删除接口的错误码 */
export type DeleteCommentErrorCode = 'bad_request' | 'not_logged_in' | 'not_found';

/**
 * 删除一条评论。
 *
 * 【Next 15 里 params 是 Promise】必须 await 之后才能取字段（同 notes 详情页）。
 *
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

  /*
    【普通用户】把 user_id 一起写进 WHERE。
    这样即使忘了写权限判断，它也**删不到任何东西**（而不是删掉别人的）——
    把权限写成查询条件，比写成 if 判断更难写错。

    【管理员】可以直接按 id 删。但**仍然先确认这条评论存在**，
    否则「删一条不存在的评论」会被误报成成功（changes 为 0 时两种语义分不清）。
  */
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
