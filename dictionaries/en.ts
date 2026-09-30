import type { Dict } from './zh';

/**
 * 英文界面文案字典。
 *
 * `const en: Dict` 让 TypeScript 拿中文字典当结构基准校验本文件：
 * 少一个键、键名拼错、层级写歪都会直接编译报错。
 * 这样「界面某处仍是中文」只会是漏接 useI18n()，不会是字典悄悄缺项。
 */
const en: Dict = {
  nav: {
    home: 'Home',
    projects: 'Projects',
    chat: 'Ask the twin',
  },
  topbar: {
    menu: 'Open menu',
    closeMenu: 'Close menu',
    siteName: '锦创AI home page',
    drawerNav: 'Menu',
    drawerContact: 'Contact',
    contactScrollHint: 'Swipe to see all contact links',
  },
  language: {
    switchTo: '切换中文',
  },
  theme: {
    ariaToLight: 'Switch to light mode',
    ariaToDark: 'Switch to dark mode',
  },
  contact: {
    wechatTitle: 'WeChat Official Account',
    wechatHint: 'Scan to follow “{account}”',
    wechatHintFallback: 'Scan to follow the WeChat account',
    qrcodeMissing: 'No QR code uploaded yet',
    emailTitle: 'Contact email',
    emailHint: 'Click the field to select all, then paste anywhere',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed, please select the text manually',
    openMail: 'Open mail client',
    notConfiguredTitle: 'This link is not set up yet',
    notConfiguredBody: 'The owner has not filled it into config/site.ts. Please try again later.',
    notConfiguredAction: 'Got it',
    close: 'Close',
  },
  hero: {
    greeting: 'Hi, I’m',
    bio: 'An engineer who likes figuring AI out.',
    robotHintOpen: 'Click to open the AI twin',
    robotHintClose: 'Click to close the AI twin',
    robotAria: 'Toggle the digital twin chat window',
    viewProjects: 'See my projects',
  },
  location: {
    /** 与 zh 侧对应：邵阳是籍贯（hometown），不是现居地 */
    label: 'From',
  },
  favorite: {
    title: 'Favourite tools',
  },
  skills: {
    title: 'Tech stack',
  },
  tools: {
    title: 'Tools',
  },
  connect: {
    title: 'Connect',
  },
  projects: {
    title: 'Projects',
    empty: 'Nothing written up yet',
    emptyHint: 'This is where my work will go. I am finishing the site and the digital twin first.',
  },
  chat: {
    title: 'Digital twin · ask me anything',
    subtitle: 'Questions about 锦创AI are welcome. Plain language, no jargon.',
    placeholder: 'What do you want to know? e.g. “what projects have you built”',
    send: 'Send',
    stop: 'Stop',
    clear: 'Clear chat',
    close: 'Close the twin',
    retry: 'Retry',
    twin: 'Twin',
    quickAsk: 'Suggested',
    disclaimer: 'AI-generated answers. For anything important, confirm with 锦创AI directly.',
    errorEmpty: 'Type something first.',
    errorTooLong: 'Too long — please keep it under 2000 characters.',
    errorFailed: 'The twin is unavailable right now',
    errorFallback: 'You can email me directly, or try again later.',
    errorDetail: 'Reason: {reason}',
    reasons: {
      env_missing: 'The server has no model key configured',
      bad_request: 'The request was malformed',
      too_long: 'That message was too long',
      rate_limited: 'Slow down a bit and try again in a few minutes',
      upstream_auth: 'The API key is invalid or expired',
      upstream_rate_limit: 'The model provider is rate-limiting',
      upstream_timeout: 'The model took too long to respond',
      upstream_error: 'The model service is unreachable',
      network: 'Network request failed',
    },
  },
  pages: {
    notFound: {
      title: 'Page not found',
      desc: 'There is nothing at this address. The link may be wrong.',
      back: 'Back home',
    },
  },
  footer: {
    rights: '© {year} 锦创AI',
  },
};

export default en;
