import type { NextConfig } from "next";

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