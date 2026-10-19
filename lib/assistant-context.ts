/** 数字分身的站内知识检索层。 */

import { listNoteMetas, listProjects, listSkillGroups, getNoteRecord } from '@/lib/content';
import type { LocalizedText } from '@/config/site';

/** 一段可被检索的站内内容片段（按「段」切，粒度才和问题对得上） */
export interface Chunk {
  /** 归属的展示名称（笔记标题 / 项目名 / 技术栈组名） */
  source: string;
  /** 这一段正文 */
  text: string;
  /** 站内路径，让分身能指路到真实地址 */
  href: string;
}

/** 切词用的停用词。 */
const STOP_CHARS = new Set([
  '的', '了', '吗', '呢', '吧', '啊', '是', '在', '有', '和', '与', '或',
  '我', '你', '他', '它', '这', '那', '什', '么', '怎', '样', '请', '帮',
  '一', '下', '个', '些', '可以', '能', '会', '要', '就', '都', '也', '还',
  '什么', '怎么', '如何', '哪些', '哪个', '一下', '总结', '介绍', '讲讲', '说说',
  '组织', '怎么组织', '如何组织', '是怎么', '怎么做', '怎么用', '怎么弄',
  '在哪', '哪里', '哪些地方', '做什么', '干什么', '有什么用', '是什么',
]);

