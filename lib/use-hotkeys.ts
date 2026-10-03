'use client';

/**
 * 全局键盘快捷键（整站唯一的一处 keydown 总入口）。
 *
 * 【这个 hook 负责哪些键】
 *   1. G 序列（按下 G，1 秒内再按第二键）：
 *        G H → 首页 /         G P → 项目页 /projects
 *        G N → 笔记页 /notes  G C → 打开数字分身
 *        G L → 中英切换
 *   2. Cmd/Ctrl + K → 打开站内搜索。搜索 UI 由别的组件负责，这里只把「意图」回调出去
 *      （handlers.onSearch），不碰任何搜索实现。
 *   3. Cmd/Ctrl + / → 切换深浅色。直接走 next-themes，不绕经调用方。
 *   4. ?（即 Shift + /）→ 打开快捷键说明面板。ShortcutHelp 自带触发逻辑，
 *      这里的 onHelp 只是给「想自己实现说明面板」的调用方留的口子。
 *   5. Esc → 请求关闭当前浮层（handlers.onClosePanel）。
 *
 * 【为什么要把「最新的回调」放进 ref，而不是塞进 useEffect 依赖数组】
 * 依赖数组里一旦出现回调，父组件每次渲染传进来的新函数都会让 effect 解绑、重绑一次
 * window 监听（React 认为依赖变了）。父组件渲染多频繁，键盘监听就重绑多频繁 ——
 * 既浪费，又会在重绑的那一瞬间漏掉按键。所以这里 effect 的依赖是**空数组**，只绑一次；
 * 所有会变的东西（回调、主题状态、路由）统一收进一个 ref，每次渲染后刷新，
 * 按键触发时读到的永远是最新值。这就是所谓「用 ref 绕开闭包陷阱」。
 *
 * 【为什么 G 序列的状态用 ref 而不是 useState】
 * 按下 G 只是「进入等待第二键」的中间状态，界面上没有任何东西需要跟着它变。
 * 用 state 会让每一次按 G 都触发一次 React 重渲染 —— 一个纯键盘手势不该惊动渲染树。
 * ref 的读写是同步的，也正好符合「按下 G、下一个事件里立刻读到」的时序要求。
 *
 * 【为什么必须在输入控件里直接 return（本文件最重要的一条）】
 * 快捷键监听挂在 window 上，是全局的。用户在搜索框、聊天输入框里打字时，
 * 敲下的每一个字母都会冒泡到这里：在输入框里打一句 "go home" 就会连按 G、H，
 * 于是页面被导航走、输入框被弹窗打断。所以第一件事就是判断事件目标是不是输入控件，
 * 是就整段跳过。判断逻辑抽成 isEditableTarget，面板组件也复用同一份。
 *
 * 【挂载位置（由使用方保证）】
 * 必须挂在 <I18nProvider> 与 <TwinChatProvider> 内部 —— 也就是和 <Navbar> 同一层
 * （见 app/layout.tsx）。本 hook 内部要用 useTheme / useI18n / useTwinChat，
 * 这三个 Context 分别由 layout 的三层 Provider 提供，挂低了会在首次渲染时抛错。
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

/**
 * G 序列的宽限时间（毫秒）。
 * 按下 G 之后，在这个时间内按下的第二个键才被当成「G + 某键」；
 * 超时则序列作废，避免「很久以前按过 G」导致后面一个无关的字母触发跳转。
 * 1000ms 是一只手自然连按两个键的宽松上限，再短会漏、再长会误触。
 */
const SEQUENCE_TIMEOUT_MS = 1000;

/**
 * 判断键盘事件的落点是不是「正在输入的控件」。
 *
 * 【为什么用 isContentEditable + closest 两道判断，而不是只比 tagName】
 * 富文本编辑器（contenteditable）里的可编辑区域，事件目标常常是里层的 <span>，
 * 只看 tagName 会漏掉。isContentEditable 对「自身可编辑」和「落在可编辑祖先里」
 * 都返回 true；closest('[contenteditable]') 再兜一道，防止个别浏览器对
 * 嵌套结构判断不一致。两道一起上，宁可多挡，不可漏挡 —— 漏挡的代价是打字被弹窗打断。
 *
 * @param target 键盘事件的 e.target（可能是 Document、Window 等非元素）
 * @returns 目标处于可输入状态时返回 true，此时调用方应跳过快捷键处理
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * 调用方需要接管的快捷键回调。
 * 三项都可选：没传的键就当作「这个站点没实现该功能」，安静地什么都不做。
 */
export interface HotkeyHandlers {
  /** Cmd/Ctrl + K：打开站内搜索（搜索组件由调用方提供） */
  onSearch?: () => void;
  /** ?：打开快捷键说明面板（ShortcutHelp 自带触发，这里仅供自定义面板使用） */
  onHelp?: () => void;
  /** Esc：请求关闭当前浮层 */
  onClosePanel?: () => void;
}

