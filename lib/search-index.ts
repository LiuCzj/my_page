/** 站内搜索索引。 */

import { site, type Lang, type LocalizedText } from '@/config/site';
import zhDict from '@/dictionaries/zh';
import enDict from '@/dictionaries/en';

/** 条目所属分组。顺序即界面上的分组展示顺序（见 GROUP_ORDER）。 */
export type SearchGroup = 'projects' | 'notes' | 'skills' | 'tools' | 'pages';

/** 一条笔记的最小可搜索形状。 */
export interface SearchNote {
  /** 文件名去掉 .mdx，用于拼详情页路径 */
  slug: string;
  title: string;
  summary: string;
  tags: string[];
}

/** 搜索索引里的一个项目。 */
export interface SearchProject {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  /** true = 有正文，搜到它进站内详情页；false 退回 url */
  hasBody: boolean;
  url: string;
  stack: string[];
}

/** 拍平后的一条可搜索条目 */
export interface SearchEntry {
  /** 全局唯一 id，用作 React key 与 aria-activedescendant 的目标 */
  id: string;
  group: SearchGroup;
  /** 当前语言下的展示标题 */
  title: string;
  /** 当前语言下的副文本（摘要 / 所属组名 / 说明），没有则省略 */
  subtitle?: string;
  /** 右侧小标签（项目的技术栈、笔记的标签），没有则省略 */
  tags?: string[];
  /** 匹配用文本：已小写、双语已拼接。过滤只查这一个字段 */
  haystack: string;
  /** 跳转地址：站内路径（/notes/xxx）或站外完整 URL */
  href: string;
  /** true = 站外链接，渲染成 <a target="_blank" rel="noopener noreferrer"> */
  external: boolean;
}

/** 分组展示顺序。数组顺序就是界面从上到下的顺序 */
const GROUP_ORDER: SearchGroup[] = ['projects', 'notes', 'skills', 'tools', 'pages'];

/**
 * 取出 LocalizedText 的两种语言值。
 * @param text 一条双语文案
 * @returns [中文, 英文]，供拼接匹配文本使用
 */
function bothLanguages(text: LocalizedText): [string, string] {
  return [text.zh, text.en];
}

/**
 * 按当前界面语言取展示文案。
 * @param text 一条双语文案
 * @param lang 当前语言
 * @returns 该语言下的字符串
 */
function display(text: LocalizedText, lang: Lang): string {
  return text[lang];
}

/**
 * 构造匹配用文本（haystack）。
 * @param parts 任意个字符串 / 字符串数组 / 空值，空值会被跳过
 * @returns 小写、单空格分隔的匹配文本
 */
function buildHaystack(...parts: (string | string[] | undefined | null)[]): string {
  const flat: string[] = [];
  for (const part of parts) {
    if (!part) continue; // 跳过 undefined / null / 空串
    if (Array.isArray(part)) flat.push(...part);
    else flat.push(part);
  }
  return flat.join(' ').toLowerCase();
}

/**
 * 给一条条目打一个「匹配质量」分，用于把标题命中的结果排到前面。
 * @param entry 待打分的条目
 * @param query 已小写的查询串
 * @returns 0 / 1 / 2
 */
function rank(entry: SearchEntry, query: string): number {
  const title = entry.title.toLowerCase();
  if (title.startsWith(query)) return 0;
  if (title.includes(query)) return 1;
  return 2;
}

/**
 * 把站点数据拍平成可搜索条目数组。
 * @param notes    由服务端读好并传入的笔记元数据（本文件不碰数据库，见文件头说明）
 * @param projects 同上：由服务端从数据库读好的项目列表
 * @param skills   同上：由服务端从数据库读好的技术栈分组
 * @param lang     当前界面语言，决定每条 entry 的展示文案用中文还是英文
 */
/** 技术栈分组的搜索形状。 */
export interface SearchSkillGroup {
  title: LocalizedText;
  sections: { label: LocalizedText; items: LocalizedText[] }[];
}

