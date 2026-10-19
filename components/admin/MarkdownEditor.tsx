'use client';

/**
 * 单栏 Markdown 编辑器：光标所在的那块显示源码，其余块显示渲染结果。
 *
 * 职责：把键盘 / 鼠标 / 拖拽事件翻译成 md-commands 的调用，再把结果写回整篇 Markdown。
 * 分块渲染走 /api/admin/render（与发布页共用 lib/markdown.ts，保证预览一致）。
 *
 * 已知限制：块边界变化时该块先退回源码纯文本；引用式链接跨块解析不到；
 * 点渲染结果进入编辑时光标落在该块末尾。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  autoFormat,
  getContext,
  insertImage,
  insertLink,
  lineBoundsAt,
  snippetInnerOffset,
  SNIPPETS,
  tableAddColumn,
  tableAddRow,
  tablePipeNewline,
  unwrapSelection,
  wrapSelection,
  type Selection,
} from '@/lib/md-commands';
import {
  buildContextMenu,
  buildImageMenu,
  buildLinkMenu,
  ContextMenu,
  FormatBubble,
  INLINE_COMMANDS,
  type MdMenuItem,
  type FloatPos,
} from './MarkdownFloats';
import { parseMarkdownFile, type ParsedMarkdownFile } from '@/lib/parse-md-file';

/** 一块：源文 + 它在整篇里的起始字符偏移。渲染结果单独存（见 rendered） */
interface Block {
  src: string;
  /** 这一块第一个字符在整篇里的下标。编辑后要靠它把光标映射回正确的块 */
  start: number;
}

/** 预览请求的防抖时长（ms）。太长打字时会觉得结果「慢半拍」，太短会在打字时发一堆请求 */
const DEBOUNCE_MS = 160;

