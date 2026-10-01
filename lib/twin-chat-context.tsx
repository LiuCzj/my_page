'use client';

/**
 * 数字分身聊天窗的开关状态。
 *
 * 【为什么要单独一个 Context】
 * 聊天窗改成悬浮面板后，控制它的人不止一个：首屏的角色（点一下开、再点一下关）、
 * 顶栏的「问分身」、移动端抽屉里的同一个入口，都要能开关同一个窗口。
 * 如果把这个 state 放在其中任何一个组件里，另外几个就得靠 props 层层传，
 * 而它们中间还隔着服务端组件 —— 传不过去。
 * 所以用一个只装布尔状态的 Provider，谁要用谁 useTwinChat()。
 *
 * 【刻意不做的事】
 * 不持久化这个开关状态：刷新后聊天窗应该收起，不会一打开页面就糊住首屏。
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface TwinChatContextValue {
  /** 聊天窗是否展开 */
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const TwinChatContext = createContext<TwinChatContextValue | null>(null);

/**
 * 聊天窗开关的提供者，挂在 app/page.tsx 里包住首屏与面板。
 * @param children 被包裹的子树
 */
export function TwinChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);
  const toggleChat = useCallback(() => setOpen((prev) => !prev), []);

  const value = useMemo<TwinChatContextValue>(
    () => ({ open, openChat, closeChat, toggleChat }),
    [open, openChat, closeChat, toggleChat],
  );

  return <TwinChatContext.Provider value={value}>{children}</TwinChatContext.Provider>;
}

/**
 * 读取/控制聊天窗开关。
 * @returns 开关状态与三个操作方法
 * @throws 在 TwinChatProvider 之外调用时抛错，避免静默拿到 undefined
 */
export function useTwinChat(): TwinChatContextValue {
  const ctx = useContext(TwinChatContext);
  if (!ctx) {
    throw new Error('useTwinChat 必须在 <TwinChatProvider> 内部使用（见 app/page.tsx）。');
  }
  return ctx;
}
