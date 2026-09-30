'use client';

/**
 * 语言切换按钮（中文 / English）。
 *
 * 【交互约定】
 * 按钮显示的是「点下去会切到的语言」：当前中文时显示 EN，当前英文时显示 中。
 * 这样在顶栏这种窄空间里不用写「中文 / English」两个词也能看懂，
 * 完整含义放在 aria-label 与 title 里（读屏用户听到的是「切换到 English」而不是「EN」）。
 *
 * 【为什么按钮里的字不参与翻译】
 * 「EN」「中」是两个语言的名字本身，翻译成当前语言就失去切换提示的意义，
 * 这是多语言站点的通行做法，不是漏接字典。
 *
 * 【持久化】偏好写在 localStorage（键 lang），由 lib/i18n.tsx 负责读取与同步 <html lang>。
 * 刷新、跳页都保持；换浏览器或清缓存则回到默认中文。
 */

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function LanguageToggle({ size = 18 }: { size?: number }) {
  const { lang, toggleLang, d } = useI18n();
  const [mounted, setMounted] = useState(false);

  // 与 theme-toggle 同一个套路：服务端首帧渲染默认中文，挂载后才按 localStorage 显示，
  // 用 mounted 挡掉这一帧的差异，避免 hydration 报错。
  useEffect(() => setMounted(true), []);

  const btnClass =
    'inline-flex size-11 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-card text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  if (!mounted) {
    return <span className={`${btnClass}`} aria-hidden="true" />;
  }

  const nextLabel = lang === 'zh' ? 'EN' : '中';

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={btnClass}
      aria-label={d.language.switchTo}
      title={d.language.switchTo}
    >
      <Languages size={size} aria-hidden="true" />
      <span className="text-xs font-bold leading-none">{nextLabel}</span>
    </button>
  );
}