export function buildSearchIndex({
  notes,
  projects,
  skills,
  lang,
}: {
  notes: SearchNote[];
  projects: SearchProject[];
  skills: SearchSkillGroup[];
  lang: Lang;
}): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // ── 项目 ────────────────────────────────────────────────
  // 每个项目一条。有正文的进站内详情页，没正文的退回 url（可能是外链，也可能为空）。
  for (const project of projects) {
    entries.push({
      id: `project:${project.slug}`,
      group: 'projects',
      title: display(project.title, lang),
      subtitle: display(project.summary, lang),
      tags: project.stack,
      // 标题、摘要的双语 + 技术栈都进匹配文本：用中文搜「数字分身」或用英文搜 "digital twin" 都能命中
      haystack: buildHaystack(bothLanguages(project.title), bothLanguages(project.summary), project.stack),
      href: project.hasBody ? `/projects/${project.slug}` : project.url,
      external: !project.hasBody,
    });
  }

  // ── 笔记 ────────────────────────────────────────────────
  // 笔记正文只有中文，所以标题 / 摘要 / 标签直接进匹配文本。
  // 站内链接，走 next/link。
  for (const note of notes) {
    entries.push({
      id: `note:${note.slug}`,
      group: 'notes',
      title: note.title,
      subtitle: note.summary,
      tags: note.tags,
      haystack: buildHaystack(note.title, note.summary, note.tags),
      href: `/notes/${note.slug}`,
      external: false,
    });
  }

  // ── 技术栈 ──────────────────────────────────────────────
  // 一条技能 = 一个条目（而不是一个分组一个条目）：搜索的价值在于精确到「TabNet」
  // 这一项，而不是「深度学习」那一组。所属组名放进副标题，保留上下文。
  // 技术栈展示在首页磁贴区，没有独立路由，所以跳回首页 '/'.
  //
  // 【数据来自数据库】由 app/layout.tsx 读好当 props 一路传下来（本文件在客户端跑，碰不到库）。
  // 这样管理员在网页上改过技术栈之后，搜索里立刻是新内容。
  // 分组 → 小节 → 条目是三层，所以这里套两层循环；小节名一起进副标题与 haystack，
  // 搜「传统机器学习」也能命中小节下面的条目。
  skills.forEach((group, groupIndex) => {
    group.sections.forEach((section, sectionIndex) => {
      const hasLabel = Boolean(section.label.zh || section.label.en);
      section.items.forEach((item, itemIndex) => {
        entries.push({
          id: `skill:${groupIndex}:${sectionIndex}:${itemIndex}`,
          group: 'skills',
          title: display(item, lang),
          subtitle: hasLabel
            ? `${display(group.title, lang)} · ${display(section.label, lang)}`
            : display(group.title, lang),
          // 条目名、组名、小节名都要能被搜到：搜「大模型」既该命中组名，也该命中组里的条目
          haystack: buildHaystack(
            bothLanguages(item),
            bothLanguages(group.title),
            bothLanguages(section.label),
          ),
          href: '/#skills',
          external: false,
        });
      });
    });
  });

  // ── 工具 ────────────────────────────────────────────────
  // 工具条与「最喜欢的工具」合并进同一个分组。id 前缀区分两个来源，避免重名撞 key。
  site.tools.forEach((tool, i) => {
    entries.push({
      id: `tool:${i}`,
      group: 'tools',
      title: display(tool.label, lang),
      haystack: buildHaystack(bothLanguages(tool.label)),
      href: '/#tools',
      external: false,
    });
  });
  site.favoriteTools.forEach((tool, i) => {
    entries.push({
      id: `favtool:${i}`,
      group: 'tools',
      title: display(tool.label, lang),
      haystack: buildHaystack(bothLanguages(tool.label)),
      href: '/#favorite-tools',
      external: false,
    });
  });

  // ── 页面 ────────────────────────────────────────────────
  // 首页 / 项目页 / 笔记页三个固定入口。站点导航名不在 config/site.ts 里，
  // 而是在字典的 nav 分组中（这才是它们唯一的真实来源），所以这里从字典取。
  // 中英两个名字都进匹配文本，切到任一语言都能被搜到。
  const pages: { zh: string; en: string; href: string }[] = [
    { zh: zhDict.nav.home, en: enDict.nav.home, href: '/' },
    { zh: zhDict.nav.projects, en: enDict.nav.projects, href: '/projects' },
    { zh: zhDict.nav.notes, en: enDict.nav.notes, href: '/notes' },
  ];
  pages.forEach((page, i) => {
    entries.push({
      id: `page:${i}`,
      group: 'pages',
      title: lang === 'zh' ? page.zh : page.en,
      haystack: buildHaystack(page.zh, page.en),
      href: page.href,
      external: false,
    });
  });

  return entries;
}

/**
 * 按查询串过滤条目。
 * @param entries 全量索引（buildSearchIndex 的返回值）
 * @param query   用户输入，可能含首尾空格与大小写
 * @returns 过滤并按相关度排好序的新数组（不改动入参）
 */
export function filterEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  // 空查询：原样返回全部。slice() 一份副本，避免调用方误改到索引本体
  if (!q) return entries.slice();
  // filter 已经产出新数组，下面的 sort 是原地排序，不会影响入参
  return entries.filter((entry) => entry.haystack.includes(q)).sort((a, b) => rank(a, q) - rank(b, q));
}

/**
 * 把条目按分组归类，并保持 GROUP_ORDER 的分组顺序。
 * @param entries 已过滤 / 排序的条目数组
 * @returns 只包含非空分组的 [{ group, items }]，顺序同 GROUP_ORDER
 */
export function groupEntries(entries: SearchEntry[]): { group: SearchGroup; items: SearchEntry[] }[] {
  // 用 Map 保持插入顺序，同时 O(1) 归并
  const buckets = new Map<SearchGroup, SearchEntry[]>();
  for (const entry of entries) {
    const list = buckets.get(entry.group);
    if (list) list.push(entry);
    else buckets.set(entry.group, [entry]);
  }
  // 按固定顺序输出，并丢掉没有条目的分组（不渲染空标题）
  return GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    items: buckets.get(group)!,
  }));
}
