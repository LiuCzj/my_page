'use client';

/** 全站登录态。 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/** 前端看到的用户形状（与 lib/auth.ts 的 PublicUser 一致） */
export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: number;
  isAdmin: boolean;
}

interface AuthState {
  /** undefined = 加载中；null = 未登录 */
  user: AuthUser | null | undefined;
  /** 重新拉取登录态（登录/登出/注销之后调用） */
  refresh: () => Promise<void>;
  /** 本地直接改登录态（接口已经返回了用户对象时省一次请求） */
  setUser: (u: AuthUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  /** 服务端首屏读到的登录态（由 app/layout.tsx 传入）。 */
  initialUser?: AuthUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null | undefined>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = (await res.json()) as { user?: AuthUser | null };
      setUser(data.user ?? null);
    } catch {
      // 网络失败按「未登录」处理：宁可让用户重新登录，也不要卡在加载态
      setUser(null);
    }
  }, []);

  useEffect(() => {
    /* 它可能是过期的（页面被缓存、cookie 刚变过），所以挂载后仍要问一次服务端。 */
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, refresh, setUser }}>{children}</AuthContext.Provider>
  );
}

/**
 * 取登录态。
 * @throws 不在 AuthProvider 内使用时抛错 —— 这类错误早点炸出来比默默拿到 undefined 好查
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
