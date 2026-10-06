# 锦创AI · 个人主页

分享 AI 技术与项目的个人网页，带一个可以提问的数字分身。

## 页面结构

三个页面（首页 / 项目 / 笔记）+ 一个悬浮聊天窗。首页是**五个跨页**（封面 / 关于我 / 项目 / 笔记 / 版权页），
每页有自己的底色令牌、主导色和排版骨架 —— 「翻页感」就来自这里，不是靠留白堆出来的。

- **鼠标拖尾**（`components/CursorFx.tsx`）：真鼠标设备才挂，一条细短的拖尾加十字准线；
  触屏和「减少动效」下都不生效
- **首屏（封面）**：桌面双栏 / 手机单列 ——
  左栏是问候行、「你好，我是 锦创AI」（名字**先解码再落定**：每个字先在随机字里跳变、从左到右逐个锁定，
  锁定瞬间放大泛光；汉字走行楷、拉丁字母走同一套字的拉丁搭档）、一句话、两个入口按钮；
  右栏是一张个人名片（Q 版头像，**本体自己在呼吸**：缩放 + 轻微晃动，悬停时放大）加一张终端卡
  （逐字敲出 `whoami` / `cat skills.txt` 等命令并打印 config 里的真实资料，点一下换下一条）。
  数字分身角色**不在首屏**，它是常驻的浮动头像，可按住拖到任意位置（见 `components/TwinEntry.tsx`）
- **关于我（磁贴区）**：籍贯（一颗只裁出上半条的点阵地球，缓慢自转、可以按住拖动，
  邵阳那一点上站着一个 Q 版小人，静止站立、转到球背面就隐藏；标题行有「放大地球」按钮，
  点开是一个完整的球，地名标签钉在卡片左下角）、最喜欢的工具（Codex / Qoder / GitHub）、
  技术栈（六个组各占一行，组名和自己的条目钉在一起）、
  工具（一排品牌标，鼠标停在哪个上就在它正下方显出名字）、连接。
  五块尺寸各不相同，各有自己的装饰色相（蓝 / 珊瑚 / 青绿 / 紫 / 琥珀，只作用于图标与极淡晕染）；
  鼠标靠近时块内会跟着指针发光，扫过时系统箭头换成对应表情（地球块是 ✈️）。
  两条滚动的带子既能自动走也能自己按住横向拖（松手有惯性，之后缓缓接回自动速度），
  手机上纵向照常划页面、横向才是拖带子。
  触屏上其他交互各有等价物：点磁贴在指尖弹一下对应表情，点工具图标把名字钉住 2.8 秒并让这一排暂时停下
- **项目摘要**：只放前几条（条数见 `config/site.ts` 的 `homePreview`），多的去 `/projects` 页；
  项目数据存在数据库里（`config/site.ts` 的 `projects` 数组只是首次迁移的种子数据，见「配置」一节），
  为空时显示一句诚实的空态
- **笔记摘要**：最近三篇，每条是标题 / 日期 / 阅读时长 / 一句话摘要 / 标签，多的去 `/notes` 页。
  笔记存在数据库里（可以在网页上随时新增和修改），正文**只有中文**（见「配置」一节）
- **数字分身聊天窗**：接入大模型，流式逐字回答关于我的问题，内置三个一键提问。
  回答前会先做**站内检索**（`lib/assistant-context.ts`）：把笔记正文、项目、技术栈切成片段，
  按问句里的关键词打分取 Top N 塞进提示词，所以它能答出「某篇笔记里写了什么」这种只有站内才有的内容。
  检索不到就不硬答 —— 越界问题（天气、代写代码）会明确说不在范围内
- **固定顶栏**：名字、GitHub / CSDN / 知乎 / 微信公众号 / 邮箱五个入口、账号入口、深浅色切换、中英文切换，
  桌面端一行排开，滚动时不动；窄屏同一行只留名字 + 账号 + 语言 + 主题 + 汉堡，联系方式收进抽屉
- **页脚（版权页）**：「打个招呼 👋」加一颗邮箱联系按钮，下面三栏（是谁 / 页内导航 / 五个联系入口）和版权行

聊天窗是**悬浮面板**而不是页面里的一段内容，这样对话再长也不会把网页越拉越长：

