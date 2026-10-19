/** 项目表单的数据形状与纯函数。放在这里是为了让「按需加载编辑器」不把编辑器本身拖进来。 */

import type { ProjectRecord } from '@/lib/content';

/** 表单态：stack 用逗号串，sort 用字符串（input 只能给字符串） */
export interface ProjectForm {
  slug: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  url: string;
  stack: string;
  date: string;
  featured: boolean;
  sort: string;
  body: string;
}

/**
 * 空白表单（新建）。
 * @param nextSort 新项目排到的位置（现有最大 sort + 1）
 */
export function blankForm(nextSort: number): ProjectForm {
  return {
    slug: '',
    titleZh: '',
    titleEn: '',
    summaryZh: '',
    summaryEn: '',
    url: '',
    stack: '',
    date: '',
    featured: false,
    sort: String(nextSort),
    body: '',
  };
}

/** 由一条项目记录生成表单态 */
export function formFromRecord(p: ProjectRecord): ProjectForm {
  return {
    slug: p.slug,
    titleZh: p.title.zh,
    titleEn: p.title.en,
    summaryZh: p.summary.zh,
    summaryEn: p.summary.en,
    url: p.url,
    stack: p.stack.join(', '),
    date: p.date ?? '',
    featured: p.featured,
    sort: String(p.sort),
    body: p.body,
  };
}
