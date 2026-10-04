'use client';

/**
 * 键盘快捷键说明面板（按 ? 打开）。
 *
 * 【它做什么】
 * 把整站可用的快捷键列成「跳转 / 操作」两组，按 ? 弹出，Esc 或点遮罩关闭。
 * 文案全部取自字典的 shortcuts 分组（中英各一份），所以切语言时说明跟着变；
 * 按键本身（G、H、Ctrl、K、?）不翻译，渲染成 <kbd> 小方块。
 *
 * 【为什么自带 ? 触发逻辑，而不靠全局 hook 传进来】
 * 它被设计成「扔进页面就能用」：不需要调用方再写一个 useState 管开合、
 * 也不需要把 onHelp 接到 useHotkeys 上。好处是 —— 即使调用方忘了挂全局 hook，
 * 只要挂了这个组件，访客按 ? 依然能看到说明。
 * 按 ? 只负责「打开」，关闭交给 Esc / 关闭按钮 / 点遮罩 ——
 * 「打开」是幂等的，所以就算调用方额外把 hook 的 onHelp 也接到本组件，重复触发也不会出问题。
 *
 * 【焦点管理（照 ContactModal 的做法，无障碍的核心）】
 * 1. 打开前记下焦点在哪（openerRef），关闭时还回去，键盘用户不会掉回页首。
 * 2. 打开时把焦点移进面板的关闭按钮。
 * 3. Tab 在面板内部循环（焦点圈禁），不会跑到背后的页面上。
 * 4. 打开期间锁 body 滚动，关闭时恢复原值（不写死成 ''，否则会覆盖别处设过的值）。
 * 5. role="dialog" + aria-modal="true" + aria-labelledby 指向标题。
 *
 * 【z-index】用 z-[100]，与 ContactModal 同级、高于聊天面板 z-[80]，
 * 保证说明面板不会被聊天窗盖住（层级约定见 app/layout.tsx 的注释）。
 *
 * 【点遮罩关闭的一个细节】
 * 遮罩层特意加 pointer-events-none：让它不参与命中测试，
 * 点空白处的点击会穿透到外层容器本身，于是 e.target === e.currentTarget 成立、
 * 关闭逻辑命中；而点面板时 e.target 是面板或其子元素，不等于容器，不会误关。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { isEditableTarget } from '@/lib/use-hotkeys';

/** 参与焦点圈禁的可聚焦元素选择器（与 ContactModal 保持一致） */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 一个按键方块。
 * 颜色只用语义令牌（bg-secondary / border-border / text-secondary-foreground），
 * 深浅两套主题各自成立；等宽字体让 Ctrl、K 这些字符对齐、读起来像键帽。
 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-secondary-foreground">
      {children}
    </kbd>
  );
}

/**
 * 一组按键。
 *
 * @param keys     按键序列
 * @param sequence true = 依次按（G → H）；false = 同时按（Ctrl + K）
 */
function Keys({ keys, sequence }: { keys: string[]; sequence: boolean }) {
  // 序列用「→」表示先后，组合用「+」表示同时 —— 两种读法不能混
  const sep = sequence ? '→' : '+';
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-1">
          {/* 分隔符只是视觉提示，读屏时读「G H」即可，所以标 aria-hidden */}
          {i > 0 && (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              {sep}
            </span>
          )}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}

/** 一行说明：左边是用途，右边是对应按键 */
interface ShortcutRow {
  keys: string[];
  label: string;
  sequence: boolean;
}

/**
 * 快捷键说明面板。
 *
 * 【两种用法】
 * · 不传 open → 非受控：组件自己监听 `?` 打开，适合「只想挂一个面板」的场景。
 * · 传了 open + onOpenChange → 受控：开合由外部决定。
 *   右下角那颗常驻提示按钮（components/ShortcutLayer.tsx）需要这一档 ——
 *   按钮和面板是两个组件，状态必须住在它们的共同父级，面板不能自己说了算。
 *
 * @param props.className 外部追加的类名
 * @param props.open 受控开合状态；不传则由组件自管
 * @param props.onOpenChange 开合变化回调，两种模式下都会调用
 */
