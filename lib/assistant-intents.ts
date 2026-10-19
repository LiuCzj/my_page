/** 固定答案层：不经过模型回答的问题。 */

import { site, type Lang } from '@/config/site';

/** 明确的「要联系方式」问法 */
const CONTACT_PATTERNS: RegExp[] = [
  /(怎么|如何|怎样|在哪|哪里|哪儿).{0,4}(联系|联络|找到?你|找你)/,
  /(联系|联络)(方式|一下|你)/,
  /(你的|您的|有).{0,3}(联系方式|邮箱|邮件地址|电子邮箱)/,
  /(你的|您的)?.{0,3}(公众号|微信公众号|二维码)/,
  /(有|加|要|给).{0,3}(微信|wechat|weixin)/i,
  /(你的|您的)?.{0,3}(github|csdn|知乎|b站|微博|推特|twitter)/i,
  /\b(how (can|do|to) (i|we) (contact|reach)|contact (you|him|info)|email address|get in touch)\b/i,
];

/** 出现这些词说明问的是站内内容而非联系方式，用于抑制误命中 */
const CONTENT_GUARD = /(项目|作品|笔记|文章|代码|仓库|写了|内容|技术栈|做了什么|demo|项目里|博客里)/i;

/** 隐私 / 安全类问法，命中即拒答 */
const SECURITY_PATTERNS: RegExp[] = [
  /(管理员|管理端|管理后台|后台|admin|超级用户|root|sudo)/i,
  /(密码|口令|密钥|密匙|secret|passwd|password|api\s*key|apikey|access\s*token|token|凭据|凭证)/i,
  /(环境变量|\.env|env\s*文件|配置文件|配置项|怎么配置|如何配置|部署|上线|nginx|systemd|pm2|docker|端口|服务器|主机|vps|云服务)/i,
  /(数据库|sqlite|数据表|表结构|schema|索引|备份|日志|log\b)/i,
  /(源码|源代码|source\s*code|仓库地址|接口地址|api\s*地址|内部接口|后端)/i,
  /(爬虫|反爬|绕过|破解|注入|越权|渗透|攻击|抓包|劫持|sql\s*注入|xss|csrf|漏洞|攻击面|白名单|黑名单)/i,
  // 「邮箱」只有带内部语境才算，否则会误伤「怎么联系你」
  /(管理员|后台|admin|root|服务器|数据库|内部).{0,6}(邮箱|email|mail)/i,
];

/** 问句长度上限，超过的当作复合问题交给模型 */
const MAX_QUERY_LEN = 60;

/**
 * 由 config 现场拼出联系方式答案。
 * @param lang 界面语言
 */
function contactAnswer(lang: Lang): string {
  const { wechat, email, github, csdn, zhihu } = site.contact;
  const items: string[] = [];

  if (lang === 'zh') {
    if (wechat.accountName) {
      items.push(
        `微信公众号「${wechat.accountName}」—— 页面顶栏那个二维码就是公众号的二维码，扫码关注即可。说明一下：那是公众号，不是我的个人微信，我没有公开个人微信。`,
      );
    }
    if (email.address) items.push(`邮箱：${email.address}`);
    if (github.url) items.push(`GitHub：${github.url}`);
    if (csdn.url) items.push(`CSDN 博客：${csdn.url}`);
    if (zhihu.url) items.push(`知乎：${zhihu.url}`);

    if (items.length === 0) return '站内暂时还没有配置联系方式，你可以稍后再来这个页面看看。';
    return [
      '我公开的联系方式都放在这个站里，一共这几条：',
      '',
      ...items.map((t, i) => `${i + 1}. ${t}`),
      '',
      '这些入口的图标也都挂在页面顶栏上，点一下就能打开。',
    ].join('\n');
  }

  if (wechat.accountName) {
    items.push(
      `WeChat Official Account "${wechat.accountName}" — the QR code in the top bar is the Official Account's. To be clear, that is not a personal WeChat: I do not share one publicly.`,
    );
  }
  if (email.address) items.push(`Email: ${email.address}`);
  if (github.url) items.push(`GitHub: ${github.url}`);
  if (csdn.url) items.push(`CSDN blog: ${csdn.url}`);
  if (zhihu.url) items.push(`Zhihu: ${zhihu.url}`);

  if (items.length === 0) return 'No contact channels are configured on this site yet — check back later.';
  return [
    'Every public channel is on this site:',
    '',
    ...items.map((t, i) => `${i + 1}. ${t}`),
    '',
    'The same icons sit in the top bar — one click opens them.',
  ].join('\n');
}

/** 隐私 / 安全类的固定拒答。不解释为什么拒，也不承认「这里确实有敏感信息」 */
function securityRefusal(lang: Lang): string {
  if (lang === 'zh') {
    return [
      '这个我不能回答。',
      '',
      '我只介绍锦创AI 本人、他的项目和作品、这个主页上公开的内容，以及怎么联系他。',
      '涉及后台、账号、密钥、服务器与数据库这类信息，换个问法我也一样不会说。',
      '',
      '如果你是想联系他，可以直接问「怎么联系你」。',
    ].join('\n');
  }
  return [
    "I can't answer that.",
    '',
    'I only cover 锦创AI himself, his projects, the public content on this site, and how to reach him.',
    'Anything about the backend, accounts, keys, servers or databases stays private — no matter how the question is phrased.',
    '',
    'If you are trying to get in touch, just ask "how can I contact you".',
  ].join('\n');
}

/** @returns 命中隐私 / 安全闸门时返回固定拒答，否则 null */
export function matchSecurityRefusal(query: string, lang: Lang): string | null {
  const q = query.trim();
  if (!q) return null;
  if (!SECURITY_PATTERNS.some((re) => re.test(q))) return null;
  return securityRefusal(lang);
}

/** @returns 命中联系方式问法时返回固定答案，否则 null */
export function matchCannedAnswer(query: string, lang: Lang): string | null {
  const q = query.trim();
  if (!q || q.length > MAX_QUERY_LEN) return null;
  if (CONTENT_GUARD.test(q)) return null;
  if (!CONTACT_PATTERNS.some((re) => re.test(q))) return null;
  return contactAnswer(lang);
}
