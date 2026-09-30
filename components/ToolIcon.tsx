'use client';

/**
 * 一枚工具标。三种情况，按「有没有标、标是几色」分流：
 *
 * 1. 单色品牌剪影 → components/ToolGlyphs.tsx 里的内联 SVG（PyTorch / pandas / NumPy /
 *    scikit-learn / Tableau / Jupyter / LangGraph / OpenAI）。颜色走 Tailwind class，
 *    深浅两档各自给值，所以不需要 -dark 副本，也不受主题就绪时机影响，第一帧就是对的。
 * 2. 多色品牌文件 → public/tools/ 下的 <img>（Python 渐变、Docker 十片、VSCode 四色、
 *    Git、GitHub）。这类标一个文件里带好几个 fill / gradient，内联进 JS 会把
 *    <defs> 的 id 也复制进文档（同名 id 全站只能有一个生效），所以留在文件里。
 * 3. 根本没有公开标 → 字母徽标。XGBoost / LightGBM / Power BI 在 simple-icons 里查不到，
 *    ReAct / Plan-and-Solve / Reflection / RAG 是方法不是产品，Qoder 官网只给
 *    73 KB 的整图 favIcon。与其为了凑齐去抓来源不明的图，不如老实显示首字母。
 *
 * 【为什么第 2 种要等 mounted】GitHub 那份文件是近黑的 #161614，深色底上必须换成
 * github-dark.svg。而主题只有 next-themes 在客户端才知道 —— 服务端渲染时
 * resolvedTheme 是 undefined，这时候按某一版硬编码就会出现
 * 「服务端给黑标、客户端换成白标」的闪烁与 hydration 不匹配。
 * 所以首帧先占一个同尺寸的位，第二帧再出图。第 1、3 种不需要这个等待。
 *
 * 【为什么用普通 <img> 而不是 next/image】实测把这几个 22px 的本地 SVG 换成 next/image
 * 之后，首页 First Load JS 从 163 kB 涨到 169 kB —— 多出来的 6 kB 全是它的客户端运行时，
 * 而本站 images.unoptimized 已开、SVG 也不需要尺寸优化。
 * 对单连接只有 10~30 KB/s 的国内访客来说，这 6 kB 是白付的。
 *
 * 【无障碍】这里一律 aria-hidden：标只是名字的图形重复，读屏拿到的是外层给的文字
 * （工具条里是 sr-only 的名字，最喜欢的工具里是并排的可见名字）。
 * 给 SVG 再挂一次 aria-label 会变成「PyTorch PyTorch」这样的重读。
 */

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import ToolGlyphMark, { TOOL_GLYPHS } from '@/components/ToolGlyphs';
import type { InlineToolGlyph, ToolGlyph } from '@/config/site';

/** 走 public/tools/ 文件的标，以及其中需要深色副本的（文件本身是近黑色的那些） */
const HAS_DARK_VARIANT: ToolGlyph[] = ['github'];

export default function ToolIcon({
  glyph,
  label,
  size = 22,
  className = '',
}: {
  /** 有官方标就给，没标就不给 —— 会退化成字母徽标 */
  glyph?: ToolGlyph;
  /** 徽标取首字母用 */
  label: string;
  size?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isInline = glyph !== undefined && glyph in TOOL_GLYPHS;
  const needsImage = glyph !== undefined && !isInline;

  // 只有第 2 种要等主题：等的时候占一个同尺寸的位，避免出现图标时整块抖一下
  if (needsImage && !mounted) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (isInline) {
    return <ToolGlyphMark glyph={glyph as InlineToolGlyph} size={size} className={className} />;
  }

  if (needsImage) {
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