- 点**浮动头像**开启（2026-10-03 从首屏搬来 —— 原来那个角色挂在首屏末尾，
  既是第五个元素、又得滚回顶部才点得到）；面板打开时按钮自动让位，因为面板桌面端就占着右下角。
  2026-10-06 起这颗按钮**可以按住拖到任意位置并记住**，拖不动网页外：默认它就贴在右下角，
  所以只允许往左上方向挪（向右/向下的上限恒为 0，否则「贴边」和「可拖动」会打架）
- 右下角头像、顶栏与页脚的「问分身」，三个入口共用同一个开合状态
- 面板内部自己滚动，输入框和「猜你想问」固定在底部；Esc 或右上角 × 关闭
- 桌面端展开面板时正文会自动让出宽度，不会被面板盖住
- 手机上换成**三档底部抽屉**（`peek` 一条 / `half` 半高 / `full` 全高，默认半高），可以上下拖着在档位间跳。
  半高档且没弹键盘时面板走**半透明 + 背景模糊**，底下被压住的文字透得出来、又不会糊到看不清；
  一旦弹起软键盘就强制切全高档，否则「键盘顶上来」和「抽屉变矮」两股力会把它挤成一条缝

其他已实现：

- 深色 / 明亮模式，颜色全部走语义令牌，切换后文字对比度均达 WCAG AA（实测最低 5.82:1）
- 中英双语自由切换，默认中文；偏好存 localStorage
- 移动端适配：顶栏单行、导航和联系方式折进抽屉；全站可点元素实测最短边 ≥44px；
  聊天面板跟着软键盘收缩（输入框不会被键盘埋掉）、列表内滚不带动背后页面；
  点按有 accent 色高亮、长按地球不弹系统菜单
- 微信公众号点击弹二维码，邮箱点击弹可复制的地址（含键盘可达性：Esc 关闭、焦点圈禁与归还）
- 聊天历史存本地，可清空、可重试、可中途停止；模型偶尔吐出的 `**加粗**` 等标记在显示前会被清成纯文本
- 键盘快捷键：`G H` / `G P` / `G N` 跳页、`Cmd/Ctrl + K` 搜索、`Cmd/Ctrl + /` 切深浅色、
  `G L` 切语言、`G C` 开聊天窗、`?` 打开快捷键面板；左下角常驻一颗「?」按钮当入口
  （否则不知道有快捷键的人永远按不出第一个问号），**输入框内一律不触发**
- 站内搜索：`Cmd/Ctrl + K` 唤起，搜项目 / 笔记 / 技能 / 工具 / 页面，
  中英关键词都能命中（匹配用的 haystack 把两种语言拼在一起）
- **背景音乐**（2026-10-06 新增，`lib/music-context.tsx` + `components/MusicControls.tsx`）:
  顶栏一颗播放键，展开是音量条。默认**暂停且静音，且不持久化任何状态** ——
  一旦记住「上次是开着听的」，下次打开就变成有声的，那默认静音就白设了。
  全站只渲染**一个** `<audio>`（顶栏与手机抽屉共用一份状态，各渲染一个会同时播两条音轨）。
  音源是 `config/site.ts` 的 `music.src`（默认 `/audio/bgm.mp3`）；
  **文件缺失或加载失败时整块不渲染**，只在控制台留一条 warn —— 与其留两个点不动的灰按钮，
  不如让访客根本看不到它
- 笔记详情页顶部一条随阅读生长的进度条（原生 scroll + rAF，零依赖 ——
  用 framer 写会把那一页 First Load JS 从 113 kB 顶到 156 kB，为一条 2px 的线不值）
- 404 页，文案跟随中英切换

账号与内容管理（2026-10-04 补齐，这几块原来在 README 里完全没提）：

- **账号体系**：邮箱验证码注册（一次性邮箱域名会被挡下）、登录、邮箱验证、找回密码、**注销账号**。
  注销是「发验证码到本人邮箱 → 填 6 位码 → 删除」，账号连同全部评论一起没，不可恢复。
  服务端只认**当前登录用户自己的邮箱**，不接受请求体里指定的邮箱 ——
  否则任何登录用户都能让本站给任意邮箱发信。
- **评论区**：挂在每篇笔记底部。读不需要登录，写才要；支持一层回复、删除自己的评论，
  管理员可删任意评论。所有错误都走错误码 + 字典，加语言不用改后端。
