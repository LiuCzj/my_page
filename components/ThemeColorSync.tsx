'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/** 让手机地址栏的颜色跟着**页面主题**走，而不是跟着系统偏好走。 */
const BAR_COLOR = {
  light: '#f3f4f9',
  dark: '#0c0e16',
} as const;

export default function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    const color = BAR_COLOR[resolvedTheme];
    /* 取全部而不是第一条：Next 会为两条媒体查询各渲染一个 meta，只改第一条的话，系统偏好那一条仍然会盖住它。 */
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => {
      meta.removeAttribute('media');
      meta.setAttribute('content', color);
    });
  }, [resolvedTheme]);

  return null;
}
