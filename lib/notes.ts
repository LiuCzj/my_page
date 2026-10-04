/**
 * ⚠️ 已废弃（2026-10-04）。
 *
 * 这个文件原来是「笔记读取层」：用 node:fs 读 content/notes/*.mdx。
 * 改造后笔记存进了数据库，读取逻辑搬到 lib/content.ts —— 请直接从那import。
 *
 * 保留这个文件只是为了万一有漏改的引用还能编译通过（转发到新实现），
 * 内容与 lib/content.ts 完全同源，不存在两套逻辑。
 *
 * 【迁移对照】
 *   getAllNotes()      → listNoteMetas()
 *   getNote(slug)      → getNoteRecord(slug)（返回完整记录，含 Markdown 正文）
 *   NoteMeta           → 同名类型，已搬到 lib/content.ts
 */

export {
  listNoteMetas as getAllNotes,
  getNoteRecord as getNote,
  estimateReadingMinutes,
} from './content';
export type { NoteMeta, NoteRecord } from './content';
