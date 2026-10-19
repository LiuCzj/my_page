/**
 * 笔记编辑器：逐行 div 渲染 + 自绘光标，键盘与输入法走隐藏 textarea。
 *
 * 正文不是输入控件，键盘事件无处可挂 —— 养一个隐藏 textarea（1px、透明）承接键盘与 IME，
 * 编辑器据此改文本、重绘。
 *
 * ⚠️ 输入法必须挂在真实的可聚焦元素上，合成 div + contenteditable 会丢字；隐藏 textarea 不能去掉。
 * ⚠️ 正文不用真 textarea：同一元素里存在 5 种行高（标题 1.75rem、正文 1rem…），
 *    而 CSS 的 line-height 作用于整个元素、不接受逐行覆盖。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { charColsForLine, classifyLine, parseInline, type InlineSeg, type LineKind } from '@/lib/md-inline';
import { parseMarkdownFile, type ParsedMarkdownFile } from '@/lib/parse-md-file';
import {
  backspace,
  caretAtLineEdge,
  changeHeadingLevel,
  del,
  enter,
  indentLines,
  insertAt,
  lineIndexOf,
  moveChar,
  moveLine,
  softBreak,
  wordRangeAt,
  type EditOutcome,
} from '@/lib/md-editing';
import {
  clearInlineFormat,
  findMatches,
  getContext,
  inlineTargetAt,
  insertImage,
  insertLink,
  lineBoundsAt,
  makeTableSnippet,
  replaceMatches,
  snippetInnerOffset,
  SNIPPETS,
  tableAddColumn,
  tableAddRow,
  tableBlockRange,
  tableCellRanges,
  tableDelete,
  tableDeleteColumn,
  tableDeleteRow,
  tableFormatSource,
  tableInsertColumn,
  tableInsertRow,
  tablePosAt,
  unwrapSelection,
  wrapSelection,
  type InlineTarget,
  type Selection,
} from '@/lib/md-commands';
import {
  buildContextMenu,
  buildImageMenu,
  buildLinkMenu,
  ContextMenu,
  FindPanel,
  FormatBubble,
  INLINE_COMMANDS,
  ImageInsertDialog,
  TableInsertDialog,
  type FindState,
  type FloatPos,
  type MdMenuItem,
} from './MarkdownFloats';

/** 一行的渲染描述 */
interface RenderLine {
  /** 这一行在整篇里的起始下标 */
  start: number;
  /** 这一行的源码（不含换行） */
  src: string;
  /** 块类型 */
  kind: LineKind;
  /** 前缀之后的可见片段 */
  segs: InlineSeg[];
  /** 前缀的源码文本（如 `## `），加虚化显示 */
  prefixText: string;
  /** 表格行的列数（取表头的列数，head/sep/body 三种行都有值） */
  tableCols?: number;
}

/** 光标位置：整篇里的绝对字符下标 */
type Caret = number;

/**
 * 字符映射表的一条：DOM 里某个可见字符 ↔ 它在源码里的下标。
 * `src === null` 表示这个字符是纯装饰（列表圆点 / 序号），不占源码位置。
 */
interface CharMapEntry {
  node: Text;
  /** 在该文本节点里的偏移 */
  offset: number;
  /** 对应的行内源码下标；null = 装饰字符 */
  src: number | null;
}

/** 表格分隔行的形态：竖线、冒号、横杠、空格的组合，且至少含一个 `-` */
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

/**
 * 取片段列表中 [from, to) 区间的内容，`srcStart` 平移成行内绝对列号。
 * 用于把整行的片段按单元格边界再切一刀。
 *
 * @param segs 整行的片段
 * @param from 区间起点（行内列号）
 * @param to 区间终点（不含）
 * @returns 区间内的片段
 */
function sliceSegs(segs: InlineSeg[], from: number, to: number): InlineSeg[] {
  const out: InlineSeg[] = [];
  for (const s of segs) {
    const s0 = s.srcStart;
    const s1 = s.srcStart + s.text.length;
    const a = Math.max(s0, from);
    const b = Math.min(s1, to);
    if (b > a) out.push({ ...s, text: s.text.slice(a - s0, b - s0), srcStart: a });
  }
  return out;
}

/**
 * 把整篇切成一行的渲染描述。
 *
 * @param src 整篇 Markdown
 * @returns 逐行的渲染描述
 */
function buildLines(src: string): RenderLine[] {
  const raw = src.split('\n');
  const out: RenderLine[] = [];
  let pos = 0;
  let inFence = false;

  for (const line of raw) {
    const kind = classifyLine(line, inFence);
    if (kind.type === 'fence') inFence = !inFence;
    const prefixText = line.slice(0, kind.prefixLen);
    const body = line.slice(kind.prefixLen);
    /**
     * ⚠️ 片段下标必须**加上前缀长度**再存：
     * parseInline 收到的是去掉前缀的 body，它返回的 srcStart 是「相对 body」的，
     * 而光标换算用的是「相对整行」的列号 —— 不对齐就会算错位置。
     */
    const segs =
      kind.type === 'code'
        ? [{ text: body, srcStart: kind.prefixLen, kind: 'plain' as const }]
        : parseInline(body).map((s) => ({ ...s, srcStart: s.srcStart + kind.prefixLen }));
    out.push({ start: pos, src: line, kind, prefixText, segs });
    pos += line.length + 1;
  }

  markTables(out);
  return out;
}

/**
 * 表格块标记：某段行含竖线、且下一行是分隔行形态时，把这一段标成
 * tableHead / tableSep / tableBody，并给每种行盖上表头的列数。
 * 判定必须拿到全文：classifyLine 逐行判定看不到下一行。
 *
 * @param lines buildLines 产出的逐行描述（原地修改）
 */
function markTables(lines: RenderLine[]): void {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.kind.type !== 'p' || !l.src.includes('|')) continue;
    const next = lines[i + 1];
    if (!next || next.kind.type !== 'p' || !TABLE_SEP_RE.test(next.src) || !next.src.includes('-')) continue;

    const cols = tableCellRanges(l.src).length;
    l.kind = { type: 'tableHead', prefixLen: 0 };
    l.tableCols = cols;
    next.kind = { type: 'tableSep', prefixLen: 0 };
    next.tableCols = cols;
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j].kind.type !== 'p' || !lines[j].src.trimStart().startsWith('|')) break;
      lines[j].kind = { type: 'tableBody', prefixLen: 0 };
      lines[j].tableCols = cols;
    }
  }
}

/** 可拖入的整体导入文件扩展名（.md / .markdown / .mdx / 纯文本） */
const MD_FILE_RE = /\.(md|markdown|mdx|txt)$/i;

/** 可拖入的图片扩展名（只插占位语法，不做上传） */
const IMG_FILE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** 撤销合并窗口：相邻同类小编辑落在这个时间内并成一步 */
const UNDO_MERGE_MS = 600;

/** 撤销栈深度上限 */
const UNDO_MAX = 200;

/** 一次历史快照：那一步之后的光标位置要一起恢复 */
interface HistoryEntry {
  text: string;
  caret: number;
}

/**
 * 笔记编辑器。
 *
 * @param props.value 整篇 Markdown
 * @param props.onChange 变化回调
 * @param props.onSave 存在时绑定 Ctrl+S
 * @param props.onImport 存在时启用「拖 .md 文件进来整体导入」
 */
