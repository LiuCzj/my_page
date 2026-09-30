import Hero from '@/components/Hero';
import Dashboard from '@/components/Dashboard';
import Projects from '@/components/Projects';
import DigitalTwinChat from '@/components/DigitalTwinChat';
import ChatInset from '@/components/ChatInset';
import { site } from '@/config/site';

/**
 * 单页主页，从上到下四块可见内容：
 *   1   首屏（头像、问候行、一句话、机器人、两个入口、联系方式） → Hero
 *   2   磁贴区（籍贯 / 最喜欢的工具 / 技术栈 / 工具 / 连接）     → Dashboard
 *   3   项目（config 里为空时显示诚实空态）                     → Projects
 *   4   数字分身聊天窗                                          → DigitalTwinChat（fixed 悬浮面板，不进文档流）
 *
 * config 里的 recentWork / expertise / interests 三份数据不在这一页上出现 ——
 * 它们是数字分身回答时引用的资料，不是页面内容。
 *
 * 聊天窗的开关状态由 app/layout.tsx 的 TwinChatProvider 提供（顶栏也要用它）。
 * ChatInset 负责在桌面端展开面板时把正文让开，不让面板压在内容上。
 */
export default function Home() {
  return (
    <>
      <ChatInset>
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:pt-14">
          <Hero />

          <Dashboard />

          <Projects />
        </div>
      </ChatInset>

      {/* features.chat 置 false 时服务端直接不渲染这个面板 */}
      {site.features.chat && <DigitalTwinChat />}
    </>
  );
}
