'use client';

/** 数字分身聊天窗的开关状态。 */

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
    throw new Error('useTwinChat 必须在 <TwinChatProvider> 内部使用。');
  }
  return ctx;
}
