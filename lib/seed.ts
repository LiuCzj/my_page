/** 内容迁移：把仓库里原有的**静态内容**灌进数据库。 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type Database from 'better-sqlite3';
import { site } from '@/config/site';

/** 旧的笔记目录（迁移完就只作为「初始种子」保留，不再被运行时读取） */
const NOTES_DIR = path.join(process.cwd(), 'content', 'notes');

/**
 * 迁移入口。建表之后由 lib/db.ts 调用。
 * @param d 已打开的数据库连接
 */
export function seedContent(d: Database.Database): void {
  seedNotes(d);
  seedProjects(d);
  seedSkills(d);
}

/** 把 content/notes/*.mdx 迁进 notes 表。 */
function seedNotes(d: Database.Database): void {
  const { c } = d.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
  if (c > 0) return;
  if (!fs.existsSync(NOTES_DIR)) return;

  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.mdx'));
  if (files.length === 0) return;

  const insert = d.prepare(
    `INSERT INTO notes (slug, title, date, summary, tags, draft, body, updated_at)
     VALUES (@slug, @title, @date, @summary, @tags, @draft, @body, @updated_at)`,
  );
  const now = Date.now();
  let ok = 0;

  d.transaction(() => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(NOTES_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      if (typeof data.title !== 'string' || !data.title) {
        console.warn(`[seed] 跳过 content/notes/${file}：缺 title`);
        continue;
      }
      insert.run({
        slug: file.replace(/\.mdx$/, ''),
        title: data.title,
        // gray-matter 会把没加引号的 解析成 Date；统一转回 YYYY-MM-DD，避免时区偏移
        date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? ''),
        summary: typeof data.summary === 'string' ? data.summary : '',
        tags: JSON.stringify(Array.isArray(data.tags) ? data.tags.map(String) : []),
        draft: data.draft === true ? 1 : 0,
        body: content.trim(),
        updated_at: now,
      });
      ok += 1;
    }
  })();

  console.log(`[seed] 已把 ${ok}/${files.length} 篇 .mdx 笔记迁移进数据库`);
}

/** 把 config/site.ts 的 projects 迁进 projects 表。 */
function seedProjects(d: Database.Database): void {
  const { c } = d.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number };
  if (c > 0) return;
  if (site.projects.length === 0) return;

  const insert = d.prepare(
    `INSERT INTO projects
       (slug, title_zh, title_en, summary_zh, summary_en, url, stack, date, featured, sort, updated_at)
     VALUES
       (@slug, @title_zh, @title_en, @summary_zh, @summary_en, @url, @stack, @date, @featured, @sort, @updated_at)`,
  );
  const now = Date.now();

  d.transaction(() => {
    site.projects.forEach((p, i) => {
      insert.run({
        slug: p.slug,
        title_zh: p.title.zh,
        title_en: p.title.en,
        summary_zh: p.summary.zh,
        summary_en: p.summary.en,
        url: p.url,
        stack: JSON.stringify(p.stack),
        date: p.date ?? null,
        featured: p.featured ? 1 : 0,
        sort: i,
        updated_at: now,
      });
    });
  })();

  console.log(`[seed] 已把 ${site.projects.length} 个项目迁移进数据库`);
}

/** 把 config/site.ts 的 skills 迁进 skill_groups 表。 */
function seedSkills(d: Database.Database): void {
  const { c } = d.prepare('SELECT COUNT(*) AS c FROM skill_groups').get() as { c: number };
  if (c > 0) return;
  if (site.skills.length === 0) return;

  const insert = d.prepare(
    `INSERT INTO skill_groups (id, title_zh, title_en, sections, sort, updated_at)
     VALUES (@id, @title_zh, @title_en, @sections, @sort, @updated_at)`,
  );
  const now = Date.now();

  d.transaction(() => {
    site.skills.forEach((g, i) => {
      insert.run({
        id: g.id,
        title_zh: g.title.zh,
        title_en: g.title.en,
        sections: JSON.stringify(g.sections),
        sort: i,
        updated_at: now,
      });
    });
  })();

  console.log(`[seed] 已把 ${site.skills.length} 组技术栈迁移进数据库`);
}