- **在线编辑**：站长登录后在 `/notes` 与 `/projects` 页面上直接新建 / 编辑 / 删除，
  内容存数据库，改完即时生效、不需要重新构建。编辑器是「左边写右边实时出效果」，
  还支持**上传一个 `.md` 文件**自动拆 frontmatter。
- **Markdown 全语法**：表格、任务列表、行内与块级公式（KaTeX）、代码块、`==高亮==` 等。

## 技术栈

Next.js 15（App Router）· React 19 · Tailwind CSS v4 · next-themes · lucide-react · framer-motion ·
cobe（WebGL 地球）· better-sqlite3（SQLite 存内容与账号）· unified + remark + rehype（运行时渲染 Markdown）·
KaTeX（公式）· nodemailer（验证码邮件）· svg-captcha（图形验证码）

没有引入成体系的 UI 组件库。通用图标（菜单、关闭、聊天、深浅色切换等）取自 lucide-react；
CSDN、知乎、微信三个品牌图标是手写内联 SVG，GitHub 与邮箱图标沿用 lucide-react 的形状；
页面切换与顶栏动效用 framer-motion；籍贯那颗点阵地球用 cobe（WebGL，纯客户端打包，不请求外部资源）；
鼠标拖尾是自己写的 2D canvas，没有再引第三方粒子/特效库。

**笔记走运行时渲染，不是构建期 MDX**（2026-10-04 改造）：笔记存在数据库里、可以在网页上随时新增和修改，
所以 `@next/mdx` 这条路已经整个拆掉（连同 `@mdx-js/*`、`mdx-components.tsx` 一起移除了）。
正文由 `lib/markdown.ts` 在**请求时**用 unified + remark-gfm（表格、任务列表）+ remark-math / rehype-katex（公式）
渲染成 HTML。排版是手写的 `.prose-site`，没有引 `@tailwindcss/typography` ——
它自带 65ch 行宽和一整套独立的 `--tw-prose-*` 颜色变量，与本站的语义令牌体系冲突，压到一致要逐个覆写。

字体四条腿：**正文**是系统无衬线栈，一个字节都不下载；
**首屏名字的汉字 + 名字里的拉丁字母**都走自托管的霞鹜文楷子集（原字体 24.4 MB，按页面真正用到的
78 个字形裁成 **15.1 KB** 的 woff2，SIL OFL 1.1，授权文本 `public/fonts/LICENSE-OFL-LXGW.txt`）。
这一条是 2026-10-03 改的：原来走系统楷体栈，而**多数安卓机一个楷体都没有**，
名字会静默退回宋体，手机上和电脑上完全是两种字 —— 名字是全站最重要的一行，不能听天由命。
霞鹜文楷自带拉丁字母，所以「锦创AI」是同一种笔意写出来的，不再有「汉字行楷 + AI 用 Comic Sans」的拼贴感；
**展示字（区块标题、页脚大字等）**是一条宋体展示栈，第一位是自托管的思源宋体子集 —— 原字体 25 MB，
按页面真正用到的 39 个汉字裁成 23 KB 的 woff2，放在 `public/fonts/` 下，授权 SIL OFL 1.1（授权文本同目录）。
**笔记正文刻意不碰这两条展示栈**：子集只含几十个汉字，正文一旦用它就会大面积静默退回系统宋体。
全站不请求任何外部 CDN —— 字体、图标、脚本全部由自己的服务器发出。

## 形象素材

全站四处人物形象 + 一枚站点图标共用同一套 Q 版画风（大头小身、统一粗细的深色描边、
单层扁平阴影、紫领带），2026-10-03 统一改绘：

| 素材 | 位置 | 尺寸 | 用途 |
|---|---|---|---|
| 头像 | `public/images/avatar.jpg` | 640×640 JPEG | 首屏个人名片里的圆形头像（CSS 裁圆） |
| 数字分身角色 | `public/images/mascot-q.png` | 512×512 PNG | **常驻的浮动头像**（`components/TwinEntry.tsx`），默认贴右下角、可拖动，点它开聊天窗 |
| 地球小人 | `public/images/avatar-stand.png` | 64×224 PNG | 籍贯卡片地球上站在邵阳的那一点 |
| 笔记配图 | `public/images/hero-scene.jpg` | 1024×1024 JPEG | 笔记正文配图（由笔记内容引用，所以静态搜代码搜不到它） |
| 站点图标 | `public/favicon.svg` | 32×32 SVG | 浏览器标签页 |

