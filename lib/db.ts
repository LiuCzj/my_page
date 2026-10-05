/**
 * 评论功能的 SQLite 数据层。
 *
 * 【为什么选 SQLite 而不是接一个数据库服务】
 * 这是一个个人博客的评论功能，量级是「几十条评论」，不是「每秒几千次写入」。
 * 为一个评论功能去装 PostgreSQL / 起一个 MySQL 容器，换来的是多一个要维护的进程、
 * 多一份备份策略、多一个可能连不上的东西。SQLite 是一个文件，随项目走，
 * 备份就是复制文件 —— 对这个量级来说，它是正确的选择，不是偷懒。
 *
 * 【为什么用 better-sqlite3 而不是 node:sqlite】
 * Node 22 内置的 node:sqlite 仍标记实验性，API 可能在小版本间变。
 * 一个要长期跑在服务器上的功能，不押在实验性 API 上。
 *
 * 【WAL 模式】
 * 默认的 rollback journal 在写入时会锁住整个库，读也要等。
 * WAL 下读写可以并发 —— 页面在渲染评论列表的同时有人发评论，不会互相卡住。
 *
 * 【单例】
 * Next.js 的 route handler 每次请求都可能重新求值模块，不缓存会反复打开同一个文件，
 * 白白消耗文件句柄。这里用模块级变量兜住一份连接。
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { seedContent } from './seed';

/** 模块级单例连接 */
let instance: Database.Database | null = null;

/**
 * 给已有表补列（SQLite 没有 ALTER TABLE ... ADD COLUMN IF NOT EXISTS）。
 *
 * 【为什么需要它】`CREATE TABLE IF NOT EXISTS` 对已存在的表是**完全跳过**的 ——
 * 不会补上后来新增的列。所以每次加字段都必须显式 ALTER，
 * 否则老库跑新代码会在「查询一个不存在的列」上炸掉。
 *
 * @param d 已打开的连接
 * @param table 表名（只接受内部常量，不接用户输入）
 * @param column 列名
 * @param definition 列定义（类型 + 默认值等）
 */
