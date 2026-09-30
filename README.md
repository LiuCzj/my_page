# 锦创AI · 个人主页

分享 AI 技术与项目的个人网页，带一个可以提问的数字分身。

## 这一版做了什么

单页站点，从上到下三块 + 一个悬浮聊天窗：

- **首屏**：整屏居中竖排，背景是一片会随鼠标搅动的星点层 ——
  彩色头像（背后一圈透出来的光，悬停时放大侧转、外圈虚线环开始慢转）、
  「你好，我是 锦创AI」（名字逐字入场、走思源宋体子集）、一句话、
  数字分身机器人 + 两个入口、五个联系方式图标
- **磁贴区**：籍贯（缓慢自转、可拖动点阵地球）、最喜欢的工具（Codex / Qoder / GitHub）、
  技术栈（三行反向滚动，行首钉住组名）、工具（两行反向滚动，有品牌标的上图）、连接。
  五块尺寸各不相同；鼠标靠近时块内会跟着指针发光，扫过时系统箭头换成对应表情（地球块是 ✈️）
- **项目**：`config/site.ts` 的 `projects` 为空时显示一句诚实的空态
- **数字分身聊天窗**：接入大模型，流式逐字回答关于我的问题，内置三个一键提问
- **固定顶栏**：名字、GitHub / CSDN / 知乎 / 微信公众号 / 邮箱五个入口、深浅色切换、中英文切换，滚动时不动

聊天窗是**悬浮面板**而不是页面里的一段内容，这样对话再长也不会把网页越拉越长：

- 点首屏的小机器人开启，再点一次关闭；悬停时提示文字会跟着变成「点我，开启/关闭数字分身」
- 首屏的「与数字分身聊聊」、首屏的小机器人、顶栏的「问分身」，都能打开同一个面板
- 面板内部自己滚动，输入框和「猜你想问」固定在底部；Esc 或右上角 × 关闭
- 桌面端展开面板时正文会自动让出宽度，不会被面板盖住；窄屏下面板贴在顶栏下方接近全屏

其他已实现：

- 深色 / 明亮模式，颜色全部走语义令牌，切换后文字对比度均达 WCAG AA（实测最低 5.82:1）
- 中英双语自由切换，默认中文；偏好存 localStorage
- 移动端适配：顶栏两行、联系方式可横滑、导航折进抽屉，触控区 44px
- 微信公众号点击弹二维码，邮箱点击弹可复制的地址（含键盘可达性：Esc 关闭、焦点圈禁与归还）
- 聊天历史存本地，可清空、可重试、可中途停止；模型偶尔吐出的 `**加粗**` 等标记在显示前会被清成纯文本
- 页脚（一句话介绍、五个联系方式、版权行）与 404 页，文案均跟随中英切换

## 技术栈

Next.js 15（App Router）· React 19 · Tailwind CSS v4 · next-themes · lucide-react · framer-motion · cobe

没有引入成体系的 UI 组件库。通用图标（菜单、关闭、聊天、深浅色切换等）取自 lucide-react；
CSDN、知乎、微信三个品牌图标是手写内联 SVG，GitHub 与邮箱图标沿用 lucide-react 的形状；
页面切换与顶栏动效用 framer-motion；籍贯那颗点阵地球用 cobe（WebGL，纯客户端打包，不请求外部资源）。

字体两条腿走路：**正文**是系统无衬线栈，一个字节都不下载；**展示字**（首屏名字、地名、区块标题）
是自托管的思源宋体子集 —— 原字体 25 MB，按页面真正用到的 39 个汉字裁成 23 KB 的 woff2，
放在 `public/fonts/` 下，授权 SIL OFL 1.1（授权文本同目录）。
子集里刻意没放拉丁字母，所以「锦创AI」里的 AI 自然落到 Georgia。
全站不请求任何外部 CDN —— 字体、图标、脚本全部由自己的服务器发出。

## 本地运行

```bash
npm install
cp .env.example .env    # 填入你的模型密钥
npm run dev             # http://localhost:3000
```

其他命令：`npm run build` 生产构建，`npm run start` 运行构建产物，`npm run typecheck` 类型检查。

## 配置

**个人信息**：全部集中在 `config/site.ts`，改这一个文件即可（名字、简介、头像、五个联系方式、
公众号二维码、邮箱、数字分身要背的资料）。中英文两列都要填。

