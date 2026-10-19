"use client";

/** 主题切换按钮（明亮 / 暗黑）。 */

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
