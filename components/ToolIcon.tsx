'use client';

/** 一枚工具标。三种情况，按「有没有标、标是几色」分流。 */

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
