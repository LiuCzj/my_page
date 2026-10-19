'use client';

/**
 * 编辑器浮层：选区格式气泡、右键上下文菜单。
 *
 * 导出：
 *  - `FormatBubble` / `ContextMenu` —— 两个浮层组件，Portal 到 body
 *  - `INLINE_COMMANDS` / `BLOCK_COMMANDS` —— 命令表
 *  - `buildContextMenu` / `buildImageMenu` / `buildLinkMenu` —— 按上下文生成菜单项
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Code,
  Link2,
  Highlighter,
  Strikethrough,
  Table,
  Quote,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Code2,
  Link as LinkIcon,
  ExternalLink,
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  Pilcrow,
  Plus,
  Type,
  Undo2,
  Redo2,
  Eraser,
  TextSelect,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  AlignLeft,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import type { ContextInfo } from '@/lib/md-commands';

/** 一条可执行的编辑命令 */
export interface MdCommand {
  /** 命令标识，既是 React key 也是调用方 switch 的依据 */
  id: string;
  /** 按钮上的中文说明 */
  label: string;
  /** 图标组件 */
  icon: React.ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** 展示用的快捷键提示（只显示，绑定在 MarkdownEditor 的 onKeyDown） */
  hint?: string;
  /** 高亮显示（表示当前已生效） */
  active?: boolean;
}

/** 分隔线（菜单分组用） */
export interface MdSeparator {
  separator: true;
}

/**
 * 子菜单项：悬停展开，用来收纳同类命令。
 *
 * ⚠️ 存在的意义就是**控长度** —— 正文菜单平铺曾达 21 条、约 640px，
 * 在普通屏幕上会顶到视口外，有些项根本看不见。
 */
export interface MdSubmenu {
  /** 触发项文案 */
  label: string;
  /** 触发项图标 */
  icon: MdCommand['icon'];
  /** 展开后的条目 */
  items: MdMenuItem[];
}

/**
 * 一排图标按钮。Typora 把「加粗/斜体/删除线/行内代码/高亮/链接」收成这样，
 * 六个文字项压成一排，省下五行高度。
 */
export interface MdIconRow {
  icons: MdCommand[];
}

export type MdMenuItem = MdCommand | MdSeparator | MdSubmenu | MdIconRow;

/** 判断是分隔线还是命令项 */
export function isSeparator(item: MdMenuItem): item is MdSeparator {
  return 'separator' in item;
}

/** 判断是不是子菜单 */
export function isSubmenu(item: MdMenuItem): item is MdSubmenu {
  return 'items' in item;
}

/** 判断是不是图标行 */
export function isIconRow(item: MdMenuItem): item is MdIconRow {
  return 'icons' in item;
}

/** 浮层位置（相对视口） */
export interface FloatPos {
  x: number;
  y: number;
}

/**
 * 选区格式气泡。选中文字时浮出，给最常用的行内格式。
 *
 * @param props.pos 浮层坐标（视口坐标，已由调用方算好）
 * @param props.commands 要显示的命令
 * @param props.onRun 点某条命令时触发
 * @param props.onClose 需要关闭时（点了别处、按了 Esc）通知调用方
 */
