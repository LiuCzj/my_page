import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllNotes, getNote } from '@/lib/notes';
import { useMDXComponents } from '@/mdx-components';
import NoteBackLink from '@/components/NoteBackLink';
import ReadingProgress from '@/components/ReadingProgress';
import CommentSection from '@/components/CommentSection';

/**
 * 笔记详情页。
 *
 * 【Next 15 里 params 是 Promise】必须 await 之后才能取字段。
 * 这是 15 相对 14 的破坏性变更之一（14 里 params 是同步对象）。
 */
type NotePageProps = { params: Promise<{ slug: string }> };

/**
 * 构建期枚举出所有笔记，逐篇预渲染成静态 HTML。
 *
 * 这样访客访问时不需要在服务器上编译 MDX —— 编译发生在构建期。
 * 笔记再多也不会拖慢运行时，因为详情页根本不在运行时生成。
 */
export function generateStaticParams() {
  return getAllNotes().map((n) => ({ slug: n.slug }));
}

/**
 * 关掉运行时兜底渲染。
 *
 * 不写这行的话，任何没被 generateStaticParams 列出的 slug 会走「按需渲染」，
 * 也就是每次请求都去磁盘找文件。关掉之后未列出的 slug 直接 404，
 * 行为更可预测，也堵住了「用奇怪 slug 反复触发文件读取」这类试探。
 */
export const dynamicParams = false;

/** 每篇笔记的标题和描述来自它自己的 frontmatter */
export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) return {};
  return { title: note.title, description: note.summary };
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNote(slug);

  // getNote 已经校验过 slug 格式和文件是否存在，这里的 notFound 是最后一道
  if (!note) notFound();

  /**
   * 动态 import 这篇笔记的 .mdx。
   *
   * 【为什么可以带变量】webpack 遇到模板字符串形式的 import 会为匹配到的目录
   * 建一个 context module，把 content/notes 下所有 .mdx 都收进去，运行时按 key 取。
   * 配合上面的 dynamicParams = false，只有 generateStaticParams 列出的 slug 会走到这里。
   *
   * 【slug 的安全性】getNote 里用 /^[\w-]+$/ 校验过才放行，
   * 所以拼进来的 slug 不含 `../` 之类的路径片段。
   */
  const { default: MDXContent } = await import(`@/content/notes/${slug}.mdx`);

  /** 元素映射：表格包滚动容器、图片限宽、外链新开标签（见 mdx-components.tsx） */
  const components = useMDXComponents({});

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
        【为什么不用 @tailwindcss/typography】它自带 65ch 行宽和一整套独立的
        --tw-prose-* 颜色变量，与本站「语义令牌 + 全站唯一紫色」体系冲突，
        要压到一致得逐个覆写，还不如直接写。
      */}
      <div className="prose-site mt-8">
        <MDXContent components={components} />
      </div>

      {/*
        评论区。放在正文之后、article 之内，理由：
        · 视觉上它是这篇笔记的一部分（同一栏宽、同一条左边界），不该跳到全宽
        · 语义上它是 article 的附属内容，放进 <article> 里对读屏和结构化数据都更正确
        登录态与评论列表都在组件内部拉取，所以这个页面依然是纯静态的 ——
        访客首屏不受影响，评论晚一步出现（见组件里的加载态）。
      */}
      <CommentSection slug={slug} />
    </article>
  );
}
