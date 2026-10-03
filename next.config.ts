import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";

const nextConfig: NextConfig = {
  /**
   * 关掉左下角的 Next.js 开发指示器（那个圆形「N」悬浮按钮）。
   * 它只在 npm run dev 下出现，生产构建本来就没有；这里显式关掉是为了本地预览时
   * 它不会盖在聊天输入区左下方，也避免以后有人以为是自己写的按钮。
   */
  devIndicators: false,
  /**
   * 让 .mdx 也能作为页面被解析。
   * 【为什么现在其实用不到】笔记走的是「从 content/ 动态 import 再渲染」这条路，
   * 不是「把 .mdx 放进 app/ 当页面」，所以严格说不加这一行也能工作。
   * 加上是为了以后想在 app/ 下直接放 page.mdx 时不用回来补这一步。
   */
  pageExtensions: ["ts", "tsx", "mdx"],
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

/**
 * MDX 支持。
 *
 * 【为什么必须用 next.config.ts 而不是 next.config.mjs】
 * remark / rehype 整个生态都是纯 ESM，Next 15 支持 TS 配置文件，这里直接用 .ts。
 *
 * 【两个 remark 插件各解决什么】
 * - remarkGfm：GitHub 风格的表格、删除线、任务列表、自动链接。笔记要贴表格，靠它。
 * - remarkFrontmatter：让解析器**认识**文件开头的 YAML 块并在渲染时丢掉它。
 *   不加这条，`---` 会被当成正文（一条分隔线）渲染出来。
 *   注意它只负责「别渲染出来」；真正读元数据的是列表页的 gray-matter，两者分工不同。
 *
 * 【未来切 Turbopack 要改这里】Turbopack 要求插件以**字符串名**传入
 * （且不支持不可序列化的选项），现在传的是函数引用，只在 webpack 下成立。
 * Next 16 起 Turbopack 成为默认，届时需要调整。
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm, remarkFrontmatter],
  },
});

export default withMDX(nextConfig);