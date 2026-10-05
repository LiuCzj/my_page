/**
 * 内容迁移：把仓库里原有的**静态内容**灌进数据库。
 *
 * 【为什么要这一步】改造之前，「笔记」是 content/notes 下的 .mdx 文件、
 * 「项目」是 config/site.ts 里的常量。改成数据库存储后，如果不做迁移，
 * 站长一上线就会发现「我原来写的东西全没了」。
 *
 * 【只在表为空时跑】两个 seed 函数都先数一下行数，非空就直接返回 ——
 * 这样它天然是幂等的：首次启动导入一次，之后每次启动都跳过，
 * 绝不会把站长后来在网页上改过的内容覆盖回去。
 *
 * 【为什么放在 migrate() 里】建表之后立刻补数据，是同一个「让库达到可用状态」的步骤；
 * 拆成需要手动执行的脚本，服务器上多一步容易漏。
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type Database from 'better-sqlite3';
import { site } from '@/config/site';

/** 旧的笔记目录（迁移完就只作为「初始种子」保留，不再被运行时读取） */
const NOTES_DIR = path.join(process.cwd(), 'content', 'notes');

/**
 * 迁移入口。建表之后由 lib/db.ts 调用。
 *
 * @param d 已打开的数据库连接
 */
export function seedContent(d: Database.Database): void {
  seedNotes(d);
  seedProjects(d);
  seedSkills(d);
}

/**
 * 把 content/notes/*.mdx 迁进 notes 表。
 *
 * 【为什么对残缺文件宽容】旧读取层（lib/notes.ts）在缺 title 时是**抛错**的 ——
 * 那是构建期，炸出来能立刻定位。这里是启动期，一个坏文件不该让整个站起不来，
 * 所以缺 title 的直接跳过并打日志。
 */
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
        // gray-matter 会把没加引号的 2026-10-03 解析成 Date；统一转回 YYYY-MM-DD，避免时区偏移
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

/**
 * 把 config/site.ts 的 projects 迁进 projects 表。
 *
 * sort 直接取原数组下标：改造前「首页取前 N 条」靠的就是数组顺序，
 * 存下来之后管理员可以在编辑器里改这个顺序。
 */
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

/**
 * 把 config/site.ts 的 skills 迁进 skill_groups 表。
 *
 * 【为什么整组的 sections 直接存 JSON】见 lib/db.ts 里 skill_groups 建表处的说明：
 * 这层数据只能整体读写，拆表只会多出级联与排序的复杂度。
 *
 * 【为什么 id 一起落库、而且写死在 config 里】编辑界面靠它区分「这次改的是哪一组」，
 * 也当 React 的 key。它是 config 里手写的稳定短名（如 'dl-ml'），不是运行时随机生成 ——
 * 这样重复灌库、或者配置与库对比时，都不会出现「同一组换了个身份」的错位。
 */
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
