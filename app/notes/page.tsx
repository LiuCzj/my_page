import type { Metadata } from 'next';
import { getAllNotes } from '@/lib/notes';
import NotesList from '@/components/NotesList';

/**
 * 笔记列表页。
 *
 * 【为什么这个文件是服务端组件，而列表 UI 是客户端组件】
 * 只有服务端能读 content/notes 下的文件（lib/notes.ts 用了 node:fs）。
 * 但页面的文案（标题、说明、空态、阅读时长）要跟着中英切换，那是客户端字典的事。
 * 所以分工是：这里读数据 → 作为 props 交给客户端子组件 NotesList 渲染。
 * 这是全站既有的范式（app/not-found.tsx 也是「客户端组件读字典」）。
 *
 * 【metadata 为什么写死中文】
 * metadata 在服务端渲染时就定死了，而语言偏好存在访客浏览器的 localStorage 里，
 * 服务器读不到，所以做不到「跟着访客的语言换标题」。这与根布局同一口径：
 * 站点内容以中文为主，标题给中文，根布局的 template 会把它补成「笔记 · 锦创AI」。
 *
 * 【容器宽度为什么是 3xl 而不是首页的 5xl】
 * 列表是竖排文字，一行太长会难以扫读。3xl（768px）是中文正文比较舒服的宽度。
 * 项目页是卡片网格，所以那边仍然用 5xl。
 */
export const metadata: Metadata = {
  title: '笔记',
  description: '技术笔记：做东西时踩过的坑，和想明白的事。',
};

export default function NotesPage() {
  const notes = getAllNotes();

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
      {/* headingLevel=1：这是本页的主标题，一个页面只能有一个 h1 */}
      <NotesList notes={notes} headingLevel={1} />
    </div>
  );
}
