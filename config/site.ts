/**
 * 站点唯一配置文件 —— 以后你只需要改这一个文件。
 *
 * 【这是什么】
 * 全站所有「关于你本人的事实」（名字、一句话介绍、头像、五个联系方式、公众号二维码、
 * 邮箱、数字分身要背的资料）都集中在这里。组件里不再零散硬编码中文，
 * 改一处即可全站生效，也保证中英文切换时这些资料能跟着换语言。
 *
 * 【待你确认的两项】（其余联系方式与头像已填好，用你自己的账号与图片）
 *   1. contact.wechat.accountName  —— 微信公众号名称（扫码弹窗里那行字，暂空）
 *   2. contact.email.address       —— 对外联系邮箱。当前是 RFC2606 保留的 example.com 占位，
 *                                      不会寄到真人，但要换成你自己的才能真的收信
 *
 * 【字段留空会怎样】
 * 联系方式 url 留空时，顶栏图标仍可点击，但只弹出「该联系方式尚未配置」提示，
 * 不会把访客送到错误页面；二维码路径留空时弹窗显示提示文字而不是破图。
 *
 * 【类型说明】
 * LocalizedText = { zh, en } 二选一的结构，由 lib/i18n.tsx 的 pick() 按当前语言取值。
 */

/** 当前站点支持的语言。新增语言要同时加 dictionaries/<语言>.ts */
export type Lang = 'zh' | 'en';

/** 一条同时具备中英文写法的文案 */
export interface LocalizedText {
  zh: string;
  en: string;
}

/** 一个站外链接型联系方式。url 为空字符串表示「尚未配置」 */
export interface SocialLink {
  /** 跳转地址；留空则点击后弹出「尚未配置」提示而不是跳转到错误网址 */
  url: string;
  /** 展示用的账号名/ID，可留空 */
  handle: string;
  /** 名称（用于 aria-label、tooltip、弹窗标题），双语 */
  label: LocalizedText;
}

export interface SiteConfig {
  identity: {
    /** 品牌名：中英文都用「锦创AI」，因为这是你的署名，不是可翻译词 */
    name: string;
    /** 名字里「AI」部分单独着色用的字符串，便于顶栏与首页标题写法统一 */
    nameAccent: string;
    /** 头像（public/ 下的相对路径） */
    avatar: string;
    /** 头像的替代文本，双语 */
    avatarAlt: LocalizedText;
    /** 一句话介绍 */
    tagline: LocalizedText;
    /** 兴趣 */
    interests: LocalizedText[];
    /** 记忆点：你希望别人记住你的那件事 */
    signature: LocalizedText;
    /** 最近在做的事（数字分身会引用） */
    recentWork: LocalizedText[];
    /** 擅长或关心的方向（数字分身会引用） */
    expertise: LocalizedText[];
  };
  contact: {
    github: SocialLink;
    csdn: SocialLink;
    zhihu: SocialLink;
    /** 微信公众号不跳外链，而是弹二维码，所以单独建模 */
    wechat: {
      /** 二维码图片（public/ 下的相对路径） */
      qrcode: string;
      /** 公众号名称，显示在二维码下方 */
      accountName: string;
      label: LocalizedText;
    };
    email: {
      /** 对外邮箱地址 */
      address: string;
      label: LocalizedText;
    };
  };
  /** 功能开关：关掉后对应代码在服务端就不渲染，而不是靠 CSS 隐藏 */
  features: {
    /** 数字分身聊天区 */
    chat: boolean;
  };
  defaults: {
    lang: Lang;
    theme: 'dark' | 'light';
  };
  assistant: {
    /** 首屏欢迎语，不走网络，避免「聊天区一片空白」 */
    greeting: LocalizedText;
    /** 三个一键提问按钮：别人最常问你的问题 */
    quickQuestions: LocalizedText[];
    /** 前端 localStorage 里最多保留多少条历史 */
    maxHistory: number;
    /** 发给模型的历史轮数上限（控制 token 与费用） */
    contextTurns: number;
  };
}

export const site: SiteConfig = {
  identity: {
    name: '锦创AI',
    nameAccent: 'AI',
    avatar: '/images/avatar.png',
    avatarAlt: { zh: '锦创AI 的头像', en: 'Avatar of 锦创AI' },
    tagline: {
      zh: '分享 AI 技术、项目的个人网页',
      en: 'A personal page for sharing AI technology and projects',
    },
    interests: [
      { zh: '钱', en: 'Making money' },
      { zh: '玩', en: 'Having fun' },
    ],
    signature: {
      zh: '喜欢把复杂问题讲成人话',
      en: 'I explain complicated things in plain language',
    },
    recentWork: [
      { zh: '搭建个人主页', en: 'Building this personal site' },
      { zh: '学大模型开发', en: 'Learning LLM development' },
      { zh: 'AI Agent', en: 'AI agents' },
    ],
    expertise: [
      { zh: '机器学习', en: 'Machine learning' },
      { zh: '深度学习', en: 'Deep learning' },
      { zh: '大模型开发', en: 'LLM development' },
      { zh: 'Agent', en: 'Agents' },
    ],
  },

  contact: {
    github: {
      url: 'https://github.com/LiuCzj',
      handle: 'LiuCzj',
      label: { zh: 'GitHub', en: 'GitHub' },
    },
    csdn: {
      // 原链接带的 ?spm=1000.2115.3001.10640 是 CSDN 的跳转追踪参数，去掉不影响访问
      url: 'https://blog.csdn.net/datafenxi',
      handle: 'datafenxi',
      label: { zh: 'CSDN 博客', en: 'CSDN blog' },
    },
    zhihu: {
      url: 'https://www.zhihu.com/people/datafenxi',
      handle: 'datafenxi',
      label: { zh: '知乎', en: 'Zhihu' },
    },
    wechat: {
      /**
       * 二维码图片路径（public/ 下）。留空时弹窗显示「尚未上传」提示，不会出现破图。
       */
      qrcode: '/images/wechat-qrcode.jpg',
      accountName: '锦创AI',
      label: { zh: '微信公众号', en: 'WeChat Official Account' },
    },
    email: {
      address: 'chn.mywork@gmail.com',
      label: { zh: '邮箱', en: 'Email' },
    },
  },

  features: {
    chat: true,
  },

  defaults: {
    lang: 'zh',
    theme: 'dark',
  },

  assistant: {
    greeting: {
      zh: '我是锦创AI 的数字分身。机器学习、大模型、Agent、怎么联系他，都可以直接问我。',
      en: "I'm 锦创AI's digital twin. Ask me about machine learning, LLMs, agents, or how to reach him.",
    },
    quickQuestions: [
      { zh: '最近 AI 的新进展是什么？', en: 'What are the recent breakthroughs in AI?' },
      { zh: '你有哪些作品？', en: 'What projects have you built?' },
      { zh: '怎么联系你？', en: 'How can I contact you?' },
    ],
    maxHistory: 20,
    contextTurns: 10,
  },
};
