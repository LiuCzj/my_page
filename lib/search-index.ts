/**
 * 站内搜索索引。
 *
 * 【它做什么】
 * 把散落在两处的站点内容拍平成一张「可搜索条目」表，供 components/SiteSearch.tsx
 * 直接过滤、分组、渲染。两处来源分别是：
 *   1. config/site.ts —— 项目 / 技术栈 / 工具 / 页面（纯数据，客户端可读）
 *   2. 笔记 —— 来自 content/notes 的 frontmatter，由服务端读好后当 props 传进来
 *
 * 【为什么笔记必须从外部传入，这个文件不 import lib/notes.ts】
 * lib/notes.ts 用 node:fs 读磁盘。它一旦被 'use client' 组件（或本文件）静态 import，
 * fs 就会被整个打进浏览器包，构建直接失败。所以笔记数据只能由服务端组件
 * （app/layout.tsx）读好后，以纯数据 props 传进搜索面板。本文件只认它被传进来的形状。
 *
 * 【为什么每条的匹配文本里中英文都要有】
 * 站点数据里大量字段是 LocalizedText（{ zh, en }）。访客可能用中文关键词搜
 * （「大模型」），也可能用英文关键词搜（"LLM"）。如果只把当前语言的展示文案放进
 * 匹配文本，切到英文界面后中文关键词就搜不到了。所以：
 *   - 展示用的 title / subtitle 取当前语言（跟着界面走）；
 *   - 匹配用的 haystack 把两种语言的值都拼进去（谁都能命中）。
 *
 * 【为什么不引模糊搜索库】
 * 需求是「大小写不敏感的子串匹配」，includes() 一行就够。引 fuse.js / minisearch
 * 只会让首屏多下载几十 KB，而本站在几万字符量级上根本用不上倒排索引。
 *
 * 【本文件是纯函数模块，没有 'use client'】
 * 它不碰 window / document，只做数据变换，客户端和服务端都能安全 import。
 */

import { site, type Lang, type LocalizedText } from '@/config/site';
import zhDict from '@/dictionaries/zh';
import enDict from '@/dictionaries/en';

/**
 * 条目所属分组。顺序即界面上的分组展示顺序（见 GROUP_ORDER）。
 * 与字典 search 分组里的 groupProjects / groupNotes / groupSkills / groupTools / groupPages 一一对应。
 */
export type SearchGroup = 'projects' | 'notes' | 'skills' | 'tools' | 'pages';

/**
 * 一条笔记的最小可搜索形状。
 *
 * 【为什么不用 lib/notes.ts 的 NoteMeta】
 * NoteMeta 多出 date / draft / readingMinutes 等搜索用不到的字段，而且引入它的类型
 * 会让 TypeScript 顺着 import 关系去解析 node:fs（即便只是 import type，
 * 也把「笔记来自文件系统」这件事耦合进来）。这里刻意只声明搜索真正要用的四个字段，
 * 服务端传过来的 NoteMeta 因为结构兼容（结构化类型）可以直接赋值。
 */
export interface SearchNote {
  /** 文件名去掉 .mdx，用于拼详情页路径 */
  slug: string;
  title: string;
  summary: string;
  tags: string[];
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
 *
 * @param text 一条双语文案
 * @returns [中文, 英文]，供拼接匹配文本使用
 */
function bothLanguages(text: LocalizedText): [string, string] {
  return [text.zh, text.en];
}

/**
 * 按当前界面语言取展示文案。
 *
 * @param text 一条双语文案
 * @param lang 当前语言
 * @returns 该语言下的字符串
 */
function display(text: LocalizedText, lang: Lang): string {
  return text[lang];
}

/**
 * 构造匹配用文本（haystack）。
 *
 * 把所有参与匹配的片段（含数组，如 stack / tags）拍平、用空格连接、统一转小写。
 * 转小写是「大小写不敏感」的实现方式：查询侧也转小写，两边对齐即可。
 *
 * 为什么用空格而不是别的分隔符：空格是天然的「词边界」，让 "power bi" 这种带空格的
 * 查询也能跨片段命中；而它不会造成误匹配 —— 一个片段内部本来就不该被拆开匹配，
 * 但拆开后仍然包含原查询的情况（如 "bi" 命中 "power bi"）正是我们想要的子串行为。
 *
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
 *
 * 只分三档，不做词频统计：
 *   0 = 标题以查询开头（最相关）
 *   1 = 标题包含查询
 *   2 = 仅副文本 / 标签 / 另一种语言命中
 * 分数越小越靠前。这是纯展示层的排序优化，不影响「是否命中」的判定。
 *
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
 *
 * 【参数】
 * @param notes 由服务端读好并传入的笔记元数据（本文件不读文件系统，见文件头说明）
 * @param lang  当前界面语言，决定每条 entry 的展示文案用中文还是英文
 *
 * 【返回】按 GROUP_ORDER 顺序排好的条目数组：项目 → 笔记 → 技术栈 → 工具 → 页面
 */
export function buildSearchIndex({
  notes,
  lang,
}: {
  notes: SearchNote[];
  lang: Lang;
}): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // ── 项目 ────────────────────────────────────────────────
  // 每个项目一条。链接指向 config 里的 url（本站目前都是 GitHub 仓库），属于站外。
  for (const project of site.projects) {
    entries.push({
      id: `project:${project.slug}`,
      group: 'projects',
      title: display(project.title, lang),
      subtitle: display(project.summary, lang),
      tags: project.stack,
      // 标题、摘要的双语 + 技术栈都进匹配文本：用中文搜「数字分身」或用英文搜 "digital twin" 都能命中
      haystack: buildHaystack(bothLanguages(project.title), bothLanguages(project.summary), project.stack),
      href: project.url,
      external: true,
    });
  }

  // ── 笔记 ────────────────────────────────────────────────
  // 笔记正文只有中文（见 lib/notes.ts 的说明），所以标题 / 摘要 / 标签直接进匹配文本。
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
  site.skills.forEach((group, groupIndex) => {
    group.items.forEach((item, itemIndex) => {
      entries.push({
        id: `skill:${groupIndex}:${itemIndex}`,
        group: 'skills',
        title: display(item, lang),
        subtitle: display(group.title, lang),
        // 条目名和组名都要能被搜到：搜「大模型」既该命中组名，也该命中组里的条目
        haystack: buildHaystack(bothLanguages(item), bothLanguages(group.title)),
        href: '/',
        external: false,
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
      href: '/',
      external: false,
    });
  });
  site.favoriteTools.forEach((tool, i) => {
    entries.push({
      id: `favtool:${i}`,
      group: 'tools',
      title: display(tool.label, lang),
      haystack: buildHaystack(bothLanguages(tool.label)),
      href: '/',
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
 *
 * 【空查询返回全部】
 * Cmd+K 面板刚打开时输入框是空的，此时展示全量条目（等价于命令面板的默认列表），
 * 而不是一片空白 —— 访客一眼就能看到「这个站里有什么可搜的」。
 *
 * 【匹配规则】大小写不敏感的子串匹配：查询与 haystack 都转小写后 includes()。
 * 命中后按 rank() 做一次轻量排序，标题命中的排在仅正文命中的前面。
 *
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
 *
 * 【为什么单独抽出来】过滤后的结果可能是「项目、技能、项目、工具」这样交错的
 * （因为 rank 排序会打乱组内顺序），界面要的是「同组聚在一起 + 组间固定顺序」。
 * 组件拿到分组结果后即可逐组渲染小标题。
 *
 * 组内顺序保持传入数组的顺序（也就是 filterEntries 排好的相关度顺序），不做二次排序。
 *
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
