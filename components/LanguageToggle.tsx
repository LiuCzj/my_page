'use client';

/** 语言切换按钮（中文 / English）。 */

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