尺寸、宽高比、透明通道、文件格式四项都是硬约束，动其中任何一项都会破坏现有布局
（头像靠 CSS 裁圆、角色靠 alpha 透出底色、地球小人按宽高比投影）。完整的画风规范、
体积预算与重绘流程见 `DOWNLOADS.md` 的「形象素材规范」一节。

## 本地运行

**要求 Node ≥ 22**（写在 `package.json` 的 `engines` 里；`better-sqlite3` 13 的硬要求）。

```bash
npm install --ignore-scripts   # 必须带这个参数，原因见下方「关于 --ignore-scripts」
cp .env.example .env    # 填入你的模型密钥
npm run dev             # http://localhost:3000
```

其他命令：`npm run build` 生产构建，`npm run start` 运行构建产物，`npm run typecheck` 类型检查。

### 关于 `--ignore-scripts`

**不加这个参数，在 Windows 上装依赖会失败**，报 `node-gyp rebuild` 找不到 Visual Studio。

原因是 `better-sqlite3` 走 **prebuildify**：它的 `package.json` 里没有 `install` 脚本，
但包内有 `binding.gyp`，而 npm 的老规矩是「有 `binding.gyp` 又没定义 `install` → 默认跑
`node-gyp rebuild`」——于是它会去白白编译一遍。**而预编译二进制其实随包下好了**
（`node_modules/better-sqlite3/prebuilds/` 里有 8 个平台各一份，含 `win32-x64.node`），
加 `--ignore-scripts` 跳过那步编译即可，功能完全不受影响。

**这跟 Node 版本无关**：Node 22 和 Node 24 都一样会失败。该模块基于 **Node-API**
（二进制里全是 `napi_*` 符号、没有 V8 私有 API 符号，prebuilds 文件名也不带 ABI 号），
所以同一份二进制跨 Node 大版本通用，升级 Node 不需要重新编译。

**另一个连带症状**：`npm ci` / `npm install` 会在这步**中止**，导致后面的包没装完，
构建时报 `Module not found: Can't resolve 'bail'`。**看到这个报错不要去追 `bail`** ——
它只是「安装没跑完」的信号，带上 `--ignore-scripts` 重装一遍即可。

## 配置

**个人信息**：全部集中在 `config/site.ts`，改这一个文件即可（名字、简介、头像、五个联系方式、
公众号二维码、邮箱、数字分身要背的资料）。中英文两列都要填。

**内容（项目 / 笔记）存在数据库里**，可以在网页上直接新增和修改，不需要改代码、不需要重新构建。
`config/site.ts` 的 `projects` 数组和 `content/notes/*.mdx` 现在是**首次迁移用的种子数据** ——
数据库还是空的时候由 `lib/seed.ts` 把它们灌进去（见 `lib/db.ts` 的调用点）；
之后的内容以数据库为准。改种子数据不会影响已有内容。

**环境变量**：完整清单和逐项说明在 `.env.example`（13 个），按用途分四组：

```
# ① 数字分身（必需，否则聊天窗不可用）
API_KEY=你的密钥
BASE_URL=https://你的服务地址/compatible-mode/v1
MODEL_ID=模型名

# ② 验证码邮件（注册 / 找回密码 / 注销账号要用）
SMTP_HOST= SMTP_PORT=465 SMTP_USER= SMTP_PASS= SMTP_FROM=

# ③ 站点与数据
SITE_URL=  DB_PATH=  DISPOSABLE_EMAIL_DOMAINS=

# ④ 管理员与 Cookie
ADMIN_EMAILS=            # 逗号分隔；改完必须重启服务，见下
COOKIE_SECURE=           # 留空=按 x-forwarded-proto 自动判断；1=强制 Secure，0=强制关闭
```

密钥只在服务端读取（`app/api/assistant/route.ts`），不会出现在浏览器里。
`.env` 已被 `.gitignore` 排除，不要提交。

**两个容易踩的坑**：
- **改完 `.env` 必须重启服务**（`sudo systemctl restart my-page`）。Next.js 只在**进程启动时**读一次 `.env`，
  不重启的话进程里还是旧值 —— 典型表现是「把某个邮箱从 `ADMIN_EMAILS` 删了，它居然还能删评论」。
