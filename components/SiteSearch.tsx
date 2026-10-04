'use client';

/**
 * 站内搜索面板（Cmd / Ctrl + K 唤起）。
 *
 * 【它做什么】
 * 一个命令面板式的搜索浮层：顶部输入框，下面按「项目 / 笔记 / 技术栈 / 工具 / 页面」
 * 分组列出命中的条目，键盘 ↑↓ 选择、Enter 打开、Esc 关闭，鼠标 hover 同步高亮。
 *
 * 【为什么是受控组件（open + onOpenChange）】
 * 打开入口有两个：全局快捷键 hook（lib/use-hotkeys.ts 的 onSearch）和界面里的搜索按钮。
 * 组件自己管开合的话，快捷键就没法从外面把它打开。所以开合状态由调用方持有，
 * 本组件只负责渲染与「请求改变」—— 这样任何入口都只是调 onOpenChange(true)。
 *
 * 【笔记为什么走 props 而不是自己读】
 * 笔记与项目都存在数据库里（lib/content.ts），客户端组件不能 import 它，否则原生模块会进浏览器包。
 * 由服务端组件（app/layout.tsx）读好后以 notes 属性传进来，这里只消费纯数据。
 *
 * 【焦点 / 滚动 / 层级，照抄站内既有浮层】
 * - 打开时记下触发元素，关闭时把焦点还回去（照 ContactModal，键盘用户不会掉回页首）。
 * - 打开时锁 body 滚动并记录原值，关闭时恢复原值（不写死成 ''，避免覆盖别处设过的值）。
 * - Tab 在面板内部循环（焦点圈禁），不会跑到背后的页面上。
 * - z-[100]：与 ContactModal / ShortcutHelp 同级，高于聊天面板 z-[80]。
 *   （层级约定：顶栏 z-50、聊天 z-[80]、抽屉 z-[90]、弹窗 z-[100]。）
 *
 * 【颜色只用语义令牌】
 * bg-card / bg-background / text-foreground / text-muted-foreground / border-border /
 * bg-secondary / text-accent。accent 是紫色，全站唯一强调色 —— 这里只给「选中项的小图标」
 * 上紫，其余一律中性色，深浅两套主题都成立。
 *
 * 【无障碍取舍：combobox + listbox，选项是真实链接】
 * 输入框用 role="combobox" + aria-activedescendant，列表用 role="listbox"，
 * 每条结果 role="option" 且 tabIndex={-1}（选项不进 Tab 序列，方向键就是它的导航方式）。
 * 选项本身是 <Link> / <a>，保留真实链接语义（可中键新开、可右键复制地址），
 * Enter 时直接 .click() 这个链接复用它的行为，而不是另写一套 window.location。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Brain, Compass, FileText, FolderGit2, Search, Wrench, X, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  buildSearchIndex,
  filterEntries,
  groupEntries,
  type SearchEntry,
  type SearchGroup,
  type SearchNote,
  type SearchProject,
} from '@/lib/search-index';

/**
 * 重新导出条目形状。
 * 服务端组件从 lib/content.ts 拿到 NoteMeta / ProjectRecord 后，
 * 只需挑出对应字段即可满足本组件的 notes / projects 属性。
 */
export type { SearchNote, SearchProject };

/** 搜索面板的属性 */
export interface SiteSearchProps {
  /** 是否打开。开合由外部驱动（快捷键 hook / 搜索按钮） */
  open: boolean;
  /** 请求改变开合状态。组件内部只调用它，不自己持有状态 */
  onOpenChange: (open: boolean) => void;
  /** 服务端读好的笔记元数据（本组件不碰数据库，见文件头说明） */
  notes: SearchNote[];
  /** 服务端读好的项目列表 */
  projects: SearchProject[];
  /** 追加在浮层根节点上的类名，供调用方做位置微调 */
  className?: string;
}

/**
 * 每个分组对应的图标。
 * 只给分组一个图标做视觉锚点，不引入任何额外色相 —— 图标颜色在行内按选中态决定。
 */
