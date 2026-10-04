import type { Metadata } from 'next';
import { listProjects } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import ProjectsPageBody from '@/components/ProjectsPageBody';

/**
 * 项目页。
 *
 * 【为什么这个文件这么短】
 * 项目数据在数据库里（lib/content.ts），需要服务端能力读；
 * 但 Next.js 不允许客户端组件导出 metadata。所以这里只做两件事：
 * 以服务端组件的形式读数据 + 导出 metadata，再把渲染交给客户端体 ProjectsPageBody。
 *
 * 【为什么按需渲染】内容可以在网页上随时改（见 lib/content.ts），
 * 预渲染会让站长改完看到旧快照。所以显式 force-dynamic，每次请求现读。
 *
 * 【metadata 写死中文的原因】同笔记页：metadata 在服务端渲染时定死，
 * 而语言偏好存在访客的 localStorage 里，服务器读不到。
 * 根布局的 title.template 会把它补成「项目 · 锦创AI」。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '项目',
  description: '我做过的、正在做的东西。',
};

export default async function ProjectsPage() {
  const projects = listProjects();
  const me = await getCurrentUser();

  return <ProjectsPageBody projects={projects} canEdit={isAdmin(me?.email)} />;
}
