'use client';

/** 顶栏的账号入口 —— 放在「网页常见的地方」（顶栏右侧，和语言/主题按钮同一排）。 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, UserX } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { TOPBAR_PILL } from '@/lib/topbar';
import AuthPanel, { type AuthTab } from './AuthPanel';
import DeleteAccountPanel from './DeleteAccountPanel';

export default function AuthMenu() {
  const { d } = useI18n();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  /** 浮层打开时停在哪个页签。 */
  const [panelTab, setPanelTab] = useState<AuthTab>('login');
  const [menuOpen, setMenuOpen] = useState(false);
  /** 注销账号浮层的开合。 */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** 点组件之外的任何地方就收起下拉。 */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  /* 方框会把顶栏控件画成卡片，而这一排是工具不是内容。 */
  const btn = TOPBAR_PILL;

  // 还在查登录态：什么都不渲染，避免闪烁
  if (user === undefined) return null;

  if (!user) {
    /* 去掉之后还多一层好处：两颗按钮都是纯文字，宽度只由字数决定，并排时不会出现「一颗带图标、一颗不带」的参差。 */
    const openPanel = (tab: AuthTab) => {
      setPanelTab(tab);
      setPanelOpen(true);
    };
    return (
      <>
        <button type="button" onClick={() => openPanel('login')} className={btn}>
          {d.auth.login}
        </button>
        {/* 但 `btn`（TOPBAR_PILL）本身就带 `inline-flex` —— Tailwind 的 display 工具类 */}
        <span className="hidden sm:contents">
          <button type="button" onClick={() => openPanel('register')} className={btn}>
            {d.auth.register}
          </button>
        </span>
        <AuthPanel open={panelOpen} onClose={() => setPanelOpen(false)} initialTab={panelTab} />
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

  /* 菜单本身是 `{menuOpen && ...}` 条件渲染的，点「注销账号」时菜单会收起，浮层要是长在菜单里就会跟着一起消失。挂在根节点上，菜单关了它还在。 */
  return (
    <>
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
          /* 这个下拉是全站唯一**手写外框**、不经过 EditorPanel 的浮层，于是漂成了另一套。 */
          className="absolute top-[calc(100%+6px)] right-0 z-[61] w-60 rounded-xl border border-border bg-card p-3 shadow-2xl"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-foreground">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {user.isAdmin && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[11px] font-semibold text-accent">
                <ShieldCheck size={11} aria-hidden="true" />
                {d.auth.adminBadge}
              </p>
            )}
            {!user.emailVerified && (
              <p className="mt-2 text-[11px] font-semibold text-destructive">{d.auth.notVerified}</p>
            )}
          </div>

          {/* 两种性质之间画一条线，视觉上把「资料区」和「动作区」分开 ——原来只有动作之间那条线，反而让「资料」和「注销账号」看起来像同一组。 */}
          <span aria-hidden="true" className="mb-1.5 block h-px bg-border" />
          {/* 注销账号。用 destructive 色而不是和「退出登录」同一种灰 ——这两件事的风险等级差着一个量级，长得一样会让人点错。 */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
            className="mt-1 inline-flex w-full min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <UserX size={16} aria-hidden="true" />
            {d.comments.deleteAccount}
          </button>

          <span aria-hidden="true" className="my-1.5 block h-px bg-border" />

          <button
            type="button"
            onClick={doLogout}
            disabled={busy}
            className="inline-flex w-full min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={16} aria-hidden="true" />
            {d.auth.logout}
          </button>
        </div>
      )}
    </div>

    <DeleteAccountPanel open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}