export function FormatBubble({
  pos,
  commands,
  onRun,
  onClose,
}: {
  pos: FloatPos;
  commands: MdCommand[];
  onRun: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 用 mousedown 而非 click：click 到达时选区已被按下动作清掉
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="格式"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[300] flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-xl"
      // 气泡自己不许被选中，否则「按下鼠标想点按钮」会先把选区弄丢
      onMouseDown={(e) => e.preventDefault()}
    >
      {commands.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.hint ? `${c.label}（${c.hint}）` : c.label}
          aria-label={c.label}
          onClick={() => onRun(c.id)}
          className={`flex size-7 items-center justify-center rounded-md transition-colors ${
            c.active
              ? 'bg-accent/15 text-accent'
              : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
          }`}
        >
          <c.icon size={15} aria-hidden="true" />
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * 右键上下文菜单。
 *
 * @param props.pos 浮层坐标（鼠标位置）
 * @param props.items 要展示的条目（可含分隔线）
 * @param props.onRun 点某条命令时触发
 * @param props.onClose 需要关闭时通知调用方
 */
export function ContextMenu({
  pos,
  items,
  onRun,
  onClose,
}: {
  pos: FloatPos;
  items: MdMenuItem[];
  onRun: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** 当前展开的子菜单（下标 + 飞出位置） */
  const [openSub, setOpenSub] = useState<{ index: number; pos: FloatPos } | null>(null);
  /**
   * 关闭子菜单的延时句柄。
   *
   * ⚠️ **不能一离开主菜单就立刻关**：菜单与飞出层之间隔着几个像素的缝，
   * 鼠标穿过去的瞬间就会触发主菜单的 `onMouseLeave`，子菜单当场消失、点不到。
   * 给一点缓冲，鼠标进到飞出层就取消。
   */
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenSub(null), 260);
  };
  useEffect(() => cancelClose, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      /**
       * ⚠️ **只有点到「菜单项按钮」才不关** —— 关早了按钮收不到 click，命令就丢了。
       *
       * 反过来写（「点在菜单/子菜单范围内就不关」）会留下一片**死区**：那片区域内点哪儿都关不掉菜单。
       */
      if (t?.closest?.('[role="menuitem"]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    /**
     * ⚠️ **滚动 / 滚轮 / 窗口失焦都要关掉**：菜单是 `fixed` 定位的，页面一滚它就钉在原地、跟内容脱节。
     * `pointerdown` 用**捕获阶段**：比冒泡阶段的 mousedown 更不容易被中途拦掉。
     */
    const onScroll = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('blur', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', onScroll);
    };
  }, [onClose]);

  /**
   * 按条目数估算菜单高度。
   *
   * ⚠️ **要按全部条目（含分隔线）算并留余量**：只按命令项算会估小
   * （实测一处分隔线就让估算少了 23px），夹取差一截、菜单仍会超出视口底部。
   */
  const estHeight = (list: MdMenuItem[]): number => list.length * 30 + 16;

  const estH = estHeight(items);
  const estW = 200;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  /**
   * ⚠️ 垂直方向**不要简单地「翻到光标上方」**：翻上去超出屏幕顶端会被夹到 `top: 4`
   * —— 于是右键屏幕中部却在**顶部**弹出、还盖住顶栏。
   * 正解是「放得下就贴光标，放不下就整体上移，刚好放进视口」。
   */
  const x = pos.x + estW > vw ? Math.max(4, pos.x - estW) : pos.x;
  const y = pos.y + estH > vh - 8 ? Math.max(4, vh - estH - 8) : pos.y;

  /**
   * 悬停某个子菜单项时算出飞出位置。
   *
   * ⚠️ 垂直方向**必须夹取**：不夹的话靠近窗口底部的子菜单会整片跑到视口外被裁掉。
   *
   * @param index 子菜单在 items 里的下标
   * @param el 触发项元素
   */
  const openSubmenuAt = (index: number, el: HTMLElement) => {
    cancelClose();
    const r = el.getBoundingClientRect();
    const w = 190;
    const inner = items[index] && isSubmenu(items[index]) ? (items[index] as MdSubmenu).items : [];
    const subH = estHeight(inner);
    const x = r.right + 2 + w > vw ? Math.max(4, r.left - w - 2) : r.right + 2;
    const y = Math.max(4, Math.min(r.top - 6, vh - subH - 8));
    setOpenSub({ index, pos: { x, y } });
  };

  /** 渲染子菜单里的条目（不递归，只支持一层） */
  const renderLeaf = (item: MdMenuItem, key: string) =>
    isSeparator(item) ? (
      <div key={key} className="my-1 border-t border-border" />
    ) : isSubmenu(item) || isIconRow(item) ? null : (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        onClick={() => onRun(item.id)}
        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
          item.active ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-foreground/[0.06]'
        }`}
      >
        <item.icon size={15} aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        {item.hint && <span className="text-[11px] text-muted-foreground">{item.hint}</span>}
      </button>
    );

  return createPortal(
    <>
      <div
        ref={ref}
        role="menu"
        style={{ left: x, top: y, minWidth: estW, maxHeight: vh - 16 }}
        className="fixed z-[300] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-2xl"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        {items.map((item, i) => {
          if (isSeparator(item)) return <div key={`sep-${i}`} className="my-1 border-t border-border" />;

          // 一排图标按钮（行内格式）
          if (isIconRow(item)) {
            return (
              <div key={`row-${i}`} className="flex items-center gap-0.5 px-2 py-1">
                {item.icons.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitem"
                    title={c.hint ? `${c.label}（${c.hint}）` : c.label}
                    aria-label={c.label}
                    onClick={() => onRun(c.id)}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <c.icon size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            );
          }

          // 子菜单
          if (isSubmenu(item)) {
            return (
              <button
                key={`sub-${i}`}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                onMouseEnter={(e) => openSubmenuAt(i, e.currentTarget)}
                onClick={(e) => openSubmenuAt(i, e.currentTarget)}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                  openSub?.index === i ? 'bg-foreground/[0.06]' : 'text-foreground hover:bg-foreground/[0.06]'
                }`}
              >
                <item.icon size={15} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[11px] text-muted-foreground">▸</span>
              </button>
            );
          }

          return renderLeaf(item, item.id);
        })}
      </div>

      {/* 子菜单飞出层：fixed 定位，不受主菜单的 overflow 裁切 */}
      {openSub && (
        <div
          data-submenu=""
          role="menu"
          style={{ left: openSub.pos.x, top: openSub.pos.y, minWidth: 180, maxHeight: vh - 16 }}
          className="fixed z-[310] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-2xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {items[openSub.index] && isSubmenu(items[openSub.index])
            ? (items[openSub.index] as MdSubmenu).items.map((s, k) => renderLeaf(s, `sub-${k}`))
            : null}
        </div>
      )}
    </>,
    document.body,
  );
}