/** 把 @ # $ 与紧跟其后的标识符粘成一个词。 */
function protectIdentifiers(query: string): string {
  return query.replace(/([@#$])([A-Za-z0-9][A-Za-z0-9._-]*)/g, ' $1$2 ');
}

/**
 * 把问句切成候选关键词。
 * @param query 访客原始问句
 * @returns 去重后的候选关键词（已转小写）
 */
function extractKeywords(query: string): string[] {
  // 标点统一换成空格，避免「第一篇笔记，的」被当成一个整串
  const normalized = protectIdentifiers(query).replace(
    /[，。！？；：、,.!?;:()[\]{}"'`]/g,
    ' ',
  );
  // 连续汉字段 与 连续英文数字段 各取一份；英数字段内部允许 . - 以保住 Next.js
  const raw = normalized.match(/[@#$]?[\u3400-\u9fff]+|[@#$]?[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? [];

  const out: string[] = [];

  /** 放一个候选词；长度不足或是停用词就丢 */
  const push = (piece: string) => {
    const core = piece.replace(/^[@#$]/, '');
    if (core.length < 2) return;
    if (STOP_CHARS.has(piece)) return;
    if (STOP_CHARS.has(core)) return;
    out.push(piece);
  };

  /** 按停用字把长汉字串切成自然片段（单字为界；双字停用词被切开后残片会因长度 1 丢掉） */
  const splitByStopChars = (text: string): string[] => {
    const parts: string[] = [];
    let buf = '';
    for (const ch of text) {
      if (STOP_CHARS.has(ch)) {
        if (buf) parts.push(buf);
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  };

  /** 超过这个长度的短语几乎不可能在正文里原样出现，拆子词更有用 */
  const MAX_PHRASE = 6;

  for (const token of raw) {
    const lower = token.toLowerCase();
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      for (const part of splitByStopChars(token)) {
        if (part.length < 2) continue;

        if (part.length <= MAX_PHRASE) {
          push(part);
        } else {
          // 步长 1 不漏组合，窗口 3 不出长垃圾
          for (let i = 0; i + 3 <= part.length; i += 1) push(part.slice(i, i + 3));
        }

        if (part.length >= 4) {
          for (let i = 0; i + 2 <= part.length; i += 1) push(part.slice(i, i + 2));
        }
      }
    } else if (lower.length >= 2) {
      // 英文 / 数字 / 带符号标识符整体保留（@theme、next.js、v4）
      push(token);
    }
  }
  return [...new Set(out)];
}

/** 构造全站的可检索片段。 */
function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  const noteMetas = listNoteMetas();
  const projects = listProjects();

  /* 目录片段：清单型提问的落点。 */
  if (noteMetas.length > 0) {
    chunks.push({
      source: '笔记目录',
      text: `本站笔记目录（共 ${noteMetas.length} 篇）：${noteMetas
        .map((n, i) => `${i + 1}. ${n.title}（/notes/${n.slug}）`)
        .join('；')}`,
      href: '/notes',
    });
  }
  if (projects.length > 0) {
    chunks.push({
      source: '项目目录',
      text: `本站项目（也叫作品，共 ${projects.length} 个）：${projects
        .map((p, i) => `${i + 1}. ${pickLang(p.title)}——${pickLang(p.summary)}（仓库：${p.url}）`)
        .join('；')}`,
      href: '/projects',
    });
  }

  for (const meta of noteMetas) {
    const record = getNoteRecord(meta.slug);
    if (!record) continue;
    const href = `/notes/${meta.slug}`;

    // 标题行单独一段，供「有哪些笔记讲 X」命中
    chunks.push({
      source: meta.title,
      text: `${meta.title}｜${meta.summary}｜标签：${meta.tags.join('、') || '无'}`,
      href,
    });

    // 正文按空行分段：太短的多半是小标题，跳过；太长的硬切一刀，免得一段吃掉全部预算
    for (const para of record.body.split(/\n\s*\n/)) {
      const text = para.trim();
      if (text.length < 10) continue;
      if (text.length <= 600) {
        chunks.push({ source: meta.title, text, href });
      } else {
        for (let i = 0; i < text.length; i += 600) {
          chunks.push({ source: meta.title, text: text.slice(i, i + 600), href });
        }
      }
    }
  }

  for (const project of projects) {
    const title = pickLang(project.title);
    chunks.push({
      source: title,
      text: `项目「${title}」：${pickLang(project.summary)}｜技术栈：${project.stack.join('、') || '未标注'}${project.date ? `｜${project.date}` : ''}｜仓库：${project.url}`,
      href: '/projects',
    });
  }

  for (const group of listSkillGroups()) {
    const gtitle = pickLang(group.title);
    const items = group.sections
      .map((s) => {
        const label = pickLang(s.label);
        const list = s.items.map(pickLang).join('、');
        return label ? `${label}：${list}` : list;
      })
      .filter(Boolean)
      .join('；');
    if (!items) continue;
    chunks.push({ source: `${gtitle}`, text: `技术栈·${gtitle}：${items}`, href: '/' });
  }

  return chunks;
}

/**
 * 取双语文案的中文侧。
 * @param text 双语文案
 * @returns 中文（缺失时回落英文）
 */
function pickLang(text: LocalizedText): string {
  return text.zh || text.en;
}

/**
 * 检索与问句最相关的站内片段。
 * @param query 访客问句
 * @param limit 最多返回几段
 * @returns 按相关度倒序；一个都没命中时返回空数组
 */
export function retrieveContext(query: string, limit = 4): Chunk[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  /** 单个关键词在段内的计分次数上限 */
  const OCCURRENCE_CAP = 3;

  const scored = buildChunks().map((chunk) => {
    const haystack = chunk.text.toLowerCase();
    const title = chunk.source.toLowerCase();
    let score = 0;
    let titleBonusUsed = false;

    for (const kw of keywords) {
      // 用 indexOf 循环数出现次数，免得为正则转义发愁
      let occurrences = 0;
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(kw, from);
        if (at === -1) break;
        occurrences += 1;
        if (occurrences >= OCCURRENCE_CAP) break;
        from = at + kw.length;
      }
      if (occurrences === 0) continue;

      score += (1 + kw.length * 0.35) * occurrences;

      if (!titleBonusUsed && title.includes(kw)) {
        score += 3;
        titleBonusUsed = true;
      }
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.chunk);
}

/**
 * 把片段渲染成可拼进 system prompt 的「站内资料」。
 * @param chunks retrieveContext 的返回值
 * @returns 无片段时返回空串（调用方据此跳过这一段）
 */
export function formatContext(chunks: Chunk[]): string {
  if (chunks.length === 0) return '';
  const blocks = chunks.map(
    (c, i) => `【资料 ${i + 1}｜来自「${c.source}」｜路径 ${c.href}】\n${c.text}`,
  );
  return blocks.join('\n\n');
}

/**
 * 取一篇笔记的整篇内容，供「当前页」优先注入。
 * @param slug     笔记短名（内部过 SLUG_RE，非法值返回空数组）
 * @param maxChars 正文注入上限，避免挤掉其他资料
 * @returns 标题摘要一条 + 正文一条；笔记不存在时返回空数组
 */
export function noteChunks(slug: string, maxChars = 4000): Chunk[] {
  const record = getNoteRecord(slug);
  if (!record) return [];
  const href = `/notes/${slug}`;

  const chunks: Chunk[] = [
    {
      source: record.title,
      text: `笔记《${record.title}》｜摘要：${record.summary}｜标签：${record.tags.join('、') || '无'}｜完整地址 ${href}`,
      href,
    },
  ];

  const body = record.body.slice(0, maxChars).trim();
  if (body) chunks.push({ source: record.title, text: body, href });

  return chunks;
}
