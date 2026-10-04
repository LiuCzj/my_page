/**
 * 中文界面文案字典（默认语言）。
 *
 * 只保留站点真正会用到的键。站点已从单页扩成「首页 + 项目页 + 笔记页」三页，
 * 这里放的是**界面文案**（导航、区块标题、空态、阅读时长）。
 * 文章正文不进字典 —— 见 lib/i18n.tsx 的说明，正文只有中文，不参与翻译。
 * dictionaries/en.ts 被声明成 `const en: Dict`，所以两边键必须完全一致，
 * 少一个就编译不过 —— 这是故意的，避免英文界面漏出中文或 undefined。
 */
const zh = {
  nav: {
    home: '首页',
    projects: '项目',
    notes: '笔记',
    /**
     * 2026-10-04 由「问分身」改成「AI 问答」。
     * 用户反馈：他自己都不确定「问分身」是什么意思，新访客更看不懂。
     * 「分身」是站内对数字人的叫法（首屏、聊天面板标题里都在用），
     * 但导航项要让**第一次来的人**秒懂，所以直接写「AI 问答」。
     */
    chat: 'AI 问答',
  },
  topbar: {
    menu: '打开菜单',
    closeMenu: '关闭菜单',
    siteName: '锦创AI 首页',
    drawerNav: '页面目录',
    drawerContact: '联系方式',
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
    bio: '喜欢用人话讲解复杂问题。',
    /** 首屏状态徽章：青绿点 + 这行字，表示愿意接洽/回消息 */
    status: '可联系',
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
    /** 独立项目页顶部的一句说明 */
    lead: '我做过的、正在做的东西。',
    /** config/site.ts 的 projects 为空数组时显示这两句 */
    empty: '还没有整理出来的项目',
    emptyHint: '这里会放我做过的东西。我先把主页和数字分身做完，再把项目补进来。',
    /** 首页摘要区块右侧的「去全部」入口 */
    viewAll: '查看全部项目',
  },
  notes: {
    title: '笔记',
    lead: '写我在做的东西时踩过的坑，和想明白的事。',
    empty: '还没有写好的笔记',
    emptyHint: '这里会放技术笔记。我先把版式搭好，再一篇篇补进来。',
    viewAll: '查看全部笔记',
    /** 列表项里的阅读时长，{minutes} 由 lib/content.ts 现算 */
    readTime: '{minutes} 分钟阅读',
    /** 详情页顶部的返回入口 */
    back: '返回笔记列表',
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
  /** 首屏终端卡：一串可点击切换的假命令，用命令行讲「我是谁」 */
  terminal: {
    title: '终端',
    hint: '点一下换个命令',
    aria: '命令行自我介绍，点击切换命令',
  },
  /** 键盘快捷键说明面板（按 ? 打开） */
  shortcuts: {
    open: '键盘快捷键',
    title: '键盘快捷键',
    close: '关闭',
    hint: '随时按 ? 打开，Esc 关闭',
    navGroup: '跳转',
    actionGroup: '操作',
    goHome: '回到首页',
    goProjects: '打开项目页',
    goNotes: '打开笔记页',
    openSearch: '搜索站内内容',
    openChat: '打开数字分身',
    toggleTheme: '切换深浅色',
    toggleLang: '切换中英文',
    showHelp: '打开这个面板',
  },
  /** 站内搜索（Cmd / Ctrl + K 唤起） */
  search: {
    open: '搜索',
    placeholder: '搜索项目、笔记、技能…',
    empty: '没找到相关内容',
    emptyHint: '换个更短的关键词试试，或者直接问数字分身。',
    hintSelect: '上下选择',
    hintOpen: '打开',
    hintClose: '关闭',
    groupProjects: '项目',
    groupNotes: '笔记',
    groupSkills: '技术栈',
    groupTools: '工具',
    groupPages: '页面',
  },
  /** 笔记详情页顶部的阅读进度 */
  reading: {
    aria: '阅读进度',
  },
  /** 评论：列表、登录注册、发表、各类错误提示 */
  comments: {
    title: '评论',
    count: '{count} 条',
    empty: '还没有人说话。',
    placeholder: '说点什么…',
    submit: '发表',
    submitting: '发表中…',
    delete: '删除',
    confirmDelete: '删除这条评论？删了就找不回来了。',
    /** 未登录时评论框的位置显示这一段 */
    loginPrompt: '登录后可以留言',
    /** 登录 / 注册两个 tab */
    tabLogin: '登录',
    tabRegister: '注册',
    fieldEmail: '邮箱',
    fieldPassword: '密码',
    fieldName: '昵称',
    fieldNameHint: '显示在评论旁边，1–24 个字',
    fieldPasswordHint: '至少 8 位',
    /** 验证码流程（2026-10-04 新增：注册与注销都改成「收码填回」） */
    fieldCode: '验证码',
    fieldCodeHint: '6 位数字，10 分钟内有效',
    sendCode: '发送验证码',
    resendCode: '重新发送',
    codeSending: '发送中…',
    codeSent: '验证码已发出，请查收邮箱（10 分钟内有效）。',
    codeCountdown: '{seconds} 秒后可重发',
    doLogin: '登录',
    doRegister: '注册',
    doLogout: '登出',
    working: '处理中…',
    /** 已登录未验证邮箱时的提示 */
    needVerify: '邮箱还没确认，请点开注册时那封邮件里的链接。',
    resend: '重新发一封',
    resent: '已重新发送，请查收（也看看垃圾邮件箱）。',
    /** 注册成功后的提示 */
    registered: '注册成功，确认邮件已寄出。',
    loggedOut: '已登出。',
    /** 回复 */
    reply: '回复',
    replyTo: '回复 {name}',
    cancelReply: '取消',
    /** 账号注销 */
    deleteAccount: '注销账号',
    deleteAccountHint: '账号注销后不可恢复，你的所有评论也会一并删除。',
    confirmDeleteAccount: '确认注销账号？你的账号和全部评论会被永久删除，无法恢复。',
    accountDeleted: '账号已注销。',
    /** 找回密码 */
    forgot: '忘记密码？',
    forgotTitle: '找回密码',
    forgotHint: '填写注册时用的邮箱，我们会寄一封重置链接过去（1 小时内有效）。',
    forgotSubmit: '发送重置邮件',
    forgotSent: '如果这个邮箱注册过，重置邮件已经发出，请查收（也看看垃圾邮件箱）。',
    backToLogin: '返回登录',
    resetTitle: '设置新密码',
    resetHint: '输入新密码。设置成功后所有设备都需要重新登录。',
    resetSubmit: '设置新密码',
    resetDone: '密码已更新，请用新密码登录。',
    resetMismatch: '两次输入的密码不一样。',
    fieldPasswordConfirm: '再输一次密码',
    /** 管理员标记（自己看得到，用来确认权限生效） */
    adminBadge: '管理员',
    /** 验证链接跳回首页时的提示 */
    verifiedOk: '邮箱确认好了，现在可以留言了。',
    verifiedExpired: '这个确认链接过期了，请重新发一封。',
    verifiedInvalid: '这个确认链接无效或已经用过。',
    /** 错误码 → 中文。键名与 API 的 code 一一对应 */
    errors: {
      invalid_email: '邮箱格式不太对。',
      disposable_email: '不支持临时邮箱，请用常用邮箱注册。',
      undeliverable_email: '这个邮箱域名收不到信，换一个试试。',
      weak_password: '密码至少 8 位。',
      password_mismatch: '两次输入的密码不一样。',
      invalid_code: '验证码不对，再看一眼邮件。',
      expired_code: '验证码过期了，重新发一个吧。',
      too_many_attempts: '验证码试太多次已作废，重新发一个吧。',
      invalid_name: '昵称请填 1–24 个字。',
      email_taken: '这个邮箱已经注册过了，直接登录吧。',
      name_taken: '这个昵称被别人用了，换一个吧。',
      bad_credentials: '邮箱或密码不对。',
      invalid_parent: '要回复的那条评论已经不在了。',
      invalid_token: '这个链接无效，请重新申请。',
      expired_token: '这个链接过期了，请重新申请。',
      rate_limited: '操作太频繁了，过几分钟再试。',
      mail_not_configured: '服务端还没配置邮件服务，暂时无法注册。',
      mail_failed: '确认邮件没发出去，请稍后再试。',
      not_logged_in: '请先登录。',
      email_not_verified: '请先确认邮箱。',
      empty_body: '还没写内容呢。',
      too_long: '评论最多 1000 字。',
      invalid_slug: '这条笔记不存在。',
      not_found: '这条评论已经不在了。',
      network: '网络不太顺，再试一次。',
      generic: '出了点问题，稍后再试。',
    },
  },
  /**
   * 账号入口（2026-10-04 新增）。
   * 只放顶栏特有的几个词 —— 登录/注册表单的字段与错误码复用 d.comments（同一张表单）。
   */
  auth: {
    login: '登录',
    logout: '登出',
    loginTitle: '登录',
    registerTitle: '注册',
    adminBadge: '管理员',
    notVerified: '邮箱未验证',
  },
  /**
   * 内容管理（2026-10-04 新增）。
   * 只有管理员登录后才会用到这些文案 —— 入口本身也只在管理员身份下渲染。
   * 错误码与 lib/admin-guard.ts / 各管理端路由返回的 code 一一对应。
   */
  admin: {
    newNote: '新建笔记',
    /** 上传本地写好的 .md 文件，自动把 frontmatter 与正文填进表单 */
    importFile: '上传 Markdown 文件',
    importHint: '已从文件填入，检查一下再保存',
    newProject: '新建项目',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    saving: '保存中…',
    cancel: '取消',
    writeTab: '编辑',
    previewTab: '预览',
    previewEmpty: '（还没写内容）',
    confirmDelete: '确定删除「{name}」？删了就找不回来了。',
    saved: '已保存。',
    deleted: '已删除。',
    draftBadge: '草稿',
    /** 笔记字段 */
    slug: '短名',
    slugHint: '用于网址，只能小写字母、数字、连字符；建好后不能改',
    title: '标题',
    date: '日期',
    summary: '摘要',
    tags: '标签',
    listHint: '多个用英文逗号分隔',
    draft: '存为草稿（不在线上显示）',
    body: '正文（Markdown）',
    /** 项目字段 */
    titleZh: '标题（中文）',
    titleEn: '标题（英文，可留空）',
    summaryZh: '摘要（中文）',
    summaryEn: '摘要（英文，可留空）',
    url: '链接',
    stack: '技术栈',
    featured: '首页优先',
    sort: '排序（数字小的在前）',
    errors: {
      not_logged_in: '登录已过期，请重新登录。',
      forbidden: '这个账号没有管理权限。',
      invalid_slug: '短名不合规：只能小写字母、数字、连字符，且以字母或数字开头。',
      invalid_title: '标题不能为空。',
      invalid_date: '日期格式不对（笔记 YYYY-MM-DD，项目 YYYY-MM）。',
      invalid_summary: '摘要不能为空。',
      invalid_body: '正文不能为空。',
      not_found: '这条内容已经不在了。',
      bad_request: '请求格式不对。',
      network: '网络不太顺，再试一次。',
      generic: '出了点问题，稍后再试。',
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
    /** 页尾那颗「打个招呼」大字的文案，和它下面按钮的字（按钮是邮箱，不是聊天窗） */
    greet: '打个招呼',
    greetCta: '用邮箱联系我',
    /** 两栏的小标题 */
    navigate: '导航',
    connect: '联系',
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
