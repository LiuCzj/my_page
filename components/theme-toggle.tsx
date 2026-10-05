"use client";

/**
 * 主题切换按钮（明亮 / 暗黑）。
 *
 * 【机制】调用 next-themes 的 useTheme().setTheme()，切换 <html> 上的 .dark 类；
 * globals.css 的 @custom-variant dark (&:is(.dark *)) 认的就是这个类。
 *
 * 【外观走 lib/topbar.ts 的共享常量】
 * 2026-10-05 改版：从「40px 方框 + 边框 + 卡片底色」改成「40px 圆形 + 极淡底色、无边框」。
 * 站长反馈原来的方框「丑」—— 方框把顶栏控件画成了卡片，而它们是工具不是内容。
 * 样式抽到共享常量是因为顶栏四个控件必须长得完全一样，各写一份早晚会漂。
 *
 * 【为什么是纯图标而不是文字按钮】
 * 顶栏要同时放下 名字 + 5 个联系方式 + 音乐 + 语言 + 主题 + 账号，横向空间紧张，
 * 图标更省位置；含义交给 aria-label / title，文案取自字典（切英文后说明也跟着变）。
 *
 * 【disableTransitionOnChange】
 * 在 layout.tsx 的 ThemeProvider 上开启：切换时临时禁掉 CSS transition，
 * 避免整页颜色「渐变过去」时出现半深半浅、文字一瞬间看不清的状态。
 */

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { TOPBAR_CONTROL, TOPBAR_ICON_SIZE } from "@/lib/topbar";

export default function ThemeToggle({ size = TOPBAR_ICON_SIZE }: { size?: number }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { d } = useI18n();
  const [mounted, setMounted] = useState(false);

  // 服务端不知道用户偏好（next-themes 从 localStorage 读），
  // 首帧不渲染真实状态，等挂载后再判定 —— 否则 SSR 的深色图标会和客户端的浅色状态对不上，
  // React 会报 hydration 不匹配。
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // 占位：尺寸与真实按钮一致，切换时不会引起顶栏布局跳动
    return <span className={TOPBAR_CONTROL} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={TOPBAR_CONTROL}
      aria-label={isDark ? d.theme.ariaToLight : d.theme.ariaToDark}
      title={isDark ? d.theme.ariaToLight : d.theme.ariaToDark}
    >
      {isDark ? <Sun size={size} aria-hidden="true" /> : <Moon size={size} aria-hidden="true" />}
    </button>
  );
}
