import type { NextConfig } from "next";

/**
 * Next 配置。
 *
 * 【2026-10-04：移除了 MDX 装配】
 * 笔记改造前是 content/notes/*.mdx，由 @next/mdx 在构建期编译。现在笔记存在数据库里、
 * 正文由 lib/markdown.ts 在**运行时**渲染成 HTML —— MDX 这条路已经没有任何调用方。
 * 原来的 `withMDX(...)`、`pageExtensions` 里的 "mdx"、以及根目录的 mdx-components.tsx
 * 一并移除，否则它们会一直给人一种「笔记还是 MDX」的错觉。
 *
 * 【相关依赖也一并卸掉了】@next/mdx、@mdx-js/loader、@mdx-js/react、remark-frontmatter。
 * 注意 `remark-gfm` **保留** —— 运行时渲染仍在用它；`gray-matter` 也保留（lib/seed.ts 迁移时解析 frontmatter）。
 */
const nextConfig: NextConfig = {
  /**
   * 关掉左下角的 Next.js 开发指示器（那个圆形「N」悬浮按钮）。
   * 它只在 npm run dev 下出现，生产构建本来就没有；这里显式关掉是为了本地预览时
   * 它不会盖在聊天输入区左下方，也避免以后有人以为是自己写的按钮。
   */
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
