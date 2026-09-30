/**
 * 中文界面文案字典（默认语言）。
 *
 * 只保留单页站点真正会用到的键。
 * dictionaries/en.ts 被声明成 `const en: Dict`，所以两边键必须完全一致，
 * 少一个就编译不过 —— 这是故意的，避免英文界面漏出中文或 undefined。
 */
const zh = {
  nav: {
    home: '首页',
    projects: '项目',
    chat: '问分身',
  },
  topbar: {
    menu: '打开菜单',
    closeMenu: '关闭菜单',
    siteName: '锦创AI 首页',
    drawerNav: '页面目录',
    drawerContact: '联系方式',
    contactScrollHint: '左右滑动查看全部联系方式',
  },
  language: {
    switchTo: '切换到 English',
  },
  theme: {
    ariaToLight: '切换到明亮模式',
    ariaToDark: '切换到暗黑模式',
  },
  contact: {
    wechatTitle: '微信公众号',
    wechatHint: '扫码关注「{account}」',
    wechatHintFallback: '扫码关注微信公众号',
    qrcodeMissing: '站长还没上传公众号二维码',
    emailTitle: '联系邮箱',
    emailHint: '点击邮箱框可全选，复制后随时粘贴',
    copy: '复制',
    copied: '已复制',
    copyFailed: '复制失败，请手动选中文字复制',
    openMail: '打开邮件客户端',
    notConfiguredTitle: '该联系方式尚未配置',
    notConfiguredBody: '站长还没把这个链接填进 config/site.ts，稍后再来试试。',
    notConfiguredAction: '我知道了',
    close: '关闭',
  },
  hero: {
    /** 问候行前半句，名字本身不翻译（署名不是可翻译词） */
    greeting: '你好，我是',
    /** 问候行下面那一句自我介绍 */
    bio: '一位喜欢研究 AI 的工程师。',
    robotHintOpen: '点我，开启数字分身',
    robotHintClose: '点我，关闭数字分身',
    robotAria: '数字分身聊天窗开关',
    viewProjects: '查看我的项目',
  },
  location: {
    /** 邵阳是籍贯，不是现居地 —— 他 2026-09-30 明确说过，所以这里用「籍贯」 */
    label: '籍贯',
  },
  favorite: {
    title: '最喜欢的工具',
  },
  skills: {
    title: '技术栈',
  },
  tools: {
    title: '工具',
  },
  connect: {
    title: '连接',
  },
  projects: {
    title: '项目',
    /** config/site.ts 的 projects 为空数组时显示这两句 */
    empty: '还没有整理出来的项目',
    emptyHint: '这里会放我做过的东西。我先把主页和数字分身做完，再把项目补进来。',
  },
  chat: {
    title: '数字分身 · 直接问我',
    subtitle: '关于锦创AI 的问题都可以问，它会用人话回答。',
    placeholder: '想问什么？比如「你有哪些作品」',
    send: '发送',
    stop: '停止',
    clear: '清空对话',
    close: '关闭数字分身',
    retry: '重试',
    twin: '分身',
    quickAsk: '猜你想问',
    disclaimer: '内容由 AI 生成，重要信息请以锦创AI 本人回复为准。',
    errorEmpty: '请先输入内容。',
    errorTooLong: '这条太长了，精简到 2000 字以内再发。',
    errorFailed: '分身暂时不可用',
    errorFallback: '你可以直接发邮件联系我，或稍后再试。',
    errorDetail: '原因：{reason}',
    /** 与 app/api/assistant/route.ts 的错误码一一对应 */
    reasons: {
      env_missing: '服务端还没配置模型密钥',
      bad_request: '请求内容有问题',
      too_long: '这条太长了',
      rate_limited: '问得太快了，休息几分钟再来',
      upstream_auth: '密钥无效或已过期',
      upstream_rate_limit: '模型那边限流了',
      upstream_timeout: '模型响应超时',
      upstream_error: '模型服务连不上',
      network: '网络请求失败',
    },
  },
  pages: {
    notFound: {
      title: '页面走丢了',
      desc: '这个地址下没有内容，可能是链接写错了。',
      back: '回首页',
    },
  },
  footer: {
    rights: '© {year} 锦创AI',
  },
};

/**
 * 注意：这里刻意不加 `as const`。
 * 加了会把每个值变成字面量类型（如 "首页"），en.ts 声明为 Dict 时就只能填一模一样的中文，
 * 失去编译期结构校验的意义。不加则值被推宽为 string，只校验「键结构」是否一致。
 */
export type Dict = typeof zh;

export default zh;
