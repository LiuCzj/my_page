import './globals.css'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { I18nProvider } from '@/lib/i18n'
import Navbar from '@/components/Navbar'
import Footer from '@/components/footer'
import PageTransition from '@/components/page-transition'
import { site } from '@/config/site'

/**
 * 站点级 metadata。
 * 子页面用 `export const metadata = { title: '首页' }` 这种短标题，
 * 由下面的 template 统一拼成「首页 · 锦创AI」，避免各页面各自硬写后缀导致重复。
 */
export const metadata: Metadata = {
  title: {
    default: `${site.identity.name} · ${site.identity.tagline.zh}`,
    template: `%s · ${site.identity.name}`,
  },
  description: site.identity.tagline.zh,
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
            <Navbar />
            <PageTransition>{children}</PageTransition>
            <Footer />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
