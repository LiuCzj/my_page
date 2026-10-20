/** 站点唯一配置文件 —— 以后你只需要改这一个文件。 */

/** 当前站点支持的语言。新增语言要同时加 dictionaries/<语言>.ts */
export type Lang = 'zh' | 'en';

/** 一条同时具备中英文写法的文案 */
export interface LocalizedText {
  zh: string;
  en: string;
}

/** 技术栈里的一个小节：小标题 + 条目。 */
export interface SkillSection {
  /** 小节名。留空表示这一组不分子节，条目直接铺开 */
  label: LocalizedText;
  items: LocalizedText[];
}

/** 技术栈的一个分组。 */
export interface SkillGroup {
  id: string;
  title: LocalizedText;
  sections: SkillSection[];
}

/** 工具品牌标的两种来路，分开列是因为渲染路径不同。 */
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
    /** 「关于我」章节头那张作者小像（`public/images/hero-scene.jpg`）的替代文本，双语。 */
    heroSceneAlt: LocalizedText;
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
    /** 目的地。为 null 时「籍贯」卡片不画箭头、也不出现第二个城市。 */
    destination: {
      label: LocalizedText;
    } | null;
  };
  /** 技术栈：按他自己给的那段话分成三组，条目原样收录，没有添加他没写的东西。 */
  skills: SkillGroup[];
  /** 工具条：icon 是品牌标（见 ToolGlyph 的两种来路）；没标的留空，渲染成字母徽标 */
  tools: { label: LocalizedText; icon?: ToolGlyph }[];
  /** 最喜欢的工具。同样是没标的留空走字母徽标 */
  favoriteTools: { label: LocalizedText; icon?: ToolGlyph }[];
  /** 项目列表。 */
  projects: {
    /** 稳定标识：用作 React key，也是以后若要开项目详情页时的路径段 */
    slug: string;
    title: LocalizedText;
    summary: LocalizedText;
    /** 主链接：点整张卡去的地方（GitHub 仓库或在线演示） */
    url: string;
    /** 用到的技术，显示成小标签 */
    stack: string[];
    /** 可选：'YYYY-MM'，用于排序与在卡片上显示时间 */
    date?: string;
    /** 可选：true 时优先出现在首页摘要里（摘要条数见 homePreview） */
    featured?: boolean;
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
  /** 背景音乐。 */
  music: {
    /** 音频文件名（路径部分不参与取用）。留空 = 不渲染播放器。 */
    src: string;
    /** 曲名，鼠标悬停在播放按钮上时显示 */
    title: LocalizedText;
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
    heroSceneAlt: {
      zh: 'Q 版插画：浅色背景上，黑发青年穿深色西装、系紫色领带，微笑着指向一台显示器，屏幕上写着「锦创AI」',
      en: 'Chibi-style illustration on a light background: a young man in a dark suit and purple tie smiling and pointing at a monitor that reads 锦创AI',
    },
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
      /** 东经 111.469230°、北纬 27.237842°，城市中心参考坐标（GCJ-02 系）。 */
      coordinates: [27.2378, 111.4692],
    },
    destination: null,
  },

  /** 以下清单逐条来自你本人给的内容，我没有添加、也没有替换成更「好听」的说法。 */
  skills: [
    {
      id: 'dl-ml',
      title: { zh: '深度学习 / 机器学习', en: 'Deep learning / ML' },
      sections: [
        {
          label: { zh: '深度学习框架', en: 'Deep learning frameworks' },
          items: [
            { zh: 'PyTorch', en: 'PyTorch' },
            {
              zh: '深度学习模型（MLP、CNN、RNN、Transformer、LSTM）',
              en: 'Deep learning models (MLP, CNN, RNN, Transformer, LSTM)',
            },
            { zh: '表格深度学习（TabNet、FT-Transformer）', en: 'Tabular deep learning (TabNet, FT-Transformer)' },
          ],
        },
        {
          label: { zh: '传统机器学习', en: 'Classical machine learning' },
          items: [
            { zh: 'XGBoost', en: 'XGBoost' },
            { zh: 'LightGBM', en: 'LightGBM' },
            { zh: '随机森林', en: 'Random forest' },
            { zh: '模型融合（Stacking / 加权平均）', en: 'Model ensembling (stacking / weighted average)' },
          ],
        },
      ],
    },
    /* 分组名、小节名、条目全部照他给的那份清单写，没有改写措辞、也没有添油加醋。 */
    {
      id: 'llm',
      title: { zh: '大模型开发', en: 'LLM development' },
      sections: [
        {
          // label 留空 = 这一组不分子节，条目直接铺开（渲染层据此不画小标题）
          label: { zh: '', en: '' },
          items: [
            { zh: 'Prompt 工程', en: 'Prompt engineering' },
            { zh: 'RAG 检索增强', en: 'RAG' },
            {
              zh: '开源模型接入与微调（OpenAI / Qwen / Llama / vLLM）',
              en: 'Open-source model integration & fine-tuning (OpenAI / Qwen / Llama / vLLM)',
            },
          ],
        },
      ],
    },
    {
      id: 'vibe-coding',
      title: { zh: 'Vibe Coding', en: 'Vibe coding' },
      sections: [
        {
          label: { zh: '', en: '' },
          items: [{ zh: 'AI 辅助编码（Codex / Qoder 等）', en: 'AI-assisted coding (Codex / Qoder etc.)' }],
        },
      ],
    },
    {
      id: 'agent',
      title: { zh: 'Agent', en: 'Agent' },
      sections: [
        {
          label: { zh: '', en: '' },
          items: [
            { zh: 'ReAct / Plan-and-Solve / Reflection', en: 'ReAct / Plan-and-Solve / Reflection' },
            { zh: 'Function Calling', en: 'Function calling' },
            { zh: 'LangGraph 流程编排', en: 'LangGraph orchestration' },
            { zh: '多智能体协作', en: 'Multi-agent collaboration' },
            { zh: '专属知识库问答', en: 'Private knowledge-base Q&A' },
          ],
        },
      ],
    },
    {
      id: 'data-biz',
      title: { zh: '数据处理与业务分析', en: 'Data & business analytics' },
      sections: [
        {
          label: { zh: '数据处理', en: 'Data processing' },
          items: [
            { zh: 'SQL', en: 'SQL' },
            { zh: 'Python（Pandas / NumPy / Scikit-learn）', en: 'Python (Pandas / NumPy / Scikit-learn)' },
            { zh: '数据清洗', en: 'Data cleaning' },
            { zh: '特征构建', en: 'Feature construction' },
          ],
        },
        {
          label: { zh: '业务分析', en: 'Business analytics' },
          items: [
            { zh: '漏斗分析', en: 'Funnel analysis' },
            { zh: 'A/B 测试', en: 'A/B testing' },
            { zh: '归因分析', en: 'Attribution analysis' },
            { zh: 'Power BI / Tableau', en: 'Power BI / Tableau' },
          ],
        },
      ],
    },
  ],

  /** 工具条 —— 他 给的原话清单，当时一条没加一条没删； */
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
    /** Qoder 官方只给一张 73 KB 的 favIcon.svg（矢量但坐标极密），按本站带宽预算不能直接用 —— svgo 压到精度 1 是 5.3 KB，自带浅灰底方块，深浅两版主题都成立，所以走 */
    { label: { zh: 'Qoder', en: 'Qoder' }, icon: 'qoder' },
    { label: { zh: 'GitHub', en: 'GitHub' }, icon: 'github' },
  ],

  /** 示例项目 —— 前两条是这个站自己真实用到的东西，第三条是明确标注的占位，等你把真项目给我时直接替换。结构照抄即可，`slug` 不能重复。 */
  projects: [
    {
      slug: 'this-homepage',
      title: { zh: '锦创AI 个人主页', en: 'JinChuang AI homepage' },
      summary: {
        zh: '一个带数字分身的个人主页：粒子背景、点阵地球、中英切换、深浅色模式，全站只有一支强调色。',
        en: 'A personal homepage with a digital twin: particle field, dotted globe, i18n and dark mode, all built around a single accent colour.',
      },
      url: 'https://github.com/LiuCzj',
      stack: ['Next.js 15', 'React 19', 'Tailwind v4', 'framer-motion', 'cobe'],
      date: '2026-10',
      featured: true,
    },
    {
      slug: 'digital-twin',
      title: { zh: '数字分身问答', en: 'Digital twin Q&A' },
      summary: {
        zh: '站内流式问答：密钥只留在服务端，人设从站点配置注入，SSE 分块边界自己处理。',
        en: 'Streaming in-site Q&A: the key stays server-side, the persona is injected from site config, and SSE chunk boundaries are handled by hand.',
      },
      url: 'https://github.com/LiuCzj',
      stack: ['Route Handler', 'SSE', 'OpenAI 兼容接口'],
      date: '2026-10',
      featured: true,
    },
    {
      slug: 'replace-me',
      title: { zh: '示例项目（待替换）', en: 'Example project (replace me)' },
      summary: {
        zh: '占位示例：把这条换成你自己的项目，字段照抄上面两条即可。',
        en: 'Placeholder: replace this with one of your own projects, copying the fields from the entries above.',
      },
      url: 'https://github.com/LiuCzj',
      stack: ['Python', 'PyTorch'],
      date: '2026-09',
    },
  ],

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
      /** 二维码图片路径（public/ 下）。留空时弹窗显示「尚未上传」提示，不会出现破图。 */
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
    /** 首次访问的默认主题。 */
    theme: 'light',
  },

  music: {
    /* 文件放在 private/audio/ —— 不是 public/，public/ 下的一切都会被静态服务。
       换非 mp3 格式时还要改 app/api/audio/route.ts 里的 Content-Type。 */
    src: '/audio/bgm.mp3',
    title: {
      zh: '背景音乐',
      en: 'Background music',
    },
  },

  assistant: {
    /** 首屏欢迎语，不走网络，避免聊天区一片空白 */
    greeting: {
      zh: '嗨，我是锦创AI 的分身，在这儿替他答话。想问什么直接说，我尽量讲人话；不知道的我会直说，不瞎编。',
      en: "Hey, I'm 锦创AI's stand-in here. Ask me anything about him — I'll keep it plain, and I'll say so when I don't know instead of making something up.",
    },
    quickQuestions: [
      { zh: '最近 AI 的新进展是什么？', en: 'What are the recent breakthroughs in AI?' },
      { zh: '你有哪些作品？', en: 'What projects have you built?' },
      { zh: '怎么联系你？', en: 'How can I contact you?' },
    ],
    maxHistory: 20,
    contextTurns: 6,
  },
};

/** 首页各摘要区块展示多少条。 */
export const homePreview = { projects: 3, notes: 3 } as const;