export default function MirrorEditor({
  value,
  onChange,
  onSave,
  onImport,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  onImport?: (r: ParsedMarkdownFile) => void;
  /** 追加到根容器的类名（全屏编辑器用来给最小高度） */
  className?: string;
}) {
  const lines = useMemo(() => buildLines(value), [value]);
  const [caret, setCaret] = useState<Caret>(0);
  /** 光标所在的行下标；-1 = 未定位 */
  const [caretLine, setCaretLine] = useState(-1);
  /** 选区锚点；null = 没有选区 */
  const [anchor, setAnchor] = useState<Caret | null>(null);
  /** 右键菜单：位置 + 条目 + 命中的图片/链接；null = 没开 */
  const [menu, setMenu] = useState<{
    pos: FloatPos;
    items: MdMenuItem[];
    /** 右键命中的图片/链接（专用菜单命令按它精确改写）；null = 通用菜单 */
    target: { t: InlineTarget; lineStart: number; lineSrc: string } | null;
  } | null>(null);
  /** 选区格式气泡的位置；null = 不显示 */
  const [bubble, setBubble] = useState<FloatPos | null>(null);
  /** 「插入表格」对话框是否打开 */
  const [tableAsk, setTableAsk] = useState(false);
  /**
   * 「插入图片」对话框；null = 没开。
   * sel 是打开对话框那一刻的选区快照 —— 对话框会拿走焦点，不能等确定时再读光标。
   */
  const [imageAsk, setImageAsk] = useState<{ alt: string; sel: Selection; hint?: string } | null>(null);
  /** 查找 / 替换面板；null = 没开 */
  const [find, setFind] = useState<FindState | null>(null);
  /** 状态栏上的一次性提示（如「请按 Ctrl+V」）；用提示条而不是弹窗，不打断操作 */
  const [notice, setNotice] = useState('');
  /** 有文件拖过编辑区时的视觉反馈 */
  const [dragging, setDragging] = useState(false);
  /** 撤销栈：entries 是逐步快照，index 指向「当前」状态 */
  const historyRef = useRef<{ entries: HistoryEntry[]; index: number }>({ entries: [], index: -1 });
  /** 上一次小编辑落栈的时刻（毫秒），配合 UNDO_MERGE_MS 判断要不要并入同一步 */
  const lastEditAt = useRef(0);
  /** 上一次小编辑的类别；「合并」只发生在同类相邻小编辑之间（打字连打 / 退格连删） */
  const lastKindRef = useRef<'input' | 'erase' | 'block'>('block');
  /** 每行 DOM，用于点击时按坐标反查字符 */
  const lineEls = useRef<(HTMLDivElement | null)[]>([]);
  /** 光标竖线的位置（相对编辑区容器） */
  const [caretBox, setCaretBox] = useState<{ x: number; y: number; h: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** 承接键盘与输入法的隐藏 textarea */
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /** 是否正在用鼠标拖拽选选区 */
  const dragRef = useRef(false);
  /** 本次按下是否**真的拖动过**（用来吞掉拖拽后浏览器补发的那个 click） */
  const draggedRef = useRef(false);
  /** 是否聚焦（决定光标显不显示、闪烁不闪烁） */
  const [focused, setFocused] = useState(false);
  /** 输入法预编辑串；非空时显示在光标处 */
  const [composing, setComposing] = useState('');
  /**
   * 「正在组合」的同步标记（IME 拼音输入中）。
   * ⚠️ 必须用 ref 而不是 composing state：组合期与上屏瞬间的 input 都是**同步**紧随派发的，
   * 读 state 拿到的是本轮渲染前的旧值 —— 用 state 会漏判，把拼音当正文插进去。
   */
  const composingRef = useRef(false);
  /**
   * 「用户按了 Esc，这次组合要取消」的标记。
   *
   * ⚠️ 不能只靠「浏览器有没有清空控件值」来判断取消 —— 那是实现细节，赌不起。
   * 用户按下 Esc 就是要取消，这是**直接信号**，与浏览器行为无关。
   */
  const cancelPending = useRef(false);
  /**
   * 「刚由输入法提交的文本」，空串 = 无。
   *
   * ⚠️ 存的是**内容**而不是布尔标记 —— 见 onCompositionEnd 的说明：
   * 尾巴 input 的特征是「内容恰好等于刚上屏的文本」，用内容比对才不依赖事件时序，
   * 也不会在「Esc 取消（没有尾巴 input）」时留下会把后续按键吞掉的残留标记。
   */
  const justComposed = useRef('');

  /**
   * 把绝对字符下标换算成屏幕坐标（用于摆光标）。
   *
   * @param abs 绝对字符下标
   * @param li 该下标所在的行
   * @param map 该行的字符映射表（由 buildCharMap 产出，与点击反查共用同一张表）
   * @returns 光标盒；找不到时为 null
   */
  const measureCaret = useCallback(
    (abs: number, li: number, map: CharMapEntry[]): { x: number; y: number; h: number } | null => {
      if (!wrapRef.current) return null;
      const wr = wrapRef.current.getBoundingClientRect();

      if (li < 0 || li >= lines.length) return null;
      const line = lines[li];
      if (!line) return null;
      // 表格分隔行不渲染（hidden），光标借邻行的行盒摆在行首，别让它凭空消失
      if (line.kind.type === 'tableSep') {
        const nb = lineEls.current[li - 1] ?? lineEls.current[li + 1];
        if (!nb) return null;
        const nr = nb.getBoundingClientRect();
        return { x: 0, y: nr.top - wr.top, h: nr.height };
      }
      const el = lineEls.current[li];
      if (!el) return null;

      const col = Math.max(0, Math.min(abs - line.start, line.src.length));
      const er = el.getBoundingClientRect();

      // 空行 / 分隔线：光标摆在行首
      if (line.kind.type === 'blank' || line.kind.type === 'hr') {
        return { x: 0, y: er.top - wr.top, h: er.height };
      }

      /**
       * 在字符映射表里定位光标。
       * 规则：光标在源码下标 `col` 处，应画在「源码下标 ≥ col 的第一个可见字符」的左边缘；
       * 若 col 已越过后半行，则画在「源码下标 < col 的最后一个可见字符」的右边缘。
       */
      const head = map.find((c) => c.src !== null && c.src >= col);
      if (head) {
        const r = document.createRange();
        r.setStart(head.node, head.offset);
        r.setEnd(head.node, head.offset + 1);
        const rr = r.getBoundingClientRect();
        if (rr.width || rr.height) return { x: rr.left - wr.left, y: rr.top - wr.top, h: rr.height };
      }

      // 行尾：量最后一个有源码映射的字符，取右边缘
      const tail = [...map].reverse().find((c) => c.src !== null);
      if (tail) {
        const len = (tail.node.nodeValue ?? '').length;
        const r = document.createRange();
        r.setStart(tail.node, Math.min(tail.offset, len - 1));
        r.setEnd(tail.node, Math.min(tail.offset + 1, len));
        const rr = r.getBoundingClientRect();
        if (rr.width || rr.height) return { x: rr.right - wr.left, y: rr.top - wr.top, h: rr.height };
      }

      return { x: 0, y: er.top - wr.top, h: er.height };
    },
    [lines],
  );

  /**
   * 建立「DOM 里每个可见字符」与「源码下标」的对应表。
   *
   * 点击反查与光标绘制**共用同一张表**，两边用同一份映射才不会互相错位。
   *
   * 列号按片段消费（segs[].srcStart 锚定），不按文本长度累加。
   * 坑：hr/fence 两类整行按源码原样渲染（列号 1:1）；空源码行的 ` ` 占位符没有对应字符。
   *
   * @param li 行下标
   * @returns 逐可见字符的映射；行不存在返回 []
   */
  const buildCharMap = useCallback(
    (li: number): CharMapEntry[] => {
      const el = lineEls.current[li];
      const line = lines[li];
      if (!el || !line) return [];

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: { node: Text; text: string; decorative: boolean }[] = [];
      let n: Text | null;
      while ((n = walker.nextNode() as Text | null)) {
        const text = n.nodeValue ?? '';
        if (!text) continue;
        const cls = n.parentElement?.className ?? '';
        // 预编辑串与圆点/序号是「正在输入 / 纯装饰」，不属于正文，不占源码列
        const decorative =
          cls.includes('md-preedit') ||
          (cls.includes('mr-2') && (text === '•' || /^\d+\.$/.test(text)));
        nodes.push({ node: n, text, decorative });
      }

      let cols: number[];
      if (line.kind.type === 'tableHead' || line.kind.type === 'tableBody') {
        // 表格行：DOM 是去掉竖线后的单元格文本，映射也按「去竖线后的片段」消费
        const cellSegs = tableCellRanges(line.src).flatMap((r) => sliceSegs(line.segs, r.from, r.to));
        cols = charColsForLine(cellSegs, false, nodes);
      } else if (line.kind.type === 'hr' || line.kind.type === 'fence') {
        // 这两类整行按源码原样渲染，列号 1:1；` ` 占位（空源码行）没有对应字符
        cols = [];
        for (const nd of nodes) {
          for (let k = 0; k < nd.text.length; k++) cols.push(k < line.src.length ? k : -1);
        }
      } else {
        // 与 JSX 的渲染条件保持一致：列表行的前缀画成圆点/序号，不算「渲染出的前缀节点」
        const prefixRendered =
          line.prefixText !== '' && line.kind.type !== 'ul' && line.kind.type !== 'ol';
        cols = charColsForLine(line.segs, prefixRendered, nodes);
      }

      const final: CharMapEntry[] = [];
      let idx = 0;
      for (const nd of nodes) {
        for (let k = 0; k < nd.text.length; k++) {
          const c = cols[idx];
          idx++;
          final.push({ node: nd.node, offset: k, src: typeof c === 'number' && c >= 0 ? c : null });
        }
      }
      return final;
    },
    [lines],
  );

  /** 光标 / 行 / 文本任一变化 → 重新量光标位置 */
  useLayoutEffect(() => {
    const map = buildCharMap(caretLine);
    setCaretBox(measureCaret(caret, caretLine, map));
  }, [caret, caretLine, buildCharMap, measureCaret, value]);

  /** 光标变了 → 把隐藏输入框挪到光标处，让输入法候选窗出现在正确位置 */
  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta || !caretBox || !wrapRef.current) return;
    const wr = wrapRef.current.getBoundingClientRect();
    ta.style.left = `${caretBox.x}px`;
    ta.style.top = `${caretBox.y}px`;
    ta.style.height = `${caretBox.h}px`;
    void wr;
  }, [caretBox]);

  /** 光标移动后同步 caretLine */
  useEffect(() => {
    let li = lines.findIndex((l, i) => {
      const next = lines[i + 1];
      return caret >= l.start && (!next || caret < next.start);
    });
    if (li === -1) li = lines.length - 1;
    setCaretLine(li);
  }, [caret, lines]);

  /** 状态栏提示 3 秒后自动消失 */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  /**
   * 有选区时把格式气泡浮到选区末尾的上方。
   *
   * ⚠️ 位置必须用**视口坐标**（气泡是 Portal 到 body 的 `fixed` 元素），
   * 而 `measureCaret` 给的是相对编辑区的坐标 —— 要补上容器的 left/top。
   */
  useEffect(() => {
    if (menu || anchor === null || anchor === caret) {
      setBubble(null);
      return;
    }
    const abs = Math.max(anchor, caret);
    const { index } = lineIndexOf(value, abs);
    const box = measureCaret(abs, index, buildCharMap(index));
    const wr = wrapRef.current?.getBoundingClientRect();
    if (!box || !wr) {
      setBubble(null);
      return;
    }
    setBubble({
      x: Math.max(8, Math.min(wr.left + box.x, window.innerWidth - 240)),
      y: Math.max(8, wr.top + box.y - 44),
    });
  }, [anchor, caret, menu, value, measureCaret, buildCharMap]);

  /**
   * 应用一次编辑：写回文本、摆好光标、推进撤销栈。
   *
   * @param r 编辑结果
   * @param kind 编辑类别：'input' 打字（可合并）｜'erase' 退格删除（可合并）｜
   *             'block' 结构性操作（粘贴 / IME 上屏 / 命令，自成一步撤销）
   */
  const applyEdit = useCallback(
    (r: EditOutcome, kind: 'input' | 'erase' | 'block' = 'block') => {
      const h = historyRef.current;
      const now = Date.now();
      // 只有「同类相邻小编辑」才并入上一步；类别变了或超时就另起一步
      const merged =
        kind !== 'block' &&
        kind === lastKindRef.current &&
        now - lastEditAt.current < UNDO_MERGE_MS &&
        h.entries[h.index] !== undefined;
      if (merged) {
        h.entries[h.index] = { text: r.text, caret: r.caret };
      } else {
        // 另起一步：丢弃当前状态之后的重做分支
        h.entries = h.entries.slice(0, h.index + 1);
        h.entries.push({ text: r.text, caret: r.caret });
        if (h.entries.length > UNDO_MAX) h.entries.shift();
        h.index = h.entries.length - 1;
      }
      lastEditAt.current = now;
      lastKindRef.current = kind;
      onChange(r.text);
      setCaret(r.caret);
      setAnchor(null);
    },
    [onChange],
  );

  /** 撤销：回退到上一步快照；textarea 的 value 恒为空，原生 undo 无处可退，必须自己维护 */
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    const e = h.entries[h.index];
    lastEditAt.current = 0;
    lastKindRef.current = 'block';
    onChange(e.text);
    setCaret(e.caret);
    setAnchor(null);
  }, [onChange]);

  /** 重做：前进到下一步快照 */
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.entries.length - 1) return;
    h.index += 1;
    const e = h.entries[h.index];
    lastEditAt.current = 0;
    lastKindRef.current = 'block';
    onChange(e.text);
    setCaret(e.caret);
    setAnchor(null);
  }, [onChange]);

  /** 正文被编辑器以外的方式改写（整体导入、父组件重置）→ 撤销栈作废重建 */
  useEffect(() => {
    const h = historyRef.current;
    const top = h.entries[h.index];
    if (!top || top.text !== value) {
      h.entries = [{ text: value, caret }];
      h.index = 0;
      lastEditAt.current = 0;
      lastKindRef.current = 'block';
    }
  }, [value, caret]);

  /** 查找命中：整篇源码里的起始下标 */
  const matches = useMemo(
    () => (find?.query ? findMatches(value, find.query, find.caseSensitive) : []),
    [value, find?.query, find?.caseSensitive],
  );
  /** 当前命中在 matches 里的下标；没有命中时 -1 */
  const currentMatch = find && matches.length > 0 ? Math.min(find.index, matches.length - 1) : -1;

  /** 跳到第 i 个命中：选中它，并把所在行滚进视野 */
  const jumpToMatch = useCallback(
    (i: number) => {
      const at = matches[i];
      if (at === undefined || !find) return;
      setAnchor(at);
      setCaret(at + find.query.length);
      const li = lineIndexOf(value, at).index;
      lineEls.current[li]?.scrollIntoView({ block: 'center' });
    },
    [find, matches, value],
  );

  /** 查询词 / 大小写开关一变就跳回第一个命中 */
  useEffect(() => {
    if (find?.open && find.query && matches.length > 0) jumpToMatch(0);
    // ⚠️ 依赖只跟查询条件：matches 每次输入都会重建，放进依赖会反复跳
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find?.query, find?.caseSensitive, find?.open]);

  /** 打开查找（Ctrl+F）/ 替换（Ctrl+H）面板 */
  const openFind = useCallback((replace: boolean) => {
    setFind((f) => ({
      open: true,
      replace,
      query: f?.query ?? '',
      replacement: f?.replacement ?? '',
      caseSensitive: f?.caseSensitive ?? false,
      index: 0,
    }));
    // 焦点让给面板输入框，否则键盘还在往隐藏 textarea 里打
    inputRef.current?.blur();
  }, []);

  /** 上一个 / 下一个命中 */
  const stepMatch = useCallback(
    (dir: -1 | 1) => {
      if (!find || matches.length === 0) return;
      const next = (currentMatch + dir + matches.length) % matches.length;
      setFind({ ...find, index: next });
      jumpToMatch(next);
    },
    [currentMatch, find, jumpToMatch, matches.length],
  );

  /** 替换当前命中 */
  const replaceCurrent = useCallback(() => {
    if (!find || currentMatch < 0) return;
    const at = matches[currentMatch];
    const r = replaceMatches(value, find.query, find.replacement, find.caseSensitive, currentMatch);
    if (r.count === 0) return;
    applyEdit({ text: r.text, caret: at + find.replacement.length });
    setNotice('已替换 1 处');
  }, [applyEdit, currentMatch, find, matches, value]);

  /** 全部替换 */
  const replaceAll = useCallback(() => {
    if (!find) return;
    const r = replaceMatches(value, find.query, find.replacement, find.caseSensitive);
    if (r.count === 0) return;
    applyEdit({ text: r.text, caret: Math.min(matches[0] ?? 0, r.text.length) });
    setNotice(`已替换 ${r.count} 处`);
  }, [applyEdit, find, matches, value]);

  /** 当前选区（没有选中时 start === end === caret） */
  const currentSelection = useCallback((): Selection => {
    const a = anchor ?? caret;
    return { start: Math.min(a, caret), end: Math.max(a, caret) };
  }, [anchor, caret]);

  /**
   * 把当前行的前缀换成 `prefix`（传空串 = 去掉前缀变正文）。
   *
   * 用于「转为引用 / 无序列表 / 有序列表 / 待办项 / 正文」这类**整行切换**命令。
   *
   * @param prefix 新的行前缀（如 `> ` / `- ` / `1. ` / `- [ ] `）
   */
  const setLinePrefix = useCallback(
    (prefix: string) => {
      const { start, end } = lineBoundsAt(value, caret);
      const line = value.slice(start, end);
      const bare = line.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|-\s\[[ xX]\]\s+)/, '');
      const next = prefix + bare;
      applyEdit({
        text: value.slice(0, start) + next + value.slice(end),
        caret: start + next.length,
      });
    },
    [applyEdit, caret, value],
  );

  /**
   * 在当前行**之后另起一段**插入一个块片段（表格 / 代码块 / 分割线）。
   *
   * @param snippet 片段源码（含内部光标占位约定，见 SNIPPETS）
   */
  const insertAfterLine = useCallback(
    (snippet: string) => {
      const { end } = lineBoundsAt(value, caret);
      const insertFrom = end;
      const next = value.slice(0, insertFrom) + '\n\n' + snippet + value.slice(insertFrom);
      applyEdit({ text: next, caret: insertFrom + 2 + snippetInnerOffset(snippet) });
    },
    [applyEdit, caret, value],
  );

  /**
   * 统一的命令分发 —— 格式气泡、右键菜单、快捷键都走这里。
   *
   * @param id 命令标识（见 MarkdownFloats 的 MdCommand.id）
   */
  const runCommand = useCallback(
    (id: string) => {
      setMenu(null);
      setBubble(null);
      // 菜单是 Portal，点它的按钮会拿走焦点 —— 立刻拿回隐藏输入框，
      // 否则「粘贴被拒后请按 Ctrl+V」的提示是空话：按了也没人接事件
      inputRef.current?.focus();
      const sel = currentSelection();

      // ── 行内格式：再按一次取消（Typora 行为） ──
      const markOf: Record<string, string> = {
        bold: '**',
        italic: '*',
        strike: '~~',
        code: '`',
        highlight: '==',
      };
      if (id === 'link') {
        applyEdit(insertLink(value, sel));
        return;
      }
      if (markOf[id]) {
        const mark = markOf[id];
        applyEdit(unwrapSelection(value, sel, mark) ?? wrapSelection(value, sel, mark));
        return;
      }

      // ── 标题：换掉已有的标题标记 ──
      const headingLevels: Record<string, number> = { h1: 1, h2: 2, h3: 3 };
      if (id in headingLevels) {
        const level = headingLevels[id];
        const { start, end } = lineBoundsAt(value, caret);
        const line = value.slice(start, end);
        const bare = line.replace(/^\s*#{1,6}\s+/, '');
        const next = '#'.repeat(level) + ' ' + bare;
        applyEdit({ text: value.slice(0, start) + next + value.slice(end), caret: start + next.length });
        return;
      }

      // ── 整行前缀切换 ──
      if (id === 'normal') return setLinePrefix('');
      if (id === 'quote') return setLinePrefix('> ');
      if (id === 'bullet') return setLinePrefix('- ');
      if (id === 'ordered') return setLinePrefix('1. ');
      if (id === 'todo') return setLinePrefix('- [ ] ');

      // ── 另起一段插入 ──
      if (id === 'table') {
        // 行列数让用户填（Typora 的插入表格对话框）
        setTableAsk(true);
        return;
      }
      if (id === 'codeblock') return insertAfterLine(SNIPPETS.code);
      if (id === 'hr') return insertAfterLine(SNIPPETS.hr);

      // ── 撤销 / 重做 / 全选 / 清除格式 ──
      if (id === 'undo') return undo();
      if (id === 'redo') return redo();
      if (id === 'select-all') {
        setAnchor(0);
        setCaret(value.length);
        return;
      }
      if (id === 'clear-format') {
        const r = clearInlineFormat(value, currentSelection());
        if (!r) {
          setNotice('先选中一段带格式的文字');
          return;
        }
        applyEdit(r);
        return;
      }

      // ── 表格：旧菜单的两条（保留兼容） ──
      if (id === 'table-row') {
        const r = tableAddRow(value, caret);
        if (r) applyEdit(r);
        return;
      }
      if (id === 'table-col') {
        const r = tableAddColumn(value);
        if (r) applyEdit(r);
        return;
      }

      // ── 表格：完整操作（Typora 的九项菜单） ──
      if (id.startsWith('table-')) {
        const pos = tablePosAt(value, caret);
        if (!pos) {
          setNotice('光标不在表格里');
          return;
        }
        if (id === 'table-copy') {
          const { from, to } = tableBlockRange(pos);
          void navigator.clipboard.writeText(value.slice(from, to)).then(
            () => setNotice('已复制表格源码'),
            () => setNotice('浏览器拒绝了剪贴板写入，请选中后 Ctrl+C'),
          );
          return;
        }
        // 分隔行是表头的附属行，在它上下插行会让表头与分隔行脱节
        if ((id === 'table-row-above' || id === 'table-row-below') && pos.rowIndex === 1) {
          setNotice('光标在分隔行上，请放到数据行再插行');
          return;
        }
        if (id === 'table-row-delete' && pos.rowIndex <= 1) {
          setNotice('表头与分隔行不能单独删，可用「删除表格」');
          return;
        }
        if (id === 'table-col-delete' && pos.cols <= 1) {
          setNotice('只剩一列了，再删就不成表格');
          return;
        }
        const r =
          id === 'table-row-above'
            ? tableInsertRow(value, caret, 'above')
            : id === 'table-row-below'
              ? tableInsertRow(value, caret, 'below')
              : id === 'table-row-delete'
                ? tableDeleteRow(value, caret)
                : id === 'table-col-left'
                  ? tableInsertColumn(value, caret, 'left')
                  : id === 'table-col-right'
                    ? tableInsertColumn(value, caret, 'right')
                    : id === 'table-col-delete'
                      ? tableDeleteColumn(value, caret)
                      : id === 'table-format'
                        ? tableFormatSource(value, caret)
                        : id === 'table-delete'
                          ? tableDelete(value, caret)
                          : null;
        if (r) applyEdit(r);
        return;
      }

      // ── 剪贴板 ──
      if (id === 'cut' || id === 'copy') {
        const text = value.slice(sel.start, sel.end);
        if (!text) {
          setNotice('先选中要操作的文字');
          return;
        }
        navigator.clipboard
          .writeText(text)
          .then(() => setNotice(id === 'cut' ? '已剪切' : '已复制'))
          .catch(() => setNotice('浏览器拒绝了剪贴板写入，请用 Ctrl+C / Ctrl+X'));
        if (id === 'cut') {
          applyEdit({ text: value.slice(0, sel.start) + value.slice(sel.end), caret: sel.start });
        }
        return;
      }
      if (id === 'paste') {
        /**
         * ⚠️ 程序**主动读剪贴板**受浏览器限制（`readText` 要剪贴板读取授权）。
         * 授权三态：granted 直接读；prompt 当场弹询问；denied 浏览器已记住拒绝，
         * 只能引导去地址栏重新允许 —— 或走 Ctrl+V（原生 paste 事件不需要授权）。
         */
        const insert = (t: string) => {
          if (!t) return;
          const s = currentSelection();
          applyEdit({
            text: value.slice(0, s.start) + t + value.slice(s.end),
            caret: s.start + t.length,
          });
        };
        const guide = (denied: boolean) =>
          setNotice(
            denied
              ? '剪贴板权限被浏览器记住为拒绝 —— 点地址栏图标允许后重试，或直接按 Ctrl+V'
              : '浏览器拦下了右键粘贴 —— 直接按 Ctrl+V（焦点已就位）',
          );
        try {
          navigator.permissions
            ?.query({ name: 'clipboard-read' as PermissionName })
            .then((st) => {
              if (st.state === 'denied') {
                guide(true);
                return undefined;
              }
              return navigator.clipboard
                .readText()
                .then(insert)
                .catch(() => guide(false));
            })
            .catch(() => guide(false));
        } catch {
          guide(false);
        }
        return;
      }

      // ── 删除这一段 ──
      if (id === 'delete-block') {
        const { start, end } = lineBoundsAt(value, caret);
        // 连同结尾换行一起删；删最后一行时改删前导换行，免得留下空行
        const from = end < value.length ? start : Math.max(0, start - 1);
        const to = end < value.length ? end + 1 : end;
        const next = value.slice(0, from) + value.slice(to);
        applyEdit({ text: next, caret: Math.min(from, next.length) });
        return;
      }

      // ── 右键命中的图片/链接：按 onContextMenu 存下的目标精确改写 ──
      if (id === 'link-open' || id === 'link-replace' || id === 'image-replace' || id === 'image-alt') {
        const mt = menu?.target;
        if (!mt) return;
        const absStart = mt.lineStart + mt.t.start;
        const absEnd = mt.lineStart + mt.t.end;
        if (id === 'link-open') {
          if (!mt.t.href) {
            setNotice('这个链接没有地址');
            return;
          }
          window.open(mt.t.href, '_blank', 'noopener,noreferrer');
          return;
        }
        if (id === 'link-replace' || id === 'image-replace') {
          const newUrl = window.prompt('新的地址（http/https 或图床链接）：', mt.t.href || 'https://');
          if (!newUrl) return;
          const syntax = (id === 'image-replace' ? '!' : '') + `[${mt.t.label}](${newUrl})`;
          applyEdit({
            text: value.slice(0, absStart) + syntax + value.slice(absEnd),
            caret: absStart + syntax.length,
          });
          return;
        }
        // image-alt
        const newAlt = window.prompt('替代文字（图片加载失败时显示）：', mt.t.label);
        if (newAlt === null) return;
        const syntax = `![${newAlt}](${mt.t.href})`;
        applyEdit({
          text: value.slice(0, absStart) + syntax + value.slice(absEnd),
          caret: absStart + syntax.length,
        });
        return;
      }

      // ── 图片：开对话框填图床地址（选中文字预填成替代文字） ──
      if (id === 'image') {
        const sel = currentSelection();
        setImageAsk({ alt: value.slice(sel.start, sel.end).trim(), sel });
        return;
      }

      // ── 代码块：复制内容 / 跳到块外 ──
      if (id === 'code-copy' || id === 'code-exit') {
        const all = value.split('\n');
        const cur = lineIndexOf(value, caret).index;
        let open = -1;
        for (let i = cur; i >= 0; i--) {
          if (/^\s*```/.test(all[i])) {
            open = i;
            break;
          }
        }
        if (open === -1) return;
        let close = -1;
        for (let i = open + 1; i < all.length; i++) {
          if (/^\s*```/.test(all[i])) {
            close = i;
            break;
          }
        }
        const lastLine = close === -1 ? all.length : close;
        if (id === 'code-copy') {
          navigator.clipboard
            .writeText(all.slice(open + 1, lastLine).join('\n'))
            .catch(() => window.alert('浏览器拒绝了剪贴板权限'));
          return;
        }
        // code-exit：把光标挪到闭栏之后另起一行
        if (close === -1) {
          const next = value + (value.endsWith('\n') ? '' : '\n');
          applyEdit({ text: next, caret: next.length });
        } else if (close + 1 < all.length) {
          applyEdit({ text: value, caret: caretAtLineEdge(value, close + 1, 'start') });
        } else {
          const next = value + '\n';
          applyEdit({ text: next, caret: next.length });
        }
        return;
      }

      // ── 选中当前行源码（「编辑源码」的落点：源码就在眼前，选中即可改） ──
      // 右键的是图片/链接时，选中它所在的那一整行（光标可能不在那一行上）
      if (id === 'source') {
        const mt = menu?.target;
        if (mt) {
          setAnchor(mt.lineStart);
          setCaret(mt.lineStart + mt.lineSrc.length);
        } else {
          const { start, end } = lineBoundsAt(value, caret);
          setAnchor(start);
          setCaret(end);
        }
        inputRef.current?.focus();
        return;
      }
    },
    [applyEdit, caret, currentSelection, insertAfterLine, menu, redo, setLinePrefix, undo, value],
  );

  /**
   * 右键：先把光标落到鼠标那一行的对应位置，再按上下文生成菜单。
   *
   * 命中图片/链接语法时开专用菜单（替换地址 / 改 alt / 新标签打开）；
   * 其余按光标上下文出通用菜单。
   *
   * @param e 鼠标事件（用 clientX/clientY 定位浮层）
   * @param li 被右键的行下标
   */
  const onContextMenu = (e: React.MouseEvent, li: number) => {
    e.preventDefault();
    const pos = caretFromPoint(li, e.clientX, e.clientY);
    const from = anchor === null ? null : Math.min(anchor, caret);
    const to = anchor === null ? null : Math.max(anchor, caret);
    /**
     * ⚠️ **右键点在已有选区内时不能动选区** —— 否则「选中 → 右键 → 复制」里
     * 选区会在菜单弹出前被清掉，复制出来是空的。点在选区之外才重新落光标。
     */
    const inside = from !== null && to !== null && pos >= from && pos <= to;
    if (!inside) {
      setCaret(pos);
      setAnchor(null);
    }
    setBubble(null);

    const line = lines[li];
    // 列号夹进行范围（pos 可能落在行尾换行上）；命中则带出「行内起止 + 行位置」供命令改写
    const col = Math.max(0, Math.min(pos - line.start, Math.max(0, line.src.length - 1)));
    const hit = inlineTargetAt(line.src, col);
    const target = hit ? { t: hit, lineStart: line.start, lineSrc: line.src } : null;
    const items = hit
      ? hit.kind === 'image'
        ? buildImageMenu()
        : buildLinkMenu()
      : buildContextMenu(getContext(value, pos), { extended: true });
    setMenu({ pos: { x: e.clientX, y: e.clientY }, items, target });
  };

  /**
   * 在某一行的字符表里反查光标下标（点左半边落在字前、右半边落在字后）。
   *
   * ⚠️ 给了 clientY 时**先锁定视觉行、再在行内按 X 找**：长段落会折行，
   * 只按 X 找最近字符会跨视觉行抓错字 —— 「点到段落末尾光标却跑到中间」就是它。
   *
   * @param li 行下标
   * @param clientX 视口横坐标
   * @param clientY 视口纵坐标（可选；给了就做视觉行过滤）
   * @returns 该行的光标绝对下标
   */
  const caretFromPoint = useCallback(
    (li: number, clientX: number, clientY?: number): number => {
      const line = lines[li];
      if (!line || !wrapRef.current) return caret;
      const wr = wrapRef.current.getBoundingClientRect();
      const map = buildCharMap(li);
      let next = line.start + line.kind.prefixLen;

      if (line.kind.type !== 'hr' && map.length) {
        const clickRel = clientX - wr.left;
        // 第一遍：找 Y 上离点击最近的可见字符，用它的上下缘圈出「视觉行」
        let bandTop = Number.NEGATIVE_INFINITY;
        let bandBottom = Number.POSITIVE_INFINITY;
        if (clientY !== undefined) {
          let bestDy = Number.POSITIVE_INFINITY;
          let bestRect: DOMRect | null = null;
          for (const c of map) {
            if (c.src === null) continue;
            const r = document.createRange();
            r.setStart(c.node, c.offset);
            r.setEnd(c.node, c.offset + 1);
            const rr = r.getBoundingClientRect();
            if (!rr.width) continue;
            const dy = Math.abs(rr.top + rr.height / 2 - clientY);
            if (dy < bestDy) {
              bestDy = dy;
              bestRect = rr;
            }
          }
          if (bestRect) {
            bandTop = bestRect.top - 2;
            bandBottom = bestRect.bottom + 2;
          }
        }
        // 第二遍：视觉行内按 X 找最近字符
        let bestDist = Number.POSITIVE_INFINITY;
        for (const c of map) {
          if (c.src === null) continue;
          const r = document.createRange();
          r.setStart(c.node, c.offset);
          r.setEnd(c.node, c.offset + 1);
          const rr = r.getBoundingClientRect();
          if (!rr.width) continue;
          if (rr.bottom < bandTop || rr.top > bandBottom) continue;
          const mid = rr.left + rr.width / 2 - wr.left;
          const d = Math.abs(mid - clickRel);
          if (d < bestDist) {
            bestDist = d;
            next = line.start + c.src + (clickRel > mid ? 1 : 0);
          }
        }
      }
      return Math.max(line.start, Math.min(next, line.start + line.src.length));
    },
    [caret, lines],
  );

  /** 点击行：把光标放到离点击点最近的那个字符旁 */
  const onLineClick = (li: number, e: React.MouseEvent) => {
    const line = lines[li];
    if (!line) return;
    /**
     * ⚠️ 刚拖拽过就**别动选区**：真实浏览器在 mouseup 之后往往还会补一个 `click`，
     * 而这里会把 `anchor` 清成 null —— 等于自己把刚选好的内容清掉。
     */
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    /**
     * ⚠️ 点击是明确的「我来重新放光标」动作 —— 顺手丢掉可能残留的组合态。
     * compositionend 丢失时，幽灵会一直画在光标上（看起来像跟着鼠标跑），
     * 用户为了摆脱它会到处点，这里复位能让它当场消失。
     */
    if (composingRef.current) {
      composingRef.current = false;
      setComposing('');
    }
    setCaret(caretFromPoint(li, e.clientX, e.clientY));
    setAnchor(e.shiftKey ? caret : null);
    inputRef.current?.focus();
  };

  /**
   * 按视口坐标反查光标下标 —— 拖拽时鼠标会**跨行**，光靠行下标不够。
   *
   * @param clientX 视口横坐标
   * @param clientY 视口纵坐标
   * @returns 光标绝对下标
   */
  const caretFromPointXY = useCallback(
    (clientX: number, clientY: number): number => {
      const els = lineEls.current;
      let li = -1;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          li = i;
          break;
        }
      }
      // 鼠标拖到编辑区外：夹到首行 / 末行，别让选区跳空
      if (li === -1) {
        const first = els[0]?.getBoundingClientRect();
        li = first && clientY < first.top ? 0 : Math.max(0, lines.length - 1);
      }
      return caretFromPoint(li, clientX, clientY);
    },
    [caretFromPoint, lines.length],
  );

  /**
   * 左键按下：开始拖拽选区。
   *
   * ⚠️ 必须 `preventDefault()` 关掉**原生选择**：否则浏览器自己也会选中一份，
   * 两套选区叠在一起，且原生那份会被任何一次重渲染抹掉。
   */
  const onLineMouseDown = (li: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = caretFromPoint(li, e.clientX, e.clientY);
    dragRef.current = true;
    draggedRef.current = false;
    setAnchor(pos);
    setCaret(pos);
    inputRef.current?.focus();
  };

  /** 拖拽中：跟着鼠标更新光标那一端（锚点不动） */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      draggedRef.current = true;
      setCaret(caretFromPointXY(e.clientX, e.clientY));
    };
    const onUp = () => {
      dragRef.current = false;
      // 没真的拖动时 anchor === caret，语义上就是「没有选区」，无需额外清理
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [caretFromPointXY]);

  /**
   * 键盘处理。所有按键在这里翻译成「文本编辑原语」的调用。
   *
   * @param e 来自隐藏 textarea 的键盘事件
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    /**
     * ⚠️ **Esc = 用户明确要取消组合**，必须记在组合判定**之前** ——
     * 组合期间的 Esc 会带着 `isComposing: true` 进来，放在后面就永远读不到。
     * 记下来交给 onCompositionEnd：取消就什么都不插入。
     * ⚠️ Esc 时浏览器**照样派发 compositionend**，不额外标记就会「取消反而填了字」。
     */
    if (e.key === 'Escape' && composingRef.current) cancelPending.current = true;

    /**
     * ⚠️ 输入法组合期间不处理任何按键：那是 IME 的中间状态，
     * 插手会让候选词错乱甚至丢字。让 compositionend 统一提交。
     *
     * ⚠️ 判据**只能用浏览器给的 `isComposing`**，不能用自己的 composing state：
     * compositionend 一旦丢失（典型场景：输入过程中窗口失焦），那个 state 会永久为真，
     * 把退格/回车/方向键**全部挡死**。
     */
    if (e.nativeEvent.isComposing) return;

    /**
     * ⚠️ 自愈：浏览器说「不在组合中」，我们却还挂着预编辑串 → compositionend 丢了。
     * 先复位再处理本次按键，否则那个幽灵会一直留在屏幕上（删不掉、也不消失）。
     */
    if (composingRef.current) {
      composingRef.current = false;
      setComposing('');
    }

    // Esc：关掉查找面板（焦点在编辑器里时；焦点在面板输入框里由面板自己处理）
    if (e.key === 'Escape' && find?.open) {
      e.preventDefault();
      setFind(null);
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    // ── Alt+Shift+5：删除线（Typora 官方快捷键；Shift+5 在部分键盘上是 %） ──
    if (e.altKey && e.shiftKey && (e.key === '5' || e.key === '%')) {
      e.preventDefault();
      runCommand('strike');
      return;
    }

    if (mod) {
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }
      // ── 撤销 / 重做 ──
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
      /**
       * ⚠️ 剪贴板**不能**在这里 preventDefault —— 拦掉之后浏览器的原生
       * copy / cut / paste 事件就不会派发，而那条路才是不需要任何权限的。
       * 实际读写都在 textarea 的 onCopy / onCut / onPaste 上做。
       */

      /**
       * Typora 官方快捷键（support.typora.io/Shortcut-Keys）。
       * ⚠️ Shift 变体必须排在下面的普通变体之前 —— Ctrl+Shift+K 不能落进 Ctrl+K。
       */
      if (e.shiftKey && k === 'k') {
        e.preventDefault();
        runCommand('codeblock');
        return;
      }
      if (e.shiftKey && k === 'q') {
        e.preventDefault();
        runCommand('quote');
        return;
      }
      // Shift+[ / Shift+] 在多数键盘上是 { / }，两种都收
      if (e.shiftKey && (k === '[' || k === '{')) {
        e.preventDefault();
        runCommand('ordered');
        return;
      }
      if (e.shiftKey && (k === ']' || k === '}')) {
        e.preventDefault();
        runCommand('bullet');
        return;
      }
      if (e.shiftKey && k === 'i') {
        e.preventDefault();
        runCommand('image');
        return;
      }
      if (e.shiftKey && (k === '`' || k === '~')) {
        e.preventDefault();
        runCommand('code');
        return;
      }

      // 标题档位 Ctrl+1..6 / 正文 Ctrl+0
      if (/^[1-6]$/.test(k) && !e.shiftKey) {
        e.preventDefault();
        runCommand('h' + k);
        return;
      }
      if (k === '0' && !e.shiftKey) {
        e.preventDefault();
        runCommand('normal');
        return;
      }
      if (k === 't' && !e.shiftKey) {
        e.preventDefault();
        runCommand('table');
        return;
      }
      if (k === 'a' && !e.shiftKey) {
        e.preventDefault();
        runCommand('select-all');
        return;
      }
      if (k === '\\') {
        e.preventDefault();
        runCommand('clear-format');
        return;
      }

      // ── 查找 / 替换（Typora 官方快捷键） ──
      if (k === 'f' && !e.shiftKey) {
        e.preventDefault();
        openFind(false);
        return;
      }
      if (k === 'h' && !e.shiftKey) {
        e.preventDefault();
        openFind(true);
        return;
      }

      // ── 缩进 / 反缩进（Ctrl+[ / Ctrl+]）与升降标题级别（Ctrl+= / Ctrl+-） ──
      if (k === '[') {
        e.preventDefault();
        applyEdit(indentLines(value, currentSelection(), -1));
        return;
      }
      if (k === ']') {
        e.preventDefault();
        applyEdit(indentLines(value, currentSelection(), 1));
        return;
      }
      if (k === '=') {
        e.preventDefault();
        applyEdit(changeHeadingLevel(value, currentSelection(), 1));
        return;
      }
      if (k === '-') {
        e.preventDefault();
        applyEdit(changeHeadingLevel(value, currentSelection(), -1));
        return;
      }

      // ── 选中词 / 删除词（Ctrl+D / Ctrl+Shift+D） ──
      if (k === 'd') {
        e.preventDefault();
        const r = wordRangeAt(value, caret);
        if (e.shiftKey) {
          if (r.end > r.start) {
            applyEdit({ text: value.slice(0, r.start) + value.slice(r.end), caret: r.start }, 'erase');
          }
        } else {
          setAnchor(r.start);
          setCaret(r.end);
        }
        return;
      }

      // ── 文首 / 文末 / 滚到光标（Ctrl+Home / Ctrl+End / Ctrl+J） ──
      if (k === 'home') {
        e.preventDefault();
        setAnchor(null);
        setCaret(0);
        return;
      }
      if (k === 'end') {
        e.preventDefault();
        setAnchor(null);
        setCaret(value.length);
        return;
      }
      if (k === 'j') {
        e.preventDefault();
        lineEls.current[lineIndexOf(value, caret).index]?.scrollIntoView({ block: 'center' });
        return;
      }

      // 表格内：Ctrl+E 选单元格 / Ctrl+L 选行 / Ctrl+Shift+Backspace 删行
      if (k === 'e' || k === 'l' || (k === 'backspace' && e.shiftKey)) {
        const p = tablePosAt(value, caret);
        if (p) {
          e.preventDefault();
          const base = p.lineStarts[p.rowIndex];
          if (k === 'e') {
            const range = tableCellRanges(p.lines[p.rowIndex])[p.colIndex];
            if (range) {
              setAnchor(base + range.from);
              setCaret(base + range.to);
            }
          } else if (k === 'l') {
            setAnchor(base);
            setCaret(base + p.lines[p.rowIndex].length);
          } else {
            runCommand('table-row-delete');
          }
          return;
        }
      }

      const shortcutOf: Record<string, string> = { b: 'bold', i: 'italic', k: 'link', '`': 'code' };
      const cmd = shortcutOf[k];
      if (cmd) {
        e.preventDefault();
        runCommand(cmd);
        return;
      }
    }

    // 选区：有 anchor 时，Backspace/Delete 删整段选区
    const hasSel = anchor !== null && anchor !== caret;
    const selStart = hasSel ? Math.min(anchor!, caret) : caret;
    const selEnd = hasSel ? Math.max(anchor!, caret) : caret;

    switch (e.key) {
      case 'Backspace': {
        e.preventDefault();
        if (hasSel) {
          applyEdit({ text: value.slice(0, selStart) + value.slice(selEnd), caret: selStart }, 'erase');
        } else {
          applyEdit(backspace(value, caret), 'erase');
        }
        return;
      }
      case 'Delete': {
        e.preventDefault();
        if (hasSel) {
          applyEdit({ text: value.slice(0, selStart) + value.slice(selEnd), caret: selStart }, 'erase');
        } else {
          applyEdit(del(value, caret), 'erase');
        }
        return;
      }
      case 'Enter': {
        e.preventDefault();
        // Shift+Enter：段内硬换行（两个空格 + 换行）—— 不走列表续写，发布页会渲染成真换行
        if (e.shiftKey) {
          const base = hasSel ? value.slice(0, selStart) + value.slice(selEnd) : value;
          const pos = hasSel ? selStart : caret;
          applyEdit(softBreak(base, pos));
          return;
        }
        if (hasSel) {
          const head = value.slice(0, selStart) + '\n';
          applyEdit({ text: head + value.slice(selEnd), caret: head.length });
        } else {
          applyEdit(enter(value, caret));
        }
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const next = moveChar(value, hasSel && !e.shiftKey ? selStart : caret, hasSel && !e.shiftKey ? dir : dir);
        setCaret(next);
        if (e.shiftKey) {
          if (anchor === null) setAnchor(caret);
        } else {
          setAnchor(null);
        }
        return;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (hasSel && !e.shiftKey) {
          setCaret(dir === -1 ? selStart : selEnd);
          setAnchor(null);
          return;
        }
        const next = moveLine(value, caret, dir as -1 | 1);
        setCaret(next);
        if (e.shiftKey) {
          if (anchor === null) setAnchor(caret);
        } else {
          setAnchor(null);
        }
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const { index } = lineIndexOf(value, caret);
        const next = caretAtLineEdge(value, index, e.key === 'Home' ? 'start' : 'end');
        setCaret(next);
        if (e.shiftKey) {
          if (anchor === null) setAnchor(caret);
        } else {
          setAnchor(null);
        }
        return;
      }
      default:
        break;
    }

    // 普通字符由 onChange（input 事件）统一处理，这里不插手
  };

  /**
   * 隐藏 textarea 的 input 事件 —— 普通字符（英文、数字、粘贴）输入走这里。
   *
   * ⚠️ **真实事件顺序（标准流程）**：
   *   compositionstart →（组合期：拼音每变一次派发一次 input）→ compositionend（带最终汉字）→ input（同一文本再派发一次）
   *
   * 由此有两类 input 必须丢弃，否则上屏会出错：
   *   ① **组合期的 input**（拼音中间态）—— 不丢的话「renggong」这些拼音会被当正文插进去；
   *   ② **compositionend 之后那次尾巴 input**（与上屏文本重复）—— 不丢的话「人工智能」会插两遍。
   * 文本一律由 compositionend 统一提交。
   *
   * ⚠️ 判据必须用 **ref**（同步），不能用 state —— input 是同步紧随派发的，读 state 拿到旧值。
   *
   * @param e 事件
   */
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    /** 浏览器对本次 input 的「是否处于组合中」表态；合成事件里该字段不存在（undefined） */
    const composingNow = (e.nativeEvent as Partial<InputEvent>).isComposing;

    /**
     * ⚠️ 自愈：浏览器**明确说**「已不在组合中」，我们却还挂着 composingRef
     * —— 即 compositionend 丢了（输入中窗口失焦、切输入法、IME 异常）。
     *
     * 不在这里复位就会**永久卡死**：预编辑串幽灵留在屏幕上删不掉、
     * onKeyDown 一直提前返回、后续 input 全被丢弃。
     *
     * ⚠️ 只在 `=== false` 时复位：`undefined` 表示浏览器没表态（合成事件），
     * 此时复位会让「组合期的 input」漏进来、拼音变成正文。
     */
    if (composingNow === false && composingRef.current) {
      composingRef.current = false;
      setComposing('');
    }

    /**
     * ⚠️⚠️ **组合期间绝对不许碰这个 textarea**，连 `value = ''` 都不行。
     * 输入法的预编辑串就存在控件里，改它的值会打断输入法内部状态
     * —— 表现为拼音显示不出来、候选词窗错位、上屏多一个字。
     *
     * 判据两条并用：浏览器表态在组合中（权威，但个别输入法会漏报）＋ 自己的 composingRef。
     */
    if (composingNow === true || composingRef.current) return;

    // 非组合期才清空：这个 textarea 只是「键盘通道」，不保存内容
    const typed = ta.value;
    ta.value = '';

    /**
     * 丢弃「compositionend 之后紧跟的那次尾巴 input」。
     * 判据是**内容与刚上屏的文本相同** —— 不依赖事件时序，
     * Esc 取消（没有尾巴 input）时也不会残留、不误伤后续键入。
     * 消费后立刻清空，保证只吃掉紧跟的那一次。
     */
    if (typed && typed === justComposed.current) {
      justComposed.current = '';
      return;
    }
    if (!typed) return;

    // 有选区则先删掉选区再插入
    const hasSel = anchor !== null && anchor !== caret;
    const selStart = hasSel ? Math.min(anchor!, caret) : caret;
    const selEnd = hasSel ? Math.max(anchor!, caret) : caret;
    const base = hasSel ? value.slice(0, selStart) + value.slice(selEnd) : value;
    const pos = hasSel ? selStart : caret;
    applyEdit(insertAt(base, pos, typed), 'input');
  };

  /**
   * IME 开始组合。
   *
   * ⚠️ 必须**同步**置 composingRef —— 组合期间浏览器会派发多次 input（每次拼音变化一次），
   * 那些 input 全部要丢弃，否则拼音字母会被当成正文插进去。
   * 用 ref 而不是 composing state：input 紧随其后同步派发，读 state 拿到的是旧值。
   */
  const onCompositionStart = () => {
    composingRef.current = true;
    cancelPending.current = false; // 新一次组合，清掉上一轮的取消标记
    setComposing('\u200b'); // 占位，标记「正在输入」
  };

  /** IME 更新预编辑串 —— 把候选串显示在光标位置 */
  const onCompositionUpdate = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    setComposing(e.data || '');
  };

  /**
   * IME 提交 —— 把最终结果插进文本。
   *
   * ⚠️ 标准事件顺序是 compositionstart →（组合期间多次 input）→ **compositionend** → **最后一次 input**。
   * compositionend 先到、携带最终汉字；紧随其后浏览器还会为同一段文本再派发一次 input。
   * 两处都插就会**重复上屏**。
   *
   * ⚠️⚠️ **「到底提交了什么」要两条信号合起来判断**：
   *   ① 用户按了 Esc（`cancelPending`）→ 这次是**取消**，一个字都不许插；
   *   ② 否则看 textarea 的当前值 —— 取消时组合文本已被移出控件（值为空），上屏时控件里就是最终结果。
   * 不能只用 `e.data`：**Esc 取消时浏览器照样派发 compositionend，`e.data` 可能仍是那串拼音**
   * —— 拿它插入就会「取消反而填了字」。
   */
  const onCompositionEnd = (_e: React.CompositionEvent<HTMLTextAreaElement>) => {
    setComposing('');
    composingRef.current = false;
    const ta = inputRef.current;
    const committed = cancelPending.current ? '' : ta?.value ?? '';
    cancelPending.current = false;
    if (ta) ta.value = '';
    // 标记「刚提交的文本」；onInput 只丢弃与它内容相同的那一次
    justComposed.current = committed;
    if (!committed) return;
    applyEdit(insertAt(value, caret, committed));
  };

  /** 预编辑串（`\u200b` 是「刚开始组合」的占位，不显示） */
  const preedit = composing && composing !== '\u200b' ? composing : '';

  /**
   * 拖进来的文件：.md 整体导入（走 onImport 回调），图片插占位语法。
   *
   * @param file 用户拖进来的文件
   */
  const handleDrop = useCallback(
    async (file: File) => {
      if (MD_FILE_RE.test(file.name) && file.type !== 'image/svg+xml') {
        const parsed = parseMarkdownFile(await file.text(), file.name.replace(/\.[^.]+$/, ''));
        if (onImport) {
          onImport(parsed);
          setNotice(`已从 ${file.name} 载入`);
        } else {
          setNotice('这个页面没有接入整体导入，.md 文件已忽略');
        }
        return;
      }
      if (IMG_FILE_RE.test(file.name)) {
        // 站内不存图片文件，只能收链接。拖入的意图明确，直接开对话框，别只丢一句提示
        setImageAsk({
          alt: file.name.replace(/\.[^.]+$/, ''),
          sel: currentSelection(),
          hint: `${file.name} 不会被保存到站内。先把这张图上传到图床，再把链接填在下面。`,
        });
        return;
      }
      setNotice('只认 .md 文本文件和图片文件');
    },
    [applyEdit, currentSelection, onImport, value],
  );

  /** 某一行的查找高亮区间（行内列号）；没开查找或本行没有命中时 null */
  const highlightFor = (l: RenderLine): { start: number; end: number; current: boolean }[] | null => {
    if (!find?.open || !find.query || matches.length === 0) return null;
    const out: { start: number; end: number; current: boolean }[] = [];
    for (let k = 0; k < matches.length; k++) {
      const at = matches[k];
      // 命中跨行时只高亮落在本行里的那一段
      if (at < l.start || at >= l.start + l.src.length) continue;
      out.push({
        start: at - l.start,
        end: Math.min(l.src.length, at - l.start + find.query.length),
        current: k === currentMatch,
      });
    }
    return out.length ? out : null;
  };

  return (
    <div
      className={`relative flex flex-col rounded-lg border bg-background transition-colors ${
        dragging ? 'border-accent' : 'border-border'
      } ${className}`}
      onMouseDown={() => inputRef.current?.focus()}
      onDragOver={(e) => {
        // 必须 preventDefault，否则浏览器会用默认行为「打开这个文件」
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0];
        if (!f) return;
        e.preventDefault();
        setDragging(false);
        // 一次拖多个文件时只取第一个，避免把正文替换成一大堆内容
        void handleDrop(f);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-accent/[0.06] text-sm font-semibold text-accent">
          松手即可导入
        </div>
      )}
      {/*
        ⚠️ `select-none` 是必须的：选区由编辑器**自己画**（见 renderSegs 的 bg-accent/25），
        原生选区会和它叠在一起，且原生那份会被任何一次重渲染抹掉。
      */}
      <div ref={wrapRef} className="relative min-h-0 flex-auto select-none px-5 py-4 text-base leading-[1.6]">
        {lines.map((l, i) => {
          const isTableRow = l.kind.type === 'tableHead' || l.kind.type === 'tableBody';
          // 表格块的最后一行才补 border-b（表头下面由表体行的 border-t 顶上，不会双线）
          const nextKind = lines[i + 1]?.kind.type;
          const isTableLast =
            isTableRow && nextKind !== 'tableBody' && nextKind !== 'tableSep';
          /* 整行只有一个图片语法时渲染大图；行内混排仍用占位符，避免破坏字符测量 */
          const imgSeg =
            l.kind.type === 'p' &&
            l.segs.length === 1 &&
            l.segs[0].kind === 'link' &&
            !!l.segs[0].href &&
            /^\s*!\[/.test(l.src)
              ? l.segs[0]
              : null;
          const segNodes = renderSegs(
            l.segs,
            anchor !== null && anchor !== caret
              ? { start: Math.min(anchor, caret) - l.start, end: Math.max(anchor, caret) - l.start }
              : null,
            i === caretLine ? caret - l.start : -1,
            preedit,
            highlightFor(l),
          );
          return (
          <div
            key={i}
            ref={(el) => {
              lineEls.current[i] = el;
            }}
            onClick={(e) => onLineClick(i, e)}
            onMouseDown={(e) => onLineMouseDown(i, e)}
            onContextMenu={(e) => onContextMenu(e, i)}
            className={`cursor-text ${
              l.kind.type === 'tableSep'
                ? 'hidden'
                : isTableRow
                  ? `grid border-border border-l border-r border-t ${isTableLast ? 'border-b' : ''} ${
                      l.kind.type === 'tableHead' ? 'bg-secondary/40 font-bold' : ''
                    }`
                  : (LINE_CLS[l.kind.type] ?? '')
            }`}
            style={
              isTableRow
                ? { gridTemplateColumns: `repeat(${l.tableCols ?? 1}, minmax(0, 1fr))` }
                : l.kind.type === 'ul' || l.kind.type === 'ol'
                  ? /* 嵌套列表按源码缩进加左内边距，否则所有层级都画在同一列 */
                    { paddingLeft: `${1.4 + (l.kind.indent ?? 0) * 0.6}em` }
                  : undefined
            }
          >
            {l.kind.type === 'blank' ? (
              /* 空行 = 段落间距（Typora 0.8em），不是一整行高 —— 整行高会让每个块之间都多出一条空白 */
              <span className="inline-block h-[0.8em] w-full" />
            ) : l.kind.type === 'hr' || l.kind.type === 'fence' ? (
              <span className="text-muted-foreground/40">{l.src || '\u00a0'}</span>
            ) : isTableRow ? (
              /* 表格行：按单元格边界切片段渲染，竖线本身不出现在 DOM 里 */
              tableCellRanges(l.src).map((r, ci) => (
                <div
                  key={ci}
                  className="border-r border-border px-3 py-1.5 whitespace-pre-wrap last:border-r-0"
                >
                  {sliceSegs(l.segs, r.from, r.to).map((p, k) => (
                    <span key={k} className={p.text.startsWith('🖼') ? 'md-img-token' : SEG_CLS[p.kind]}>
                      {p.text}
                    </span>
                  ))}
                </div>
              ))
            ) : imgSeg ? (
              <span className="block py-1">
                <img
                  src={imgSeg.href}
                  alt=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="max-h-[360px] w-auto max-w-full rounded-lg border border-border"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="mt-1 block text-[12px] text-muted-foreground/60">{segNodes}</span>
              </span>
            ) : (
              <>
                {/* 列表行：把 `- ` 换成真圆点 / 序号，并制造缩进 */}
                {l.kind.type === 'ul' && <span className="mr-2 text-muted-foreground">•</span>}
                {l.kind.type === 'ol' && (
                  <span className="mr-2 text-muted-foreground">{l.kind.marker}.</span>
                )}
                {/* 其余块类型：前缀（如 `## `、`> `）虚化显示 —— 保留 Markdown 语法感 */}
                {l.prefixText && l.kind.type !== 'ul' && l.kind.type !== 'ol' && (
                  <span className="text-muted-foreground/40">{l.prefixText}</span>
                )}
                {/* 预编辑串内联插在光标处、选区就地加底色（都由 renderSegs 切分） */}
                {segNodes}
              </>
            )}
          </div>
          );
        })}

        {caretBox && (
          <div
            className={`pointer-events-none absolute w-[2px] bg-accent ${
              focused && !composing ? 'animate-pulse' : ''
            }`}
            style={{ left: caretBox.x, top: caretBox.y, height: caretBox.h }}
          />
        )}

        {/* 输入通道：不可见但可聚焦。IME 必须挂在真实控件上，不能省。 */}
        <textarea
          ref={inputRef}
          onKeyDown={onKeyDown}
          onInput={onInput}
          onCompositionStart={onCompositionStart}
          onCompositionUpdate={onCompositionUpdate}
          onCompositionEnd={onCompositionEnd}
          /**
           * ⚠️ 剪贴板走**原生事件**（`e.clipboardData`），这条路不需要任何权限。
           * `navigator.clipboard.readText()` 要求文档聚焦 + 用户授权，
           * 会报 `NotAllowedError: Document is not focused`；原生事件由用户按键触发，浏览器直接放行。
           */
          onCopy={(e) => {
            const sel = currentSelection();
            const text = value.slice(sel.start, sel.end);
            if (!text) return;
            e.preventDefault();
            e.clipboardData.setData('text/plain', text);
            setNotice('已复制');
          }}
          onCut={(e) => {
            const sel = currentSelection();
            const text = value.slice(sel.start, sel.end);
            if (!text) return;
            e.preventDefault();
            e.clipboardData.setData('text/plain', text);
            applyEdit({ text: value.slice(0, sel.start) + value.slice(sel.end), caret: sel.start });
          }}
          onPaste={(e) => {
            /* 粘贴进来的文本可能带 CRLF；行尾的 \r 会让字符列号整体错位 */
            const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
            // 剪贴板里没有纯文本（多半是截图/图片）—— 文本编辑器只收文字，明说，别静默吞掉
            if (!text) {
              e.preventDefault();
              if (e.clipboardData.files.length > 0) {
                // 截图 / 复制的图片：站内存不下文件，但意图明确，开对话框让用户填图床地址
                setImageAsk({
                  alt: '',
                  sel: currentSelection(),
                  hint: '剪贴板里是图片，站内不保存图片文件。先把这张图上传到图床，再把链接粘在下面。',
                });
                return;
              }
              setNotice('剪贴板里没有可粘贴的文字');
              return;
            }
            e.preventDefault();
            const sel = currentSelection();
            applyEdit({
              text: value.slice(0, sel.start) + text + value.slice(sel.end),
              caret: sel.start + text.length,
            });
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            /**
             * ⚠️ 焦点离开时不可能还处于组合中 —— 清掉残留态。
             * 输入过程中窗口失焦（切窗口、按截图快捷键）会让 compositionend 不派发，
             * 不清就会留下删不掉的预编辑串幽灵。
             */
            composingRef.current = false;
            setComposing('');
          }}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="编辑器输入"
          className="absolute w-px resize-none border-0 bg-transparent p-0 text-transparent outline-none"
          style={{ caretColor: 'transparent', opacity: 0.01, height: 20, left: 0, top: 0 }}
        />
      </div>

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        下标 <span className="font-mono text-accent">{caret}</span>
        {'　'}
        {caretLine >= 0 ? `第 ${caretLine + 1} 行 / 共 ${lines.length} 行` : '未定位'}
        {anchor !== null && <span className="ml-2 text-warm">已选区</span>}
        {composing && composing !== '\u200b' && <span className="ml-2 text-accent">输入中：{composing}</span>}
        {notice && <span className="ml-2 text-accent">{notice}</span>}
      </div>

      {/* 浮层统一 Portal 到 body，免得被编辑区的滚动/裁切影响 */}
      {find?.open && (
        <FindPanel
          state={find}
          total={matches.length}
          onState={(patch) => setFind((f) => (f ? { ...f, ...patch } : f))}
          onNext={() => stepMatch(1)}
          onPrev={() => stepMatch(-1)}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => {
            setFind(null);
            inputRef.current?.focus();
          }}
        />
      )}
      {tableAsk && (
        <TableInsertDialog
          onCancel={() => setTableAsk(false)}
          onConfirm={(cols, rows) => {
            setTableAsk(false);
            insertAfterLine(makeTableSnippet(cols, rows));
          }}
        />
      )}
      {imageAsk && (
        <ImageInsertDialog
          initialAlt={imageAsk.alt}
          hint={imageAsk.hint}
          onCancel={() => {
            setImageAsk(null);
            inputRef.current?.focus();
          }}
          onConfirm={(src, alt) => {
            const sel = imageAsk.sel;
            setImageAsk(null);
            applyEdit(insertImage(value, sel, src, alt));
            // 对话框是 Portal，关掉后焦点不会自己回到隐藏输入框
            inputRef.current?.focus();
          }}
        />
      )}
      {menu && <ContextMenu pos={menu.pos} items={menu.items} onRun={runCommand} onClose={() => setMenu(null)} />}
      {bubble && (
        <FormatBubble
          pos={bubble}
          commands={INLINE_COMMANDS}
          onRun={runCommand}
          onClose={() => setBubble(null)}
        />
      )}
    </div>
  );
}