function ensureColumn(d: Database.Database, table: string, column: string, definition: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * 建表 + 迁移。全部用 IF NOT EXISTS / 补列判断，所以重复调用是安全的（每次启动都会跑一遍）。
 *
 * 三张表：
 *   users      —— 注册用户。email_verified 为 0 时不能发评论，这是挡临时邮箱的最后一关。
 *   sessions   —— 登录态。存库而不是只靠签名 cookie，好处是可以主动吊销（登出即删行）。
 *   comments   —— 评论。note_slug 直接存笔记短名，不建外键到 notes 表
 *                 （评论先于「笔记入库」这个改动存在，历史数据里可能还有指向已删笔记的行）。
 *
 * @param d 已打开的连接
 */
function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT    NOT NULL UNIQUE,
      display_name   TEXT    NOT NULL,
      password_hash  TEXT    NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verify_token   TEXT,
      verify_sent_at INTEGER,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      note_slug  TEXT    NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comments_slug    ON comments(note_slug, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // ── 2026-10-03 新增：找回密码用的 token ──
  // 与注册验证分开两个字段，而不是复用 verify_token：
  // 两者可能同时存在（注册后还没验证就去点找回密码），复用会让其中一个把另一个覆盖掉。
  ensureColumn(d, 'users', 'reset_token', 'TEXT');
  ensureColumn(d, 'users', 'reset_sent_at', 'INTEGER');

  // ── 2026-10-03 新增：评论回复 ──
  // 指向父评论。ON DELETE CASCADE 让「删掉父评论时子回复跟着消失」，
  // 否则会留下一堆没有上下文的孤儿回复。
  ensureColumn(d, 'comments', 'parent_id', 'INTEGER REFERENCES comments(id) ON DELETE CASCADE');

  /*
    昵称唯一索引。

    用「唯一索引」而不是列上的 UNIQUE 约束，因为约束只能在建表时声明 ——
    要给一张已经存在的表加唯一性，只能建索引（SQLite 不支持 ADD CONSTRAINT）。

    COLLATE NOCASE 让 "Tom" 和 "tom" 也算重复 —— 否则会出现两个看起来一样的昵称，
    评论区里根本分不清谁是谁。

    注意：如果老库里已经有重复昵称，这句会抛错。用 try 包住并降级成警告，
    让站点还能起来（宁可暂时不唯一，也不要因为一条历史数据整个服务起不来）。
  */
  try {
    d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(display_name COLLATE NOCASE)');
  } catch (err) {
    console.warn(
      '[db] 昵称唯一索引创建失败（库里可能已有重复昵称），本次跳过：',
      err instanceof Error ? err.message : err,
    );
  }

  /*
    ── 2026-10-04 新增：可在线编辑的内容 ──────────────────────────────
    「项目」「笔记」原来分别是 config/site.ts 里的常量、和 content/notes 下的 .mdx 文件，
    都是**构建期静态**内容 —— 网页上改不了。要让站长能在网页里编辑，
    就必须把它们从「构建期静态」搬到「运行时数据库」。

    两张表都是「一条内容一行」的形态，正文整段存原文，读的时候整行取出来用。
      tags / stack 存 JSON 数组字符串（如 '["AI","SSE"]'）：它们只用于展示与搜索匹配，
      不需要按元素查询，所以不值得单开关联表。

    updated_at 用于「最后修改时间」的展示与排序兜底。
  */
  d.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      slug       TEXT    PRIMARY KEY,
      title      TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      summary    TEXT    NOT NULL,
      tags       TEXT    NOT NULL DEFAULT '[]',
      draft      INTEGER NOT NULL DEFAULT 0,
      body       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      slug       TEXT    PRIMARY KEY,
      title_zh   TEXT    NOT NULL,
      title_en   TEXT    NOT NULL DEFAULT '',
      summary_zh TEXT    NOT NULL,
      summary_en TEXT    NOT NULL DEFAULT '',
      url        TEXT    NOT NULL DEFAULT '',
      stack      TEXT    NOT NULL DEFAULT '[]',
      date       TEXT,
      featured   INTEGER NOT NULL DEFAULT 0,
      sort       INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    /*
      ── 2026-10-04 新增：技术栈分组 ────────────────────────────────
      「技术栈」原来只是 config/site.ts 里的常量，网页上改不了。
      站长要求能自己在线编辑，于是和笔记、项目一样搬进库。

      【为什么 sections 存 JSON，而不是再开「小节表 + 条目表」】
      分组 → 小节 → 条目是三层嵌套，而且**只能整体读、整体写**（编辑界面一次提交全部）——
      没有「查出所有含某关键词的条目」这类需求。拆成三张表就要处理外键级联、逐行排序与
      事务拼装，换来的是零查询收益。条目本身已经是 {zh, en} 双语对象，JSON 正好原样承载。

      【两个字段的分工】sort 决定分组在页面上的先后（管理员可调）；id 只用于
      「这次改的是哪一组」，不参与展示。
    */
    CREATE TABLE IF NOT EXISTS skill_groups (
      id         TEXT    PRIMARY KEY,
      title_zh   TEXT    NOT NULL,
      title_en   TEXT    NOT NULL DEFAULT '',
      sections   TEXT    NOT NULL DEFAULT '[]',
      sort       INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    /*
      ── 2026-10-04 新增：邮箱验证码 ────────────────────────────────
      注册与注销都要「往邮箱发一个 6 位码、填回来确认」。码存哈希不存明文 ——
      和 session token 一个道理：库万一泄漏，拿到哈希也反推不出可用的码。
      主键是 (email, purpose)：一个邮箱在同一个用途下**同时只有一个有效码**，
      重发就覆盖旧的，不会留下一堆还能用的历史码。

      attempts 用来限制暴力尝试次数（6 位数字只有 100 万种，不限制的话脚本能刷穿）。
    */
    CREATE TABLE IF NOT EXISTS email_codes (
      email      TEXT    NOT NULL,
      purpose    TEXT    NOT NULL,
      code_hash  TEXT    NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (email, purpose)
    );
  `);

  // 首次启动（两张表都还空着）时，把仓库里现有的静态内容灌进去，保证一篇不丢。
  seedContent(d);
}
/**
 * 取数据库连接（首次调用时打开并建表）。
 *
 * @returns better-sqlite3 的连接实例
 * @throws 数据库文件无法创建或打开时抛出（例如目录无写权限）
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  // 路径可由环境变量覆盖：服务器上建议指到 /srv/my_page/data/ 这类持久化目录，
  // 绝不能落在 /tmp（重启即丢）。
  const file = process.env.DB_PATH
    ? resolve(process.env.DB_PATH)
    : resolve(process.cwd(), 'data', 'comments.db');

  mkdirSync(dirname(file), { recursive: true });

  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  migrate(d);

  instance = d;
  return d;
}
