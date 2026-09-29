'use client';

/**
 * 顶部导航（全站唯一，滚动时固定不动）。
 *
 * 【布局规则】
 * 名字、联系方式、语言切换、主题切换全部置于最顶部依次排开，页面滚动时不动。
 *   → header 用 sticky top-0 z-50：它在文档流里占位，滚动到任何位置都留在顶部。
 *     （fixed 也能固定，但会把下面内容顶上去或压在下面，需要额外补偿 padding；
 *      sticky 不用补偿，也更不容易出「切语言后布局跳动」。）
 *   → 桌面端一行排开：名字 | 页内导航 | GitHub/CSDN/知乎/微信/邮箱 | 语言 | 主题。
 *   → 手机端两行都固定：第一行 名字 + 语言 + 主题 + 汉堡；第二行 五个联系方式（顺序不变）。
 *     8 项在 390px 一行放不下，拆两行是唯一能同时满足「全部置于顶部」和「依次排开」的做法。
 *
 * 【几个刻意的取舍】
 * 1. 联系方式数据统一来自 config/site.ts，顶栏、抽屉、页脚复用同一份
 * 2. 邮箱用弹窗展示（可复制），不是 mailto 直链
 * 3. 底色用 bg-background/95 而非 /80：透明度过低时滚动正文会透上来压在导航文字下面，读着发糊
 * 4. 图标一律带 rel="noopener noreferrer"，防止被打开的页面反向操控本站标签页
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from './theme-toggle';
import LanguageToggle from './LanguageToggle';
import SocialLinks from './SocialLinks';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import MobileNavDrawer from './MobileNavDrawer';
import { useI18n } from '@/lib/i18n';
import { site } from '@/config/site';

export default function Navbar() {
  const { d } = useI18n();
  const pathname = usePathname();
  /** null 表示没有弹窗打开；一次只允许一个，避免遮罩叠遮罩 */
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * 导航是页内锚点：本站是单页（首页 / 关于我 / 问分身）。
   * globals.css 里开了 scroll-behavior: smooth，点下去会平滑滚到对应区块。
   */
  const navItems = [
    { href: '/', label: d.nav.home },
    { href: '/#info', label: d.nav.info },
    { href: '/#ask-twin', label: d.nav.chat },
  ];

  const controlBtn =
    'inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* ── 第一行：名字 / 导航（桌面） / 联系方式（桌面） / 语言 / 主题 / 汉堡（手机） ── */}
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              href="/"
              className="shrink-0 text-xl font-extrabold tracking-tight text-foreground no-underline sm:text-2xl"
              aria-label={d.topbar.siteName}
            >
              {site.identity.name.replace(site.identity.nameAccent, '')}
              <span className="text-accent">{site.identity.nameAccent}</span>
            </Link>

            {/* 桌面导航：绝对居中改成顺序排列，避免窄屏时与右侧图标叠在一起 */}
            <ul className="hidden items-center gap-1 text-sm font-semibold lg:flex">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href} className="relative px-3 py-2">
                    <Link href={item.href} className="block no-underline">
                      <motion.span
                        whileHover={{ y: -2 }}
                        className={`transition-colors ${
                          isActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
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
            </ul>

            <div className="flex items-center gap-2">
              {/* 桌面端联系方式排在语言/主题之前，符合「依次排开」的顺序 */}
              <div className="hidden items-center gap-1 lg:flex">
                <SocialLinks size={18} onOpenModal={setModal} />
              </div>
              <span className="mx-1 hidden h-6 w-px bg-border lg:block" aria-hidden="true" />
              <LanguageToggle />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className={`${controlBtn} lg:hidden`}
                aria-label={menuOpen ? d.topbar.closeMenu : d.topbar.menu}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* ── 第二行（仅手机/窄屏）：五个联系方式，顺序与桌面端一致 ── */}
          <div
            className="flex items-center gap-1 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
            title={d.topbar.contactScrollHint}
          >
            {/* shrink-0 保证在 320px 这类极窄屏上是横向滑动而不是被压扁 */}
            <span className="flex shrink-0 items-center gap-1">
              <SocialLinks size={20} itemClassName="size-11 shrink-0" onOpenModal={setModal} />
            </span>
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
