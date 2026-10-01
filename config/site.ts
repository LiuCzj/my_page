/**
 * 站点唯一配置文件 —— 以后你只需要改这一个文件。
 *
 * 【这是什么】
 * 全站所有「关于你本人的事实」（名字、一句话介绍、头像、五个联系方式、公众号二维码、
 * 邮箱、数字分身要背的资料）都集中在这里。组件里不再零散硬编码中文，
 * 改一处即可全站生效，也保证中英文切换时这些资料能跟着换语言。
 *
 * 【当前填写状态】
 * 五个联系方式（GitHub / CSDN / 知乎 / 微信公众号 / 邮箱）、公众号二维码与头像均已填真实内容。
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

/** 技术栈的一个分组：组名 + 组内条目 */
export interface SkillGroup {
  title: LocalizedText;
  items: LocalizedText[];
}

/**
 * 工具品牌标的两种来路，分开列是因为渲染路径不同：
 * - FileToolGlyph：public/tools/ 下的多色品牌文件（渐变、多路径、自带底色），只能走 <img>
 * - InlineToolGlyph：内联在 components/ToolGlyphs.tsx 里的单色剪影，走 <svg> + class 控色
 *
 * 刻意用联合类型而不是 string：填一个不存在的名字，typecheck 当场就报，
 * 不会等到线上裂一个图。XGBoost / LightGBM 官方就没有矢量标，不给 icon，
 * 退化成字母徽标。
 */
export type FileToolGlyph =
  | 'python'
  | 'git'
  | 'github'
  | 'vscode'
  | 'docker'
  | 'powerbi'
  | 'qoder';
export type InlineToolGlyph =
  | 'pytorch'
  | 'pandas'
  | 'numpy'
  | 'scikitlearn'
  | 'tableau'
  | 'jupyter'
  | 'langgraph'
  | 'openai'
  | 'mysql';
