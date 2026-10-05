'use client';

/**
 * 语言切换按钮（中文 / English）。
 *
 * 【交互约定】
 * 按钮显示的是「点下去会切到的语言」：当前中文时显示 EN，当前英文时显示 中。
 * 这样在顶栏这种窄空间里不用写「中文 / English」两个词也能看懂，
 * 完整含义放在 aria-label 与 title 里（读屏用户听到的是「切换到 English」而不是「EN」）。
 *
 * 【2026-10-05 改版：去掉地球图标，只留 EN / 中】
 * 改前是「地球图标 + EN」挤在一个 44px 方框里，两样东西都小。站长反馈顶栏「有些内容显得太小」。
 * 现在整枚按钮就是一个圆，里面只有 EN 或 中 —— 字能放大到 15px，
 * 而且「EN」本身已经说清了这是语言切换，前面再挂个地球是同一件事说两遍。
 * 外观走 lib/topbar.ts 的共享常量（和主题、音乐那几枚完全同款）。
 *
 * 【为什么按钮里的字不参与翻译】
 * 「EN」「中」是两个语言的名字本身，翻译成当前语言就失去切换提示的意义，
 * 这是多语言站点的通行做法，不是漏接字典。
 *
 * 【持久化】偏好写在 localStorage（键 lang），由 lib/i18n.tsx 负责读取与同步 <html lang>。
 * 刷新、跳页都保持；换浏览器或清缓存则回到默认中文。
 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { TOPBAR_CONTROL } from '@/lib/topbar';

export default function LanguageToggle() {
  const { lang, toggleLang, d } = useI18n();
  const [mounted, setMounted] = useState(false);

  // 与 theme-toggle 同一个套路：服务端首帧渲染默认中文，挂载后才按 localStorage 显示，
  // 用 mounted 挡掉这一帧的差异，避免 hydration 报错。
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={TOPBAR_CONTROL} aria-hidden="true" />;
  }

  const nextLabel = lang === 'zh' ? 'EN' : '中';

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={TOPBAR_CONTROL}
      aria-label={d.language.switchTo}
      title={d.language.switchTo}
    >
      <span className="text-[15px] font-bold leading-none tracking-tight" aria-hidden="true">
        {nextLabel}
      </span>
    </button>
  );
}
