/**
 * 文本编辑原语：在整篇 Markdown 上做插入 / 删除 / 移动光标。
 *
 * 全部是纯函数：输入 (text, caret) 出 { text, caret }，不碰 DOM、不碰 React。
 */

import { listPrefixOf } from './md-inline';
import type { Selection } from './md-commands';

/** 编辑结果：新的整篇文本 + 新的光标下标 */
export interface EditOutcome {
  text: string;
  caret: number;
  /** 若这次编辑需要选中一段（如删除整行后），给出选区 */
  select?: { start: number; end: number };
}

/**
 * 在光标处插入文本。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @param insert 要插入的字符串（可含 `\n`）
 * @returns 新文本与新光标（落在插入内容之后）
 */
export function insertAt(text: string, caret: number, insert: string): EditOutcome {
  const pos = Math.max(0, Math.min(caret, text.length));
  return { text: text.slice(0, pos) + insert + text.slice(pos), caret: pos + insert.length };
}

/**
 * 退格：删掉光标前一个字符。
 *
 * ⚠️ 光标在**列表行的行首**（前缀之前）时**不删前缀**：在当前行上方插入一个空的同款列表项，
 * 原内容整体下移一行，光标落在新的空项上。删前缀会直接破坏列表结构。
 *
 * 其余位置一律删一个字符。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @returns 新文本与新光标；已在文首则原样返回
 */
export function backspace(text: string, caret: number): EditOutcome {
  if (caret <= 0) return { text, caret: 0 };

  const { index, start } = lineIndexOf(text, caret);
  const line = text.split('\n')[index] ?? '';
  const lp = listPrefixOf(line);

  if (lp && caret === start) {
    const insert = lp.prefix + '\n';
    return {
      text: text.slice(0, caret) + insert + text.slice(caret),
      caret: caret + lp.prefix.length,
    };
  }

  return { text: text.slice(0, caret - 1) + text.slice(caret), caret: caret - 1 };
}

/**
 * 前向删除：删掉光标后一个字符。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @returns 新文本与新光标；已在文末则原样返回
 */
export function del(text: string, caret: number): EditOutcome {
  if (caret >= text.length) return { text, caret: text.length };
  return { text: text.slice(0, caret) + text.slice(caret + 1), caret };
}

/**
 * 回车：换行，并在列表行里续写列表。
 *
 *   ① 光标在列表行的前缀之后 → 换行并补上**下一项的前缀**（无序沿用同一符号，有序序号 +1）；
 *   ② 该列表项**内容为空**时回车 → **退出列表**：去掉本行前缀，变回空行。
 *      「回车两下退出列表」= 第一下生成空项、第二下把空项的前缀去掉。
 *
 * 其余情况（非列表行、或光标停在前缀之前）就是普通换行。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @returns 新文本与新光标
 */
export function enter(text: string, caret: number): EditOutcome {
  const { index, start } = lineIndexOf(text, caret);
  const line = text.split('\n')[index] ?? '';
  const lp = listPrefixOf(line);

  if (lp && caret >= start + lp.len) {
    // 空项上回车 → 退出列表
    if (line.slice(lp.len).trim() === '') {
      return { text: text.slice(0, start) + text.slice(start + lp.len), caret: start };
    }
    return insertAt(text, caret, '\n' + lp.nextPrefix);
  }

  return insertAt(text, caret, '\n');
}

/** 当前行的范围（0 基行号 + 该行起始下标） */
export function lineIndexOf(text: string, caret: number): { index: number; start: number } {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('\n') + 1;
  return { index: before.split('\n').length - 1, start };
}

/**
 * 把光标移到某一行的行首 / 行尾。
 *
 * 用于 Home / End，以及上下方向键。
 *
 * @param text 整篇 Markdown
 * @param lineIndex 目标行号（0 基，越界会夹紧）
 * @param where 行首还是行尾
 * @returns 新的光标下标
 */
