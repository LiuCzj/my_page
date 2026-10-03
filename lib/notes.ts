/**
 * 笔记读取层。
 *
 * 【只能被服务端组件 import】它用 node:fs 读 content/notes 下的文件，
 * 一旦被 'use client' 组件引到，整个 fs 模块会被打进浏览器包并直接报错。
 *
 * 【为什么列表页不编译 MDX，只读 frontmatter】
 * 列表只需要标题 / 日期 / 摘要 / 标签这四样。为了拿这四样去编译整篇 MDX
 * （走一遍 remark/rehype 管线）是纯浪费。gray-matter 只切文件开头那段 YAML，
 * 毫秒级，几十篇笔记也不会有感知。MDX 编译只在详情页发生那一次。
 *
 * 【正文为什么只有中文】
 * 见 lib/i18n.tsx 的说明：本站只有**界面文案**会中英切换，文章正文一直是中文。
 * 所以这个读取层不碰 LocalizedText，返回的都是纯字符串。
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/** 笔记目录。用 process.cwd() 而不是 __dirname：构建期与运行期的工作目录都是项目根 */
const NOTES_DIR = path.join(process.cwd(), 'content', 'notes');

/** 一篇笔记的元数据（不含正文） */
export interface NoteMeta {
  /** 由文件名派生，不含扩展名。例：content/notes/hello-mdx.mdx → 'hello-mdx' */
  slug: string;
  title: string;
  /** 'YYYY-MM-DD' 字符串，不做 Date 转换，避免时区问题 */
  date: string;
  summary: string;
  tags: string[];
  /** true 时生产构建不收录（本地开发仍可见，方便预览） */
  draft: boolean;
  /** 估算的阅读分钟数，最少 1 */
  readingMinutes: number;
}

/**
 * 估算阅读时长。
 *
 * 【为什么不用现成的 reading-time 包】
 * 它的算法是按空白字符切词。中文句子没有空格，一整段中文会被算成「一个词」，
 * 于是任何一篇中文笔记的读数都是「1 分钟」—— 这个数字不但没用，还是错的。
 * 中文站点必须按字数算，所以自己写。
 *
 * 300 字/分钟（中文）、200 词/分钟（英文）是常见的阅读速度经验值，够用了。
 * 结果最少给 1，避免极短的笔记显示「0 分钟阅读」。
 *
 * @param body 去掉 frontmatter 之后的正文
 * @returns 整数分钟
 */
function estimateReadingMinutes(body: string): number {
  // \u3400-\u9fff 覆盖 CJK 扩展A + 统一表意文字，够本站用
  const cjkCount = (body.match(/[\u3400-\u9fff]/g) ?? []).length;
  // 先把汉字挖成空格，再按词切，避免中文被当成拉丁词
  const latinWords = (body.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjkCount / 300 + latinWords / 200));
}

/**
 * 读一篇笔记的元数据。
 *
 * 【为什么缺字段直接抛错而不是兜底】
 * 这是在构建期跑的（generateStaticParams / 页面渲染）。
 * 缺 title 的笔记如果静默通过，线上就会出现一个没有标题的空白页，
 * 而且没人知道是哪个文件出的问题。抛错会带着文件名一起炸出来，一眼定位。
 *
 * @param fileName content/notes 下的文件名（含 .mdx）
 * @throws 必填 frontmatter 字段缺失或类型不对时
 */
function readNote(fileName: string): NoteMeta {
  const slug = fileName.replace(/\.mdx$/, '');
  const raw = fs.readFileSync(path.join(NOTES_DIR, fileName), 'utf8');
  const { data, content } = matter(raw);

  for (const key of ['title', 'date', 'summary'] as const) {
    if (typeof data[key] !== 'string' || !data[key]) {
      throw new Error(`content/notes/${fileName} 缺少必填的 frontmatter 字段：${key}`);
    }
  }

  return {
    slug,
    title: data.title,
    /**
     * gray-matter 会把没加引号的 2026-10-03 解析成 Date 对象，
     * 而 Date → 字符串会带上时区，在 UTC+8 下可能显示成前一天。
     * 所以：是 Date 就转回 YYYY-MM-DD，否则原样用字符串。
     * （模板里推荐日期加引号，但这里兜住不加引号的情况。）
     */
    date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date),
    summary: data.summary,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft === true,
    readingMinutes: estimateReadingMinutes(content),
  };
}

/**
 * 全部可见笔记，按日期倒序（新的在前）。
 *
 * 生产构建时剔除 draft；开发环境保留，方便边写边看。
 * 目录不存在时返回空数组 —— 首页会读这个函数，目录还没建时不该让整页崩掉。
 */
export function getAllNotes(): NoteMeta[] {
  if (!fs.existsSync(NOTES_DIR)) return [];
  return fs
    .readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map(readNote)
    .filter((n) => (process.env.NODE_ENV === 'production' ? !n.draft : true))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * 取单篇笔记的元数据。
 *
 * 【slug 为什么要校验】详情页会拿它拼动态 import 的路径。
 * 不校验就等于把路径拼接交给访客输入（`../../` 之类）。
 * /^[\w-]+$/ 只放行字母、数字、下划线、连字符，从源头堵住路径穿越。
 *
 * @param slug 文件名去掉 .mdx
 * @returns 找不到时返回 null，由调用方决定是 404 还是忽略
 */
export function getNote(slug: string): NoteMeta | null {
  const fileName = `${slug}.mdx`;
  if (!/^[\w-]+$/.test(slug) || !fs.existsSync(path.join(NOTES_DIR, fileName))) return null;
  return readNote(fileName);
}
