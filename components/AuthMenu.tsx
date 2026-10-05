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
  /**
   * 浮层打开时停在哪个页签（2026-10-05 新增）。
   * 顶栏现在是**两颗**按钮 ——「登录」和「注册」—— 各自要直接进到对应的页签，
   * 而不是都先落到登录页签让用户再点一次 tab。
   */
  const [panelTab, setPanelTab] = useState<AuthTab>('login');
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * 注销账号浮层的开合。
   *
   * 【2026-10-04 补：这个入口原来根本不存在】
   * DeleteAccountPanel（发码 → 填码 → 删除）和后端接口早就写好了，但没有任何地方渲染它 ——
   * 全仓库唯一提到它的还是一句过时注释（CommentSection 里说「入口已搬到顶栏账号菜单」，
   * 而那次搬运只改了注释、没真的接上）。结果就是「注销账号」这个功能用户点不到。
   * 现在按注释里写的那样，接在账号菜单里。
   */
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  /*
    【2026-10-05 改版】从「40px 方框 + 边框 + 卡片底色」改成「40px 胶囊 + 极淡底色、无边框」。
    站长反馈原来那一排方框「丑」—— 方框把顶栏控件画成了卡片，而它们是工具不是内容。
    样式走 lib/topbar.ts 的共享常量，和主题 / 语言 / 音乐那几枚同款，
    这样「登录是方的、主题是圆的」这种漂移不会再发生。
  */
  const btn = TOPBAR_PILL;

  // 还在查登录态：什么都不渲染，避免闪烁
  if (user === undefined) return null;

  if (!user) {
    /*
      【为什么登录按钮上没有图标了】2026-10-05 站长要求。
      去掉之后还多一层好处：两颗按钮都是纯文字，宽度只由字数决定，
      并排时不会出现「一颗带图标、一颗不带」的参差。
      【为什么窄屏不显示「注册」】390px 的顶栏已经排了 logo + 登录 + 语言 + 主题 + 汉堡，
      再塞一颗会挤爆。手机上「注册」并没有消失 —— 点「登录」打开浮层，页签里就有「注册」。
    */
    const openPanel = (tab: AuthTab) => {
      setPanelTab(tab);
      setPanelOpen(true);
    };
    return (
      <>
        <button type="button" onClick={() => openPanel('login')} className={btn}>
          {d.auth.login}
        </button>
        <button
          type="button"
          onClick={() => openPanel('register')}
          className={`${btn} hidden sm:inline-flex`}
        >
          {d.auth.register}
        </button>
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

  /*
    【为什么整块用 Fragment 包起来】注销浮层必须挂在菜单之外 ——
    菜单本身是 `{menuOpen && ...}` 条件渲染的，点「注销账号」时菜单会收起，
    浮层要是长在菜单里就会跟着一起消失。挂在根节点上，菜单关了它还在。
    浮层自己走 EditorPanel 的 Portal（渲染到 document.body），
    所以不受顶栏 backdrop-blur 造成的 fixed 包含块问题影响。
  */
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

          {/*
            注销账号。用 destructive 色而不是和「退出登录」同一种灰 ——
            这两件事的风险等级差着一个量级，长得一样会让人点错。
            【min-h 为什么是 44px 而不是原来退出按钮的 36px】
            项目硬规矩：手机上可点元素最短边 ≥44px。下拉菜单在手机上就是纯触控目标，
            原来那个 36px 的退出按钮本身就低于这条线，这里一并补上，两个条目高度也就齐了。
          */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
            className="mt-1 inline-flex w-full min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <UserX size={14} aria-hidden="true" />
            {d.comments.deleteAccount}
          </button>

          <span aria-hidden="true" className="my-1 block h-px bg-border" />

          <button
            type="button"
            onClick={doLogout}
            disabled={busy}
            className="inline-flex w-full min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={14} aria-hidden="true" />
            {d.auth.logout}
          </button>
        </div>
      )}
    </div>

    <DeleteAccountPanel open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}
