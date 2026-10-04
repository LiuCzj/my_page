import Hero from '@/components/Hero';
import FlowLink from '@/components/FlowLink';
import Dashboard from '@/components/Dashboard';
import Projects from '@/components/Projects';
import NotesList from '@/components/NotesList';
import ChatInset from '@/components/ChatInset';
import { homePreview } from '@/config/site';
import { listNoteMetas, listProjects } from '@/lib/content';

/**
 * 首页，从上到下五块可见内容：
 *   1   首屏（头像、问候行、一句话、数字分身角色、两个入口）  → Hero
 *   2   磁贴区（籍贯 / 最喜欢的工具 / 技术栈 / 工具 / 连接） → Dashboard
 *   3   项目摘要（只放前几条，多的去 /projects）             → Projects
 *   4   笔记摘要（只放最近几篇，多的去 /notes）              → NotesList
 *   5   数字分身聊天窗                                      → DigitalTwinChat（挂在 app/layout.tsx，所有页面可用）
 *
 * 【为什么这个文件是服务端组件，而且不能加 'use client'】
 * 笔记与项目数据都在 SQLite 里，读取要用 better-sqlite3（原生模块）。
 * 一旦这个文件变成客户端组件，原生模块会被打进浏览器包并直接构建失败。
 * 需要客户端能力的那几块（NotesList 的字典、Projects 的交互）各自是客户端组件，
 * 由这里把数据当 props 传下去。
 *
 * 【为什么整页改成按需渲染】内容现在可以在网页上随时改（见 lib/content.ts）。
 * 如果还按构建期预渲染，站长改完会发现「页面没变」—— 因为看到的是构建那一刻的快照。
 * 所以这一页和它下面的 /notes、/projects 都显式声明 force-dynamic：
 * 每次请求现读数据库，改完刷新就生效。代价是每次请求多几次本地 SQLite 查询（毫秒级）。
 */
export const dynamic = 'force-dynamic';

export default function Home() {
  /**
   * 首页只展示最近几篇笔记、前几个项目，条数见 config/site.ts 的 homePreview。
   * 这两个函数读的是数据库；库里没内容时返回空数组，首页会显示空态而不是崩掉。
   */
  const notes = listNoteMetas().slice(0, homePreview.notes);
  const projects = listProjects();

  return (
    <>
      <ChatInset>
        {/*
          手机端顶部留白从 pt-10 收到 pt-2。
          原来手机上是 pt-10（40px）+ Hero 自己的 pt-6（24px）= 64px 空白，
          在 667px 高的屏上顶栏到头像之间空掉一整条，看着像内容没加载出来。
          桌面端保持 sm:pt-14 —— 大屏上这段留白是「呼吸」，不是「空」。
        */}
        <div className="mx-auto max-w-5xl px-4 pt-2 pb-16 sm:pt-14">
          <Hero />

          {/*
            区块之间的流光连接线：随滚动从顶端往下拉，光点走在线头。
            「往下滚」这个动作因此变成「把线往下画」，四块内容被缝成一条动线，
            而不是四段各自为政的留白。组件见 components/FlowLink.tsx。
            线本身有高度（默认 56px），所以插进来之后原来的区块间距要相应收紧。
          */}
          <FlowLink />

          <Dashboard />

          <FlowLink />

          {/*
            首页的项目是**摘要**，不给编辑入口 —— 编辑集中在 /projects 页。
            摘要是「让人快速知道你在做什么」，就地能改反而容易误触。
          */}
          <Projects projects={projects} />

          <FlowLink className="h-10" />

          {/* 笔记摘要。mt-6 + 上面那条 40px 的线，合起来还是原来 mt-12 的呼吸量 */}
          <div className="mt-6">
            <NotesList notes={notes} headingLevel={2} viewAllHref="/notes" index="02" />
          </div>
        </div>
      </ChatInset>
    </>
  );
}