// ── 插入表格对话框 ────────────────────────────────────────

/**
 * 插入表格对话框：列数 / 行数可填，默认 3 列 4 行（与 Typora 一致）。
 *
 * @param props.onConfirm 确定（列数、总行数）
 * @param props.onCancel 取消（点遮罩、Esc、取消按钮）
 */
export function TableInsertDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (cols: number, rows: number) => void;
  onCancel: () => void;
}) {
  const [cols, setCols] = useState('3');
  const [rows, setRows] = useState('4');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /** 把输入夹到合法范围；填了非法值时退回默认值 */
  const clampNum = (v: string, min: number, max: number, dflt: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min ? Math.min(max, n) : dflt;
  };

  const INPUT =
    'w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring';

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-start justify-center bg-foreground/20 pt-[18vh]"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-label="插入表格"
        className="w-[320px] rounded-lg border border-border bg-card p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-sm font-bold text-foreground">插入表格</p>
        <div className="flex items-center gap-3 text-sm text-foreground">
          <label className="flex items-center gap-1.5">
            列
            <input
              autoFocus
              value={cols}
              onChange={(e) => setCols(e.target.value)}
              inputMode="numeric"
              aria-label="列数"
              className={INPUT}
            />
          </label>
          <label className="flex items-center gap-1.5">
            行
            <input
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              inputMode="numeric"
              aria-label="行数"
              className={INPUT}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">行数含表头与分隔行（最少 2 行）</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-soft">
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(clampNum(cols, 1, 12, 3), clampNum(rows, 2, 50, 4))}
            className="btn-primary"
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── 插入图片对话框 ────────────────────────────────────────

/**
 * 插入图片对话框。只收地址，不接管文件：图片存在站外图床。
 *
 * @param props.initialAlt 预填的替代文字（拖入文件时用文件名）
 * @param props.hint 顶部说明（拖入文件或粘贴图片时补充上下文）
 * @param props.onConfirm 确定（地址、替代文字）
 * @param props.onCancel 取消（遮罩、Esc、取消按钮）
 */