/** 列表项：`- x` / `* x` / `+ x` / `1. x` / `1) x` */
const ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** 代码围栏：``` 或 ~~~（三个以上） */
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/** 可接受的 Markdown 文件扩展名 */
const MD_FILE_RE = /\.(md|markdown|mdx|txt)$/i;

/** 可接受的图片扩展名（拖进来的图片只插占位语法，不做上传） */
const IMG_FILE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/**
 * 把整篇 Markdown 切成块。
 *
 * 切分规则：
 *  - 空行分界；**分界空行不进块**（块之间允许存在「不属于任何块的空行」）
 *  - **块末尾的那一个换行留在块里** —— 光标在段末回车后才能停在新行上。
 *    若不留，回车产生的 `\n` 会落进块间缝隙，光标无处可落，看起来像「跳回原处 / 跳到文末」。
 *  - 代码围栏内部不切；相邻两个列表项之间的空行不切（松散列表）
 *
 * @param src 整篇 Markdown
 * @returns 每块的源文与起始偏移；整篇为空时返回一个空块
 */
function splitBlocks(src: string): Block[] {
  // 空文档也要有一块，否则编辑器里没有任何可点的东西
  if (src.trim() === '') return [{ src: '', start: 0 }];

  const lines = src.split('\n');
  const out: Block[] = [];
  /** 当前正在攒的块 */
  let buf: string[] = [];
  /** 当前块的起始偏移 */
  let bufStart = 0;
  /** 当前行的起始偏移 */
  let lineStart = 0;
  /** 当前所处的代码围栏字符（null = 不在围栏里） */
  let fence: string | null = null;

  /**
   * 收尾当前块：空块丢弃；**末尾补一个换行**（即上一行之后的那个分隔符归本块）。
   * 补的是 `buf.join('\n') + '\n'`，与原文里「本块最后一行 + 它的换行符」完全对齐。
   */
  const flush = () => {
    if (buf.length === 0) return;
    out.push({ src: buf.join('\n') + '\n', start: bufStart });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLineStart = lineStart + line.length + 1;

    // 必须先更新围栏状态再判空行，否则围栏内的空行会被当成分界
    const fm = FENCE_RE.exec(line);
    if (fm) {
      if (fence === null) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
    }

    if (line.trim() === '' && fence === null) {
      // 前后各找一行非空行，都是列表项则保留这个空行（松散列表）
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = j < lines.length ? lines[j] : '';
      const prev = [...buf].reverse().find((l) => l.trim() !== '') ?? '';
      if (buf.length > 0 && ITEM_RE.test(prev) && ITEM_RE.test(next)) {
        buf.push(line);
      } else {
        flush();
      }
      lineStart = nextLineStart;
      continue;
    }

    // 攒下这一行；空 buf 时记下块起点
    if (buf.length === 0) bufStart = lineStart;
    buf.push(line);
    lineStart = nextLineStart;
  }

  flush();

  // 末块原本不带换行（文件末尾没有换行符），去掉刚补上的那个，避免凭空多出一个空行
  const last = out[out.length - 1];
  if (last && src[src.length - 1] !== '\n') last.src = last.src.slice(0, -1);

  return out;
}

/**
 * 单栏编辑器本体。对外接口与原来的两栏版本一致（value / onChange）。
 *
 * @param props.value 整篇 Markdown
 * @param props.onChange 整篇 Markdown 变化时回调（受控）
 * @param props.onSave 存在时绑定 Ctrl+S
 * @param props.onImport 存在时启用「拖 .md 文件进来整体导入」
 */
export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  onImport,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  onImport?: (r: ParsedMarkdownFile) => void;
}) {
  const { d, pick } = useI18n();

  /** 从整篇切出来的块，value 变化时重切 */
  const blocks = useMemo(() => splitBlocks(value), [value]);

  /** 正在编辑的块下标；null = 全部显示渲染结果 */
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  /**
   * 服务端渲染结果，与它对应的源文一起存。
   * 只有当 `srcs[i] === blocks[i].src` 时才敢用该 html，否则显示源码。
   */
  const [rendered, setRendered] = useState<{ srcs: string[]; html: string[] }>({ srcs: [], html: [] });
  const [pending, setPending] = useState(false);
  /** 编辑后要恢复到的绝对光标偏移（相对整篇） */
  const caretRef = useRef<number | null>(null);
  /** 光标恢复时若要选中一段，存这里 */
  const selectRef = useRef<Selection | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  /** 每个渲染块的 DOM，用于按点击位置换算光标行 */
  const blockEls = useRef<Record<number, HTMLDivElement | null>>({});
  const timer = useRef<number>(0);

  /** 格式气泡的位置；null = 不显示 */
  const [bubble, setBubble] = useState<FloatPos | null>(null);
  /** 右键菜单的位置与条目；null = 不显示 */
  const [menu, setMenu] = useState<{ pos: FloatPos; items: MdMenuItem[]; blockIdx: number } | null>(null);
  /** 拖拽经过时的视觉反馈 */
  const [dragging, setDragging] = useState(false);
  /** 导入/拖拽时的提示信息（如「已从 xxx.md 载入」） */
  const [notice, setNotice] = useState<string | null>(null);
  /** 隐藏的文件选择框（右键「插入图片」用） */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * 右键菜单里那些「必须靠 textarea 才做得了」的命令（剪贴板、删除块）。
   * 右键的瞬间可能还没切进编辑态、textarea 尚未挂载，先存这里，等它挂载后执行。
   */
  const pendingCmd = useRef<string | null>(null);

  /** 块源文一变就重新请求预览（防抖）。按块请求：单栏编辑器要的是「每块各自的 HTML」 */
  useEffect(() => {
    window.clearTimeout(timer.current);
    const srcs = blocks.map((b) => b.src);
    setPending(true);
    timer.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: srcs }),
        });
        const data = (await res.json()) as { ok?: boolean; html?: string[] };
        if (data.ok && Array.isArray(data.html)) setRendered({ srcs, html: data.html });
      } catch {
        // 预览失败就保持上一次的结果，不打断写作
      } finally {
        setPending(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [blocks]);

  /**
   * textarea 高度跟随内容。用 useLayoutEffect 以免先按一行画出再跳高；
   * 无依赖数组，每次渲染后重新量（换行、粘贴、切块都会改高度）。
   */
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  });

  /**
   * 渲染后恢复光标：按 caretRef 里的绝对偏移找到所属块，若不是当前活动块则先切过去，
   * 下一轮再 focus + setSelectionRange。
   * 无依赖数组，块 / 活动下标 / value 任一变化都重新对齐。
   */
  useLayoutEffect(() => {
    const want = caretRef.current;
    if (want === null) return;
    if (blocks.length === 0) {
      caretRef.current = null;
      setActiveIdx(null);
      return;
    }

    // 找覆盖 want 的块。块之间的「分界空行」不属于任何块，光标落在那里时
    // 按「离哪个块最近」吸附 —— 不能直接兜底到最后一块，那正是「回车跳文末」的原因。
    let idx = blocks.findIndex((b) => want >= b.start && want <= b.start + b.src.length);
    if (idx === -1) {
      let bestDist = Number.POSITIVE_INFINITY;
      for (let k = 0; k < blocks.length; k++) {
        const bk = blocks[k];
        // 到块的起止各算一个距离，取小的
        const d = Math.min(Math.abs(want - bk.start), Math.abs(want - (bk.start + bk.src.length)));
        if (d < bestDist) {
          bestDist = d;
          idx = k;
        }
      }
      if (idx === -1) idx = 0;
    }

    if (idx !== activeIdx) {
      setActiveIdx(idx);
      return;
    }
    const ta = taRef.current;
    if (!ta) return;
    caretRef.current = null;
    const wantSel = selectRef.current;
    selectRef.current = null;
    ta.focus();
    if (wantSel) {
      // 需要选中一段（如插入链接后选中 url），同样换算到块内坐标
      const s = Math.max(0, Math.min(ta.value.length, wantSel.start - blocks[idx].start));
      const e = Math.max(0, Math.min(ta.value.length, wantSel.end - blocks[idx].start));
      ta.setSelectionRange(s, e);
    } else {
      const pos = Math.max(0, Math.min(ta.value.length, want - blocks[idx].start));
      ta.setSelectionRange(pos, pos);
    }

    // textarea 就绪了：执行那些排队等着它的命令（右键菜单里的剪贴板 / 删除块）
    const pending = pendingCmd.current;
    if (pending !== null) {
      pendingCmd.current = null;
      handleMenuCommand(pending);
    }
  });

  /**
   * 某一块被编辑了。
   * @param i 块下标
   * @param next 这一块的新源文
   * @param selectionStart 光标在这一块内的位置（用来换算成整篇里的绝对位置）
   */
  const onEdit = (i: number, next: string, selectionStart: number) => {
    const b = blocks[i];
    caretRef.current = b.start + selectionStart;
    // 只替换这一块那一段，其余原样拼回去 —— 块之间的空行不属于任何块，所以不会被碰到
    onChange(value.slice(0, b.start) + next + value.slice(b.start + b.src.length));
  };

  /**
   * 点某一块的渲染结果 → 进入编辑。
   *
   * @param i 块下标
   * @param viewportY 点击位置相对视口的 y（可选）。给了就按行换算光标落点，
   *                  不给则落到块首 —— 不要落块尾，那会让光标离手很远且把 textarea 撑高。
   */
  const activate = (i: number, viewportY?: number) => {
    const b = blocks[i];
    let offset = 0;

    // 按点击的纵向位置换算「第几行」，再把光标放到该行行首。
    // 渲染块的行高与源码行高不一定相同，这里只求「落在正确的行附近」，不追求逐像素。
    if (viewportY !== undefined) {
      const el = blockEls.current[i];
      if (el) {
        const rect = el.getBoundingClientRect();
        const lineH = 1.8 * 16; // 与 textarea 的 lineHeight 对齐（1.8 × 16px）
        const row = Math.max(0, Math.floor((viewportY - rect.top) / lineH));
        const lines = b.src.split('\n');
        const rowClamped = Math.min(row, lines.length - 1);
        offset = lines.slice(0, rowClamped).reduce((n, l) => n + l.length + 1, 0);
      }
    }

    caretRef.current = b.start + offset;
    setActiveIdx(i);
  };

  /**
   * 取某一块的渲染结果。
   * @param i 块下标
   * @returns HTML 字符串；源文与上次渲染时不一致则返回 null（预览还没跟上）
   */
  const htmlFor = (i: number): string | null =>
    rendered.srcs[i] === blocks[i].src ? rendered.html[i] : null;

  /**
   * 在当前活动块上执行一个就地变换：把这一块的源码交给命令，算完拼回整篇。
   *
   * @param fn 接收（块源码, 块内光标）返回结果的函数
   * @returns 是否执行了（fn 返回 null 表示条件不满足）
   */
  const runOnBlock = useCallback(
    (fn: (src: string, caret: number) => { text: string; caret: number; select?: Selection } | null): boolean => {
      const i = activeIdx;
      if (i === null) return false;
      const ta = taRef.current;
      if (!ta) return false;
      const b = blocks[i];
      // 优先用 textarea 的实时选区（受控组件在输入法组合期间 value 可能滞后一拍）
      const caret = ta.value !== b.src ? ta.value.length : ta.selectionStart;
      const out = fn(b.src, caret);
      if (!out) return false;
      caretRef.current = b.start + out.caret;
      selectRef.current = out.select
        ? { start: b.start + out.select.start, end: b.start + out.select.end }
        : null;
      onChange(value.slice(0, b.start) + out.text + value.slice(b.start + b.src.length));
      return true;
    },
    [activeIdx, blocks, onChange, value],
  );

  /** 取当前选区（块内坐标） */
  const currentSelection = (): Selection => {
    const ta = taRef.current;
    const i = activeIdx;
    if (!ta || i === null) return { start: 0, end: 0 };
    return { start: ta.selectionStart, end: ta.selectionEnd };
  };

  /**
   * 执行一条行内格式命令（气泡 & 右键菜单 & 快捷键共用这一个入口）。
   *
   * @param id 命令标识
   */
  const runInline = useCallback(
    (id: string) => {
      const markOf: Record<string, string> = {
        bold: '**',
        italic: '*',
        strike: '~~',
        code: '`',
        highlight: '==',
      };

      if (id === 'link') {
        runOnBlock((src) => insertLink(src, currentSelection()));
        return;
      }

      const mark = markOf[id];
      if (!mark) return;
      runOnBlock((src) => {
        const sel = currentSelection();
        // 已经有这层标记就剥掉（Typora 行为：再按一次取消）
        return unwrapSelection(src, sel, mark) ?? wrapSelection(src, sel, mark);
      });
    },
    [runOnBlock],
  );

  /**
   * 执行一条块级命令。
   * @param id 命令标识
   */
  const runBlock = useCallback(
    (id: string) => {
      // 标题：把当前行的已有标题标记去掉，换上新的
      const headingLevels: Record<string, number> = { h1: 1, h2: 2, h3: 3 };

      if (id in headingLevels) {
        const level = headingLevels[id];
        runOnBlock((src, caret) => {
          const { start, end } = lineBoundsAt(src, caret);
          const line = src.slice(start, end);
          const bare = line.replace(/^\s*#{1,6}\s+/, '');
          const next = '#'.repeat(level) + ' ' + bare;
          return { text: src.slice(0, start) + next + src.slice(end), caret: start + next.length };
        });
        return;
      }

      if (id === 'normal') {
        runOnBlock((src, caret) => {
          const { start, end } = lineBoundsAt(src, caret);
          const line = src.slice(start, end);
          const bare = line.replace(/^\s*(?:#{1,6}\s+|>\s?)/, '');
          return { text: src.slice(0, start) + bare + src.slice(end), caret: start + bare.length };
        });
        return;
      }

      // 插入类：在光标所在块之后另起一段插入（不碰原有内容）
      const snippetOf: Record<string, string> = {
        table: SNIPPETS.table,
        codeblock: SNIPPETS.code,
        quote: SNIPPETS.quote,
        bullet: SNIPPETS.bullet,
        ordered: SNIPPETS.ordered,
        todo: SNIPPETS.todo,
        hr: SNIPPETS.hr,
      };
      const snippet = snippetOf[id];
      if (!snippet) return;

      const i = activeIdx;
      if (i === null) {
        // 没有活动块时插到整篇末尾
        const sep = value.endsWith('\n') || value === '' ? '' : '\n\n';
        const next = value + sep + snippet;
        caretRef.current = next.length - snippet.length + snippetInnerOffset(snippet);
        onChange(next);
        return;
      }
      const b = blocks[i];
      // 在当前块之后新起一段插入；块与块之间用空行分隔（与 splitBlocks 的分界约定一致）
      const insertFrom = b.start + b.src.length;
      const next = value.slice(0, insertFrom) + '\n\n' + snippet + value.slice(insertFrom);
      caretRef.current = insertFrom + 2 + snippetInnerOffset(snippet);
      onChange(next);
    },
    [activeIdx, blocks, onChange, runOnBlock, value],
  );

  /**
   * 统一的命令分发入口 —— 气泡、右键菜单、快捷键都调它。
   * @param id 命令标识
   */
  const runCommand = useCallback(
    (id: string) => {
      runInline(id);
      if (['bold', 'italic', 'strike', 'code', 'highlight', 'link'].includes(id)) return;
      runBlock(id);
    },
    [runBlock, runInline],
  );

  /**
   * 镜像测量：算 textarea 内第 pos 个字符的视口坐标（textarea 没有直接取坐标的 API，
   * 只能复制一份样式相同的隐藏 div，灌入光标前文本再量末尾 span 的位置）。
   *
   * @param ta 目标 textarea
   * @param pos 块内字符偏移
   * @returns 相对视口的坐标
   */
  const measureCaret = (ta: HTMLTextAreaElement, pos: number): FloatPos => {
    const cs = window.getComputedStyle(ta);
    const mirror = document.createElement('div');
    // 逐条抄样式。用 cssText 一次性写完，避免多次 reflow
    mirror.style.cssText = `
      position: fixed; visibility: hidden; white-space: pre-wrap; word-wrap: break-word;
      top: 0; left: 0; width: ${ta.clientWidth}px;
      font: ${cs.font}; font-size: ${cs.fontSize}; line-height: ${cs.lineHeight};
      padding: ${cs.padding}; border: ${cs.borderWidth} solid transparent;
      box-sizing: ${cs.boxSizing};
    `;
    mirror.textContent = ta.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = '\u200b'; // 零宽空格：能定位又不占宽度
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const rect = ta.getBoundingClientRect();
    // 减掉 scrollTop 才是「屏幕上真实看得到的位置」
    const x = rect.left + marker.offsetLeft - ta.scrollLeft;
    const y = rect.top + marker.offsetTop - ta.scrollTop;
    document.body.removeChild(mirror);
    return { x, y };
  };

  /**
   * 选区变化时决定气泡要不要出现。
   * 只在**真的有选中内容**、且选区在同一个活动块内时才显示。
   */
  const syncBubble = useCallback(() => {
    const ta = taRef.current;
    if (!ta || activeIdx === null) {
      setBubble(null);
      return;
    }
    const { selectionStart: s, selectionEnd: e } = ta;
    if (s === e || ta.value.slice(s, e).trim() === '') {
      setBubble(null);
      return;
    }
    const at = measureCaret(ta, e);
    // 摆在选区右下方一点。x 夹一下避免超出视口右边
    setBubble({ x: Math.min(at.x + 8, window.innerWidth - 240), y: at.y - 12 });
  }, [activeIdx]);

  /**
   * 弹出右键菜单。
   * @param e 鼠标事件（用 clientX/clientY 定位）
   * @param i 被右键的块下标
   */
  const openMenu = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    const b = blocks[i];
    // 用鼠标纵向位置换算到块内行，再算上下文；渲染态下拿不到精确字符位置，行级判断足够
    const el = blockEls.current[i];
    let rowOffset = 0;
    if (el) {
      const rect = el.getBoundingClientRect();
      const lineH = 1.8 * 16;
      const row = Math.max(0, Math.floor((e.clientY - rect.top) / lineH));
      const lines = b.src.split('\n');
      const rowClamped = Math.min(row, lines.length - 1);
      rowOffset = lines.slice(0, rowClamped).reduce((n, l) => n + l.length + 1, 0);
    }
    const caretAbs = b.start + rowOffset;
    const ctx = getContext(value, caretAbs);

    // 图片 / 链接上右键，给专用菜单
    const target = e.target as HTMLElement;
    let items: MdMenuItem[];
    if (target.closest('img')) items = buildImageMenu();
    else if (target.closest('a')) items = buildLinkMenu();
    else items = buildContextMenu(ctx);

    setMenu({ pos: { x: e.clientX, y: e.clientY }, items, blockIdx: i });
    // 右键同时也把这一块切进编辑态，保证后续命令有 textarea 可用
    caretRef.current = caretAbs;
    setActiveIdx(i);
  };

  /**
   * 文件输入/拖拽的统一处理：.md 整体导入；图片插入占位语法。
   * @param file 用户选/拖进来的文件
   */
  const handleFile = useCallback(
    async (file: File) => {
      if (MD_FILE_RE.test(file.name) && file.type !== 'image/svg+xml') {
        const raw = await file.text();
        const parsed = parseMarkdownFile(raw, file.name.replace(/\.[^.]+$/, ''));
        if (onImport) {
          onImport(parsed);
          setNotice(pick({ zh: `已从 ${file.name} 载入`, en: `Loaded from ${file.name}` }));
        } else {
          // 没有 onImport 回调时退化为「只插入正文到光标处」
          onChange(value + (value.endsWith('\n') ? '' : '\n') + parsed.body);
          setNotice(pick({ zh: `已插入 ${file.name} 正文`, en: `Inserted ${file.name}` }));
        }
        return;
      }

      if (IMG_FILE_RE.test(file.name)) {
        // 本地图片在浏览器里是加载不出来的（没有上传后端），
        // 所以只插入占位语法，把路径原样保留 —— 图片语法绝不丢失。
        const path = file.name;
        runOnBlock((src) => {
          const sel = currentSelection();
          return insertImage(src, sel, path);
        });
        setNotice(
          pick({
            zh: `已插入图片占位：${file.name}（需换成图床链接才能显示）`,
            en: `Image placeholder inserted: ${file.name}`,
          }),
        );
      }
    },
    [currentSelection, onChange, onImport, pick, runOnBlock, value],
  );

  /**
   * 键盘快捷键：只认 Ctrl/Cmd；命中后一律 preventDefault。
   *
   * @param e 键盘事件（来自 textarea）
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const ta = e.currentTarget;

    // ── Tab：表格里跳格 / 列表里缩进 ──
    if (e.key === 'Tab' && !mod) {
      const ctx = getContext(ta.value, ta.selectionStart);
      if (ctx.table) {
        e.preventDefault();
        const caret = ta.selectionStart;
        // 跳到下一个 `|` 之后（单元格之间）
        const rest = ta.value.slice(caret);
        const bar = rest.indexOf('|');
        const nextPos = bar === -1 ? ta.value.length : caret + bar + 1;
        ta.setSelectionRange(nextPos, nextPos);
        caretRef.current = (activeIdx !== null ? blocks[activeIdx].start : 0) + nextPos;
        return;
      }
      if (ctx.list) {
        // 列表里 Tab 缩进两格（Markdown 嵌套列表的惯例）
        e.preventDefault();
        const { start } = lineBoundsAt(ta.value, ta.selectionStart);
        const next = ta.value.slice(0, start) + '  ' + ta.value.slice(start);
        onEdit(activeIdx as number, next, ta.selectionStart + 2);
        return;
      }
    }

    // ── Ctrl+Enter：表格加一行 ──
    if (e.key === 'Enter' && mod) {
      const ok = runOnBlock((src, caret) => tableAddRow(src, caret));
      if (ok) {
        e.preventDefault();
        return;
      }
    }

    if (!mod) return;

    const key = e.key.toLowerCase();

    // ── Ctrl+B / I / K / ` ──
    if (key === 'b') {
      e.preventDefault();
      runInline('bold');
      return;
    }
    if (key === 'i') {
      e.preventDefault();
      runInline('italic');
      return;
    }
    if (key === 'k') {
      e.preventDefault();
      runInline('link');
      return;
    }
    if (key === '`') {
      e.preventDefault();
      runInline('code');
      return;
    }

    // ── Ctrl+S：保存 ──
    if (key === 's') {
      e.preventDefault();
      onSave?.();
      return;
    }

    // ── Ctrl+Shift+7 / Shift+8：有序 / 无序列表 ──
    if (e.shiftKey && (key === '7' || key === '&')) {
      e.preventDefault();
      runBlock('ordered');
      return;
    }
    if (e.shiftKey && (key === '8' || key === '*')) {
      e.preventDefault();
      runBlock('bullet');
      return;
    }

    // ── Ctrl+Shift+. ：引用 ──
    if (e.shiftKey && (key === '.' || key === '>')) {
      e.preventDefault();
      runBlock('quote');
    }
  };

  /**
   * 文本变化的总入口：先跑「输入即转换」「表格补分隔行」，再写回。
   *
   * @param i 块下标
   * @param raw 变化后的块源码
   * @param caret 变化后的块内光标位置
   */
  const onChangeWithAuto = (i: number, raw: string, caret: number) => {
    // 表格补分隔行优先：它比自动转换更具体（`|a|b|` 不该被当成别的东西）
    const t = tablePipeNewline(raw, caret);
    if (t) {
      onEdit(i, t.text, t.caret);
      return;
    }
    // 输入即转换（`# ` → 标题、`- ` → 列表……）
    const a = autoFormat(raw, caret);
    if (a) {
      onEdit(i, a.text, a.caret);
      return;
    }
    onEdit(i, raw, caret);
  };

  /** 提示信息几秒后自动消失，免得一直挂在标题旁边 */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  return (
    <div
      onDragOver={(e) => {
        // 必须 preventDefault，否则浏览器会用默认行为「打开这个文件」
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        // 一次拖多个文件时只取第一个，避免把正文替换成一大堆内容
        void handleFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{d.admin.writeTab}</p>
        <span className="text-[11px] text-muted-foreground/70">
          {pick({
            zh: '点任意段落即可编辑，光标移开即所见即所得；可拖入 .md 或图片',
            en: 'Click any block to edit; drop .md or images here',
          })}
        </span>
        {pending && <span className="text-[11px] text-muted-foreground/70">· …</span>}
        {notice && <span className="text-[11px] text-accent">{notice}</span>}
      </div>

      <div
        className={`relative rounded-lg border bg-background px-4 py-3 transition-colors ${
          dragging ? 'border-accent bg-accent/[0.04]' : 'border-border'
        }`}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-accent/[0.06] text-sm font-semibold text-accent">
            {pick({ zh: '松手即可导入', en: 'Drop to import' })}
          </div>
        )}

        {blocks.map((b, i) =>
          i === activeIdx ? (
            <textarea
              key={i}
              ref={taRef}
              value={b.src}
              onChange={(e) => onChangeWithAuto(i, e.target.value, e.target.selectionStart)}
              onKeyDown={onKeyDown}
              onSelect={syncBubble}
              onMouseUp={syncBubble}
              onContextMenu={(e) => openMenu(e, i)}
              onBlur={() => {
                setActiveIdx(null);
                setBubble(null);
              }}
              spellCheck={false}
              rows={1}
              aria-label={pick({ zh: `第 ${i + 1} 段源码`, en: `Block ${i + 1} source` })}
              /* font / line-height / color 对齐 .prose-site，避免源码块与渲染块切换时行高跳动。
                 font: inherit 必须写：textarea 默认字体是等宽，不继承外层。 */
              style={{ font: 'inherit', fontSize: '1rem', lineHeight: 1.8 }}
              className="block min-h-[1.8rem] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-foreground outline-none"
            />
          ) : (
            /* 渲染结果区。onClick 进入编辑；点到链接时拦掉默认跳转 ——
               在编辑器里点一下链接就跳走，会把没保存的内容一起带走。
               负 margin + 同值 padding 是给悬停底色留出「不吃掉行宽」的余量。 */
            <div
              key={i}
              ref={(el) => {
                blockEls.current[i] = el;
              }}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a')) e.preventDefault();
                activate(i, e.clientY);
              }}
              onContextMenu={(e) => openMenu(e, i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(i);
                }
              }}
              aria-label={pick({ zh: `编辑第 ${i + 1} 段`, en: `Edit block ${i + 1}` })}
              className="prose-site -mx-2 cursor-text rounded-md px-2 transition-colors hover:bg-foreground/[0.03]"
            >
              {(() => {
                const html = htmlFor(i);
                if (html !== null) {
                  return <BlockHtml html={html} />;
                }
                // 预览还没跟上：先显示源码纯文本兜底，绝不去显示**别的块**的渲染结果
                if (b.src.trim() === '') {
                  return (
                    <p className="text-muted-foreground/60">
                      {pick({ zh: '点这里开始写…', en: 'Click to start writing…' })}
                    </p>
                  );
                }
                return <p className="whitespace-pre-wrap text-muted-foreground/70">{b.src}</p>;
              })()}
            </div>
          ),
        )}
      </div>

      {/* 隐藏的文件框：右键「插入图片」走它（也支持直接选 .md 整体导入） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.mdx,.txt,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {bubble && (
        <FormatBubble
          pos={bubble}
          commands={INLINE_COMMANDS}
          onRun={(id) => {
            runInline(id);
            setBubble(null);
          }}
          onClose={() => setBubble(null)}
        />
      )}

      {menu && (
        <ContextMenu
          pos={menu.pos}
          items={menu.items}
          onRun={(id) => {
            // 这几条必须靠 textarea（读选区、改文本）。右键时 textarea 可能还没挂载，
            // 先入队，等光标恢复那一轮再执行。
            if (['cut', 'copy', 'paste', 'delete-block'].includes(id) && !taRef.current) {
              pendingCmd.current = id;
            } else {
              handleMenuCommand(id);
            }
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );

  /**
   * 右键菜单里那几条「不是简单格式」的命令（表格加列、图片换地址等）。
   *
   * @param id 命令标识
   */
  function handleMenuCommand(id: string) {
    switch (id) {
      // ── 剪贴板三项：走浏览器 Clipboard API ──
      // textarea 上的 Ctrl+X/C/V 是原生行为，但菜单项要自己实现。
      case 'cut': {
        const ta = taRef.current;
        if (!ta) return;
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (sel === '') return;
        void navigator.clipboard?.writeText(sel);
        const next = ta.value.slice(0, ta.selectionStart) + ta.value.slice(ta.selectionEnd);
        onEdit(activeIdx as number, next, ta.selectionStart);
        return;
      }
      case 'copy': {
        const ta = taRef.current;
        if (!ta) return;
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        // 没选中就复制整块源码 —— 比「什么都不做」有用
        void navigator.clipboard?.writeText(sel === '' ? ta.value : sel);
        return;
      }
      case 'paste': {
        const ta = taRef.current;
        if (!ta) return;
        // readText 需要用户授权，用户拒绝时抛异常 → 静默降级，不打断
        void navigator.clipboard
          ?.readText()
          .then((text) => {
            if (!text) return;
            const caret = ta.selectionStart;
            const next = ta.value.slice(0, caret) + text + ta.value.slice(ta.selectionEnd);
            onEdit(activeIdx as number, next, caret + text.length);
          })
          .catch(() => {
            // 权限被拒或无剪贴板：提示用户用 Ctrl+V
            setNotice(pick({ zh: '浏览器拒绝了粘贴权限，请用 Ctrl+V', en: 'Clipboard denied, use Ctrl+V' }));
          });
        return;
      }
      case 'delete-block': {
        const i = activeIdx;
        if (i === null) return;
        const b = blocks[i];
        // 连同它后面的分界空行一起删，避免留下一串空行
        let end = b.start + b.src.length;
        while (value[end] === '\n') end++;
        const next = value.slice(0, b.start) + value.slice(end);
        caretRef.current = Math.max(0, b.start - 1);
        onChange(next);
        return;
      }
      // ── 表格 ──
      case 'table-row':
        runOnBlock((src, caret) => tableAddRow(src, caret));
        return;
      case 'table-col':
        runOnBlock((src) => tableAddColumn(src));
        return;
      case 'image':
        fileInputRef.current?.click();
        return;
      case 'code-exit':
        // 在代码块结束围栏之后新起一段，方便接着写正文
        runOnBlock((src, caret) => {
          const { end } = lineBoundsAt(src, caret);
          return { text: src.slice(0, end) + '\n\n' + src.slice(end), caret: end + 2 };
        });
        return;
      case 'image-replace':
      case 'link-replace': {
        // 低频操作，用 prompt 拿新地址即可，不值得为它做一套弹层。
        // 只改「块里的第一个」图片/链接地址 —— 渲染态下拿不到精确字符位置，
        // 多做一步「猜是哪一个」反而会改错地方。
        const isImg = id === 'image-replace';
        const pattern = isImg ? /!\[([^\]]*)\]\(([^)]*)\)/ : /(?<!!)\[([^\]]*)\]\(([^)]*)\)/;
        const newUrl = window.prompt(
          pick({ zh: '新的地址（http/https 或图床链接）：', en: 'New URL:' }),
          'https://',
        );
        if (!newUrl) return;
        runOnBlock((src) => {
          if (!pattern.test(src)) return null;
          const next = src.replace(pattern, (_m, alt: string, _old: string) =>
            isImg ? `![${alt}](${newUrl})` : `[${alt}](${newUrl})`,
          );
          return { text: next, caret: Math.min(next.length, src.length) };
        });
        return;
      }
      case 'image-alt': {
        const newAlt = window.prompt(pick({ zh: '替代文字（图片加载失败时显示）：', en: 'Alt text:' }), '');
        if (newAlt === null) return;
        runOnBlock((src) => {
          const pattern = /!\[([^\]]*)\]\(([^)]*)\)/;
          if (!pattern.test(src)) return null;
          const next = src.replace(pattern, (_m, _old: string, url: string) => `![${newAlt}](${url})`);
          return { text: next, caret: Math.min(next.length, src.length) };
        });
        return;
      }
      case 'link-open': {
        const m = menu ? blocks[menu.blockIdx].src.match(/(?<!!)\[([^\]]*)\]\(([^)]*)\)/) : null;
        if (m?.[2]) window.open(m[2], '_blank', 'noopener,noreferrer');
        return;
      }
      case 'code-copy': {
        const src = menu ? blocks[menu.blockIdx].src : '';
        void navigator.clipboard?.writeText(src);
        return;
      }
      case 'source':
        // 「编辑源码」：光标已经在这一块里（openMenu 时切进来的），无需额外动作
        return;
      default:
        runCommand(id);
    }
  }
}