/** 各块类型的行样式 */
const LINE_CLS: Record<string, string> = {
  // 数值取自 Typora 默认主题（本机 resources/app/style/themes/github.css 实读）：
  // 标题 margin 1rem、line-height 1.4（h1 1.2 / h2 1.225 / h3 1.43）；
  // h1 2.25em、h2 1.75em、h3 1.5em、h4 1.25em、h5/h6 1em；h1/h2 有 padding-bottom .3em + 下边框
  h1: 'text-[2.25rem] font-bold leading-[1.2] mt-1 mb-1 pb-[0.3em] border-b border-border',
  h2: 'text-[1.75rem] font-bold leading-[1.225] mt-1 mb-1 pb-[0.3em] border-b border-border',
  h3: 'text-[1.5rem] font-bold leading-[1.43] mt-1 mb-1',
  h4: 'text-[1.25rem] font-bold leading-[1.4] mt-1 mb-1',
  h5: 'text-[1rem] font-bold leading-[1.4] mt-1 mb-1',
  h6: 'text-[1rem] font-bold leading-[1.4] mt-1 mb-1 text-muted-foreground',
  quote: 'border-l-[3px] border-accent/50 pl-4 text-muted-foreground',
  ul: 'pl-[1.4em] -indent-[1.4em]',
  ol: 'pl-[1.4em] -indent-[1.4em]',
  hr: 'border-t border-border my-4 h-0 leading-none',
  code: 'font-mono text-sm',
  p: '',
  // 空行按 Typora 的段落间距 0.8em 渲染；leading-[0] 压掉行盒，否则 strut 会撑回整行高
  blank: 'leading-[0]',
};

