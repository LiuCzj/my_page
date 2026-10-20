'use client';

/** 站内搜索面板的开合状态：顶栏按钮与 Cmd/Ctrl+K 共用同一个开关。 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface SearchContextValue {
  /** 面板是否打开 */
  open: boolean;
  /** 打开面板（顶栏图标、快捷键都调它） */
  openSearch: () => void;
  /** 关闭面板 */
  closeSearch: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openSearch, closeSearch }), [open, openSearch, closeSearch]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

/** @returns 搜索面板的开合状态与动作 */
export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch 必须在 SearchProvider 内使用');
  return ctx;
}
