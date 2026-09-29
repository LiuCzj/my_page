'use client';

/**
 * 移动端导航抽屉（小屏点汉堡后展开）。
 *
 * 【抽屉里放两样东西】
 * 1. 页内导航（首页 / 关于我 / 问分身）
 * 2. 带文字说明的联系方式清单
 * 第 2 点是有意的冗余：顶栏第二行的图标要横向滑动才看得全，
 * 抽屉里给出「GitHub · 用户名」这种带文字的完整列表，访客不用猜图标。
 *
 * 【行为】跳页后自动收起、Esc 关闭、打开期间锁背景滚动。
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
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
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  /** 与桌面导航同一组页内锚点：单页站点没有子页面了 */
  const navItems = [
    { href: '/', label: d.nav.home },
    { href: '/#info', label: d.nav.info },
    { href: '/#ask-twin', label: d.nav.chat },
  ];

  // 跳页后自动收起：否则点了「项目」到新页面，抽屉还盖在半屏上
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
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground no-underline transition hover:bg-secondary"
      >
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </a>
    ) : (
      <button
        type="button"
        onClick={() => onOpenModal('notice')}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition hover:bg-secondary"
      >
        <span>{icon}</span>
        {label}
      </button>
    );

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" role="presentation">
      {/* 遮罩：点它关闭抽屉 */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={d.topbar.menu}
        className="absolute inset-x-0 top-0 max-h-[80vh] overflow-y-auto border-b border-border bg-card px-4 pb-6 pt-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {d.topbar.drawerNav}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label={d.topbar.closeMenu}
          >
            {d.contact.close}
          </button>
        </div>

        <nav className="mt-2 flex flex-col">
          {navItems.map((item) => {
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <span className="text-muted-foreground"><WechatIcon size={18} /></span>
            {pick(wechat.label)}
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('email')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <span className="text-muted-foreground"><MailIcon size={18} /></span>
            {pick(email.label)} · {email.address}
          </button>
        </div>
      </div>
    </div>
  );
}
