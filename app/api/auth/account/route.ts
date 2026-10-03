/**
 * 账号注销：彻底删除当前用户的账号及其全部数据。
 *
 * 【删掉的是什么】用户行 + 他的所有会话 + 他的所有评论。
 * 后两项靠数据库的外键 ON DELETE CASCADE 自动完成（见 lib/db.ts）——
 * 不靠应用层一条条删，是因为「删了用户忘了删评论」会留下挂在不存在的用户 ID 上的孤儿数据，
 * 让评论列表 JOIN 出一片空白。让数据库保证这件事，比在代码里记得更可靠。
 *
 * 【为什么是真删，不是标记为已注销】
 * 用户点「注销」的语义就是「把我的东西从你的系统里拿掉」。
 * 如果只是把账号标记成 deleted、把评论改成「已注销用户」，那数据还在库里，
 * 和用户的预期不符 —— 对个人博客来说，真删更诚实，也更符合个人信息保护的要求。
 *
 * 【不可逆，所以前端必须二次确认】
 * 这个操作没有回收站。前端用 window.confirm 挡一道，用户还得手动输入确认才提交。
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { destroySession, getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 注销接口的错误码 */
export type DeleteAccountErrorCode = 'not_logged_in' | 'not_found';

/**
 * 注销当前账号。
 *
 * @returns 成功 { ok: true, removedComments }；失败 { ok: false, code }
 */
export async function DELETE(): Promise<NextResponse> {
  const fail = (code: DeleteAccountErrorCode, status = 400) =>
    NextResponse.json({ ok: false, code }, { status });

  const me = await getCurrentUser();
  if (!me) return fail('not_logged_in', 401);

  const db = getDb();

  // 先数一下会连带删掉多少评论，返回给前端做提示（用户有权知道自己删掉了什么）
  const before = db
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?')
    .get(me.id) as { n: number };

  const removed = db.transaction((userId: number) => {
    // 显式删评论，不依赖级联 —— 因为 comments.user_id 的外键虽然在 schema 里写了
    // ON DELETE CASCADE，但外键约束需要 PRAGMA foreign_keys = ON 才生效
    // （lib/db.ts 里开了）。这里显式删一道，等于不把数据完整性押在那个开关上。
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return info.changes;
  })(me.id);

  if (removed === 0) return fail('not_found', 404);

  // 清 cookie。数据库那边用户已经没了，这一步只是别让浏览器继续带着无效 token
  await destroySession();

  return NextResponse.json({ ok: true, removedComments: before.n });
}
