/**
 * 行内 Markdown 解析：把一行源码切成「可见片段」，并建立源码下标 → 可见片段下标 的双向映射。
 *
 * 光标位置、选区、字符宽度都依赖这个映射 —— 一个 `**` 前缀渲染后不显示，光标要能正确跳过它。
 *
 * ⚠️ 不做块级解析（那是行本身的事），只管行内：加粗、斜体、行内代码、链接、删除线。
 */

/** 一个可见片段：它的可见文本 + 它开始于源码的哪个下标 */
export interface InlineSeg {
  /** 渲染出来看得见的文字 */
  text: string;
  /** 这段可见文字的第一个字符，对应源码里的下标 */
  srcStart: number;
  /** 样式标记 */
  kind: 'plain' | 'strong' | 'em' | 'code' | 'del' | 'link' | 'url';
  /** link 类型的 href */
  href?: string;
}

/**
 * 解析一行源码里的行内标记。
 *
 * 做法：从源码第 0 个字符开始逐字符扫，遇到能识别的标记就开一个带样式的段，
 * 标记符号本身**不产生可见字符**，只在映射表里留下「跳过的源码区间」。
 *
 * @param src 一行源码（不含结尾换行）
 * @returns 可见片段数组；空行返回 `[]`
 */
export function parseInline(src: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let buf = '';
  let bufSrcStart = 0;
  let i = 0;

  /** 收尾当前普通段 */
  const flush = () => {
    if (buf) {
      segs.push({ text: buf, srcStart: bufSrcStart, kind: 'plain' });
      buf = '';
    }
  };

  while (i < src.length) {
    // 行内代码：`code`（优先级最高，里面的东西一律不当标记）
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        segs.push({ text: src.slice(i + 1, end), srcStart: i + 1, kind: 'code' });
        i = end + 1;
        continue;
      }
    }

    // 图片 ![alt](url) / 链接 [text](url)
    const isImg = src[i] === '!' && src[i + 1] === '[';
    if (isImg || src[i] === '[') {
      const open = isImg ? i + 1 : i;
      const close = src.indexOf(']', open + 1);
      if (close !== -1 && src[close + 1] === '(') {
        const paren = src.indexOf(')', close + 2);
        if (paren !== -1) {
          flush();
          const label = src.slice(open + 1, close);
          const href = src.slice(close + 2, paren);
          if (isImg) {
            // 图片：整段当作一个「链接样式」的可见片段，显示 alt 或 url
            // ⚠️ 带上 VS16（\uFE0F），否则 Windows 按Symbols字体渲染成单色锯齿框，像乱码
            segs.push({ text: '🖼️ ' + (label || href), srcStart: i, kind: 'link', href });
          } else {
            segs.push({ text: label, srcStart: open + 1, kind: 'link', href });
          }
          i = paren + 1;
          continue;
        }
      }
    }

    // 加粗 **x** / 删除线 ~~x~~（必须先试长的，再试短的）
    const pair = src.startsWith('**', i) ? '**' : src.startsWith('~~', i) ? '~~' : null;
    if (pair) {
      const end = src.indexOf(pair, i + 2);
      if (end !== -1) {
        flush();
        segs.push({
          text: src.slice(i + 2, end),
          srcStart: i + 2,
          kind: pair === '**' ? 'strong' : 'del',
        });
        i = end + 2;
        continue;
      }
    }

    // 斜体 *x_ 或 _x_
    if (src[i] === '*' || src[i] === '_') {
      const mark = src[i];
      const end = src.indexOf(mark, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        segs.push({ text: src.slice(i + 1, end), srcStart: i + 1, kind: 'em' });
        i = end + 1;
        continue;
      }
    }

    // 裸 URL
    if (src.startsWith('http://', i) || src.startsWith('https://', i)) {
      let j = i;
      while (j < src.length && !/\s/.test(src[j])) j++;
      flush();
      segs.push({ text: src.slice(i, j), srcStart: i, kind: 'url' });
      i = j;
      continue;
    }

    // 普通字符
    if (buf === '') bufSrcStart = i;
    buf += src[i];
    i++;
  }

  flush();
  return segs;
}

/**
 * 逐 DOM 文本节点算出「每个可见字符的源码列号」。
 *
 * 参数：
 *  - segs      行内片段（srcStart 为行内列号，已含前缀长度），parseInline 产出
 *  - prefixRendered 前缀是否作为独立文本节点渲染（列表行的前缀画成圆点/序号，不算）
 *  - nodes     DOM 文本节点按出现顺序；decorative = 圆点/序号/预编辑串等不占源码列的节点
 *
 * 返回：与所有节点文本逐字符对应的列号数组；装饰字符与无法对齐的字符为 -1。
 *
 * 约束：
 *  - 节点可能只是片段的**一半**（选区高亮、预编辑串都会把片段切开），
 *    必须按「片段消费游标」推进，不能假设一个节点等于一个片段；
 *    也不能按文本长度累加列号 —— 标记符（`**`、`[]()` 等）渲染时不显示，
 *    按长度累加会让格式化过的行从标记起整体错位。
 *  - 图片段渲染成 `🖼 alt`，可见文本与源码不逐字对应，整段都锚到片段起点。
 */
