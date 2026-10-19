/** 运行时 Markdown → HTML。 */

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

/** mdast 节点（同上，只用到 type / children / value / data） */
interface MdastNode {
  type?: string;
  children?: MdastNode[];
  value?: string;
  /** mdast-util-math 把 hast 输出信息挂在这里 */
  data?: unknown;
}

/** KaTeX 只允许在 display 模式使用的环境 */
const DISPLAY_ONLY_ENV = /\\begin\{(align\*?|gather\*?|equation\*?|eqnarray\*?|multline\*?)\}/;

/**
 * 把 `$$\begin{align}…$$` 这类同一行包裹的块级公式提升为 display math。
 *
 * remark-math 会把 `$$` 同行的写法解析成行内公式（inlineMath），
 * KaTeX 在行内模式对这些环境直接报错（{align} can be used only in display mode）。
 *
 * ⚠️ 只改 `type` 不够：mdast-util-math 把 hast 输出信息写在节点的 `data` 上
 * （inlineMath 是 `<code class="math-inline">`，math 是 `<pre><code class="math-display">`），
 * 必须一并重建 data，否则 remark-rehype 仍按行内公式输出。
 */
function remarkPromoteDisplayMath() {
  return (tree: MdastNode) => {
    const visit = (node: MdastNode): void => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        const value = typeof child.value === 'string' ? child.value : '';
        if (child.type === 'inlineMath' && DISPLAY_ONLY_ENV.test(value)) {
          return {
            ...child,
            type: 'math',
            data: {
              hName: 'pre',
              hChildren: [
                {
                  type: 'element',
                  tagName: 'code',
                  properties: { className: ['language-math', 'math-display'] },
                  children: [{ type: 'text', value }],
                },
              ],
            },
          };
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}

/** 深度优先遍历 hast 树。 */
function walk(node: HastNode, visit: (n: HastNode, parent: HastNode, index: number) => void): void {
  if (!node || !Array.isArray(node.children)) return;
  node.children.forEach((child, i) => {
    visit(child, node, i);
    walk(child, visit);
  });
}

/** `==高亮==` → `<mark>高亮</mark>`。 */
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

/** 本站对渲染结果的两处修正。 */
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

      /*
       * 外链图床（gitee 等）按 Referer 拦截：浏览器必须不发 Referer，否则 302 到 favicon。
       */
      if (node.tagName === 'img') {
        node.properties = {
          ...node.properties,
          referrerpolicy: 'no-referrer',
          loading: 'lazy',
          decoding: 'async',
        };
      }
    });
  };
}

/** 复用同一个 processor：unified 的 process() 每次都会新建 vfile，实例本身是无状态的 */
const processor = unified()
  .use(remarkParse)
  /* 单个回车 → <br>。标准 Markdown 里「一行内的换行」不算换行，但中文写字时几乎所有人都是「按一下回车换一行」。 */
  .use(remarkBreaks)
  .use(remarkGfm)
  // 数学公式：$...$（行内）与 $$...$$（块级）。remark-math 把它俩变成 math / inlineMath 节点，
  // 真正的 HTML 展开交给下游的 rehype-katex 做。放在 remark 阶段、remark-rehype 之前。
  .use(remarkMath)
  // 必须在 remark-rehype 之前跑：它改的是 mdast 的节点类型
  .use(remarkPromoteDisplayMath)
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
 * @param markdown Markdown 源文（允许内嵌 HTML）
 * @returns HTML 字符串（未包外层容器；调用方负责套 .prose-site）
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