/**
 * 注册全局快捷键。
 *
 * @param handlers 需要由调用方接管的回调；未提供的快捷键将不产生任何动作
 */
export function useHotkeys(handlers: HotkeyHandlers = {}): void {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { toggleLang } = useI18n();
  const { openChat } = useTwinChat();

  /**
   * 把「每次渲染都可能变的东西」全部收进一个 ref。
   * effect 只读 latest.current，因此它的依赖数组可以留空 —— 监听只绑一次。
   * 初值就用首次渲染的值，之后由下面那个无依赖 effect 在每次渲染后刷新。
   */
  const latest = useRef({
    handlers,
    router,
    resolvedTheme,
    setTheme,
    toggleLang,
    openChat,
  });

  // 无依赖数组 = 每次渲染后都执行一次。这里只是给 ref 赋最新值，开销可忽略。
  useEffect(() => {
    latest.current = { handlers, router, resolvedTheme, setTheme, toggleLang, openChat };
  });

  /**
   * G 序列的中间状态。
   * 用 ref 保存，原因见文件头：按键不该触发重渲染。
   */
  const awaitingSecondKey = useRef(false);
  /** 序列超时定时器的 id；卸载时必须清掉，否则会在组件消失后触发回调 */
  const sequenceTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    /** 结束当前 G 序列：清掉等待标记与定时器。所有分支离开时都要调它 */
    const resetSequence = () => {
      awaitingSecondKey.current = false;
      if (sequenceTimer.current !== undefined) {
        window.clearTimeout(sequenceTimer.current);
        sequenceTimer.current = undefined;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // 第一道闸：输入控件里不响应任何快捷键（本文件最关键的规则，详见文件头）
      if (isEditableTarget(e.target)) return;
      // 长按会以 repeat 连续触发。忽略它，避免按住 G 时反复起序列、按住某键时反复导航
      if (e.repeat) return;

      const { handlers: h, router: r, resolvedTheme: theme, setTheme: apply, toggleLang: toggle, openChat: open } =
        latest.current;
      /** 是否为「命令键」组合：Mac 的 ⌘ 或 Windows/Linux 的 Ctrl */
      const mod = e.metaKey || e.ctrlKey;

      // Esc：请求关闭浮层。放在最前面，任何状态下都应能被关掉
      if (e.key === 'Escape') {
        resetSequence();
        h.onClosePanel?.();
        return;
      }

      // Cmd/Ctrl + K：搜索。浏览器默认把 Cmd/Ctrl+K 当成「聚焦地址栏/站内搜索」，
      // 不 preventDefault 的话地址栏会被抢走，所以必须拦。
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        resetSequence();
        h.onSearch?.();
        return;
      }

      // Cmd/Ctrl + /：切深浅色。直接操作 next-themes，不经调用方。
      if (mod && e.key === '/') {
        e.preventDefault();
        resetSequence();
        apply(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      // ?（Shift + /）：打开快捷键说明面板。
      // 只有不带其它修饰键时才算「?」，否则 Cmd+Shift+/ 会和上面的 Cmd+/ 抢。
      if (e.key === '?') {
        if (!mod && !e.altKey) {
          resetSequence();
          h.onHelp?.();
        }
        return;
      }

      // 到这里还没处理的，只认「不带修饰键的单字母」。
      // 放行 Cmd+H / Ctrl+P 之类的话，它们会被当成 G 序列的第二键，误触发跳转。
      if (mod || e.altKey) return;

      const key = e.key.toLowerCase();

      // 已经在 G 序列中：这一下就是第二个键
      if (awaitingSecondKey.current) {
        resetSequence();
        if (key === 'h') r.push('/');
        else if (key === 'p') r.push('/projects');
        else if (key === 'n') r.push('/notes');
        else if (key === 'c') open();
        else if (key === 'l') toggle();
        // 其它第二键：序列作废，什么都不做（已经在 resetSequence 里收尾）
        return;
      }

      // 第一键：G。进入等待第二键的状态，并起一个超时定时器
      if (key === 'g') {
        awaitingSecondKey.current = true;
        // 理论上不会已有定时器（进入序列前必然已清），保险起见再清一次，避免叠加
        if (sequenceTimer.current !== undefined) window.clearTimeout(sequenceTimer.current);
        sequenceTimer.current = window.setTimeout(() => {
          awaitingSecondKey.current = false;
          sequenceTimer.current = undefined;
        }, SEQUENCE_TIMEOUT_MS);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      // 卸载时清掉序列定时器：留着它，回调会在组件已消失后仍然执行
      resetSequence();
    };
    // 空依赖：只绑一次。所有可变数据都通过 latest ref 读取，不存在闭包过期问题。
  }, []);
}
