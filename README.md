# 锦创AI · 个人主页

分享 AI 技术与项目的个人网页，带一个可提问的数字分身。

## 页面

首页 / 项目 / 笔记 / 项目详情 / 笔记详情，外加一个悬浮聊天窗。首页由五个跨页组成：封面 / 关于我 / 项目 / 笔记 / 版权页，
每页有自己的底色令牌、主导色与排版骨架。

- **封面**：桌面双栏 / 手机单列。左栏是问候行、名字（逐字解码入场）、一句话、两个入口按钮；
  右栏是个人名片（Q 版头像）与终端卡（逐字敲 `whoami` 等命令，打印 `config/site.ts` 里的真实资料）
- **关于我**：籍贯（点阵地球，可拖动、可放大；邵阳那一点站着一个小人）、最喜欢的工具、技术栈、工具、连接
- **项目摘要 / 笔记摘要**：各取前几条（条数见 `config/site.ts` 的 `homePreview`），多的去独立页
- **项目详情页**（`/projects/<slug>`）：有正文的项目点卡片进站内详情页，无正文的直接跳外链，
  两者都没有则整行不可点。详情页含标题摘要、日期与技术栈、仓库按钮、阅读进度条和评论区；
  没有正文的项目不生成空壳页，直接 404。站内搜索与项目列表遵循同一套跳转规则
- **固定顶栏**：名字、五个联系方式、账号入口、深浅色、中英文；窄屏只留名字 + 账号 + 语言 + 主题 + 汉堡
- **页脚**：打招呼 + 邮箱按钮，三栏（是谁 / 导航 / 联系）与版权行

聊天窗是**悬浮面板**，对话再长也不把页面拉长：

- 点右下角浮动头像开启（可拖动并记住位置，吸附到最近的一条边）；顶栏与页脚的入口共用同一开合状态
- 面板内部自滚，输入框与「猜你想问」固定在底部；Esc 或 × 关闭
- 桌面端展开时正文自动让出宽度；手机上是三档底部抽屉（peek / half / full，默认 half），可上下拖动
- 半高档走半透明 + 背景模糊；软键盘弹起时强制切 full，否则「键盘顶上来」和「抽屉变矮」会把它挤成一条缝

其他：

- 深浅色（语义令牌，切换后对比度均达 WCAG AA）｜中英双语（默认中文，偏好存 localStorage）
- 移动端：可点元素最短边 ≥44px；聊天面板跟随软键盘；列表内滚不带动背景页
- 微信公众号弹二维码，邮箱弹可复制地址
- 聊天历史存本地，可清空 / 重试 / 中途停止；模型吐出的 `**加粗**` 等标记在显示前清成纯文本
- 快捷键：`G H`/`G P`/`G N` 跳页、`Cmd/Ctrl+K` 搜索、`Cmd/Ctrl+/` 切主题、`G L` 切语言、`G C` 开聊天、`?` 打开说明
- 站内搜索：搜项目 / 笔记 / 技能 / 工具 / 页面，中英关键词都能命中
- 背景音乐：顶栏播放键 + 音量条。默认**暂停且静音**，不持久化播放状态；全站只渲染一个 `<audio>`；
  音源缺失或加载失败时整块不渲染
- 笔记详情页顶部有阅读进度条（原生 scroll + rAF）
- 404 页，文案跟随中英切换

账号与内容管理：

- **账号**：邮箱验证码注册（一次性邮箱会被挡）、登录、邮箱验证、找回密码、注销账号。
  注销走「图形码 → 当前密码 → 邮箱验证码」；服务端只认当前登录用户自己的邮箱
- **评论区**：挂在每篇笔记与每个项目详情页底部。读不需登录，写才要；支持一层回复、删除自己的评论，管理员可删任意评论
- **在线编辑**：管理员在 `/notes` 与 `/projects` 页面直接增删改，笔记与项目详情页也有「编辑」入口；
  内容存数据库，改完即时生效。编辑器是**全屏的 Typora 式镜像视图**：打开即铺满屏幕，
  正文直接渲染成排版后的样子（不是「左写右预览」），底部状态栏显示光标下标与行列
- **Markdown 编辑器**：表格（插入 / 增删行列 / 选格选行）、查找替换（命中高亮）、撤销重做、
  图片以占位符行内显示、独占一行的图片语法渲染成外链预览、拖入 `.md` 自动拆 frontmatter 填表
  （项目编辑器会把标题 / 摘要 / 日期一并填进表单，正文原样保留）、Typora 同款快捷键
  （`Ctrl+1..6` 标题、`Ctrl+T` 表格、`Ctrl+F` 查找等）
- **Markdown 渲染**：表格、任务列表、行内与块级公式（KaTeX，`$$\begin{align}…$$` 同行写法兼容）、
  代码块、`==高亮==`；外链图床（如 gitee）统一加 `referrerpolicy="no-referrer"`，绕开按 Referer 的防盗链