export function caretAtLineEdge(text: string, lineIndex: number, where: 'start' | 'end'): number {
  const lines = text.split('\n');
  const idx = Math.max(0, Math.min(lineIndex, lines.length - 1));
  let pos = 0;
  for (let i = 0; i < idx; i++) pos += lines[i].length + 1;
  return where === 'start' ? pos : pos + lines[idx].length;
}

/**
 * 上下方向键：把光标尽量保持在同一列，移动到上一行 / 下一行。
 *
 * 目标行比当前行短时，夹到该行末尾 —— 与浏览器行为一致。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @param dir -1 向上，1 向下
 * @returns 新的光标下标
 */
export function moveLine(text: string, caret: number, dir: -1 | 1): number {
  const lines = text.split('\n');
  const { index, start } = lineIndexOf(text, caret);
  const col = caret - start;
  const target = index + dir;
  if (target < 0 || target >= lines.length) return caret;
  const base = caretAtLineEdge(text, target, 'start');
  return base + Math.min(col, lines[target].length);
}

/**
 * 左右方向键：光标移动一个字符。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @param dir -1 向左，1 向右
 * @returns 新的光标下标
 */
export function moveChar(text: string, caret: number, dir: -1 | 1): number {
  return Math.max(0, Math.min(caret + dir, text.length));
}

/**
 * 方向键 + Shift：维护一个选区锚点。
 *
 * ⚠️ 本函数只负责「算出新光标」；锚点由调用方保存。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @param dir 移动方向
 * @param key 按下的是哪个键
 * @returns 新的光标下标
 */
export function extendSelection(
  text: string,
  caret: number,
  dir: -1 | 1,
  key: 'left' | 'right' | 'up' | 'down' | 'home' | 'end',
): number {
  switch (key) {
    case 'left':
    case 'right':
      return moveChar(text, caret, dir);
    case 'up':
    case 'down':
      return moveLine(text, caret, key === 'up' ? -1 : 1);
    case 'home': {
      const { index } = lineIndexOf(text, caret);
      return caretAtLineEdge(text, index, 'start');
    }
    case 'end': {
      const { index } = lineIndexOf(text, caret);
      return caretAtLineEdge(text, index, 'end');
    }
  }
}

/**
 * 软换行（Shift+Enter）：段内换行。
 *
 * 插的是「两个空格 + 换行」——Markdown 里这叫**硬换行**，发布页才会渲染成真正的换行；
 * 只插 `\n` 在发布页里会被折成空格（软换行不换行）。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @returns 新文本与新光标
 */
export function softBreak(text: string, caret: number): EditOutcome {
  return insertAt(text, caret, '  \n');
}

/**
 * 对若干整行做同一种变换，并把光标 / 选区按行长变化平移。
 *
 * 缩进、升降标题级别这类「改整行」的操作都走它：只要给出「怎么改一行」，
 * 位置映射由这里统一算，避免每个操作各写一份偏移换算。
 *
 * @param text 整篇 Markdown
 * @param sel 选区（start === end 表示只有光标，只改光标所在那一行）
 * @param fn 单行变换函数
 * @returns 新文本、新光标与新选区
 */
export function transformLines(
  text: string,
  sel: Selection,
  fn: (line: string) => string,
): EditOutcome & { select?: Selection } {
  const lines = text.split('\n');
  const first = lineIndexOf(text, sel.start).index;
  const last = lineIndexOf(text, sel.end).index;
  const deltas: number[] = [];
  for (let i = first; i <= last; i++) {
    const next = fn(lines[i]);
    deltas.push(next.length - lines[i].length);
    lines[i] = next;
  }
  const nextText = lines.join('\n');

  /**
   * 把旧位置映射到新文本。
   * ⚠️ 行内列号要**加上本行的长度变化**：缩进 / 标题级别都是在行首插删前缀，
   * 前缀一变，行内每个字符的列号跟着平移；只按前面几行的变化平移会算到错位置。
   */
  const mapPos = (p: number) => {
    const { index, start } = lineIndexOf(text, p);
    let shift = 0;
    for (let i = first; i < Math.min(index, last + 1); i++) shift += deltas[i - first];
    const own = index >= first && index <= last ? deltas[index - first] : 0;
    const lineNewLen = lines[index]?.length ?? 0;
    const col = Math.max(0, Math.min(p - start + own, lineNewLen));
    return start + shift + col;
  };

  return {
    text: nextText,
    caret: mapPos(sel.end),
    select: sel.start === sel.end ? undefined : { start: mapPos(sel.start), end: mapPos(sel.end) },
  };
}

