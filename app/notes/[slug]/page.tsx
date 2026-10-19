import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNoteRecord } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import NoteBackLink from '@/components/NoteBackLink';
import ReadingProgress from '@/components/ReadingProgress';
import CommentSection from '@/components/CommentSection';
import NoteEditButton from '@/components/admin/NoteEditButton';
import { getCurrentUser, isAdmin } from '@/lib/auth';

/** 笔记详情页。 */

export const dynamic = 'force-dynamic';

type NotePageProps = { params: Promise<{ slug: string }> };

/** 每篇笔记的标题和描述来自它自己的记录 */
export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = getNoteRecord(slug);
  if (!note) return {};
  return { title: note.title, description: note.summary };
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNoteRecord(slug);

  // getNoteRecord 已经校验过 slug 格式，这里的 notFound 是最后一道
  if (!note) notFound();

  const html = await renderMarkdown(note.body);

  // 管理员才渲染「编辑」入口。服务端算，访客的 HTML 里根本没有这个按钮
  const canEdit = isAdmin((await getCurrentUser())?.email);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:pt-12">
      {/* 阅读进度条：fixed 定位、钉在固定顶栏的下沿，不进文档流 ——所以放在 article 里任何位置都不影响这段排版，放开头只是为了就近说明它属于这一页。 */}
      <ReadingProgress />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NoteBackLink />
        {canEdit && <NoteEditButton note={note} />}
      </div>

      {/* 阅读进度条统计的范围：**标题 + 正文**，不含下面的评论区与页脚。 */}
      <div data-reading-progress data-protect>
        <header className="mt-2 border-b border-border pb-6">
          {/* break-words：中文长标题没有空格，不打断行会把容器撑宽 */}
          <h1 className="text-2xl leading-tight font-black tracking-tight break-words text-foreground sm:text-4xl">
            {note.title}
          </h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] font-semibold text-muted-foreground">
            <time dateTime={note.date}>{note.date}</time>
            {note.tags.length > 0 && <span aria-hidden="true">·</span>}
            {note.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-semibold text-secondary-foreground"
              >
                {t}
              </span>
            ))}
          </p>
        </header>

        {/* 正文排版走 .prose-site（定义在 globals.css）。 */}
        <div className="prose-site mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {/* 评论区。放在正文之后、article 之内。 */}
      <CommentSection slug={slug} />
    </article>
  );
}