- **内容保护**：非管理员禁选禁复制（ContentGuard），刻意不封右键

## 技术栈

Next.js 15（App Router）· React 19 · Tailwind CSS v4 · next-themes · lucide-react · framer-motion ·
cobe（WebGL 地球）· better-sqlite3 · unified + remark + rehype · KaTeX · nodemailer · svg-captcha

没有 UI 组件库：通用图标取自 lucide-react，CSDN / 知乎 / 微信是手写内联 SVG，鼠标拖尾是自己写的 2D canvas。

笔记走**运行时渲染**，不是构建期 MDX —— 内容存在数据库里、可在线修改，`@next/mdx` 那条路已整个拆掉。
正文由 `lib/markdown.ts` 在请求时渲染成 HTML；排版是手写的 `.prose-site`，没引 `@tailwindcss/typography`。

字体四条腿，全站不请求任何外部 CDN：

- **正文**：系统无衬线栈，零下载
- **名字**：自托管霞鹜文楷子集（原字体 24.4 MB → 按实际用到的字形裁成 15.1 KB woff2，SIL OFL 1.1）。
  自带拉丁字母，所以「锦创AI」是同一种笔意
- **展示字**（区块标题、页脚大字）：宋体展示栈，第一位是自托管思源宋体子集（25 MB → 23 KB woff2）
- ⚠️ **笔记正文刻意不碰后两条**：子集只含几十个字形，正文用它就会大面积静默退回系统字体

## 形象素材

四处人物形象 + 一枚站点图标，同一套 Q 版画风（大头小身、统一描边、单层扁平阴影、紫领带）。

| 素材 | 位置 | 尺寸 | 用途 |
|---|---|---|---|
| 头像 | `public/images/avatar.jpg` | 640×640 JPEG | 首屏名片里的圆形头像（CSS 裁圆） |
| 数字分身角色 | `public/images/mascot-q.png` | 512×512 PNG | 浮动入口按钮 |
| 地球小人 | `public/images/avatar-stand.png` | 64×224 PNG | 地球上站在邵阳的那一点 |
| 笔记配图 | `public/images/hero-scene.jpg` | 1024×1024 JPEG | 笔记正文配图（由笔记内容引用） |
| 站点图标 | `public/favicon.svg` | 32×32 SVG | 浏览器标签页 |

尺寸、宽高比、透明通道、格式四项都是硬约束。完整画风规范与重绘流程记录在仓库外的 `DOWNLOADS.md`（不随仓库分发）。

## 本地运行

要求 **Node ≥ 22**（`better-sqlite3` 13 的硬要求）。

```bash
npm install --ignore-scripts   # 必须带这个参数，见下
cp .env.example .env           # 填入模型密钥
npm run dev                    # http://localhost:3000
```

其他命令：`npm run build` / `npm run start` / `npm run typecheck`。

### `--ignore-scripts` 是必需的

不加这个参数，Windows 上装依赖会失败（`node-gyp rebuild` 找不到 Visual Studio）。

`better-sqlite3` 走 prebuildify：包内有 `binding.gyp` 但没定义 `install` 脚本，npm 会默认跑
`node-gyp rebuild`；而预编译二进制其实随包下好了（`prebuilds/` 下 8 个平台各一份）。
加 `--ignore-scripts` 跳过编译即可。该模块基于 Node-API，同一份二进制跨 Node 大版本通用。

⚠️ 装到一半中止时，构建会报 `Module not found: Can't resolve 'bail'` —— 那是「安装没跑完」的信号，
带参数重装一遍即可，不要去追 `bail`。

## 配置

**个人信息**全部集中在 `config/site.ts`（名字、简介、头像、联系方式、公众号二维码、分身要背的资料），中英两列都要填。

**内容（项目 / 笔记）存在数据库里**，可在网页上直接增删改。`config/site.ts` 的 `projects` 数组与
`content/notes/*.mdx` 现在是**首次迁移的种子数据**，只在数据库为空时由 `lib/seed.ts` 灌入，之后以数据库为准。

**环境变量**：完整清单见 `.env.example`，分五组 —— 模型服务（必需）、联网检索（可选）、
背景音乐保护（可选）、评论邮件（可选）、管理员与 Cookie。

⚠️ 两个坑：
- **改完 `.env` 必须重启服务** —— Next 只在进程启动时读一次，典型表现是「把邮箱从 `ADMIN_EMAILS` 删了，它居然还能删评论」
- **HTTP 访问**（如局域网 `http://192.168.x.x:3000`）时 `COOKIE_SECURE` 不要强制开 ——
  Secure cookie 在 HTTP 下浏览器根本不存，表现为「登录完一刷新就掉」

## 目录结构

