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
import ShortcutLayer from '@/components/ShortcutLayer'
import TwinEntry from '@/components/TwinEntry'
import ResetPasswordPanel from '@/components/ResetPasswordPanel'
import VerifyNotice from '@/components/VerifyNotice'
import DigitalTwinChat from '@/components/DigitalTwinChat'
import { site } from '@/config/site'
import { listNoteMetas, listProjects, listSkillGroups } from '@/lib/content'
import { getCurrentUser } from '@/lib/auth'

/**
 * 全站按需渲染。
 *
 * 根布局会为站内搜索读取笔记与项目的索引（见下面的 listNoteMetas / listProjects），
 * 而这两样内容现在可以在网页上随时改（见 lib/content.ts）。若还按构建期预渲染，
 * 站长改完会发现搜索里还是旧数据。声明在这里 = 整站按需渲染，
 * 与首页、/notes、/projects 各自的 force-dynamic 是同一口径。
 */
export const dynamic = 'force-dynamic'

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
  /*
    图标三件套（2026-10-05 补）。
    · favicon.svg —— 桌面浏览器，矢量、任意尺寸都清晰
    · icon-192.png —— 不支持 SVG favicon 的浏览器兜底
    · apple-touch-icon.png —— **iOS Safari 专用**：它直接忽略 SVG 图标，
      没有这一条时手机标签页/书签上显示的是系统默认图标
      （站长反馈的「手机上显示的不是这个图标」就是这个原因）。
    两个 PNG 由 temp/make-icons.mjs 从 favicon.svg 生成 —— 改了 SVG 的四个色值后要重跑它。
    生成时特意去掉了源图自带的圆角（满幅方形）：iOS 会自己套圆角遮罩，
    源图再带一层圆角就成了「小圆角方块套在大圆角方块里」。
  */
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
  /**
   * 站内搜索要用的索引：笔记 + 项目。
   *
   * 【为什么在这里读】两者都存在数据库里（lib/content.ts 依赖 better-sqlite3）——
   * 客户端组件一旦 import 它，原生模块会被打进浏览器包并直接构建失败。
   * 所以读取留在这一层（服务端），把结果当纯数据往下传。
   * 只挑搜索用得到的字段，笔记正文不参与；几十条也只是一串小对象。
   *
   * 【开销】layout 对每个页面都执行一次，每次请求两次 SQLite 查询（本地文件，毫秒级）。
   */
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
    url: p.url,
    stack: p.stack,
  }));

  /**
   * 技术栈分组（只挑搜索用得到的字段：组名 + 小节 + 条目）。
   *
   * 【为什么也要在这一层读】技术栈现在可以在网页上编辑、存在数据库里，
   * 而搜索面板跑在客户端（碰不到 better-sqlite3）——
   * 它原来直接读 config/site.ts，于是「后台改过技术栈，搜索里还是旧的那份」。
   * 和 notes / projects 走同一条路：服务端读好，当纯数据往下传。
   */
  const skills = listSkillGroups().map((g) => ({
    title: g.title,
    sections: g.sections.map((s) => ({ label: s.label, items: s.items })),
  }));

  /**
   * 当前登录用户（服务端读）。
   * 传给 AuthProvider 当首屏初始值 —— 否则顶栏的账号入口要等客户端查完才蹦出来。
   */
  const me = await getCurrentUser();

  return (
    <html lang="zh" suppressHydrationWarning>
      <body className="antialiased">
        {/*
          ThemeProvider 负责给 <html> 加/去 .dark 类，globals.css 里的 @custom-variant dark 认的就是这个类。

          【enableSystem={false} 是必须的】默认主题是亮色（见 config/site.ts 的 defaults.theme）。
          next-themes 默认 enableSystem 为 true —— 那样它会去读系统的 prefers-color-scheme，
          系统是深色的访客拿到的还是深色，「默认亮色」就不成立了。
          关掉之后：没存过偏好的访客一律亮色，自己点过主题开关的按存下来的走。
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme={site.defaults.theme}
          enableSystem={false}
          disableTransitionOnChange
        >
          {/*
            手机地址栏颜色的同步件。不渲染任何东西，只把上面 viewport.themeColor 那两条
            带媒体查询的 meta 改成跟着**页面主题**走 —— 默认主题改成亮色之后，
            「系统深色 + 页面亮色」的访客会看到一条不属于这个页面的深色地址栏。见组件内说明。
          */}
          <ThemeColorSync />
          {/*
            AuthProvider：全站登录态。
            顶栏的账号入口与笔记页评论区的登录框共用同一份 —— 否则会出现
            「在顶栏登录了、滚到评论区还是显示未登录」这种两个真相来源的问题。
            与 I18nProvider 互不依赖，放外层即可。
          */}
          <AuthProvider initialUser={me}>
          {/* I18nProvider 在 Navbar 之外，顶栏的语言按钮和导航文案才能同时读到字典 */}
          <I18nProvider>
            {/*
              TwinChatProvider 必须放在这一层而不是 page.tsx：
              顶栏的「问分身」也要能打开聊天窗，而 Navbar 渲染在 layout 里，
              拿不到 page 内部的 Context —— 放低了就会在顶栏里抛 "必须在 Provider 内部使用"。
            */}
            <TwinChatProvider>
              {/*
                【2026-10-05 移除星空层】这里原来挂着一个 ParticleField
                （最早是「粒子连线网」，后来改成三层景深的「星尘」）。
                撤掉它的原因是：**它属于「噪点」，不属于「设计」**——
                满屏细碎光点会让页面读起来像通用科技风模板，而气质来自克制，不来自叠加。
                组件文件 `components/ParticleField.tsx` **保留在仓库里没有删**，
                哪天想恢复，把这一层加回来即可。
              */}

              {/*
                MusicProvider：背景音乐的**唯一**播放状态与 <audio> 元素。
                顶栏和手机抽屉里的播放控件都读这一份 —— 各自渲染 <audio> 会同时播两条音轨。
                放在这一层而不是 Navbar 里，是因为抽屉不在 Navbar 的子树里。
              */}
              <MusicProvider>
              <div className="relative z-10">
                <Navbar />
                {/*
                  ChatInset：桌面端聊天面板展开时的「让位」层。
                  【2026-10-06 从 app/page.tsx 挪到这里】改前它只包住首页，
                  /notes、/projects 三页完全没有让位，面板直接盖住正文。
                  放在 PageTransition 外面（包住它）而不是里面，是为了让它
                  **在所有页面、所有路由**上都生效 —— 以后新增页面会自动继承，
                  不需要每个 page.tsx 再记得包一次。
                  它只加 padding-right，不动任何布局结构，对各页自己的
                  mx-auto / max-w-* 是透明平移（见组件内说明）。
                */}
                <ChatInset>
                  <PageTransition>{children}</PageTransition>
                </ChatInset>
                <Footer />
                {/*
                  鼠标拖尾 + 十字准线。放在这个 wrapper 里面是有讲究的：
                  wrapper 有 z-index 会自成一层，拖尾的 z-[60] 要和顶栏 z-50、
                  聊天面板 z-[80]、抽屉 z-[90]、弹窗 z-[100] 比较才有意义 ——
                  放到 wrapper 外面，它就会盖在聊天面板上面（一层 10 打不过 60）。
                  它自己会判断设备：触屏和开了「减少动效」的系统上整个不挂载。
                */}
                <CursorFx />
                {/*
                  全局键盘层：快捷键注册 + 快捷键说明面板 + 站内搜索面板。
                  放在这个 z-10 的 wrapper 里，理由和 CursorFx 一样 ——
                  它的浮层用 z-[100]，要和聊天面板 z-[80]、抽屉 z-[90]
                  在同一个层叠上下文里比较才有意义。
                */}
                <ShortcutLayer notes={notes} projects={projects} skills={skills} />

                {/*
                  数字分身的常驻入口：右下角一颗浮动头像。
                  2026-10-03 从首屏搬来的 —— 原来它挂在首屏末尾，既是第五个元素、
                  又得滚回顶部才点得到。放在这一层是因为它要用 useTwinChat
                  （开合状态住在 TwinChatProvider 里），而且要和聊天面板 z-[80]
                  在同一个层叠上下文里比层级。
                */}
                <TwinEntry />

                {/*
                  数字分身聊天面板。2026-10-04 从 app/page.tsx 挪到这里 ——
                  原来它只挂在首页，导致在 /projects、/notes 上点右下角的分身头像
                  「什么都不会发生」（面板根本没渲染，用户反馈过）。
                  它自己是客户端组件，由服务端 layout 渲染没有问题；
                  开合状态住在 TwinChatProvider（也在 layout 这一层），所以任何页面都能开关。
                */}
                <DigitalTwinChat />

                {/*
                  重置密码浮层：接管邮件里 `?reset=<token>` 的链接。
                  放在 layout 而不是某个页面，是因为那个链接的落点由 SITE_URL 决定 ——
                  落到首页、笔记页、任何页面都应该能弹出重置框，而不是只有某一页才行。
                */}
                <ResetPasswordPanel />

                {/*
                  邮箱验证链接的结果提示：接管 `?verified=ok|expired|invalid`。
                  和上面那个重置浮层同理 —— 验证链接的落点也是全局的，
                  而且它只在「从老邮件点回来」时才出现，属于一次性结果提示。
                */}
                <VerifyNotice />
              </div>
              </MusicProvider>
              {/* 表情光标：只在真鼠标设备上挂载，负责把带 data-cursor-emoji 的磁贴
                  上方那枚系统箭头换成对应表情（地球块是 ✈️）。它自己会判断设备，
                  触屏上整个组件不生效。 */}
              <CustomCursor />
            </TwinChatProvider>
          </I18nProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