const GROUP_ICON: Record<SearchGroup, LucideIcon> = {
  projects: FolderGit2,
  notes: FileText,
  skills: Brain,
  tools: Wrench,
  pages: Compass,
};

/** 参与焦点圈禁的可聚焦元素选择器（与 ContactModal / ShortcutHelp 保持一致） */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 一枚按键小方块，用在底部操作提示里。
 * 等宽字体 + 语义令牌，深浅两套主题都成立。
 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border bg-secondary px-1 font-mono text-[10px] font-semibold leading-4 text-secondary-foreground">
      {children}
    </kbd>
  );
}

/** 一条结果行需要的属性 */
interface ResultRowProps {
  entry: SearchEntry;
  /** 该行在扁平结果里的全局序号（键盘导航与 aria 都用它） */
  index: number;
  /** 是否为当前高亮项 */
  active: boolean;
  /** 鼠标进入时把高亮移过来 */
  onHover: (index: number) => void;
  /** 点击时打开并关闭面板 */
  onActivate: () => void;
  /** 把 DOM 节点登记到 ref 数组，供 Enter / 滚动定位使用 */
  registerRef: (index: number, el: HTMLAnchorElement | null) => void;
}

/**
 * 一条搜索结果。
 *
 * 【为什么站内用 <Link>、站外用 <a>】
 * 站内跳转交给 next/link 做客户端路由（不整页刷新）；站外链接（项目的 GitHub 地址）
 * 用 <a target="_blank" rel="noopener noreferrer">，rel 里带 noopener 是防「被打开页面
 * 通过 window.opener 反向操作本页」的标准做法。
 *
 * 【为什么 tabIndex={-1}】
 * 选项在 listbox 模式里不参与 Tab 序列 —— 键盘用户用 ↑↓ 在选项间移动（配合
 * aria-activedescendant），Tab 只用于在输入框和关闭按钮之间走。把它从 Tab 序列里拿掉，
 * 焦点就不会被 Tab 甩到列表深处，方向键的语义也不会和 Tab 打架。
 *
 * 【为什么两种链接都带 role="option"】
 * 视觉与读屏需要一致的「列表选项」语义，光标高亮项由 aria-selected 表达。
 */
function ResultRow({ entry, index, active, onHover, onActivate, registerRef }: ResultRowProps) {
  const Icon = GROUP_ICON[entry.group];
  const optionId = `site-search-option-${index}`;
  // 选中态只改背景（bg-secondary）与小图标颜色（text-accent）；未选中一律透明背景
  const rowClass = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
    active ? 'bg-secondary' : ''
  }`;

  const content = (
    <>
      <Icon
        size={16}
        aria-hidden="true"
        className={`shrink-0 ${active ? 'text-accent' : 'text-muted-foreground'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{entry.title}</span>
        {entry.subtitle && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{entry.subtitle}</span>
        )}
      </span>
      {/* 右侧小标签：项目显示技术栈、笔记显示标签，最多两个，窄屏隐藏以免挤掉标题 */}
      {entry.tags && entry.tags.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {entry.tags.slice(0, 2).map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </>
  );

  // 站外：真实 <a>，新标签页打开
  if (entry.external) {
    return (
      <a
        ref={(el) => registerRef(index, el)}
        id={optionId}
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onMouseEnter={() => onHover(index)}
        onClick={onActivate}
        className={rowClass}
      >
        {content}
      </a>
    );
  }

  // 站内：next/link，客户端路由跳转
  return (
    <Link
      ref={(el) => registerRef(index, el)}
      id={optionId}
      href={entry.href}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseEnter={() => onHover(index)}
      onClick={onActivate}
      className={rowClass}
    >
      {content}
    </Link>
  );
}

/**
 * 搜索面板主体。
 *
 * @param props.open         是否打开（受控）
 * @param props.onOpenChange 请求改变开合
 * @param props.notes        服务端传入的笔记元数据
 * @param props.className    追加到浮层根节点的类名
 */
