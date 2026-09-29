import Hero from '@/components/Hero';
import InfoCard from '@/components/InfoCard';
import DigitalTwinChat from '@/components/DigitalTwinChat';
import ChatInset from '@/components/ChatInset';
import { site } from '@/config/site';

/**
 * 单页主页，从上到下三块可见内容：
 *   1+2 头像、名字、一句话介绍、个人特色 → Hero
 *   3   个人信息展示区                → InfoCard
 *   4   数字分身聊天窗                → DigitalTwinChat（fixed 悬浮面板，不进文档流）
 *
 * 聊天窗的开关状态由 app/layout.tsx 的 TwinChatProvider 提供（顶栏也要用它）。
 * ChatInset 负责在桌面端展开面板时把正文让开，不让面板压在内容上。
 */
export default function Home() {
  return (
    <>
      <ChatInset>
        <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
          <Hero />

          <InfoCard />
        </div>
      </ChatInset>

      {/* features.chat 置 false 时服务端直接不渲染这个面板 */}
      {site.features.chat && <DigitalTwinChat />}
    </>
  );
}
