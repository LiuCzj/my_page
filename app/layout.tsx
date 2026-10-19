import './globals.css'
// KaTeX 公式样式 + 字体：rehype-katex 把 $...$ / $$...$$ 渲染成带 .katex 类的 HTML，
// 但这套 HTML 自身不带样式，必须引入它的 CSS（含 woff2 字体）公式才会正常显示。
// 放在根布局 = 全站任意笔记/项目页都能用，且 Next.js 会自动打包并服务字体。
import 'katex/dist/katex.min.css'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { I18nProvider } from '@/lib/i18n'
import { TwinChatProvider } from '@/lib/twin-chat-context'
import { MusicProvider } from '@/lib/music-context'
import { AuthProvider } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'
import CustomCursor from '@/components/CustomCursor'
import CursorFx from '@/components/CursorFx'
import ThemeColorSync from '@/components/ThemeColorSync'
import Footer from '@/components/footer'
import PageTransition from '@/components/page-transition'
import ChatInset from '@/components/ChatInset'
import ContentGuard from '@/components/ContentGuard'
import ShortcutLayer from '@/components/ShortcutLayer'
import TwinEntry from '@/components/TwinEntry'
import ResetPasswordPanel from '@/components/ResetPasswordPanel'
import VerifyNotice from '@/components/VerifyNotice'
import DigitalTwinChat from '@/components/DigitalTwinChat'
import { site } from '@/config/site'
import { listNoteMetas, listProjects, listSkillGroups } from '@/lib/content'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import { issueAudioToken } from '@/lib/audio-token'

/** 全站按需渲染。 */
export const dynamic = 'force-dynamic'

/** 站点级 metadata。 */
export const metadata: Metadata = {
  title: {
    default: site.identity.name,
    template: `%s · ${site.identity.name}`,
  },
  description: `${site.identity.tagline.zh} · ${site.identity.tagline.en}`,
  /* 图标三件套。 */
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

/** 移动端适配的关键一环。 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 深色/明亮模式的主题色：手机浏览器地址栏跟着变，切模式时不会有突兀的白边。
  // ⚠️ 这个颜色一共存了**三处**，改一处必须三处一起改：
  //   ① 这里（服务端首帧用的 meta，带媒体查询，只能读系统偏好）
  //   ② globals.css 的 --band-cover（页面最顶端的实际底色）
  //   ③ components/ThemeColorSync.tsx 的 BAR_COLOR（挂载后按站内主题覆盖 ①）
  // 取的必须是 --band-cover 而不是 --background：地址栏压在页面最顶端，
  // 而最顶端是「封面」那一页。（明亮 #f3f4f9、暗黑 #0c0e16。）
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e16' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /** 站内搜索要用的索引：笔记 + 项目。 */
  const notes = listNoteMetas().map((n) => ({
    slug: n.slug,
    title: n.title,
    summary: n.summary,
    tags: n.tags,
  }));

  const projects = listProjects().map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    // 搜索只用来决定跳站内还是跳外链，正文不进客户端
    hasBody: p.body.trim().length > 0,
    url: p.url,
    stack: p.stack,
  }));

  /** 技术栈分组（只挑搜索用得到的字段：组名 + 小节 + 条目）。 */
  const skills = listSkillGroups().map((g) => ({
    title: g.title,
    sections: g.sections.map((s) => ({ label: s.label, items: s.items })),
  }));

  /** 当前登录用户（服务端读）。 */
  const me = await getCurrentUser();

  // 服务端算出编辑权限：内容保护的 data-guard 要在首帧就写进 <html>，
  // 等客户端算会留下「先能选中、后被禁掉」的窗口，那一瞬间的内容真能复制走
  const canEdit = isAdmin(me?.email);

  // 音频地址要带签名，而签名用 node:crypto、客户端算不了，所以在服务端拼好传下去。
  // src 为空 = 没配音乐，传空串让播放器整块不渲染。
  const audioSrc = site.music.src ? `/api/audio?t=${issueAudioToken()}` : '';

  return (
    /* data-guard：非管理员时打上，CSS 据此对 [data-protect] 禁用选中。管理员不加 */
    <html lang="zh" suppressHydrationWarning data-guard={canEdit ? undefined : '1'}>
      <body className="antialiased">
        {/* ThemeProvider 负责给 <html> 加/去 .dark 类，globals.css 里的 @custom-variant dark 认的就是这个类。 */}
        <ThemeProvider
          attribute="class"
          defaultTheme={site.defaults.theme}
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* 手机地址栏颜色的同步件。不渲染任何东西，只把上面 viewport.themeColor 那两条 */}
          <ThemeColorSync />
          {/* AuthProvider：全站登录态。 */}
          <AuthProvider initialUser={me}>
          {/* I18nProvider 在 Navbar 之外，顶栏的语言按钮和导航文案才能同时读到字典 */}
          <I18nProvider>
            {/* 内容保护：非管理员时拦截复制，剪贴板只留出处。要读字典，所以在 I18nProvider 内 */}
            <ContentGuard enabled={!canEdit} />
            {/* TwinChatProvider 必须放在这一层而不是 page.tsx。 */}
            <TwinChatProvider>
              {/* （最早是「粒子连线网」，后来改成三层景深的「星尘」）。 */}

              {/* MusicProvider：背景音乐的**唯一**播放状态与 <audio> 元素。 */}
              <MusicProvider src={audioSrc}>
              <div className="relative z-10">
                <Navbar />
                {/* ChatInset：桌面端聊天面板展开时的「让位」层。 */}
                <ChatInset>
                  <PageTransition>{children}</PageTransition>
                </ChatInset>
                <Footer />
                {/* 鼠标拖尾 + 十字准线。放在这个 wrapper 里面是有讲究的。 */}
                <CursorFx />
                {/* 全局键盘层：快捷键注册 + 快捷键说明面板 + 站内搜索面板。 */}
                <ShortcutLayer notes={notes} projects={projects} skills={skills} />

                {/* 数字分身的常驻入口：右下角一颗浮动头像。 */}
                <TwinEntry />

                <DigitalTwinChat />

                {/* 重置密码浮层：接管邮件里 `?reset=<token>` 的链接。 */}
                <ResetPasswordPanel />

                {/* 邮箱验证链接的结果提示：接管 `?verified=ok|expired|invalid`。 */}
                <VerifyNotice />
              </div>
              </MusicProvider>
              {/* 上方那枚系统箭头换成对应表情（地球块是 ✈️）。它自己会判断设备，触屏上整个组件不生效。 */}
              <CustomCursor />
            </TwinChatProvider>
          </I18nProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