**模型服务**：`.env` 三个变量，走 OpenAI 兼容格式，换任意厂商只改这两行不用动代码：

```
API_KEY=你的密钥
BASE_URL=https://你的服务地址/compatible-mode/v1
MODEL_ID=模型名
```

密钥只在服务端读取（`app/api/assistant/route.ts`），不会出现在浏览器里。
`.env` 已被 `.gitignore` 排除，不要提交。

## 目录结构

```
config/site.ts              个人信息与功能开关
dictionaries/{zh,en}.ts     界面文案（两份结构由类型系统强制一致）
lib/i18n.tsx                语言 Context + localStorage 持久化
lib/twin-chat-context.tsx   聊天窗的开合状态（多处入口控制同一个面板）
lib/use-reveal.ts           滚动进入动画的属性包（减少动效时整包不挂）
app/page.tsx                单页主体
app/layout.tsx              主题、语言、聊天窗三个 Provider + metadata + viewport
app/globals.css             颜色令牌、深浅色变体、背景光晕层、展示字体栈
app/not-found.tsx           404 页（读语言字典，跟随中英切换）
app/api/assistant/route.ts  模型代理（密钥只在这一层）+ 人设提示词
components/
  Hero.tsx                  首屏：居中竖排的头像、逐字入场的问候行、机器人、两个入口、联系方式
  StarField.tsx             首屏背景的星点层（会随鼠标搅动；减动效下画一帧静态星点）
  Dashboard.tsx             磁贴区：籍贯 / 最喜欢的工具 / 技术栈 / 工具 / 连接（鼠标邻近发光）
  Projects.tsx              项目区块（config 为空时是诚实空态）
  DottedGlobe.tsx           点阵地球（cobe / WebGL，城市标记由第二张 canvas 投影绘制，可拖动）
  Marquee.tsx               来回滚动的条（技术栈、工具共用）
  CustomCursor.tsx          表情光标（地球块上方箭头变 ✈️），只在真鼠标设备生效
  RobotMark.tsx             数字分身机器人（全身投影像 + 扫描线）
  ToolIcon.tsx              工具标：有官方彩色标的上图，没标的用字母徽标
  DigitalTwinChat.tsx       悬浮聊天面板（流式渲染、重试、停止、内部滚动、历史）
  ChatInset.tsx             桌面端展开面板时让正文让位，避免被遮挡
  Navbar.tsx                固定顶栏
  MobileNavDrawer.tsx       移动端导航抽屉
  BrandIcons.tsx            五个平台图标
  SocialLinks.tsx           联系方式按钮
  ContactModal.tsx          二维码 / 邮箱弹窗
  LanguageToggle.tsx        语言切换
  theme-toggle.tsx          深浅色切换
  footer.tsx                页脚（一句话介绍 + 联系方式 + 版权行）
  page-transition.tsx       页面切换淡入动画
```

## 数字分身的人设

系统提示词在 `app/api/assistant/route.ts` 的 `buildSystemPrompt()`，
资料从 `config/site.ts` 注入。核心要求是：先给结论、再打一个生活化的比方、不堆术语，
不知道的就说不知道，不编造经历与数据。

## 后续计划

- 文章 / 项目详情页（技术分享的主要内容）
- 英文内容
- 部署到自有服务器

部署注意：本站有服务端路由 `app/api/assistant/route.ts`（代理模型密钥、转发流式响应），
**必须跑在有 Node 进程的服务器上**，不能部署成纯静态站点 —— GitHub Pages / 纯静态托管
会让聊天功能直接失效，只有页面壳能打开。

## 授权说明

**代码**部分采用 GNU AGPL-3.0 授权，全文见根目录 `LICENSE`。Copyright © 2026 锦创AI

你可以自由使用、修改、分发，也可以收费；但有两条底线：

- 保留版权声明
- 若你修改了本项目，并把修改版通过网络提供给他人使用（哪怕不分发文件），
  必须同时向这些用户免费开放完整源码，且继续以 AGPL-3.0 授权

**页面内容**（头像、照片、文案、版式设计、公众号二维码等）不在 AGPL 授权范围内，
一律**保留所有权利**，未经许可不得使用。
