'use client';

/**
 * 轻量中英切换（自建，不引入 next-intl / i18next）。
 *
 * 【为什么不装 next-intl】
 * next-intl 的标准做法是加 middleware + /[locale] 路由段，会连带改动现有的路由结构
 * （app/page.tsx 与 app/notes/[slug]/page.tsx），并让所有 URL 变成 /zh/... /en/...。
 * 而 content/ 下的文章只有中文一种，
 * 加语言前缀反而让访客以为英文站有内容。第一版要的是「点一下就换、刷新不丢」，
 * 一个 Context + 两份字典就够了，新增依赖为 0。
 *
 * 【作用域限制（已写进 README）】
 * 只有界面文案会被翻译；文章正文仍是中文。
 *
 * 【为什么默认语言在 useEffect 里覆盖】
 * 服务端渲染永远用 site.defaults.lang（中文），客户端首次渲染也必须一致，
 * 否则 React 会报 hydration 不匹配。所以「读 localStorage 恢复英文」这件事放在
 * effect 里做 —— 代价是英文用户会看到一瞬间的中文，换来的是控制台干净无报错。
 * 这与 components/theme-toggle.tsx 用 mounted 开关防闪烁是同一个思路。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { site, type Lang, type LocalizedText } from '@/config/site';
import zhDict, { type Dict } from '@/dictionaries/zh';
import enDict from '@/dictionaries/en';

/** localStorage 键名：语言偏好只存在浏览器本地，服务端不知道，因此不做持久化承诺 */
const STORAGE_KEY = 'lang';

const dictionaries: Record<Lang, Dict> = { zh: zhDict, en: enDict };

interface I18nContextValue {
  /** 当前界面语言 */
  lang: Lang;
  /** 当前语言的字典对象，用法形如 d.nav.home */
  d: Dict;
  /** 切换语言，同时写入 localStorage */
  setLang: (lang: Lang) => void;
  /** 在 zh / en 之间来回切 */
  toggleLang: () => void;
  /** 从 config/site.ts 的 LocalizedText 里按当前语言取一条文案 */
  pick: (text: LocalizedText) => string;
  /** 占位符填充：fill(d.footer.rights, { year: 2026 }) → "© 2026 锦创AI" */
  fill: (template: string, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * 语言提供者。挂在 app/layout.tsx 里、包裹整个站点。
 *
 * @param children 被包裹的子树
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(site.defaults.lang);

  // 挂载后恢复上次选择的语言。放在 effect 里而不是 useState 初始值，原因见文件头注释。
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') {
      setLangState(saved);
    }
  }, []);

  // 让 <html lang> 跟随界面语言：屏幕阅读器靠它选中正确发音，搜索引擎靠它判断语种。
  // app/layout.tsx 的 <html lang="zh"> 只是服务端首屏值，这里负责后续同步。
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  }, [lang, setLang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      d: dictionaries[lang],
      setLang,
      toggleLang,
      pick: (text: LocalizedText) => text[lang],
      fill: (template: string, vars: Record<string, string | number>) =>
        Object.entries(vars).reduce(
          (acc, [key, replacement]) => acc.replaceAll(`{${key}}`, String(replacement)),
          template,
        ),
    }),
    [lang, setLang, toggleLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * 取当前语言与文案工具。
 *
 * @returns {I18nContextValue}
 * @throws 在 I18nProvider 之外调用时抛错，避免开发者拿到 undefined 后在页面上一片空白。
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n 必须在 <I18nProvider> 内部使用（请检查 app/layout.tsx 是否已包裹）。');
  }
  return ctx;
}