export function ImageInsertDialog({
  initialAlt = '',
  hint,
  onConfirm,
  onCancel,
}: {
  initialAlt?: string;
  hint?: string;
  onConfirm: (src: string, alt: string) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState(initialAlt);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const url = src.trim();
  const submit = () => {
    if (url) onConfirm(url, alt.trim());
  };

  const INPUT =
    'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring';
  const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-start justify-center bg-foreground/20 pt-[18vh]"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-label="插入图片"
        className="w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-sm font-bold text-foreground">插入图片</p>

        {hint && (
          <p className="mb-3 rounded-md bg-foreground/[0.05] px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}

        <label className={LABEL} htmlFor="md-img-src">
          图片地址
        </label>
        <input
          id="md-img-src"
          ref={urlRef}
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="https://图床地址/xxx.png"
          className={INPUT}
        />

        <label className={`${LABEL} mt-3`} htmlFor="md-img-alt">
          替代文字
        </label>
        <input
          id="md-img-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="图片加载失败时显示，可留空"
          className={INPUT}
        />

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          站内不保存图片文件：先把图片传到图床，再把链接粘到这里。
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-soft">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!url}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── 查找 / 替换面板 ────────────────────────────────────────

/** 查找替换面板的状态（由编辑器持有，面板只做受控渲染） */
export interface FindState {
  /** 面板是否打开 */
  open: boolean;
  /** 是否展开「替换」那一行（Ctrl+H 打开时为真） */
  replace: boolean;
  /** 要查找的内容 */
  query: string;
  /** 替换成什么 */
  replacement: string;
  /** 是否区分大小写 */
  caseSensitive: boolean;
  /** 当前是第几个命中（0 基） */
  index: number;
}

/**
 * 查找 / 替换面板。默认浮在编辑区右上角，与 Typora 的查找栏位置一致。
 *
 * 键盘：Enter 下一个、Shift+Enter 上一个、Esc 关闭（焦点在输入框里时都生效）。
 *
 * @param props.state 面板状态
 * @param props.total 命中总数
 * @param props.onState 状态变化（只传要改的字段）
 * @param props.onNext 下一个命中
 * @param props.onPrev 上一个命中
 * @param props.onReplace 替换当前命中
 * @param props.onReplaceAll 全部替换
 * @param props.onClose 关闭面板
 */
export function FindPanel({
  state,
  total,
  onState,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  state: FindState;
  total: number;
  onState: (patch: Partial<FindState>) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  const FIELD =
    'min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring';
  const ICON_BTN =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground';

  return createPortal(
    <div
      role="dialog"
      aria-label="查找替换"
      className="fixed right-4 top-[calc(var(--header-h-total)+8px)] z-[320] w-[330px] rounded-lg border border-border bg-card p-3 shadow-2xl"
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={state.query}
          onChange={(e) => onState({ query: e.target.value, index: 0 })}
          onKeyDown={onKey}
          placeholder="查找"
          aria-label="查找"
          className={FIELD}
        />
        <span className="w-[52px] shrink-0 text-center text-[11px] text-muted-foreground">
          {total ? `${state.index + 1}/${total}` : '无结果'}
        </span>
        <button type="button" className={ICON_BTN} onClick={onPrev} aria-label="上一个" title="上一个（Shift+Enter）">
          <ChevronUp size={15} aria-hidden="true" />
        </button>
        <button type="button" className={ICON_BTN} onClick={onNext} aria-label="下一个" title="下一个（Enter）">
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <button type="button" className={ICON_BTN} onClick={onClose} aria-label="关闭查找" title="关闭（Esc）">
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {state.replace && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={state.replacement}
            onChange={(e) => onState({ replacement: e.target.value })}
            onKeyDown={onKey}
            placeholder="替换为"
            aria-label="替换为"
            className={FIELD}
          />
          <button type="button" onClick={onReplace} disabled={!total} className="btn-soft shrink-0">
            替换
          </button>
          <button type="button" onClick={onReplaceAll} disabled={!total} className="btn-soft shrink-0">
            全部
          </button>
        </div>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={state.caseSensitive}
          onChange={(e) => onState({ caseSensitive: e.target.checked, index: 0 })}
          className="size-3.5 cursor-pointer"
        />
        区分大小写
      </label>
    </div>,
    document.body,
  );
}

// ── 命令表 ────────────────────────────────────────────────

/** 行内格式（气泡用） */
export const INLINE_COMMANDS: MdCommand[] = [
  { id: 'bold', label: '加粗', icon: Bold, hint: 'Ctrl+B' },
  { id: 'italic', label: '斜体', icon: Italic, hint: 'Ctrl+I' },
  { id: 'strike', label: '删除线', icon: Strikethrough },
  { id: 'code', label: '行内代码', icon: Code, hint: 'Ctrl+`' },
  { id: 'highlight', label: '高亮', icon: Highlighter },
  { id: 'link', label: '链接', icon: Link2, hint: 'Ctrl+K' },
];

/** 块级插入（菜单用） */
export const BLOCK_COMMANDS: MdCommand[] = [
  { id: 'h1', label: '一级标题', icon: Heading1 },
  { id: 'h2', label: '二级标题', icon: Heading2 },
  { id: 'h3', label: '三级标题', icon: Heading3 },
  { id: 'table', label: '插入表格', icon: Table },
  { id: 'code', label: '插入代码块', icon: Code2 },
  { id: 'quote', label: '插入引用', icon: Quote },
  { id: 'bullet', label: '无序列表', icon: List },
  { id: 'ordered', label: '有序列表', icon: ListOrdered },
  { id: 'todo', label: '待办项', icon: ListChecks },
  { id: 'hr', label: '分割线', icon: Minus },
];

/**
 * 剪贴板组：剪切 / 复制 / 粘贴。放在菜单最上方，与 Typora 的分组顺序一致。
 *
 * @returns 三条剪贴板命令
 */
export function clipboardGroup(): MdMenuItem[] {
  return [
    { id: 'cut', label: '剪切', icon: Scissors, hint: 'Ctrl+X' },
    { id: 'copy', label: '复制', icon: Copy, hint: 'Ctrl+C' },
    { id: 'paste', label: '粘贴', icon: ClipboardPaste, hint: 'Ctrl+V' },
  ];
}

/**
 * 删除当前块。
 *
 * @returns 一条删除命令
 */
export function deleteGroup(): MdMenuItem[] {
  return [{ id: 'delete-block', label: '删除这一段', icon: Trash2 }];
}

/**
 * `段落 ▸` 子菜单：标题档位 + 列表 / 引用 / 正文。
 *
 * @param ctx 光标上下文（用来给当前生效的那一项打高亮）
 * @returns 子菜单条目
 */
function paragraphSubmenu(ctx: ContextInfo): MdSubmenu {
  return {
    label: '段落',
    icon: Pilcrow,
    items: [
      { id: 'h1', label: '一级标题', icon: Heading1, active: ctx.headingLevel === 1 },
      { id: 'h2', label: '二级标题', icon: Heading2, active: ctx.headingLevel === 2 },
      { id: 'h3', label: '三级标题', icon: Heading3, active: ctx.headingLevel === 3 },
      { separator: true },
      { id: 'quote', label: '引用', icon: Quote, active: ctx.quote },
      { id: 'bullet', label: '无序列表', icon: List, active: ctx.list },
      { id: 'ordered', label: '有序列表', icon: ListOrdered, active: ctx.list },
      { id: 'todo', label: '待办项', icon: ListChecks },
      { separator: true },
      { id: 'normal', label: '正文', icon: Type, active: !ctx.quote && !ctx.list && !ctx.heading },
    ],
  };
}

/**
 * `插入 ▸` 子菜单：图片 / 表格 / 代码块 / 分割线 / 列表 / 引用。
 *
 * @returns 子菜单条目
 */
function insertSubmenu(): MdSubmenu {
  return {
    label: '插入',
    icon: Plus,
    items: [
      { id: 'image', label: '图片', icon: ImageIcon },
      { id: 'table', label: '表格', icon: Table },
      { id: 'codeblock', label: '代码块', icon: Code2 },
      { id: 'hr', label: '分割线', icon: Minus },
      { separator: true },
      { id: 'bullet', label: '无序列表', icon: List },
      { id: 'ordered', label: '有序列表', icon: ListOrdered },
      { id: 'todo', label: '待办项', icon: ListChecks },
      { id: 'quote', label: '引用', icon: Quote },
    ],
  };
}

/**
 * 表格组：按 Typora 的表格右键菜单分组（官方文档 + 本机实测一致）。
 * 顺序：上方/下方插入行 → 左侧/右侧插入列 → 删除行/删除列 → 复制表格/格式化表格源码 → 删除表格。
 *
 * @returns 表格操作条目
 */
export function tableGroup(): MdMenuItem[] {
  return [
    { id: 'table-row-above', label: '上方插入行', icon: ArrowUpToLine },
    { id: 'table-row-below', label: '下方插入行', icon: ArrowDownToLine },
    { separator: true },
    { id: 'table-col-left', label: '左侧插入列', icon: ArrowLeftToLine },
    { id: 'table-col-right', label: '右侧插入列', icon: ArrowRightToLine },
    { separator: true },
    { id: 'table-row-delete', label: '删除行', icon: Trash2, hint: 'Ctrl+Shift+⌫' },
    { id: 'table-col-delete', label: '删除列', icon: Trash2 },
    { separator: true },
    { id: 'table-copy', label: '复制表格', icon: Copy },
    { id: 'table-format', label: '格式化表格源码', icon: AlignLeft },
    { separator: true },
    { id: 'table-delete', label: '删除表格', icon: Trash2 },
  ];
}

/**
 * 按光标上下文生成右键菜单项。
 *
 * ⚠️ 结构要**短**：行内格式收成一排图标、标题与插入收进子菜单；
 * 平铺会超出视口，底部条目点不到。
 *
 * @param ctx 光标上下文
 * @param opts.extended 真时补上撤销/重做、全选、清除格式，表格组换成完整版
 *                     （旧编辑器不认识这些命令，默认关）
 * @returns 菜单条目（含分隔线 / 子菜单 / 图标行）
 */
export function buildContextMenu(ctx: ContextInfo, opts: { extended?: boolean } = {}): MdMenuItem[] {
  const items: MdMenuItem[] = [];

  if (opts.extended) {
    items.push(
      { id: 'undo', label: '撤销', icon: Undo2, hint: 'Ctrl+Z' },
      { id: 'redo', label: '重做', icon: Redo2, hint: 'Ctrl+Shift+Z' },
      { separator: true },
    );
  }

  items.push(...clipboardGroup());

  // ── 代码块里：不给行内格式与段落，只给「跳出 / 复制内容」 ──
  if (ctx.code) {
    items.push({ separator: true });
    items.push({ id: 'code-exit', label: '在下方跳出代码块', icon: Code2 });
    items.push({ id: 'code-copy', label: '复制代码块内容', icon: Copy });
    items.push({ separator: true });
    items.push(...deleteGroup());
    return items;
  }

  // ── 行内格式：一排图标，六个文字项压成一行 ──
  items.push({ separator: true });
  items.push({ icons: INLINE_COMMANDS });

  if (opts.extended) {
    items.push({ separator: true });
    items.push({ id: 'clear-format', label: '清除格式', icon: Eraser, hint: 'Ctrl+\\' });
    items.push({ id: 'select-all', label: '全选', icon: TextSelect, hint: 'Ctrl+A' });
  }

  // ── 表格里：完整表格操作（扩展菜单）/ 两个常用项（旧菜单） ──
  if (ctx.table) {
    items.push({ separator: true });
    if (opts.extended) {
      items.push(...tableGroup());
    } else {
      items.push({ id: 'table-row', label: '在下方加一行', icon: Table, hint: 'Ctrl+Enter' });
      items.push({ id: 'table-col', label: '在右侧加一列', icon: Table });
    }
  }

  items.push({ separator: true });
  items.push(paragraphSubmenu(ctx));
  items.push(insertSubmenu());
  items.push({ separator: true });
  items.push(...deleteGroup());
  return items;
}

/** 图片上右键的菜单 */
export function buildImageMenu(): MdMenuItem[] {
  return [
    ...clipboardGroup(),
    { separator: true },
    { id: 'image-replace', label: '替换图片地址…', icon: ExternalLink },
    { id: 'image-alt', label: '修改替代文字…', icon: ImageIcon },
    { separator: true },
    { id: 'source', label: '编辑源码', icon: Code2 },
    { separator: true },
    ...deleteGroup(),
  ];
}

/** 链接上右键的菜单 */
export function buildLinkMenu(): MdMenuItem[] {
  return [
    ...clipboardGroup(),
    { separator: true },
    { id: 'link-open', label: '在新标签打开', icon: ExternalLink },
    { id: 'link-replace', label: '修改链接地址…', icon: LinkIcon },
    { separator: true },
    { id: 'source', label: '编辑源码', icon: Code2 },
    { separator: true },
    ...deleteGroup(),
  ];
}