/**
 * 缩进 / 反缩进整行（Ctrl+[ 与 Ctrl+]、Tab / Shift+Tab）。
 *
 * 缩进加两个空格（Markdown 嵌套一层），反缩进最多去掉行首两个空格。
 *
 * @param text 整篇 Markdown
 * @param sel 选区
 * @param dir 1 缩进，-1 反缩进
 * @returns 新文本与新光标 / 选区
 */
export function indentLines(text: string, sel: Selection, dir: -1 | 1): EditOutcome & { select?: Selection } {
  return transformLines(text, sel, (line) => (dir === 1 ? '  ' + line : line.replace(/^ {1,2}/, '')));
}

/**
 * 升降标题级别（Ctrl+= / Ctrl+-）。
 *
 * 已是标题 → 级别 ±1；级别降到 0 → 去掉标题标记变正文；
 * 非标题行按 Ctrl+= → 升为一级标题，按 Ctrl+- → 不动。
 *
 * @param text 整篇 Markdown
 * @param sel 选区
 * @param dir 1 升（级别变小），-1 降
 * @returns 新文本与新光标 / 选区
 */
export function changeHeadingLevel(text: string, sel: Selection, dir: -1 | 1): EditOutcome & { select?: Selection } {
  return transformLines(text, sel, (line) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) return dir === 1 ? '# ' + line : line;
    const level = m[1].length - dir; // dir=1 是「升」，即级别数字变小
    if (level < 1) return m[2];
    return '#'.repeat(Math.min(6, level)) + ' ' + m[2];
  });
}

/**
 * 取光标处的「词」范围（Ctrl+D 选中词 / Ctrl+Shift+D 删词）。
 *
 * 词的分法：连续的中日韩字符算一个词，连续的字母 / 数字 / 下划线算一个词。
 * 光标停在词尾（右边是空格或标点）时，退回到左边的词上 —— 与常见编辑器的习惯一致。
 *
 * @param text 整篇 Markdown
 * @param pos 光标下标
 * @returns 词的起止下标；光标处不是词时返回该字符本身的范围
 */
export function wordRangeAt(text: string, pos: number): Selection {
  const cls = (ch: string | undefined): 0 | 1 | 2 => {
    if (!ch) return 0;
    if (/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/.test(ch)) return 1;
    if (/[A-Za-z0-9_]/.test(ch)) return 2;
    return 0;
  };
  const p = Math.max(0, Math.min(pos, Math.max(0, text.length - 1)));
  let i = p;
  if (cls(text[i]) === 0 && cls(text[i - 1]) !== 0) i -= 1;
  const kind = cls(text[i]);
  if (kind === 0) return { start: p, end: Math.min(p + 1, text.length) };

  let start = i;
  let end = i + 1;
  while (start > 0 && cls(text[start - 1]) === kind) start--;
  while (end < text.length && cls(text[end]) === kind) end++;
  return { start, end };
}

/**
 * 删掉当前光标所在的**整行**（含结尾换行）。
 *
 * @param text 整篇 Markdown
 * @param caret 光标下标
 * @returns 新文本与新光标
 */
export function deleteLine(text: string, caret: number): EditOutcome {
  const lines = text.split('\n');
  const { index } = lineIndexOf(text, caret);
  if (lines.length <= 1) return { text: '', caret: 0 };
  lines.splice(index, 1);
  const newText = lines.join('\n');
  // 光标落到被删行的行首（即上一行末尾之后）
  let pos = 0;
  for (let i = 0; i < Math.min(index, lines.length); i++) pos += lines[i].length + 1;
  return { text: newText, caret: Math.min(pos, newText.length) };
}
