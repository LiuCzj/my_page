'use client';

/** 顶部导航（全站唯一，滚动时固定不动）。 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from './theme-toggle';
import LanguageToggle from './LanguageToggle';
import MusicControls from './MusicControls';
import SocialLinks from './SocialLinks';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import MobileNavDrawer from './MobileNavDrawer';
import AuthMenu from './AuthMenu';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { useSearch } from '@/lib/search-context';
import { TOPBAR_CONTROL, TOPBAR_ICON_SIZE, TOPBAR_SOCIAL_ICON_SIZE } from '@/lib/topbar';
import { site } from '@/config/site';

/**
 * 站内搜索入口。桌面放在社交图标那一簇，手机放在账号左边 —— 两处只显示一处，
 * 断点由调用方给的 className 决定。
 * @param props.className 控制显示断点的类名
 */
function SearchButton({ className = '' }: { className?: string }) {
  const { d } = useI18n();
  const { openSearch } = useSearch();

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label={d.search.open}
      aria-haspopup="dialog"
      className={`${TOPBAR_CONTROL} ${className}`}
    >
      <Search size={TOPBAR_ICON_SIZE} aria-hidden="true" />
    </button>
  );
}

export default function Navbar() {
  const { d } = useI18n();
  const pathname = usePathname();
  /** null 表示没有弹窗打开；一次只允许一个，避免遮罩叠遮罩 */
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { open: chatOpen, toggleChat } = useTwinChat();

  /** 导航三项里，只有「首页」和「关于我」是页内锚点。 */
  /** 导航项。 */
  const linkItems = [
    { href: '/', label: d.nav.home },
    { href: '/projects', label: d.nav.projects },
    { href: '/notes', label: d.nav.notes },
  ];

  /** 导航项文字配色：当前页用 accent，其余用灰并在悬停时提亮。
   *  visited: 一条防止 Chrome 把点过的导航项换成它自己的访问色（详见 SocialLinks 同处注释） */
  const navLabelClass = (active: boolean) =>
    `transition-colors duration-200 ${active ? 'text-accent visited:text-accent' : 'text-muted-foreground visited:text-muted-foreground hover:text-foreground'}`;

  const controlBtn = TOPBAR_CONTROL;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* 高度走 --header-h（定义在 app/globals.css），全站只有那一个来源：聊天面板的顶边和锚点跳转的补偿都由它算出来。 */}
          <div className="flex h-[var(--header-h)] items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center self-stretch text-2xl font-extrabold tracking-tight text-foreground no-underline sm:text-3xl"
              aria-label={d.topbar.siteName}
            >
              {site.identity.name.replace(site.identity.nameAccent, '')}
              <span className="text-brand">{site.identity.nameAccent}</span>
            </Link>

            {/* 桌面导航：顺序排列，避免窄屏时与右侧图标叠在一起 */}
            <ul className="hidden items-center gap-0.5 text-[15px] font-semibold lg:flex">
              {linkItems.map((item) => {
                /** 高亮判断。旧写法是 `pathname === item.href`，有两个 bug。 */
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href} className="relative px-3 py-2">
                    <Link href={item.href} className="block no-underline">
                      <motion.span whileHover={{ y: -2 }} className={navLabelClass(isActive)}>
                        {item.label}
                      </motion.span>
                    </Link>
                    {isActive && (
                      <motion.span
                        layoutId="activeNavIndicator"
                        className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </li>
                );
              })}

              <li className="relative px-3 py-2">
                <button
                  type="button"
                  onClick={toggleChat}
                  aria-haspopup="dialog"
                  aria-expanded={chatOpen}
                  aria-label={chatOpen ? d.chat.close : d.nav.chat}
                  className="block cursor-pointer bg-transparent p-0 font-semibold"
                >
                  <motion.span whileHover={{ y: -2 }} className={navLabelClass(false)}>
                    {chatOpen ? d.chat.close : d.nav.chat}
                  </motion.span>
                </button>
              </li>
            </ul>

            <div className="flex items-center gap-1.5">
              {/* 桌面端联系方式排在语言/主题之前，符合「依次排开」的顺序。搜索跟它们同一簇，放在最左 */}
              <div className="hidden items-center gap-1 lg:flex">
                <SearchButton />
                <SocialLinks
                  size={TOPBAR_SOCIAL_ICON_SIZE}
                  itemClassName="-mx-[2px] size-10"
                  qrPlacement="below"
                  onOpenModal={setModal}
                />
              </div>
              {/* 竖分隔线：把「联系方式」和「工具控件」两簇分开。 */}
              <span className="mx-1 hidden h-7 w-px bg-border lg:block" aria-hidden="true" />

              {/* 手机 / 平板：社交簇整块不渲染，搜索图标改挂在账号左边 */}
              <SearchButton className="lg:hidden" />

              {/* 背景音乐。桌面端和 ≥640px 的宽屏上直接摆在顶栏； */}
              <div className="hidden sm:block">
                <MusicControls variant="popover" />
              </div>

              {/* 账号入口：登录/昵称，放在语言、主题旁边 —— 网页里最常见的位置 */}
              <AuthMenu />
              <LanguageToggle />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className={`${controlBtn} lg:hidden`}
                aria-label={menuOpen ? d.topbar.closeMenu : d.topbar.menu}
                aria-expanded={menuOpen}
              >
                {/* 于是它比旁边的语言/主题图标小一号，是「整排比例不齐」的其中一处。 */}
                {menuOpen ? <X size={TOPBAR_ICON_SIZE} /> : <Menu size={TOPBAR_ICON_SIZE} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} onOpenModal={setModal} />

      <ContactModal
        open={modal !== null}
        variant={modal ?? 'notice'}
        onClose={() => setModal(null)}
      />
    </>
  );
}
