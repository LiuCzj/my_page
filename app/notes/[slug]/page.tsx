import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNoteRecord } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import NoteBackLink from '@/components/NoteBackLink';
import ReadingProgress from '@/components/ReadingProgress';
import CommentSection from '@/components/CommentSection';

/**
 * 笔记详情页。
 *
 * 【Next 15 里 params 是 Promise】必须 await 之后才能取字段。
 *
 * 【为什么从「构建期预渲染」改成「按需渲染」】
 * 改造前笔记是 content/notes 下的 .mdx，构建期就编译成静态 HTML（generateStaticParams +
 * dynamicParams = false）。现在笔记存在数据库里、可以在网页上随时新增和修改 ——
 * 构建期不可能知道以后会有哪些 slug。所以：
 *   · 去掉 generateStaticParams 与 dynamicParams（新 slug 必须在运行时可用）；
 *   · 声明 force-dynamic，每次请求现读数据库 + 现渲染 Markdown。
 *
 * 【Markdown 为什么在服务端渲染】内容只有管理员能写（可信来源），
 * 服务端渲染成 HTML 字符串直接注入，不用把 Markdown 解析器发到浏览器。
 * 管线与编辑器预览共用同一条（lib/markdown.ts），保证所见即所得。
 */

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

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:pt-12">
      {/*
        阅读进度条：fixed 定位、钉在固定顶栏的下沿，不进文档流 ——
        所以放在 article 里任何位置都不影响这段排版，放开头只是为了就近说明它属于这一页。
      */}
      <ReadingProgress />

      <NoteBackLink />

      <header className="mt-2 border-b border-border pb-6">
        {/* break-words：中文长标题没有空格，不打断行会把容器撑宽 */}
        <h1 className="text-2xl leading-tight font-black tracking-tight break-words text-foreground sm:text-4xl">
          {note.title}
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-semibold text-muted-foreground">
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

      {/*
        正文排版走 .prose-site（定义在 globals.css）。
        【为什么用 dangerouslySetInnerHTML】HTML 由 lib/markdown.ts 在服务端生成，
        内容只有管理员能写，属可信来源（该文件头有详细说明）。
      */}
      <div className="prose-site mt-8" dangerouslySetInnerHTML={{ __html: html }} />

      {/*
        评论区。放在正文之后、article 之内，理由：
        · 视觉上它是这篇笔记的一部分（同一栏宽、同一条左边界），不该跳到全宽
        · 语义上它是 article 的附属内容，放进 <article> 里对读屏和结构化数据都更正确
        登录态与评论列表都在组件内部拉取。
      */}
      <CommentSection slug={slug} />
    </article>
  );
}