/**
 * 注入渲染好的 HTML，并把加载失败的图片换成占位卡片。
 * 用捕获阶段监听 error（error 不冒泡），并对已失败的图片补扫一次。
 *
 * @param props.html 服务端渲染好的 HTML
 */
function BlockHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    /** 把一张加载失败的图片换成占位卡片，保留其 src */
    const markBroken = (img: HTMLImageElement) => {
      if (img.dataset.broken === '1') return; // 已处理过
      img.dataset.broken = '1';

      const box = document.createElement('span');
      box.className = 'md-img-broken';
      box.contentEditable = 'false';

      const label = document.createElement('span');
      label.className = 'md-img-broken-label';
      label.textContent = '图片无法加载';

      const path = document.createElement('code');
      path.className = 'md-img-broken-path';
      // src 被渲染管线做过 URL 编码，解回来显示；解不动就用原文
      const raw = img.getAttribute('src') ?? '';
      let src = raw;
      try {
        src = decodeURIComponent(raw);
      } catch {
        src = raw;
      }
      // 只显示尾部，完整路径放 title
      path.textContent = src.length > 72 ? '…' + src.slice(-69) : src;
      path.title = src;
      box.title = src;

      box.appendChild(label);
      box.appendChild(path);
      img.replaceWith(box);
    };

    // error 事件不冒泡，必须用捕获；同时把已失败的图片扫一遍（SSR 出来的图可能早就 404 了）
    const onError = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'IMG') markBroken(t as HTMLImageElement);
    };
    root.addEventListener('error', onError, true);

    root.querySelectorAll('img').forEach((img) => {
      // complete 且 naturalWidth 为 0 = 已经加载失败了（不等事件）
      if (img.complete && img.naturalWidth === 0) markBroken(img);
      else {
        img.addEventListener('error', () => markBroken(img), { once: true });
      }
    });

    return () => root.removeEventListener('error', onError, true);
  }, [html]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
