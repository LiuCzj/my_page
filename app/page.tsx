import Hero from '@/components/Hero';
import InfoCard from '@/components/InfoCard';
import DigitalTwinChat from '@/components/DigitalTwinChat';
import { site } from '@/config/site';
import type { Metadata } from 'next';

/** 短标题，「· 锦创AI」后缀由 app/layout.tsx 的 template 统一拼 */
export const metadata: Metadata = {
  title: '首页',
  description: site.identity.tagline.zh,
};

/**
 * 单页主页，从上到下四块：
 *   1+2 头像、名字和一句话介绍 → Hero
 *   3   个人信息展示区        → InfoCard
 *   4   数字分身聊天区        → DigitalTwinChat
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
      <Hero />

      <InfoCard />

      {/* features.chat 置 false 时服务端直接不渲染这一块 */}
      {site.features.chat && (
        <div className="mt-8">
          <DigitalTwinChat />
        </div>
      )}
    </div>
  );
}
