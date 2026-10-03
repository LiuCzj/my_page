import type { Metadata } from 'next';
import ProjectsPageBody from '@/components/ProjectsPageBody';

/**
 * 项目页。
 *
 * 【为什么这个文件这么短】
 * 项目数据在 config/site.ts 里，是静态的，不需要服务端能力；
 * 但 Next.js 不允许客户端组件导出 metadata。所以这里只做一件事：
 * 以服务端组件的形式导出 metadata，再把渲染交给客户端体 ProjectsPageBody。
 *
 * 【metadata 写死中文的原因】同笔记页：metadata 在服务端渲染时定死，
 * 而语言偏好存在访客的 localStorage 里，服务器读不到。
 * 根布局的 title.template 会把它补成「项目 · 锦创AI」。
 */
export const metadata: Metadata = {
  title: '项目',
  description: '我做过的、正在做的东西。',
};

export default function ProjectsPage() {
  return <ProjectsPageBody />;
}
