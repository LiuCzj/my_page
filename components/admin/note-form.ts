/** 笔记表单的数据形状与纯函数。放在这里是为了让「按需加载编辑器」不把编辑器本身拖进来。 */

import type { NoteRecord } from '@/lib/content';

/** 表单态：tags 用逗号串，提交前再切回数组 */
export interface NoteForm {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string;
  draft: boolean;
  body: string;
}

/** 空白表单（新建） */
export function blankForm(): NoteForm {
  return {
    slug: '',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    summary: '',
    tags: '',
    draft: false,
    body: '',
  };
}

/** 由一条笔记记录生成表单态 */
export function formFromRecord(n: NoteRecord): NoteForm {
  return {
    slug: n.slug,
    title: n.title,
    date: n.date,
    summary: n.summary,
    tags: n.tags.join(', '),
    draft: n.draft,
    body: n.body,
  };
}

/**
 * 从标题生成合法 slug。纯中文标题过滤后是空串，退化成 note-<时间戳>。
 * @param title 笔记标题
 * @returns 通过 SLUG_RE 的短名
 */
export function slugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || `note-${Date.now().toString(36)}`;
}
