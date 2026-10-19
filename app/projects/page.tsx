import type { Metadata } from 'next';
import { listProjects } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import ProjectsPageBody from '@/components/ProjectsPageBody';

/** 项目页。 */
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