export default function SiteSearch({ open, onOpenChange, notes, projects, className }: SiteSearchProps) {
  const { d, lang } = useI18n();
  /** 系统开了「减少动态效果」时不做任何动画 */
  const reduceMotion = useReducedMotion();

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 打开前的焦点元素，关闭时归还给它 */
  const openerRef = useRef<HTMLElement | null>(null);
  /** 每条结果行的 DOM 节点，按全局序号存放；Enter 与滚动定位靠它 */
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * 全量索引。
   * 随「语言」或「笔记/项目数据」变化重建：切中英文时每条条目的展示文案要跟着换，
   * 而匹配文本里始终带着双语，所以切换语言不会丢失另一种语言的可搜性。
   */
  const index = useMemo(() => buildSearchIndex({ notes, projects, lang }), [notes, projects, lang]);

  /**
   * 过滤 + 分组，并给每条打上全局序号。
   * 序号必须与「渲染顺序」完全一致，键盘 ↑↓ 才和眼睛看到的一致：
   * 所以先按 GROUP_ORDER 分组，再在分组结果上从 0 连续编号。
   */
  const sections = useMemo(() => {
    let cursor = 0;
    return groupEntries(filterEntries(index, query)).map((section) => ({
      group: section.group,
      items: section.items.map((entry) => ({ entry, index: cursor++ })),
    }));
  }, [index, query]);

  /** 扁平顺序 = 渲染顺序。键盘导航与 aria-activedescendant 都基于它 */
  const ordered = useMemo(() => sections.flatMap((s) => s.items.map((it) => it.entry)), [sections]);

  /**
   * 打开期间的收尾工作。
   *
   * 放在一个 effect 里统一处理「进入」与「离开」两半：
   *   进入：记录触发元素 → 锁 body 滚动（先存原值）→ 重置查询与高亮 → 聚焦输入框
   *   离开：清定时器 → 恢复滚动原值 → 焦点还给触发元素
   * 这样即便组件被直接卸载（而不是走关闭分支），滚动锁与焦点也不会留在错误状态。
   *
   * 【为什么聚焦要延后一帧】
   * 面板是刚挂载的，动画 / 布局还没稳定，立刻 focus 在部分浏览器上会失败。
   * 等 30ms 再聚焦，稳定可靠。
   */
  useEffect(() => {
    if (!open) return;

    // 必须在移动焦点之前取，否则 activeElement 已经变成输入框了
    openerRef.current = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 每次打开都从「空查询 + 高亮第一条」开始，行为可预期
    setQuery('');
    setActiveIndex(0);

    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  /** 查询变化 → 高亮回到第一条（新结果的第一个才是「最相关」的起点） */
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  /**
   * 结果数量变化 → 把高亮夹回有效范围。
   * 删字 / 改词后结果可能变少，若高亮停在越界的位置，Enter 会打不开任何东西。
   */
  useEffect(() => {
    setActiveIndex((i) => (ordered.length === 0 ? 0 : Math.min(i, ordered.length - 1)));
  }, [ordered.length]);

  /**
   * 高亮项滚动进视野。
   * block: 'nearest' 只在确实超出可视区时才滚动，且只滚最近的滚动容器（这里就是结果列表），
   * 不会把背后的页面拽走 —— 与 DigitalTwinChat 里滚动到底用的是同一种克制做法。
   */
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, ordered.length]);

  /** 登记结果行的 DOM 节点 */
  const registerRef = useCallback((index: number, el: HTMLAnchorElement | null) => {
    rowRefs.current[index] = el;
  }, []);

  /** 关闭面板（只改状态，滚动与焦点的恢复交给上面那个 effect 的清理函数） */
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /** 上下移动高亮。到头 / 到尾时环绕，长列表里不用反复按反方向键 */
  const move = useCallback(
    (delta: number) => {
      setActiveIndex((i) => {
        if (ordered.length === 0) return 0;
        return (i + delta + ordered.length) % ordered.length;
      });
    },
    [ordered.length],
  );

  /**
   * 打开第 index 条结果。
   *
   * 优先 .click() 真实链接节点：站内走 next/link 的客户端路由，站外走 target=_blank，
   * 语义与鼠标点击完全一致。只有在节点缺失（理论上不会发生）时才退回 window.open。
   * 打开后立刻请求关闭面板 —— 导航与关闭互不阻塞。
   */
  const activate = useCallback(
    (index: number) => {
      const entry = ordered[index];
      if (!entry) return;
      const el = rowRefs.current[index];
      if (el) el.click();
      else if (entry.external) window.open(entry.href, '_blank', 'noopener,noreferrer');
      onOpenChange(false);
    },
    [ordered, onOpenChange],
  );

  /**
   * 面板内的键盘处理（挂在面板容器上，事件从输入框 / 链接冒泡上来都能接住）。
   *
   * Esc 关闭；↑↓ 移动高亮并阻止默认行为（否则输入框里光标会跳到行首行尾）；
   * Enter 打开当前高亮项；Tab 做焦点圈禁。
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(activeIndex);
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;

    // 焦点圈禁：只收集输入框与关闭按钮。结果行带 role="option"（tabIndex=-1），
    // 但选择器里的 [href] 仍会命中它们，所以这里显式排除 —— 选项由方向键导航，不该进 Tab 序列。
    const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('role') !== 'option',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // 循环：最后一个元素按 Tab 回到第一个，第一个按 Shift+Tab 回到最后一个
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /** 分组小标题文案，全部取自字典 search 分组（中英各一份） */
  const groupLabels: Record<SearchGroup, string> = {
    projects: d.search.groupProjects,
    notes: d.search.groupNotes,
    skills: d.search.groupSkills,
    tools: d.search.groupTools,
    pages: d.search.groupPages,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="site-search"
          role="presentation"
          className={`fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh] ${className ?? ''}`}
          // 点遮罩关闭：遮罩层是 pointer-events-none，点空白处命中的是容器本身。
          // 用 pointerdown 而不是 mousedown，触屏上才不会有半拍延迟（同 ContactModal）。
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
        >
          {/* 半透明遮罩：bg-black/60 与主题无关，深浅两套的暗化效果都成立。
              pointer-events-none 让点击穿透到容器，见上面「点遮罩关闭」的说明 */}
          <div className="pointer-events-none absolute inset-0 bg-black/60" aria-hidden="true" />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={d.search.open}
            className="relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            onKeyDown={onKeyDown}
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
          >
            {/* 头部：搜索图标 + 输入框 + 关闭按钮。shrink-0 保证它不随结果滚动消失 */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4">
              <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={d.search.placeholder}
                // combobox + listbox 模式：输入框是组合框，列表是它的弹出列表
                role="combobox"
                aria-expanded={true}
                aria-controls="site-search-list"
                aria-activedescendant={ordered.length > 0 ? `site-search-option-${activeIndex}` : undefined}
                aria-autocomplete="list"
                aria-label={d.search.placeholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-[52px] min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={d.search.hintClose}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/*
              结果列表：唯一会滚动的部分。
              min-h-0 是 flex 子项能内部滚动的必要条件；overscroll-contain 让列表滚到头时
              不再把背后的页面一起拖动（同 DigitalTwinChat 的消息区）。
            */}
            <div
              id="site-search-list"
              role="listbox"
              aria-label={d.search.open}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
            >
              {ordered.length === 0 ? (
                // 空态：给一句「没找到」和一条「换个更短的关键词」的引导
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-foreground">{d.search.empty}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{d.search.emptyHint}</p>
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section.group} className="mb-1">
                    {/* 分组小标题：中性色小字，不给强调色，让 accent 只属于选中项 */}
                    <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {groupLabels[section.group]}
                    </div>
                    {section.items.map(({ entry, index }) => (
                      <ResultRow
                        key={entry.id}
                        entry={entry}
                        index={index}
                        active={index === activeIndex}
                        onHover={setActiveIndex}
                        onActivate={() => activate(index)}
                        registerRef={registerRef}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* 底部操作提示：按键用 Kbd 小方块，说明文字取自字典 */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {d.search.hintSelect}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>↵</Kbd>
                {d.search.hintOpen}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Esc</Kbd>
                {d.search.hintClose}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
