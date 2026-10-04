'use client';

/**
 * 全站登录态。
 *
 * 【为什么需要一个全局 Context】
 * 改造前只有评论区用到登录态，所以它自己 fetch 一次 `/api/auth/me` 就够了。
 * 现在顶栏也要显示「登录 / 昵称 + 登出 / 管理员标记」—— 如果两边各拉一次、各存一份 state，
 * 从顶栏登录之后评论区不会知道，得刷新整页才同步。这类「两个真相来源」是 bug 的温床。
 * 所以把登录态提到这里，顶栏与评论区共用同一份。
 *
 * 【为什么 refresh() 也暴露出去】
 * 登录、登出、注销之后都要重新拉一次用户信息。把「重新拉」这个动作暴露出来，
 * 调用方不必知道数据是怎么来的。
 *
 * 【user 的三种状态】undefined = 还在加载（界面别急着显示「登录」按钮，否则会闪）；
 * null = 确定未登录；对象 = 已登录。
 */

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
  /**
   * 服务端首屏读到的登录态（由 app/layout.tsx 传入）。
   *
   * 【为什么需要它】不传的话，初始状态只能是 undefined，AuthMenu 在「加载中」什么都不渲染 ——
   * 顶栏的账号入口要等客户端 fetch 完才蹦出来。传了之后第一帧就是对的。
   * undefined = 服务端也不知道（这种情况才会在挂载后补一次请求）；null = 确定未登录。
   */
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
    /*
      【总是对一次账】服务端给的 initialUser 只负责让**第一帧**是对的；
      它可能是过期的（页面被缓存、cookie 刚变过），所以挂载后仍要问一次服务端。

      踩过的坑：原来写成「有 initialUser 就跳过请求」，结果服务端一旦给出过期的「未登录」，
      客户端永远不会纠正 —— 表现就是「手机上一刷新，登录就失效了」。
    */
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, refresh, setUser }}>{children}</AuthContext.Provider>
  );
}

/**
 * 取登录态。
 *
 * @throws 不在 AuthProvider 内使用时抛错 —— 这类错误早点炸出来比默默拿到 undefined 好查
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
