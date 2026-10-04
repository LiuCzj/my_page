import type { Metadata } from 'next';
import { listNoteMetas } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import NotesList from '@/components/NotesList';
import NoteAdmin from '@/components/admin/NoteAdmin';

/**
 * 笔记列表页。
 *
 * 【为什么这个文件是服务端组件，而列表 UI 是客户端组件】
 * 笔记数据在数据库里（lib/content.ts，依赖 better-sqlite3），只有服务端能读。
 * 但页面的文案（标题、说明、空态、阅读时长）要跟着中英切换，那是客户端字典的事。
 * 所以分工是：这里读数据 + 判权限 → 作为 props 交给客户端子组件渲染。
 *
 * 【管理员看到的是 NoteAdmin，访客看到的是 NotesList】
 * NoteAdmin 比 NotesList 多一个「新建」工具条和每条右侧的编辑/删除按钮，
 * 并且会带上草稿（管理端要能看见并编辑未发布的笔记）。
 * 访客那一条路径上，DOM 里根本没有这些按钮。
 *
 * 【metadata 为什么写死中文】
 * metadata 在服务端渲染时就定死了，而语言偏好存在访客浏览器的 localStorage 里，
 * 服务器读不到，所以做不到「跟着访客的语言换标题」。
 *
 * 【容器宽度为什么是 3xl 而不是首页的 5xl】
 * 列表是竖排文字，一行太长会难以扫读。3xl（768px）是中文正文比较舒服的宽度。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '笔记',
  description: '技术笔记：做东西时踩过的坑，和想明白的事。',
};

export default async function NotesPage() {
  const me = await getCurrentUser();
  const canEdit = isAdmin(me?.email);
  // 管理端连草稿一起列出来（否则改完的草稿在列表里找不到）；访客按默认规则（生产环境不含草稿）
  const notes = listNoteMetas(canEdit ? true : undefined);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
      {/* headingLevel=1：这是本页的主标题，一个页面只能有一个 h1 */}
      {canEdit ? (
        <NoteAdmin notes={notes} />
      ) : (
        <NotesList notes={notes} headingLevel={1} />
      )}
    </div>
  );
}
