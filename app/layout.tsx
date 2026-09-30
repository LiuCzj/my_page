import './globals.css'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { I18nProvider } from '@/lib/i18n'
import { TwinChatProvider } from '@/lib/twin-chat-context'
import Navbar from '@/components/Navbar'
import CustomCursor from '@/components/CustomCursor'
import Footer from '@/components/footer'
import PageTransition from '@/components/page-transition'
import { site } from '@/config/site'

/**
 * 站点级 metadata。
 * 标题只放名字「锦创AI」—— 中英访客看这一段都一样，不会出现半中半英的拼接。
 * 描述把中英文写进同一条：metadata 在服务端渲染时就定死了，而语言偏好存在访客浏览器的
 * localStorage 里，服务器读不到，所以做不到「跟着访客的语言换标题」。
 * template 留着给以后开子页面用；根 layout 自己的 default 标题不会被 template 加工。
 */
export const metadata: Metadata = {
  title: {
    default: site.identity.name,
    template: `%s · ${site.identity.name}`,
  },
  description: `${site.identity.tagline.zh} · ${site.identity.tagline.en}`,
  icons: { icon: '/favicon.svg' },
}

/**
 * 移动端适配的关键一环。
 * 没有这个 viewport 设置时，手机会按 980px 宽度渲染再整体缩小，
 * 结果就是「电脑版缩小版」，顶栏两行布局和 44px 触控区全部失效。
 * 这一行导出等价于 <meta name="viewport" content="width=device-width, initial-scale=1">。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 深色/明亮模式的主题色：手机浏览器地址栏跟着变，切模式时不会有突兀的白边
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1420' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className="antialiased">
        {/* ThemeProvider 负责给 <html> 加/去 .dark 类，globals.css 里的 @custom-variant dark 认的就是这个类 */}
        <ThemeProvider attribute="class" defaultTheme={site.defaults.theme} disableTransitionOnChange>
          {/* I18nProvider 在 Navbar 之外，顶栏的语言按钮和导航文案才能同时读到字典 */}
          <I18nProvider>
            {/*
              TwinChatProvider 必须放在这一层而不是 page.tsx：
              顶栏的「问分身」也要能打开聊天窗，而 Navbar 渲染在 layout 里，
              拿不到 page 内部的 Context —— 放低了就会在顶栏里抛 "必须在 Provider 内部使用"。
            */}
            <TwinChatProvider>
              <Navbar />
              <PageTransition>{children}</PageTransition>
              <Footer />
              {/* 表情光标：只在真鼠标设备上挂载，负责把带 data-cursor-emoji 的磁贴
                  上方那枚系统箭头换成对应表情（地球块是 ✈️）。它自己会判断设备，
                  触屏上整个组件不生效。 */}
              <CustomCursor />
            </TwinChatProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
