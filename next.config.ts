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
   * 不要打包 `svg-captcha`，让它按普通的 node_modules 依赖在运行时被 require。
   *
   * 【为什么必须这么做】这个库生成验证码时要读**它自己包里的字体文件**
   * （`node_modules/svg-captcha/fonts/Comismsh.ttf`，80 KB），
   * 路径是靠 `__dirname` 拼出来的。webpack 把模块打进 `.next/server/` 之后，
   * `__dirname` 指向的是构建产物目录，那里没有 fonts 子目录 ——
   * 表现为**构建期就报错**：`Failed to collect page data for /api/auth/captcha`
   * + `syscall: 'open', path: '.next/server/fonts/Comismsh.ttf'`。
   * 列进 serverExternalPackages 之后，运行时直接 require 真实包目录，字体就在它旁边。
   *
   * 【为什么不用「把字体复制到 public 再 loadFont」那条路】
   * 那要多维护一份 80 KB 的字体副本，而且升级这个库时容易忘记同步；
   * 一个配置项就能解决的事，不值得引入一份需要人工同步的资产。
   */
  serverExternalPackages: ['svg-captcha'],
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
