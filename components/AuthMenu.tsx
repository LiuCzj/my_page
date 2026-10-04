'use client';

/**
 * 顶栏的账号入口 —— 放在「网页常见的地方」（顶栏右侧，和语言/主题按钮同一排）。
 *
 * 【为什么要有它】改造前登录入口只藏在笔记详情页的评论区里，站长自己都找不到
 * （用户反馈「压根没看到哪有入口」）。登录本来就是一个全站级动作，不该依附在某一页的某个区块上。
 *
 * 【两种形态】
 *   · 未登录：一颗「登录」按钮 → 打开 AuthPanel（登录 / 注册 / 找回密码都在里面）
 *   · 已登录：显示昵称 → 点开一个下拉，里面有邮箱、管理员标记、登出
 *
 * 【下拉为什么用「document 上的 pointerdown」而不是铺一层透明遮罩】
 * 踩过的坑：原来用 `<button className="fixed inset-0">` 当遮罩，但顶栏有 `backdrop-blur-md` ——
 * **backdrop-filter 会让后代的 position: fixed 相对顶栏而不是视口定位**，
 * 于是那层遮罩只有顶栏那么高，点页面别处根本关不掉下拉（用户实测反馈）。
 * 改成在 document 上监听 pointerdown、判断点是否落在组件之外，不受任何定位上下文影响。
 *
 * 【登录后为什么要 router.refresh()】「新建/编辑/删除」这些入口是**服务端**根据
 * canEdit 渲染的。只更新客户端登录态，服务端那层不会重算 —— 表现就是「登录了却看不到管理入口」。
 * refresh() 会让服务端组件带着新 cookie 重渲染一次。
 *
 * 【管理员标记为什么重要】站长改完 ADMIN_EMAILS 后要能一眼确认权限到底生效没有。
 * （注意：改 ADMIN_EMAILS 后**必须重启服务**，见 .env.example 的说明。）
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import AuthPanel from './AuthPanel';

export default function AuthMenu() {
  const { d } = useI18n();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * 点组件之外的任何地方就收起下拉。
   * 用 pointerdown 而不是 click：按下的瞬间就收，手感比等抬手更利落。
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const btn =
    'inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  // 还在查登录态：什么都不渲染，避免闪烁
  if (user === undefined) return null;

  if (!user) {
    return (
      <>
        <button type="button" onClick={() => setPanelOpen(true)} className={btn}>
          <LogIn size={15} aria-hidden="true" />
          {/* 窄屏只留图标，顶栏那一行放不下更多字 */}
          <span className="hidden sm:inline">{d.auth.login}</span>
        </button>
        <AuthPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    );
  }

  const doLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setMenuOpen(false);
      // 让服务端组件重算（/notes、/projects 的管理员入口要跟着消失）
      router.refresh();
    } catch {
      // 登出失败就保持原状，用户可再点一次
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className={btn}
      >
        {user.isAdmin && <ShieldCheck size={14} className="text-accent" aria-hidden="true" />}
        <span className="max-w-[7rem] truncate">{user.displayName}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] right-0 z-[61] w-60 rounded-xl border border-border bg-card p-2 shadow-xl"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-xs font-semibold text-foreground">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {user.isAdmin && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[11px] font-semibold text-accent">
                <ShieldCheck size={11} aria-hidden="true" />
                {d.auth.adminBadge}
              </p>
            )}
            {!user.emailVerified && (
              <p className="mt-1.5 text-[11px] font-semibold text-destructive">{d.auth.notVerified}</p>
            )}
          </div>

          <button
            type="button"
            onClick={doLogout}
            disabled={busy}
            className="mt-1 inline-flex w-full min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={14} aria-hidden="true" />
            {d.auth.logout}
          </button>
        </div>
      )}
    </div>
  );
}
