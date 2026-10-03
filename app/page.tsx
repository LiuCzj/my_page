import Hero from '@/components/Hero';
import FlowLink from '@/components/FlowLink';
import Dashboard from '@/components/Dashboard';
import Projects from '@/components/Projects';
import NotesList from '@/components/NotesList';
import DigitalTwinChat from '@/components/DigitalTwinChat';
import ChatInset from '@/components/ChatInset';
import { site, homePreview } from '@/config/site';
import { getAllNotes } from '@/lib/notes';

/**
 * 首页，从上到下五块可见内容：
 *   1   首屏（头像、问候行、一句话、数字分身角色、两个入口）  → Hero
 *   2   磁贴区（籍贯 / 最喜欢的工具 / 技术栈 / 工具 / 连接） → Dashboard
 *   3   项目摘要（只放前几条，多的去 /projects）             → Projects
 *   4   笔记摘要（只放最近几篇，多的去 /notes）              → NotesList
 *   5   数字分身聊天窗                                      → DigitalTwinChat（fixed 悬浮面板，不进文档流）
 *
 * 【为什么这个文件是服务端组件，而且不能加 'use client'】
 * 笔记数据来自 content/notes 目录，靠 node:fs 读取（lib/notes.ts）。
 * 一旦这个文件变成客户端组件，fs 会被打进浏览器包并直接构建失败。
 * 需要客户端能力的那两块（NotesList 的字典、Projects 的交互）各自是客户端组件，
 * 由这里把数据当 props 传下去。
 *
 * 整页的底色和粒子网由 app/layout.tsx 那一层 fixed 画布负责，不属于这一页的内容，
 * 所以这里的区块不需要各自再铺背景图。
 *
 * config 里的 recentWork / expertise / interests 三份数据不在这一页上出现 ——
 * 它们是数字分身回答时引用的资料，不是页面内容。
 *
 * 聊天窗的开关状态由 app/layout.tsx 的 TwinChatProvider 提供（顶栏也要用它）。
 * ChatInset 负责在桌面端展开面板时把正文让开，不让面板压在内容上。
 */
export default function Home() {
  /**
   * 首页只展示最近几篇笔记，条数见 config/site.ts 的 homePreview。
   * getAllNotes() 读的是 content/notes 目录 —— 这就是这个文件必须是服务端组件的原因。
   * 目录不存在时它返回空数组（内部有 existsSync 兜底），首页会显示空态而不是崩掉。
   */
  const notes = getAllNotes().slice(0, homePreview.notes);

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

          <Projects />

          <FlowLink className="h-10" />

          {/* 笔记摘要。mt-6 + 上面那条 40px 的线，合起来还是原来 mt-12 的呼吸量 */}
          <div className="mt-6">
            <NotesList notes={notes} headingLevel={2} viewAllHref="/notes" />
          </div>
        </div>
      </ChatInset>

      {/* features.chat 置 false 时服务端直接不渲染这个面板 */}
      {site.features.chat && <DigitalTwinChat />}
    </>
  );
}
