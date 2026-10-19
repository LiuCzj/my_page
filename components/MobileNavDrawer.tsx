'use client';

/** 移动端导航抽屉（小屏点汉堡后展开）。 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { CsdnIcon, GitHubIcon, MailIcon, WechatIcon, ZhihuIcon } from './BrandIcons';
import MusicControls from './MusicControls';
import type { ContactModalVariant } from './ContactModal';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 抽屉里的联系方式同样要能唤起二维码/邮箱弹窗 */
  onOpenModal: (variant: ContactModalVariant) => void;
}

export default function MobileNavDrawer({ open, onClose, onOpenModal }: MobileNavDrawerProps) {
  const { d, pick } = useI18n();
  const { open: chatOpen, toggleChat } = useTwinChat();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  /** 抽屉里的页面链接；「AI 问答」开关单独渲染在最后。 */
  const linkItems = [
    { href: '/', label: d.nav.home },
    { href: '/projects', label: d.nav.projects },
    { href: '/notes', label: d.nav.notes },
  ];

  // 跳页后自动收起：否则点了导航项到了新位置，抽屉还盖在半屏上
  useEffect(() => {
    onClose();
    // 只依赖 pathname，避免父组件重渲染时被反复关闭
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc 关闭 + 锁背景滚动
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const { github, csdn, zhihu, wechat, email } = site.contact;

  /** 一行联系方式：url 为空时不跳外链，只弹「尚未配置」提示 */
  const contactRow = (label: string, icon: React.ReactNode, url?: string) =>
    url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold text-foreground no-underline transition hover:bg-secondary"
      >
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </a>
    ) : (
      <button
        type="button"
        onClick={() => onOpenModal('notice')}
        className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-muted-foreground transition hover:bg-secondary"
      >
        <span>{icon}</span>
        {label}
      </button>
    );

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" role="presentation">
      {/* 遮罩：点它关闭抽屉 */}
      <div
        className="absolute inset-0 touch-none bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* 抽屉面板。两处和手机有关。 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={d.topbar.drawerNav}
        className="absolute inset-x-0 top-0 max-h-[80dvh] overscroll-contain overflow-y-auto border-b border-border bg-card px-4 pb-6 pt-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {d.topbar.drawerNav}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label={d.topbar.closeMenu}
          >
            {d.contact.close}
          </button>
        </div>

        {/* 背景音乐。窄屏顶栏放不下它（logo + 账号 + 语言 + 主题 + 汉堡已经占满一行），所以挪到这里。 */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2">
          <span className="shrink-0 text-sm font-semibold text-foreground">{pick(site.music.title)}</span>
          <MusicControls variant="inline" />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3">
          {/* 左列：页内导航 + AI 问答开关 */}
          <nav className="flex flex-col gap-1">
          {linkItems.map((item) => {
            /* 和顶栏同一套判断：首页精确匹配，其余按前缀 —— 详见 Navbar.tsx 的注释 */
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-3 text-base font-bold no-underline transition hover:bg-secondary ${
                    isActive ? 'text-accent' : 'text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {/* AI 问答控制的是全站悬浮面板开合，不是页内锚点 */}
            <button
              type="button"
              onClick={() => {
                onClose();
                toggleChat();
              }}
              aria-haspopup="dialog"
              aria-expanded={chatOpen}
              aria-label={chatOpen ? d.chat.close : d.nav.chat}
              className="rounded-lg px-3 py-3 text-left text-base font-bold text-foreground transition hover:bg-secondary"
            >
              {chatOpen ? d.chat.close : d.nav.chat}
            </button>
          </nav>

          {/* 右列：联系方式 */}
          <div className="flex flex-col gap-1">
            {contactRow(`GitHub${github.handle ? ` · ${github.handle}` : ''}`, <GitHubIcon size={18} />, github.url)}
            {contactRow(pick(csdn.label), <CsdnIcon size={18} />, csdn.url)}
            {contactRow(pick(zhihu.label), <ZhihuIcon size={18} />, zhihu.url)}
            <button
              type="button"
              onClick={() => onOpenModal('wechat')}
              className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              <span className="text-muted-foreground"><WechatIcon size={18} /></span>
              {pick(wechat.label)}
            </button>
            <button
              type="button"
              onClick={() => onOpenModal('email')}
              className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
            >
              <span className="text-muted-foreground"><MailIcon size={18} /></span>
              {pick(email.label)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
