# 锦创AI · 个人主页

分享 AI 技术与项目的个人网页，带一个可以提问的数字分身。

## 这一版做了什么

单页站点，四个部分：

- **头像 + 名字 + 一句话介绍**
- **个人信息区**：兴趣、个人特点、最近在做的事、擅长/关心的方向
- **数字分身聊天区**：接入大模型，流式逐字回答关于我的问题，内置三个一键提问
- **固定顶栏**：名字、GitHub / CSDN / 知乎 / 微信公众号 / 邮箱五个入口、深浅色切换、中英文切换，滚动时不动

其他已实现：

- 深色 / 明亮模式，颜色全部走语义令牌，切换后文字对比度均达 WCAG AA（实测最低 5.82:1）
- 中英双语自由切换，默认中文；偏好存 localStorage
- 移动端适配：顶栏两行、联系方式可横滑、导航折进抽屉，触控区 44px
- 微信公众号点击弹二维码，邮箱点击弹可复制的地址（含键盘可达性：Esc 关闭、焦点圈禁与归还）
- 聊天历史存本地，可清空、可重试、可中途停止

## 技术栈

Next.js 15（App Router）· React 19 · Tailwind CSS v4 · next-themes

无 UI 组件库，图标为内联 SVG，字体使用系统字体栈 —— 页面不请求任何外部 CDN 资源。

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
app/page.tsx                单页主体
app/layout.tsx              主题与语言 Provider、metadata、viewport
app/globals.css             颜色令牌与深浅色变体
app/api/assistant/route.ts  模型代理（密钥只在这一层）+ 人设提示词
components/
  Hero.tsx                  头像、名字、一句话介绍
  InfoCard.tsx              个人信息展示区
  DigitalTwinChat.tsx       聊天区（流式渲染、重试、停止、历史）
  Navbar.tsx                固定顶栏
  MobileNavDrawer.tsx       移动端导航抽屉
  BrandIcons.tsx            五个平台图标
  SocialLinks.tsx           联系方式按钮
  ContactModal.tsx          二维码 / 邮箱弹窗
  LanguageToggle.tsx        语言切换
  theme-toggle.tsx          深浅色切换
```

## 数字分身的人设

系统提示词在 `app/api/assistant/route.ts` 的 `buildSystemPrompt()`，
资料从 `config/site.ts` 注入。核心要求是：先给结论、再打一个生活化的比方、不堆术语，
不知道的就说不知道，不编造经历与数据。

## 后续计划

- 文章 / 项目详情页（技术分享的主要内容）
- 英文内容
- 部署到自有服务器

## 授权说明

**代码**部分采用 GNU AGPL-3.0 授权，全文见根目录 `LICENSE`。Copyright © 2026 锦创AI

你可以自由使用、修改、分发，也可以收费；但有两条底线：

- 保留版权声明
- 若你修改了本项目，并把修改版通过网络提供给他人使用（哪怕不分发文件），
  必须同时向这些用户免费开放完整源码，且继续以 AGPL-3.0 授权

**页面内容**（头像、照片、文案、版式设计、公众号二维码等）不在 AGPL 授权范围内，
一律**保留所有权利**，未经许可不得使用。