- **站点如果通过 HTTP 访问**（比如局域网 `http://192.168.x.x:3000`），`COOKIE_SECURE` **不要**强制开 ——
  Secure cookie 在 HTTP 下浏览器根本不存，表现为「登录完一刷新就掉」。

## 目录结构

```
config/site.ts              个人信息、工具清单、种子项目与功能开关（homePreview 等）
dictionaries/{zh,en}.ts     界面文案（两份结构由类型系统强制一致）
content/notes/*.mdx         笔记的**种子数据**（数据库为空时由 lib/seed.ts 灌进去，之后以数据库为准）
data/comments.db            SQLite 数据库：评论、账号、会话、验证码、项目、笔记（已 gitignore）
.env.example                环境变量清单与逐项说明（13 个，分四组）

lib/db.ts                   SQLite 数据层：建表、迁移、连接（评论 / 账号 / 内容都在这张库里）
lib/content.ts              内容层：笔记与项目的读写
lib/seed.ts                 内容迁移：把 config 与 content/notes 里的静态内容灌进数据库
lib/markdown.ts             运行时 Markdown → HTML（unified + remark + rehype + KaTeX）
lib/parse-md-file.ts        解析整篇 .md 文件：拆 frontmatter 与正文（给「上传 .md」用）
lib/auth.ts                 认证层：密码哈希 + 会话管理（cookie 的 Secure 判定也在这）
lib/auth-context.tsx        全站登录态（顶栏账号入口与评论区共用同一份）
lib/admin-guard.ts          管理端接口的公共守卫与输入校验
lib/captcha.ts              图形验证码的生成与校验（**校验与消费是两个函数，不要合并**）
lib/auth-ttl.ts             各类凭证的过期时长单一来源（界面文案也从这里取值）
lib/codes.ts                邮箱验证码：注册与注销共用同一套
lib/mailer.ts               邮件发送（验证码 / 重置密码 / 注销确认）
lib/email-guard.ts          邮箱准入检查：把一次性邮箱挡在注册之外
lib/disposable-domains.ts   一次性邮箱域名清单（数据文件，不要手改）
lib/i18n.tsx                语言 Context + localStorage 持久化
lib/search-index.ts         站内搜索的索引构建与匹配（把站点数据拍平成可搜索条目）
lib/twin-chat-context.tsx   聊天窗的开合状态（多处入口控制同一个面板）
lib/assistant-context.ts    数字分身的站内检索：切片段 → 按问句关键词打分 → 取 Top N 拼提示词
lib/music-context.tsx       背景音乐状态（全站共用同一个 `<audio>`；默认暂停 + 静音，不持久化）
lib/topbar.ts               顶栏控件外观的**唯一来源**（圆钮 / 胶囊 / 图标尺寸 / 播放中的环）
lib/use-hotkeys.ts          全局键盘快捷键（G 序列跳转、Cmd+K 搜索、Cmd+/ 切主题等）
lib/use-reveal.ts           滚动进入动画的属性包 + useHydrationSafeReducedMotion
lib/use-scroll-fx.ts        滚动特效的两个原语：焦点接力高光、视差位移

app/page.tsx                首页（首屏 + 磁贴区 + 项目摘要 + 笔记摘要）
app/layout.tsx              主题、语言、登录、聊天窗四个 Provider + 背景层 + 顶栏 / 页脚
app/globals.css             颜色与几何令牌、深浅色变体、keyframes、字体栈、卡片表面、笔记正文排版
app/projects/page.tsx       项目页（服务端壳：读数据 + 导出 metadata，渲染交给客户端体）
app/notes/page.tsx          笔记列表页
app/notes/[slug]/page.tsx   笔记详情页（force-dynamic，每次请求现读库 + 现渲染 Markdown）
app/not-found.tsx           404 页（读语言字典，跟随中英切换）
app/api/assistant/route.ts  模型代理（密钥只在这一层）+ 人设提示词
app/api/auth/*              账号接口：register / login / logout / me / verify / send-code /
                            forgot / reset / account（DELETE 注销）
app/api/comments/*          评论的读写与删除
app/api/admin/*             管理端接口：笔记与项目的增删改 + Markdown 预览渲染

components/
  CursorFx.tsx              鼠标拖尾 + 十字准线（2D canvas，只在真鼠标设备挂）
  Hero.tsx                  首屏（桌面双栏 / 手机单列）：名字解码入场、简介、两个入口、个人名片、终端卡
  TerminalCard.tsx          首屏终端卡（逐字敲命令 + 打印输出，点一下换下一条）
  Dashboard.tsx             关于我：籍贯 / 最喜欢的工具 / 技术栈 / 工具 / 连接 + 放大地球浮层
  DottedGlobe.tsx           点阵地球（cobe / WebGL；邵阳那一点由第二张 canvas 投影贴一张站姿人像，可拖动）
  SectionBand.tsx           区块外壳 + 区块头：通栏底色 + 2px 页眉线 + 该页自己的背景光 + 等宽编号 + 宋体章节名。
                            新加区块统一走它（旧的 `SectionHeader.tsx` 已删除）
  Marquee.tsx               滚动的条（工具那两排）：自动走 + 可用指针横向拖，松手带惯性
  CustomCursor.tsx          表情光标（地球块上方箭头变 ✈️），只在真鼠标设备生效
  ToolIcon.tsx              工具标：有官方彩色标的上图，没标的用字母徽标
  ToolGlyphs.tsx            九枚单色品牌标的内联路径数据
  Projects.tsx              首页的项目摘要（前几条 + 查看全部）
  ProjectsGrid.tsx          项目卡片网格（首页摘要与 /projects 共用同一套卡片，避免样式漂移）
  ProjectsPageBody.tsx      项目页的内容体（客户端，读字典）
  NotesList.tsx             笔记列表（首页摘要与 /notes 共用；整项是一条链接）
  NoteBackLink.tsx          笔记详情页的「返回笔记列表」
  CommentSection.tsx        笔记详情页底部的评论区（含未登录时的登录 / 注册 / 找回密码三视图）
  DigitalTwinChat.tsx       聊天面板：流式渲染、重试、停止、内部滚动、历史；手机上是三档底部抽屉
  ChatInset.tsx             桌面端展开面板时让正文让位，避免被遮挡
  TwinEntry.tsx             数字分身常驻入口：一颗浮动头像，可拖动并记住位置（点它开聊天窗）
  Navbar.tsx                固定顶栏（一行；窄屏收进抽屉）
  MobileNavDrawer.tsx       移动端导航抽屉
  AuthMenu.tsx              顶栏账号入口：未登录显示「登录」，已登录是下拉（管理员徽章 / 注销账号 / 退出登录）
  AuthPanel.tsx             登录 / 注册 / 找回密码浮层
  CaptchaField.tsx          图形验证码输入块（刷新 / 校验 / 错误提示），注册与注销共用
  DeleteAccountPanel.tsx    注销账号浮层（图形码 → 当前密码 → 邮箱验证码，按验证成本从低到高）
  ResetPasswordPanel.tsx    重置密码面板（接管邮件里 `?reset=<token>` 的链接）
  VerifyNotice.tsx          邮箱验证完成后的提示（接管 `?verified=`）
  BrandIcons.tsx            五个平台图标
  SocialLinks.tsx           联系方式按钮
  ContactModal.tsx          二维码 / 邮箱弹窗
  LanguageToggle.tsx        语言切换
  theme-toggle.tsx          深浅色切换
  MusicControls.tsx         顶栏背景音乐控件（播放 / 静音 / 音量条）
  ThemeColorSync.tsx        把手机地址栏的颜色同步成当前封面页的底色
  footer.tsx                页脚（打招呼 + 邮箱按钮、三栏、版权行）
  page-transition.tsx       页面切换淡入动画
  ReadingProgress.tsx       笔记详情页的阅读进度条（原生 scroll + rAF，不引 framer）
  ShortcutLayer.tsx         全局键盘层的组装件（快捷键注册 + 说明面板 + 站内搜索 + 常驻入口）
  ShortcutHelp.tsx          快捷键说明面板（按 ? 或点左下角常驻按钮打开）
  SiteSearch.tsx            Cmd/Ctrl+K 唤起的站内搜索面板
  admin/
    EditorPanel.tsx         浮层外壳（遮罩 + 面板 + 标题 + 关闭）。全站弹层都用它，Portal 到 body
    MarkdownEditor.tsx      Markdown 编辑器：左边写、右边实时出效果（窄屏上下叠）
    MarkdownImport.tsx      「上传 Markdown 文件」按钮
    NoteAdmin.tsx           笔记管理：新建 + 带编辑/删除的列表 + 编辑浮层
    ProjectAdmin.tsx        项目管理：新建 + 带编辑/删除的卡片网格 + 编辑浮层
```