export type ToolGlyph = FileToolGlyph | InlineToolGlyph;

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
    /** 籍贯：卡片上显示的全称 + 地球上的标记坐标 */
    location: {
      label: LocalizedText;
      /** [纬度, 经度]，单位「度」，北纬/东经为正 */
      coordinates: [number, number];
    };
    /**
     * 目的地。为 null 时「籍贯」卡片不画箭头、也不出现第二个城市。
     * 留 null 是因为你只给了邵阳一个地点，我不会替你编一个目的地出来。
     */
    destination: {
      label: LocalizedText;
    } | null;
  };
  /**
   * 技术栈：按他自己给的那段话分成三组，条目原样收录，没有添加他没写的东西。
   * 这一组是「会什么」，和下面的 tools（用什么软件）分开，避免同一份清单出现两遍。
   */
  skills: SkillGroup[];
  /** 工具条：icon 是品牌标（见 ToolGlyph 的两种来路）；没标的留空，渲染成字母徽标 */
  tools: { label: LocalizedText; icon?: ToolGlyph }[];
  /** 最喜欢的工具。同样是没标的留空走字母徽标 */
  favoriteTools: { label: LocalizedText; icon?: ToolGlyph }[];
  /**
   * 项目列表。现在是空数组 —— 我没有你的任何项目数据，不会替你编。
   * 空数组时「项目」区块显示一句诚实的空态；你往里填一条，空态立刻换成卡片列表。
   */
  projects: {
    title: LocalizedText;
    summary: LocalizedText;
    url: string;
    /** 用到的技术，显示成小标签 */
    stack: string[];
  }[];
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
    avatar: '/images/avatar.jpg',
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
      { zh: '大模型开发', en: 'Learning LLM development' },
      { zh: 'AI Agent', en: 'AI agents' },
    ],
    expertise: [
      { zh: '机器学习', en: 'Machine learning' },
      { zh: '深度学习', en: 'Deep learning' },
      { zh: '大模型开发', en: 'LLM development' },
      { zh: 'Agent', en: 'Agents' },
    ],
    location: {
      label: { zh: '中国湖南省邵阳市', en: 'Shaoyang, Hunan, China' },
      /**
       * 东经 111.469230°、北纬 27.237842°，城市中心参考坐标（GCJ-02 系）。
       * 与 WGS-84 差几十到上百米，在一颗装饰性地球上完全看不出来，不做换算。
       */
      coordinates: [27.2378, 111.4692],
    },
    destination: null,
  },

  /**
   * 以下三份清单逐条来自你本人给的那段话，我没有添加、也没有替换成更「好听」的说法。
   * 英文一栏是同一含义的翻译，不是另一份内容。
   */
  skills: [
    {
      title: { zh: '深度学习 / 机器学习', en: 'Deep learning / ML' },
      items: [
        { zh: 'PyTorch 框架', en: 'PyTorch' },
        {
          zh: '表格数据专用深度学习模型（TabNet、FT-Transformer、TabTransformer 等）',
          en: 'Tabular deep models (TabNet, FT-Transformer, TabTransformer)',
        },
        {
          zh: '深度学习模型（MLP、CNN、RNN、Transformer、LSTM）',
          en: 'Neural architectures (MLP, CNN, RNN, Transformer, LSTM)',
        },
        {
          zh: '传统机器学习算法（XGBoost、LightGBM、随机森林等）',
          en: 'Classical ML (XGBoost, LightGBM, random forest)',
        },
        { zh: '模型融合（Stacking / 加权平均）', en: 'Ensembling (stacking / weighted average)' },
      ],
    },
    /**
     * 下面三组是 2026-10-01 他点名要加的。组名照他给的原话，
     * 条目我先只用了站里已经出现过的东西（工具条、最喜欢的工具里那些），
     * 没有替他新编任何一项技能 —— 要增删直接改这三段的 items 就行。
     */
    {
      title: { zh: '大模型开发', en: 'LLM development' },
      items: [
        { zh: 'Prompt 工程（ReAct / Plan-and-Solve / Reflection）', en: 'Prompting (ReAct / Plan-and-Solve / Reflection)' },
        { zh: 'RAG 检索增强', en: 'RAG' },
        { zh: 'LangGraph 流程编排', en: 'LangGraph orchestration' },
        { zh: 'OpenAI 等模型接入', en: 'Model APIs (OpenAI etc.)' },
      ],
    },
    {
      title: { zh: 'Vibe Coding', en: 'Vibe coding' },
      items: [
        { zh: 'Codex', en: 'Codex' },
        { zh: 'Qoder', en: 'Qoder' },
        { zh: 'GitHub 协作', en: 'GitHub workflow' },
      ],
    },
    {
      title: { zh: 'Agent', en: 'Agent' },
      items: [
        { zh: '工具调用（Function Calling）', en: 'Tool / function calling' },
        { zh: '多轮任务编排', en: 'Multi-step task orchestration' },
        { zh: '数字分身问答', en: 'Avatar Q&A agent' },
      ],
    },
    {
      title: { zh: '数据处理与特征工程', en: 'Data & feature engineering' },
      items: [
        { zh: 'SQL', en: 'SQL' },
        { zh: 'Python（Pandas / NumPy / Scikit-learn）', en: 'Python (Pandas / NumPy / Scikit-learn)' },
        { zh: '数据清洗', en: 'Data cleaning' },
        { zh: '特征构建', en: 'Feature construction' },
      ],
    },
    {
      title: { zh: '业务分析与可视化', en: 'Analytics & visualization' },
      items: [
        { zh: '漏斗分析', en: 'Funnel analysis' },
        { zh: 'A/B 测试', en: 'A/B testing' },
        { zh: '归因分析', en: 'Attribution analysis' },
        { zh: 'Power BI / Tableau', en: 'Power BI / Tableau' },
      ],
    },
  ],

  /**
   * 工具条 —— 他 2026-09-30 给的原话清单，当时一条没加一条没删；
   * 2026-10-01 他点名补了 MySQL，又点名删掉 ReAct / Plan-and-Solve / Reflection / RAG
   * 那四条（理由是「不是产品就不该混在品牌标里」）。
   * 这四个名字本身没消失，它们作为技能条目留在技术栈那一条带里。
   */
  tools: [
    { label: { zh: 'Python', en: 'Python' }, icon: 'python' },
    { label: { zh: 'PyTorch', en: 'PyTorch' }, icon: 'pytorch' },
    { label: { zh: 'Pandas', en: 'Pandas' }, icon: 'pandas' },
    { label: { zh: 'NumPy', en: 'NumPy' }, icon: 'numpy' },
    { label: { zh: 'Scikit-learn', en: 'Scikit-learn' }, icon: 'scikitlearn' },
    { label: { zh: 'XGBoost', en: 'XGBoost' } },
    { label: { zh: 'LightGBM', en: 'LightGBM' } },
    { label: { zh: 'Power BI', en: 'Power BI' }, icon: 'powerbi' },
    { label: { zh: 'Tableau', en: 'Tableau' }, icon: 'tableau' },
    { label: { zh: 'Jupyter', en: 'Jupyter' }, icon: 'jupyter' },
    { label: { zh: 'Git', en: 'Git' }, icon: 'git' },
    { label: { zh: 'VSCode', en: 'VSCode' }, icon: 'vscode' },
    { label: { zh: 'Docker', en: 'Docker' }, icon: 'docker' },
    { label: { zh: 'MySQL', en: 'MySQL' }, icon: 'mysql' },
    { label: { zh: 'LangGraph', en: 'LangGraph' }, icon: 'langgraph' },
  ],

  favoriteTools: [
    /** Codex 是 OpenAI 的产品，它自己没有独立标，用 OpenAI 的标 */
    { label: { zh: 'Codex', en: 'Codex' }, icon: 'openai' },
    /**
     * Qoder 官方只给一张 73 KB 的 favIcon.svg（矢量但坐标极密），
     * 按本站带宽预算不能直接用 —— svgo 压到精度 1 是 5.3 KB，自带浅灰底方块，
     * 深浅两版主题都成立，所以走 public/tools/ 那份文件。
     */
    { label: { zh: 'Qoder', en: 'Qoder' }, icon: 'qoder' },
    { label: { zh: 'GitHub', en: 'GitHub' }, icon: 'github' },
  ],

  projects: [],

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
