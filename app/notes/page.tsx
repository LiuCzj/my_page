import type { Metadata } from 'next';
import { listNoteMetas } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import NotesList from '@/components/NotesList';
import NoteAdmin from '@/components/admin/NoteAdmin';

/** 笔记列表页。 */
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