## 数字分身的人设

系统提示词在 `app/api/assistant/route.ts` 的 `buildSystemPrompt()`，
资料从 `config/site.ts` 注入。核心要求是：先给结论、再打一个生活化的比方、不堆术语，
不知道的就说不知道，不编造经历与数据。

里面有一段**硬编码的站内地图**（「本站有三个页面…」）。站点结构一变就要回来改它 ——
忘了改，分身会一本正经地告诉访客「本站只有一页」，而页面上明明挂着新入口。

## 后续计划

- 项目详情页（目前项目卡直接外链 GitHub，要写长文时再开）
- 笔记的标签筛选与分页（现在是一次列全部）
- 代码块语法高亮（`rehype-pretty-code` + `shiki`，构建期执行、不进浏览器 JS）
- 英文内容（正文目前只有中文，见 `lib/i18n.tsx` 的作用域说明）

## 部署

**必须跑在有 Node 进程的服务器上**，不能部署成纯静态站点。原因不止一条：
`app/api/assistant/route.ts` 要代理模型密钥并转发流式响应；账号、评论、内容都存在 SQLite 里，
要读要写；`/notes/[slug]` 是 `force-dynamic`，每次请求现读数据库。
GitHub Pages / 纯静态托管只会打开一个页面壳，聊天、登录、评论、笔记详情全部失效。

