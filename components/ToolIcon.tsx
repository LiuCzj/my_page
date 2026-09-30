'use client';

/**
 * 工具标（public/tools/ 下的彩色品牌 SVG），没有标的用字母徽标兜底。
 *
 * 【为什么有两条路】他给的工具清单里，只有 Python / Git / GitHub / SQL / VSCode / Docker
 * 在参考项目里有现成的彩色标；PyTorch、Pandas、NumPy、Scikit-learn、XGBoost、LightGBM、
 * Power BI、Tableau、Jupyter、LangGraph 以及 ReAct / Plan-and-Solve / Reflection / RAG
 * 这些都没有。与其为了凑齐去下载一批来源不明的 SVG，不如让没标的就老老实实显示字母 + 名字 ——
 * 混用「彩色官方标 + 单色剪影」才会真的难看。
 *
 * 【为什么要等 mounted】这些标里有的是单色的，GitHub 在深色底上必须用 -dark 那份，
 * 否则和背景糊在一起。而主题只有 next-themes 在客户端才知道 —— 服务端渲染时
 * resolvedTheme 是 undefined，这时候按某一版硬编码，就会出现
 * 「服务端给黑标、客户端换成白标」的闪烁与 hydration 不匹配。
 * 所以首帧先占一个同尺寸的位，第二帧再出图。
 *
 * 【为什么用普通 <img> 而不是 next/image】实测把这几个 22px 的本地 SVG 换成 next/image
 * 之后，首页 First Load JS 从 163 kB 涨到 169 kB —— 多出来的 6 kB 全是它的客户端运行时，
 * 而本站 images.unoptimized 已开、SVG 也不需要尺寸优化。
 * 对单连接只有 10~30 KB/s 的国内访客来说，这 6 kB 是白付的。
 */

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import type { ToolGlyph } from '@/config/site';

/** public/tools/ 下备了深色版的标（其余两版通用） */
const HAS_DARK_VARIANT: ToolGlyph[] = ['github'];

export default function ToolIcon({
  glyph,
  label,
  size = 22,
  className = '',
}: {
  /** 有官方标就给，没标就不给 —— 会退化成字母徽标 */
  glyph?: ToolGlyph;
  /** 徽标取首字母用，也是图的无障碍名 */
  label: string;
  size?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!glyph) {
    // 字母徽标：取名字第一个字母（拉丁名）或第一个字（中文名）
    const initial = label.trim().charAt(0).toUpperCase();
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-accent/15 font-display text-accent ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      >
        {initial}
      </span>
    );
  }

  if (!mounted) {
    // 占位：尺寸和真图一致，避免出现图标时整块抖一下
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const dark = HAS_DARK_VARIANT.includes(glyph) && resolvedTheme === 'dark';

  return (
    <img
      src={`/tools/${glyph}${dark ? '-dark' : ''}.svg`}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    />
  );
}