/** 行内样式 */
const SEG_CLS: Record<InlineSeg['kind'], string> = {
  plain: '',
  strong: 'font-bold',
  em: 'italic',
  code: 'font-mono text-[0.9em] bg-secondary border border-border rounded-[3px] px-1',
  del: 'line-through opacity-60',
  link: 'text-accent underline underline-offset-2',
  url: 'text-accent underline underline-offset-2',
};

/**
 * 预编辑串样式：下划线，与系统输入法视觉一致。
 *
 * ⚠️ `md-preedit` 不是 Tailwind 类，是给 `buildCharMap` 认的**标记类** ——
 * 预编辑串混在行内，不排除掉会被当成正文、把列号游标带偏。
 */
const PREEDIT_CLS = 'md-preedit border-b-2 border-accent text-foreground';

/**
 * 把一行的片段在若干列号处切开。
 *
 * 选区边界与光标位置都要靠它切 —— 切完再渲染，就不必为每种情况各写一套逻辑。
 *
 * @param segs 该行片段（`srcStart` 已含前缀长度）
 * @param cuts 切开处的行内列号（越界的会被自动忽略）
 * @returns 切好的小片，`start` 是它的行内起始列号
 */
function splitSegsAt(
  segs: InlineSeg[],
  cuts: number[],
): { kind: InlineSeg['kind']; text: string; start: number }[] {
  const marks = [...new Set(cuts)].sort((a, b) => a - b);
  const out: { kind: InlineSeg['kind']; text: string; start: number }[] = [];
  for (const s of segs) {
    const s0 = s.srcStart;
    const s1 = s.srcStart + s.text.length;
    const inner = marks.filter((c) => c > s0 && c < s1);
    let prev = s0;
    for (const c of [...inner, s1]) {
      out.push({ kind: s.kind, text: s.text.slice(prev - s0, c - s0), start: prev });
      prev = c;
    }
  }
  return out;
}