```
config/site.ts              个人信息、工具清单、种子项目与功能开关
dictionaries/{zh,en}.ts     界面文案（两份结构由类型系统强制一致）
content/notes/*.mdx         笔记的种子数据（仅数据库为空时灌入）
data/comments.db            SQLite：评论、账号、会话、验证码、项目、笔记（已 gitignore；项目评论键为 project:<slug>）

lib/db.ts                   建表、迁移、连接
lib/content.ts              笔记与项目的读写
lib/seed.ts                 把静态种子内容灌进数据库
lib/markdown.ts             运行时 Markdown → HTML
lib/md-{inline,editing,commands}.ts   镜像编辑器的纯函数层（行内解析 / 编辑命令 / 表格与快捷键）
lib/auth.ts                 密码哈希 + 会话管理（cookie 的 Secure 判定也在这）
lib/auth-context.tsx        全站登录态
lib/admin-guard.ts          管理端接口的守卫与输入校验
lib/captcha.ts              图形验证码（校验与消费是两个函数，不要合并）
lib/codes.ts / mailer.ts    邮箱验证码 / 邮件发送
lib/audio-token.ts          背景音乐流接口的 HMAC 签名（app/api/audio/）
lib/i18n.tsx                语言 Context
lib/search-index.ts         站内搜索的索引与匹配
lib/assistant-context.ts    分身的站内检索：切片段 → 关键词打分 → 取 Top N
lib/assistant-intents.ts    分身的意图路由
lib/web-search.ts           联网检索（Provider 可换：tavily / bocha / serper）
lib/music-context.tsx       背景音乐状态（全站共用一个 <audio>）
lib/topbar.ts               顶栏控件外观的唯一来源
lib/use-*.ts                快捷键 / 滚动进入动画 / 滚动特效

app/layout.tsx              四个 Provider + 背景层 + 顶栏 / 页脚
app/page.tsx                首页
app/globals.css             颜色与几何令牌、深浅色变体、字体栈、笔记正文排版
app/{projects,notes}/       项目页 / 笔记列表 / 项目详情 / 笔记详情
app/api/assistant/route.ts  模型代理（密钥只在这一层）+ 人设提示词
app/api/{auth,comments,admin,audio}/*

components/admin/MirrorEditor.tsx     Typora 式镜像编辑器（行渲染 + 字符映射 + 光标）
components/admin/MarkdownFloats.tsx   编辑器浮层：右键菜单、格式气泡、查找替换、表格与图片对话框
components/ContentGuard.tsx           非管理员禁选禁复制
components/                 见文件名；区块统一走 SectionBand.tsx（旧的 SectionHeader.tsx 已删）
```

## 数字分身的人设

提示词在 `app/api/assistant/route.ts` 的 `buildSystemPrompt()`，资料从 `config/site.ts` 注入。
回答前先做站内检索（`lib/assistant-context.ts`）；可选接联网搜索（`lib/web-search.ts`，Provider 在 `.env.example`）。
检索不到就不硬答，越界问题明确说不在范围内。

⚠️ 提示词里有一段**硬编码的站内地图**，站点结构一变就要回来改 ——
忘了改，分身会告诉访客「本站只有一页」。

## 部署

**必须跑在有 Node 进程的服务器上**，不能部署成纯静态站点：`/api/assistant` 要代理密钥并转发流式响应；
账号、评论、内容都在 SQLite 里；`/notes/[slug]` 是 `force-dynamic`。纯静态托管只会打开一个页面壳。

要求 Node ≥ 22，装依赖同样带 `--ignore-scripts`。

### 什么时候需要重装依赖

只有 `package.json` / `package-lock.json` 变了才要跑 `npm ci --ignore-scripts`：

```bash
# pull 之后
git diff --name-only HEAD@{1} HEAD -- package.json package-lock.json
# pull 之前
git fetch && git diff --name-only HEAD origin/main -- package.json package-lock.json
```

有输出 = 依赖变过；无输出 = 跳过这步直接 build。拿不准就直接跑，代价只是多一两分钟。

### 背景音乐文件要单独传

`private/audio/bgm.mp3` 不在 git 里（`.gitignore` 排除了 `*.mp3` 与 `/private/`），需要手动传一次：

```bash
scp bgm.mp3 user@server:/srv/my_page/private/audio/
```

不传也不会坏 —— 控件检测不到音频就整块不渲染。想彻底关掉，把 `config/site.ts` 的 `music.src` 置空。

`npm run build` 需要 1~2 GB 内存，小机器先加 swap。

## 授权

**代码**采用 GNU AGPL-3.0，全文见 `LICENSE`。Copyright © 2026 锦创AI。

可自由使用、修改、分发、收费，但有两条底线：保留版权声明；若把修改版通过网络提供给他人使用
（哪怕不分发文件），必须同时向这些用户免费开放完整源码，并继续以 AGPL-3.0 授权。

**页面内容**（头像、照片、文案、版式、公众号二维码等）不在 AGPL 范围内，**保留所有权利**，未经许可不得使用。
