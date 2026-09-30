'use client';

/**
 * 移动端导航抽屉（小屏点汉堡后展开）。
 *
 * 【抽屉里放两样东西】
 * 1. 页内导航（首页 / 项目）+「问分身」按钮
 * 2. 带文字说明的联系方式清单
 * 第 2 点是有意的冗余：顶栏第二行的图标要横向滑动才看得全，
 * 抽屉里给出「GitHub · 用户名」这种带文字的完整列表，访客不用猜图标。
 *
 * 【行为】跳页后自动收起、Esc 关闭、打开期间锁背景滚动。
 * 【触控】抽屉里每一行都是 min-h-[44px]：这一层只在手机上出现，
 * 而 44px 是手指能稳定点中的下限。
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { CsdnIcon, GitHubIcon, MailIcon, WechatIcon, ZhihuIcon } from './BrandIcons';
import type { ContactModalVariant } from './ContactModal';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 抽屉里的联系方式同样要能唤起二维码/邮箱弹窗 */
  onOpenModal: (variant: ContactModalVariant) => void;
}

export default function MobileNavDrawer({ open, onClose, onOpenModal }: MobileNavDrawerProps) {
  const { d, pick } = useI18n();
  const { openChat } = useTwinChat();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  /** 抽屉里的两项页内锚点；第三项「问分身」是按钮，单独渲染 */
  const linkItems = [
    { href: '/', label: d.nav.home },
    { href: '/#projects', label: d.nav.projects },
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
      {/*
        抽屉面板。两处和手机有关：
        - max-h 用 dvh 不用 vh：vh 算的是「地址栏收起来之后的那个大视口」，
          手机刚打开页面时地址栏是展开的，80vh 会比肉眼看到的屏幕还高，
          底部几行就落到屏幕外面去了。dvh 是动态视口，跟着地址栏一起变。
        - overscroll-contain：抽屉里翻到底不再拖着背后的页面一起滚。
      */}
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

        <nav className="mt-2 flex flex-col">
          {linkItems.map((item) => {
            const isActive = pathname === item.href;
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

          {/* 「问分身」是按钮不是锚点：聊天区只在面板打开时存在，页面上没有可跳的目标 */}
          <button
            type="button"
            onClick={() => {
              onClose();
              openChat();
            }}
            aria-haspopup="dialog"
            className="rounded-lg px-3 py-3 text-left text-base font-bold text-foreground transition hover:bg-secondary"
          >
            {d.nav.chat}
          </button>
        </nav>

        <div className="mt-4 border-t border-border pt-3">
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {d.topbar.drawerContact}
          </p>
          {contactRow(`GitHub${github.handle ? ` · ${github.handle}` : ''}`, <GitHubIcon size={18} />, github.url)}
          {contactRow(pick(csdn.label), <CsdnIcon size={18} />, csdn.url)}
          {contactRow(pick(zhihu.label), <ZhihuIcon size={18} />, zhihu.url)}
          <button
            type="button"
            onClick={() => onOpenModal('wechat')}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <span className="text-muted-foreground"><WechatIcon size={18} /></span>
            {pick(wechat.label)}
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('email')}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <span className="text-muted-foreground"><MailIcon size={18} /></span>
            {pick(email.label)} · {email.address}
          </button>
        </div>
      </div>
    </div>
  );
}
