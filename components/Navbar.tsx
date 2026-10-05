'use client';

/**
 * 顶部导航（全站唯一，滚动时固定不动）。
 *
 * 【2026-10-05 视觉改版：这一排控件从「方框」改成「圆」】
 * 站长反馈两点：「有些内容显得太小」「登录、换语言、切换模式干嘛用那么丑的框」。
 * 改动：
 *   ① 栏高 56 → **64px**（`--header-h`），一排 40px 的圆才呼吸得开；
 *   ② 右侧所有控件从「40px 方框 + 边框 + 卡片底色」改成 **40px 圆形 + 极淡底色、无边框**
 *      （样式统一在 lib/topbar.ts，四个组件共用，免得各写一份漂成「登录是方的、主题是圆的」）；
 *   ③ 图标 18 → **20px**，logo 24 → **30px**，导航文字 14 → **15px** —— 这是「太小」的正面回应；
 *   ④ 语言按钮去掉地球图标（「EN」本身已经说清是语言切换，前面再挂个地球是同一件事说两遍），
 *      字放大到 15px 填满那个圆；
 *   ⑤ 新增背景音乐控件（播放 + 静音两枚），见 components/MusicControls.tsx。
 * 方框为什么丑：它把顶栏控件画成了「卡片」，而这一排是**工具**不是内容，
 * 不该有卡片那样的实底和描边。
 *
 * 【布局规则】
 * 名字、联系方式、语言切换、主题切换全部置于最顶部依次排开，页面滚动时不动。
 *   → header 用 fixed inset-x-0 top-0 z-50：脱离文档流、钉在视口顶端。
 *   → 桌面端一行排开：名字 | 页内导航 | GitHub/CSDN/知乎/微信/邮箱 | 语言 | 主题。
 *   → 窄屏只有这一行（名字 + 语言 + 主题 + 汉堡），联系方式收进抽屉。
 *     联系方式在窄屏上另起一行横滑是行不通的：640~1023 这段宽度上它会左边挂五个图标、
 *     右边空一大片，而且把顶栏撑成两行 —— 顶栏高度一改，凡是贴着它下沿定位的东西都要重对一次。
 *     同一份入口在磁贴区的「连接」那块和页脚都有，顶栏不必再占一行。
 *
 * 【2026-10-05 从 sticky 改成 fixed：修站长反馈的手机端「顶栏粘不住」】
 * 【症状】手机上往下滑，顶栏会跟着往上挪一点、顶部的部分被切掉；往上滑又恢复正常。
 * 【实测排除了 CSS 的可能】用 CDP 在 390×844 下滚到 0/150/400/900/1600/2600 六个位置量过：
 *   computed position 是 sticky、top 0px、z-index 50，
 *   header.getBoundingClientRect().top 在每一档都是 0，elementFromPoint 命中的也一直是顶栏内部的元素。
 *   → **CSS 层没有任何问题，既没脱粘也没被盖住。**
 * 【结论】这是 iOS/安卓「地址栏收放」那一层的行为：地址栏收起时布局视口顶端跑到可视区之外，
 *   而 sticky 是吸附在**布局视口**上的，于是顶栏跟着跑上去、被状态栏/地址栏残影切掉一截。
 *   fixed 在这件事上表现正常，这也是社区里「常驻顶栏」的通行做法。
 * 【代价】fixed 脱离文档流，必须自己补回高度 —— 补偿加在 components/page-transition.tsx 的
 *   <main> 上（`pt-[var(--header-h-total)]`），一处生效全站。之所以选 main 而不是每个页面各写一遍，
 *   是因为页面里那些 `pt-*` 本来就是「顶栏已经占位」之后又加的呼吸位，改在 main 上等于原样平移。
 * 【别给它加 transform】顶栏自己带 backdrop-blur-md，已经会让后代的 position:fixed 相对顶栏定位
 *   （AuthMenu.tsx 踩过，现在靠 Portal 到 body 绕开）。再叠一个 transform 只会多一层同样的陷阱。
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
import MusicControls from './MusicControls';
import SocialLinks from './SocialLinks';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import MobileNavDrawer from './MobileNavDrawer';
import AuthMenu from './AuthMenu';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { TOPBAR_CONTROL } from '@/lib/topbar';
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
    `transition-colors duration-200 ${active ? 'text-accent visited:text-accent' : 'text-muted-foreground visited:text-muted-foreground hover:text-foreground'}`;

  const controlBtn = TOPBAR_CONTROL;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* ── 唯一一行：名字 / 导航（桌面） / 联系方式（桌面） / 语言 / 主题 / 汉堡（手机） ──
              高度走 --header-h（定义在 app/globals.css），全站只有那一个来源：
              聊天面板的顶边和锚点跳转的补偿都由它算出来。 */}
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

            <div className="flex items-center gap-1.5">
              {/* 桌面端联系方式排在语言/主题之前，符合「依次排开」的顺序 */}
              <div className="hidden items-center gap-0.5 lg:flex">
                <SocialLinks size={20} qrPlacement="below" onOpenModal={setModal} />
              </div>
              <span className="mx-1 hidden h-6 w-px bg-border lg:block" aria-hidden="true" />

              {/*
                背景音乐。桌面端和 ≥640px 的宽屏上直接摆在顶栏；
                窄屏顶栏放不下（logo + 账号 + 语言 + 主题 + 汉堡已经占满），
                所以那些宽度上它挪进手机抽屉 —— 见 MobileNavDrawer。
                两处控件共用 lib/music-context.tsx 里那一份播放状态，不会各播各的。
              */}
              <div className="hidden sm:block">
                <MusicControls />
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
