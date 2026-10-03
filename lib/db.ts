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
 *   comments   —— 评论。note_slug 直接存笔记文件名，不建外键到文件系统
 *                 （笔记是 .mdx 文件，不是数据库记录，没有可引用的主键）。
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
