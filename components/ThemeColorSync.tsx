'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * 让手机地址栏的颜色跟着**页面主题**走，而不是跟着系统偏好走。
 *
 * 【它解决什么】`app/layout.tsx` 里导出的 viewport.themeColor 是两条带
 * `prefers-color-scheme` 媒体查询的 meta —— 那是**构建时定死**的，
 * 只能读系统偏好，读不到访客在站内点过什么。
 * 在默认主题是深色的时候这两者大致吻合，问题不明显；
 * 2026-10-05 默认改成亮色（并且关掉了 enableSystem）之后就不吻合了：
 * 系统是深色的访客看到的是**亮色页面 + 深色地址栏**，顶上像贴了一条不属于这个页面的色带。
 *
 * 【做法】挂载后把那些 meta 的 media 属性摘掉，改成一条无条件的、
 * 值取自当前解析出来的主题。这两档色值和 globals.css 的 --band-cover 是同一对
 * （亮 #f3f4f9 / 暗 #0c0e16）—— 地址栏压在页面最顶端，最顶端是「封面」那一页。
 * ⚠️ 改 --band-cover 时要连这里和 layout.tsx 的 themeColor 一起改，一共三处。
 *
 * 【为什么不用 ThemeProvider 的属性】next-themes 的 ThemeProvider 只负责给 <html> 加类，不碰 meta。
 *
 * 【它渲染什么】什么都不渲染（返回 null），只做副作用。
 */
const BAR_COLOR = {
  light: '#f3f4f9',
  dark: '#0c0e16',
} as const;

export default function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    const color = BAR_COLOR[resolvedTheme];
    /*
      取全部而不是第一条：Next 会为两条媒体查询各渲染一个 meta，
      只改第一条的话，系统偏好那一条仍然会盖住它。
      摘掉 media 之后它们都变成无条件生效，值又一样，谁生效都对。
    */
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => {
      meta.removeAttribute('media');
      meta.setAttribute('content', color);
    });
  }, [resolvedTheme]);

  return null;
}