export function charColsForLine(
  segs: InlineSeg[],
  prefixRendered: boolean,
  nodes: { text: string; decorative: boolean }[],
): number[] {
  const cols: number[] = [];
  let prefixDone = !prefixRendered;
  let segIdx = 0;
  let offInSeg = 0;

  /** 跳过已耗尽的片段，让 (segIdx, offInSeg) 指向下一个待消费字符 */
  const advanceSeg = () => {
    while (segIdx < segs.length && offInSeg >= segs[segIdx].text.length) {
      segIdx++;
      offInSeg = 0;
    }
  };

  for (const node of nodes) {
    if (node.decorative) {
      for (let k = 0; k < node.text.length; k++) cols.push(-1);
      continue;
    }
    // 前缀节点：它总是单独一个节点、文本恰为 prefixText，列号 = 节点内偏移
    if (!prefixDone) {
      for (let k = 0; k < node.text.length; k++) cols.push(k);
      prefixDone = true;
      continue;
    }
    for (let k = 0; k < node.text.length; k++) {
      advanceSeg();
      const seg = segs[segIdx];
      if (!seg) {
        // DOM 里多出来的字符（不该发生）：不给列号，点击反查会跳过它
        cols.push(-1);
        continue;
      }
      const isImageSeg = seg.kind === 'link' && seg.text.startsWith('🖼');
      cols.push(seg.srcStart + (isImageSeg ? 0 : offInSeg));
      offInSeg++;
    }
  }
  return cols;
}

/** 列表行前缀的解析结果 */
export interface ListPrefix {
  /** 缩进（前导空白） */
  indent: string;
  /** 本行完整前缀，如 `- ` / `  * ` / `1. ` */
  prefix: string;
  /** 前缀长度 = 内容起始列 */
  len: number;
  /** 是否有序列表 */
  ordered: boolean;
  /** 序号文本（仅有序列表，如 `1`） */
  marker?: string;
  /** 续写下一项要用的前缀：无序沿用同一符号，有序把序号 +1 */
  nextPrefix: string;
}

/**
 * 解析列表行前缀（无序 `- ` / `* ` / `+ `，有序 `1. ` / `1) `）。
 *
 * ⚠️ `classifyLine` 的 ul/ol 判定也走这里 —— 列表语法只有这一处定义，别在别处再写一份。
 *
 * @param line 一行源码
 * @returns 不是列表行则返回 null
 */
export function listPrefixOf(line: string): ListPrefix | null {
  const m = /^(\s*)([-*+]|\d+[.)])(\s+)/.exec(line);
  if (!m) return null;
  const indent = m[1];
  const sym = m[2];
  const gap = m[3];
  const ordered = /^\d/.test(sym);
  const marker = ordered ? sym.replace(/[.)]$/, '') : undefined;
  const nextSym = ordered ? `${Number(marker) + 1}${sym.slice(-1)}` : sym;
  return {
    indent,
    prefix: m[0],
    len: m[0].length,
    ordered,
    marker,
    nextPrefix: indent + nextSym + gap,
  };
}

/** 行前缀识别：这一行是什么块类型 */
export interface LineKind {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'quote'
    | 'ul'
    | 'ol'
    | 'hr'
    | 'fence'
    | 'code'
    | 'blank'
    | 'p'
    /** 表格块三件套：classifyLine 不产出，由 buildLines 的表格标记赋值 */
    | 'tableHead'
    | 'tableSep'
    | 'tableBody';
  /** 前缀占用的源码长度（如 `## ` 是 3，`- ` 是 2） */
  prefixLen: number;
  /** 有序列表的序号文本 */
  marker?: string;
  /** 列表项前面的缩进空格数（嵌套层级用） */
  indent?: number;
}

/**
 * 判断一行的块类型与前缀长度。
 *
 * @param line 一行源码
 * @param inFence 是否正处于代码围栏内部（由调用方按行序维护）
 * @returns 类型与前缀长度
 */
export function classifyLine(line: string, inFence: boolean): LineKind {
  /**
   * ⚠️ **围栏行必须最先判，且围栏内也要判**：调用方靠「这一行是 fence」来翻转围栏状态，
   * 若围栏内一律返回 code，闭合围栏就识别不到 —— 围栏永远关不上，后面整篇都被当成代码
   * （表格 / 标题 / 列表全部失效）。`` ` `` 与 `~` 两种围栏都认。
   * `$$` 单独成行时同样按围栏处理（块级公式），块内按源码原样显示。
   */
  const fm = /^\s*(`{3,}|~{3,}|\$\$)\s*$/.exec(line) ?? /^\s*(`{3,}|~{3,})\w*\s*/.exec(line);
  if (fm) return { type: 'fence', prefixLen: fm[0].length };

  if (inFence) return { type: 'code', prefixLen: 0 };
  if (line.trim() === '') return { type: 'blank', prefixLen: 0 };

  let m: RegExpExecArray | null;
  if ((m = /^(#{1,6})\s+/.exec(line))) {
    const lv = m[1].length;
    const key = ('h' + lv) as LineKind['type'];
    return { type: key, prefixLen: m[0].length };
  }
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { type: 'hr', prefixLen: line.length };
  if ((m = /^(\s*)>\s?/.exec(line))) return { type: 'quote', prefixLen: m[0].length };
  const lp = listPrefixOf(line);
  if (lp) return { type: lp.ordered ? 'ol' : 'ul', prefixLen: lp.len, marker: lp.marker, indent: lp.indent.length };
  return { type: 'p', prefixLen: 0 };
}