/**
 * 渲染一行的可见片段：切出选区高亮与查找命中高亮，并把输入法预编辑串**内联**插在光标处。
 *
 * ⚠️ 预编辑串必须内联插入、把后面的字推开，**不能绝对定位盖上去** —— 盖上去会压住后面的文字。
 *
 * @param segs 该行的可见片段（`srcStart` 已含前缀长度）
 * @param sel 选区在**本行内**的列号范围；null = 本行没有选中内容
 * @param caretCol 光标在本行的列号；负数表示光标不在本行
 * @param preedit 预编辑串；空串表示当前没有组合
 * @param hl 查找命中在**本行内**的列号范围（current = 当前那一个）；null = 没有命中
 * @returns React 节点数组
 */
function renderSegs(
  segs: InlineSeg[],
  sel: { start: number; end: number } | null,
  caretCol: number,
  preedit: string,
  hl?: { start: number; end: number; current: boolean }[] | null,
): React.ReactNode[] {
  const cuts: number[] = [];
  if (sel) cuts.push(sel.start, sel.end);
  if (preedit && caretCol >= 0) cuts.push(caretCol);
  if (hl) for (const h of hl) cuts.push(h.start, h.end);

  const pieces = splitSegsAt(segs, cuts);
  const out: React.ReactNode[] = [];
  let placed = false;

  pieces.forEach((p, k) => {
    // 光标落在本片之前 → 预编辑串插在这里
    if (!placed && preedit && caretCol >= 0 && p.start >= caretCol) {
      out.push(
        <span key={`pe${k}`} className={PREEDIT_CLS}>
          {preedit}
        </span>,
      );
      placed = true;
    }
    const selected = !!sel && p.start >= sel.start && p.start < sel.end;
    const hit = hl?.find((h) => p.start >= h.start && p.start < h.end);
    const base = p.text.startsWith('🖼') ? 'md-img-token' : SEG_CLS[p.kind];
    const mark = hit ? (hit.current ? ' bg-accent/30' : ' bg-warm/25') : '';
    out.push(
      <span key={k} className={base + mark + (selected ? ' bg-accent/25' : '')}>
        {p.text}
      </span>,
    );
  });

  // 光标在该行末尾（超出所有片段）→ 补在最后
  if (!placed && preedit && caretCol >= 0) {
    out.push(
      <span key="pe-end" className={PREEDIT_CLS}>
        {preedit}
      </span>,
    );
  }

  return out;
}