export default function ShortcutHelp({
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { d } = useI18n();
  /** 非受控模式下的内部状态；受控时这份状态不会被读 */
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  /** 传了 open 就算受控，开合权交给外部 */
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  /**
   * 统一的开合入口。
   * 受控时只通知外部（自己不存），非受控时改内部状态 ——
   * 这样 `?` 键、Esc、点遮罩三个入口不必各写一套分支。
   */
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  /** 打开前的焦点元素，关闭时归还给它 */
  const openerRef = useRef<HTMLElement | null>(null);
  /** 系统开了「减少动态效果」时不做任何动画 */
  const reduceMotion = useReducedMotion();

  /**
   * 修饰键的显示文本。
   * Mac 显示 ⌘，其余显示 Ctrl。首帧统一是 Ctrl，挂载后再按 UA 判定 ——
   * 但面板只在交互后才渲染，那时早已挂载完毕，不存在 hydration 不一致。
   */
  const [modKey, setModKey] = useState('Ctrl');
  useEffect(() => {
    setModKey(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl');
  }, []);

  /** 关闭面板。焦点归还放在打开 effect 的清理函数里，这里只改状态 */
  const close = useCallback(() => setOpen(false), [setOpen]);

  /**
   * ? 触发：本组件自带的打开入口。
   * 与全局 hook 的输入控件判断复用同一个 isEditableTarget ——
   * 在搜索框 / 聊天输入框里打问号不会被弹窗打断。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      // 带修饰键的 ?（如 Cmd+Shift+/）交给全局 hook 处理，这里不抢
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // setOpen 是 useCallback 的产物，受控模式下它的引用会随 onOpenChange 变化，
    // 所以必须进依赖数组 —— 漏了会一直绑着第一版回调，表现为「按 ? 打不开面板」。
  }, [setOpen]);

  /**
   * 打开期间的三件事：Esc 关闭 + Tab 焦点圈禁 + 锁背景滚动，并把焦点移进面板。
   * 监听挂在 document 而不是面板上：点遮罩时焦点可能落在 body，
   * 只监听面板会漏掉 Esc（与 ContactModal 同一处理）。
   */
  useEffect(() => {
    if (!open) return;

    // 记下打开前的焦点。必须在移动焦点之前取，否则 activeElement 已经变了
    openerRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled'));
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

    document.addEventListener('keydown', onKeyDown);
    // 锁背景滚动：手机上弹窗后面的页面不再跟着滑
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 初始焦点放进关闭按钮
    closeBtnRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // 焦点归还：把焦点还给当初触发它的元素
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open, close]);

  /** 跳转组：全部是 G 开头的两键序列 */
  const navRows: ShortcutRow[] = [
    { keys: ['G', 'H'], label: d.shortcuts.goHome, sequence: true },
    { keys: ['G', 'P'], label: d.shortcuts.goProjects, sequence: true },
    { keys: ['G', 'N'], label: d.shortcuts.goNotes, sequence: true },
  ];

  /** 操作组：搜索 / 主题是「修饰键 + 字母」，其余是 G 序列或单键 */
  const actionRows: ShortcutRow[] = [
    { keys: [modKey, 'K'], label: d.shortcuts.openSearch, sequence: false },
    { keys: ['G', 'C'], label: d.shortcuts.openChat, sequence: true },
    { keys: [modKey, '/'], label: d.shortcuts.toggleTheme, sequence: false },
    { keys: ['G', 'L'], label: d.shortcuts.toggleLang, sequence: true },
    { keys: ['?'], label: d.shortcuts.showHelp, sequence: false },
  ];

  /** 渲染一组快捷键（组标题 + 行列表） */
  const renderGroup = (title: string, rows: ShortcutRow[]) => (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5"
          >
            <span className="text-sm text-foreground">{row.label}</span>
            <Keys keys={row.keys} sequence={row.sequence} />
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcut-help"
          role="presentation"
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${className ?? ''}`}
          // 点遮罩关闭：遮罩层是 pointer-events-none，所以点空白处命中的是容器本身
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          {/* 半透明遮罩：bg-black/60 与主题无关，深浅两套的暗化效果都成立。
              pointer-events-none 让点击穿透到容器，见文件头「点遮罩关闭」那段说明 */}
          <div className="pointer-events-none absolute inset-0 bg-black/60" aria-hidden="true" />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-help-title"
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="shortcut-help-title"
                className="flex items-center gap-2 text-base font-bold text-foreground"
              >
                {/* 全站唯一的交互强调色：给标题一枚蓝色键盘图标，别处不再加色 */}
                <Keyboard size={18} className="text-accent" aria-hidden="true" />
                {d.shortcuts.title}
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                aria-label={d.shortcuts.close}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {renderGroup(d.shortcuts.navGroup, navRows)}
              {renderGroup(d.shortcuts.actionGroup, actionRows)}
            </div>

            <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
              {d.shortcuts.hint}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