**服务器要求 Node ≥ 22**（`better-sqlite3` 13 的硬要求，见「本地运行」一节）。
装依赖同样要带 `--ignore-scripts`。

### 什么时候才需要重新装依赖

只有 `package.json` / `package-lock.json` **变了**才要跑 `npm ci --ignore-scripts`。

判断方法 —— 在服务器上 `git pull` **之后**执行：

```bash
git diff --name-only HEAD@{1} HEAD -- package.json package-lock.json
# 有输出 = 依赖变过，跑 npm ci --ignore-scripts
# 无输出 = 没变，跳过这步直接 build
```

`HEAD@{1}` 是 pull 之前那个提交（git reflog 里记着）。

想在 pull **之前**就知道，换成：

```bash
git fetch && git diff --name-only HEAD origin/main -- package.json package-lock.json
```

本地则更简单，工作区干净时看 `git status --short package.json package-lock.json` 有没有输出即可。

拿不准就直接跑 `npm ci --ignore-scripts` —— 它先删 `node_modules` 再按 lock 重装，
结果确定，代价只是多花一两分钟。

### 背景音乐文件要单独传

`public/audio/bgm.mp3` 被 `.gitignore` 排除了，所以 `git pull` 拿不到它，需要手动传一次：

```bash
scp public/audio/bgm.mp3 user@server:/srv/my_page/public/audio/
```

不传也不会坏 —— 控件检测不到音频文件就整块不渲染，顶栏不会留下一个点不动的按钮。
想彻底关掉这个功能，把 `config/site.ts` 里 `music.src` 置空即可。

所有配置从环境变量读，不放代码里、不进仓库 —— 完整清单见 `.env.example`（13 个，分四组）。
上线前至少要配：模型三件套（`API_KEY` / `BASE_URL` / `MODEL_ID`）、
邮件（`SMTP_*`，注册与找回密码要用）、`SITE_URL`、`DB_PATH`、`ADMIN_EMAILS`。

`npm run build` 需要的内存比开发模式大不少，1~2 GB 的机器先加 swap 再构建。

## 授权说明

**代码**部分采用 GNU AGPL-3.0 授权，全文见根目录 `LICENSE`。Copyright © 2026 锦创AI

你可以自由使用、修改、分发，也可以收费；但有两条底线：

- 保留版权声明
- 若你修改了本项目，并把修改版通过网络提供给他人使用（哪怕不分发文件），
  必须同时向这些用户免费开放完整源码，且继续以 AGPL-3.0 授权

**页面内容**（头像、照片、文案、版式设计、公众号二维码等）不在 AGPL 授权范围内，
一律**保留所有权利**，未经许可不得使用。
