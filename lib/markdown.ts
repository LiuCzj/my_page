/**
 * 运行时 Markdown → HTML。
 *
 * 【为什么需要它】改造前笔记是 .mdx，由 @next/mdx 在**构建期**编译。
 * 现在笔记正文存在数据库里、可以在网页上随时改，构建期编译这条路就断了 ——
 * 必须在**请求时**把 Markdown 渲染成 HTML。
 *
 * 【为什么不用 MDX 运行时编译】那要引一套完整的 MDX 编译器进服务端，
 * 每次渲染都编译一遍；而且允许内容里写 JSX/表达式，等于给「能写内容的人」开了执行代码的口子。
 * 站长要的只是 Markdown 语法，纯 Markdown 管线（remark + rehype）更快、面更小。
 *
 * 【为什么放行原始 HTML】站长明确要求「字体颜色也要支持」，而 Markdown 本身没有颜色语法 ——
 * 通用做法就是写 `<span style="color:#e11d48">红字</span>`。要让它生效必须放行原始 HTML：
 * remark-rehype 加 allowDangerousHtml，再由 rehype-raw 把这些标签真正解析成节点。
 * 【安全边界】内容只有管理员能写（见 lib/auth.ts 的 isAdmin），属可信来源，所以不做 sanitize。
 * 如果以后开放多人协作，要在这条管线末尾加 rehype-sanitize。
 *
 * 【管线顺序】Markdown 源码 →(remark-parse)→ mdast →(remark-breaks 单回车换行)→
 * (remark-gfm 表格/删除线/任务列表/脚注)→(remark-math 识别 $...$ / $$...$$)→ mdast
 * →(remark-rehype, allowDangerousHtml)→ hast →(rehype-raw 解析内嵌 HTML)→(rehype-katex 公式)→
 * (==x== → <mark>)→(本站小修正)→ hast →(rehype-stringify)→ HTML。
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

/** hast 节点（只用到 type / tagName / properties / children / value，所以宽松标注） */
interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

/**
 * 深度优先遍历 hast 树。
 *
 * 【为什么手写而不引 unist-util-visit】下面只用两处修正，
 * 为它多引一个依赖不划算；这段遍历只有十来行，读起来也更直白。
 */
function walk(node: HastNode, visit: (n: HastNode, parent: HastNode, index: number) => void): void {
  if (!node || !Array.isArray(node.children)) return;
  node.children.forEach((child, i) => {
    visit(child, node, i);
    walk(child, visit);
  });
}

/**
 * `==高亮==` → `<mark>高亮</mark>`。
 *
 * 【为什么需要它】这是 Obsidian 等方言的写法，标准 Markdown 和 GFM 都没有 ——
 * 站长实测反馈「==高亮== 不支持」。放在 hast 层做：走到这一步时 `==` 还留在文本节点里，
 * 按正则切开、中间那段包进 mark 元素即可，比在 mdast 层造一个自定义节点简单得多。
 * 且它发生在 rehype-raw 之后，所以 `<mark>` 不会被当成用户 HTML 二次解析。
 */
const MARK_RE = /==([^=\n]+)==/g;

/** 把 "a ==b== c" 切成 [文本 a、<mark>b</mark>、文本 c]；不含 == 时返回 null */
function splitMark(value: string): HastNode[] | null {
  MARK_RE.lastIndex = 0;
  const out: HastNode[] = [];
  let last = 0;
  let hit = false;
  let m: RegExpExecArray | null;

  while ((m = MARK_RE.exec(value))) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({
      type: 'element',
      tagName: 'mark',
      properties: {},
      children: [{ type: 'text', value: m[1] }],
    });
    last = m.index + m[0].length;
    hit = true;
  }
  if (!hit) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

/** 递归地把所有含 ==...== 的文本节点换成 mark 元素 */
function rehypeHighlightMark() {
  const visit = (node: HastNode): void => {
    if (!Array.isArray(node.children)) return;
    const next: HastNode[] = [];
    let changed = false;
    for (const child of node.children) {
      if (child.type !== 'text' || typeof child.value !== 'string') {
        visit(child);
        next.push(child);
        continue;
      }
      const parts = splitMark(child.value);
      if (!parts) {
        next.push(child);
        continue;
      }
      changed = true;
      next.push(...parts);
    }
    if (changed) node.children = next;
  };
  return (tree: HastNode) => visit(tree);
}

/**
 * 本站对渲染结果的两处修正（对应改造前 mdx-components.tsx 里做的同样两件事）：
 *
 * 1. **表格包一层横向滚动容器**：单元格是 `white-space: nowrap` 的，宽表格必须靠外层滚动，
 *    否则会把整页撑出横向滚动条（手机上尤其明显）。包一层 `.table-scroll` 由 CSS 接管滚动。
 * 2. **站外链接新开标签**：`target="_blank"` 必须配 `rel="noopener noreferrer"`，
 *    否则被打开的页面能通过 window.opener 反向操控本站标签页。
 */
function rehypeSiteTweaks() {
  return (tree: HastNode) => {
    walk(tree, (node, parent, index) => {
      if (node.type !== 'element') return;

      if (node.tagName === 'table') {
        parent.children![index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'] },
          children: [node],
        };
        return;
      }

      if (node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && /^https?:\/\//.test(href)) {
          node.properties = { ...node.properties, target: '_blank', rel: ['noopener', 'noreferrer'] };
        }
      }
    });
  };
}

/** 复用同一个 processor：unified 的 process() 每次都会新建 vfile，实例本身是无状态的 */
const processor = unified()
  .use(remarkParse)
  /*
    单个回车 → <br>。标准 Markdown 里「一行内的换行」不算换行，
    但中文写字时几乎所有人都是「按一下回车换一行」。不加这个，写完发布出来会发现
    段落里该断行没断 —— 是最容易被当成「Markdown 不支持」的一类。
  */
  .use(remarkBreaks)
  .use(remarkGfm)
  // 数学公式：$...$（行内）与 $$...$$（块级）。remark-math 把它俩变成 math / inlineMath 节点，
  // 真正的 HTML 展开交给下游的 rehype-katex 做。放在 remark 阶段、remark-rehype 之前。
  .use(remarkMath)
  // 放行原始 HTML，配合下面的 rehype-raw 解析（字体颜色这类需求要用）
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  // 公式必须在 rehype-raw 之后、其它 hast 修正之前处理：
  // 此时 math 节点已被 rehype-katex 展开成带 .katex 类的一堆 span（含字体图标），
  // 后续的 walk（表格包裹、外链新开、== 高亮）不会误伤这些结构。
  // 公式写错也不会让整页崩：rehype-katex 自己 try/catch，parse 失败时降级成红色 .katex-error 文本。
  // strict:false 容忍宽松语法（未知命令不报错）；trust:false 禁止 \href 之类的危险指令
  // （内容虽仅管理员可写，仍守住底线，避免公式里塞外链/脚本）。
  .use(rehypeKatex, { strict: false, trust: false })
  .use(rehypeHighlightMark)
  .use(rehypeSiteTweaks)
  .use(rehypeStringify);

/**
 * 把一段 Markdown 渲染成 HTML 字符串。
 *
 * 【调用方必须用 dangerouslySetInnerHTML 注入】安全性由「只有管理员能写内容」这一条保证，
 * 见文件头说明。
 *
 * @param markdown Markdown 源文（允许内嵌 HTML）
 * @returns HTML 字符串（未包外层容器；调用方负责套 .prose-site）
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
