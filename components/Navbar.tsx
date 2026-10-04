'use client';

/**
 * 顶部导航（全站唯一，滚动时固定不动）。
 *
 * 【布局规则】
 * 名字、联系方式、语言切换、主题切换全部置于最顶部依次排开，页面滚动时不动。
 *   → header 用 sticky top-0 z-50：它在文档流里占位，滚动到任何位置都照常留在顶部。
 *     （fixed 也能固定，但会把下面内容顶上去或压在下面，需要额外补偿 padding；
 *      sticky 不用补偿，也更不容易出「切语言后布局跳动」。）
 *   → 桌面端一行排开：名字 | 页内导航 | GitHub/CSDN/知乎/微信/邮箱 | 语言 | 主题。
 *   → 窄屏只有这一行（名字 + 语言 + 主题 + 汉堡），联系方式收进抽屉。
 *     联系方式在窄屏上另起一行横滑是行不通的：640~1023 这段宽度上它会左边挂五个图标、
 *     右边空一大片，而且把顶栏撑成两行 —— 顶栏高度一改，凡是贴着它下沿定位的东西都要重对一次。
 *     同一份入口在磁贴区的「连接」那块和页脚都有，顶栏不必再占一行。
 *
 * 【顶栏高度只有一个来源】内容行写的是 h-[var(--header-h)]（定义在 app/globals.css）。
 *  聊天面板的顶边、锚点跳转的落点偏移都由那个变量算，不再各自写死一个像素数。
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
import AuthMenu from './AuthMenu';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { site } from '@/config/site';

export default function Navbar() {
  const { d } = useI18n();
  const pathname = usePathname();
  /** null 表示没有弹窗打开；一次只允许一个，避免遮罩叠遮罩 */
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { open: chatOpen, toggleChat } = useTwinChat();

  /**
   * 导航三项里，只有「首页」和「关于我」是页内锚点。
   *
   * 「AI 问答」必须是开关按钮：聊天区是悬浮面板，入口需要控制同一份开合状态，
   * 不能依赖页面锚点。手机抽屉里使用同一个开关。
   */
  /**
   * 导航项。
   *
   * 【为什么从 `/#projects` 改成了 `/projects`】
   * 站点原本是单页，项目只是首页里的一个锚点区块。现在项目有了自己的页面
   * （笔记同理），导航就该指向真路由 —— 否则从笔记详情页点「项目」，
   * 会被带回首页再滚下去，路径是错的。
   */
  const linkItems = [
    { href: '/', label: d.nav.home },
    { href: '/projects', label: d.nav.projects },
    { href: '/notes', label: d.nav.notes },
  ];

  /** 导航项文字配色：当前页用 accent，其余用灰并在悬停时提亮。
   *  visited: 一条防止 Chrome 把点过的导航项换成它自己的访问色（详见 SocialLinks 同处注释） */
  const navLabelClass = (active: boolean) =>
    `transition-colors ${active ? 'text-accent visited:text-accent' : 'text-muted-foreground visited:text-muted-foreground hover:text-foreground'}`;

  const controlBtn =
    'inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* ── 唯一一行：名字 / 导航（桌面） / 联系方式（桌面） / 语言 / 主题 / 汉堡（手机） ──
              高度走 --header-h（定义在 app/globals.css），全站只有那一个来源：
              聊天面板的顶边和锚点跳转的补偿都由它算出来。 */}
          <div className="flex h-[var(--header-h)] items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center self-stretch text-xl font-extrabold tracking-tight text-foreground no-underline sm:text-2xl"
              aria-label={d.topbar.siteName}
            >
              {site.identity.name.replace(site.identity.nameAccent, '')}
              <span className="text-brand">{site.identity.nameAccent}</span>
            </Link>

            {/* 桌面导航：顺序排列，避免窄屏时与右侧图标叠在一起 */}
            <ul className="hidden items-center gap-1 text-sm font-semibold lg:flex">
              {linkItems.map((item) => {
                /**
                 * 高亮判断。旧写法是 `pathname === item.href`，有两个 bug：
                 *   ① 那时「项目」的 href 是 `'/#projects'`，而 pathname 不含 hash，
                 *      这个等式永远不成立 —— 所以那个导航项从来不会亮；
                 *   ② 精确匹配意味着 `/notes/某篇` 详情页不会点亮 `/notes`。
                 * 现在：首页精确匹配（否则所有路径都以 `/` 开头，会全亮），
                 * 其余按「等于自己 或 以自己 + / 开头」判断。
                 */
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

            <div className="flex items-center gap-2">
              {/* 桌面端联系方式排在语言/主题之前，符合「依次排开」的顺序 */}
              <div className="hidden items-center gap-1 lg:flex">
                <SocialLinks size={18} onOpenModal={setModal} />
              </div>
              <span className="mx-1 hidden h-6 w-px bg-border lg:block" aria-hidden="true" />
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
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
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
