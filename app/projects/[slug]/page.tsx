import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import ReadingProgress from '@/components/ReadingProgress';
import CommentSection from '@/components/CommentSection';
import ProjectDetailHead from '@/components/ProjectDetailHead';

/** 项目详情页。 */
export const dynamic = 'force-dynamic';

type ProjectPageProps = { params: Promise<{ slug: string }> };

/** 标题与描述取中文档；英文档留空时本来就是回落中文 */
export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return { title: project.title.zh, description: project.summary.zh };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProject(slug);

  // 没有正文的项目没有详情页：空壳页不生成，也不给搜索引擎索引
  if (!project || !project.body.trim()) notFound();

  const html = await renderMarkdown(project.body);

  // 管理员才渲染「编辑」入口。服务端算，访客的 HTML 里根本没有这个按钮
  const canEdit = isAdmin((await getCurrentUser())?.email);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:pt-12">
      {/* 阅读进度条：fixed 定位、钉在固定顶栏下沿，不进文档流 */}
      <ReadingProgress />

      {/* 进度统计范围：标题 + 正文，不含下面的评论区 */}
      <div data-reading-progress data-protect>
        <ProjectDetailHead project={project} canEdit={canEdit} />
        <div className="prose-site mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {/* 项目评论落在 comments.note_slug，键名加 `project:` 前缀，与笔记 slug 分开 */}
      <CommentSection slug={`project:${slug}`} />
    </article>
  );
}
