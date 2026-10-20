/** 评论功能的 SQLite 数据层。 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { seedContent } from './seed';

/** 模块级单例连接 */
let instance: Database.Database | null = null;

/**
 * 给已有表补列（SQLite 没有 ALTER TABLE ... ADD COLUMN IF NOT EXISTS）。
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
 * 建表 + 迁移。全部用 IF NOT EXISTS / 补列判断，重复调用安全（每次启动都会跑）。
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

  // ── 找回密码用的 token ──
  // 与注册验证分开两个字段，而不是复用 verify_token：
  // 两者可能同时存在（注册后还没验证就去点找回密码），复用会让其中一个把另一个覆盖掉。
  ensureColumn(d, 'users', 'reset_token', 'TEXT');
  ensureColumn(d, 'users', 'reset_sent_at', 'INTEGER');

  /* ── 项目正文 ──
   * 老库补列，默认空串：空串 = 只有卡片、没有详情页（点卡片仍走外链）。 */
  ensureColumn(d, 'projects', 'body', "TEXT NOT NULL DEFAULT ''");

  // ── 评论回复 ──
  // 指向父评论。ON DELETE CASCADE 让「删掉父评论时子回复跟着消失」，
  // 否则会留下一堆没有上下文的孤儿回复。
  ensureColumn(d, 'comments', 'parent_id', 'INTEGER REFERENCES comments(id) ON DELETE CASCADE');

  /* 昵称唯一索引。 */
  try {
    d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(display_name COLLATE NOCASE)');
  } catch (err) {
    console.warn(
      '[db] 昵称唯一索引创建失败（库里可能已有重复昵称），本次跳过：',
      err instanceof Error ? err.message : err,
    );
  }

  /* ── 可在线编辑的内容 ────────────────────────────── */
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
      body       TEXT    NOT NULL DEFAULT '',
      url        TEXT    NOT NULL DEFAULT '',
      stack      TEXT    NOT NULL DEFAULT '[]',
      date       TEXT,
      featured   INTEGER NOT NULL DEFAULT 0,
      sort       INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    /* ── 技术栈分组 ──────────────────────────────── */
    CREATE TABLE IF NOT EXISTS skill_groups (
      id         TEXT    PRIMARY KEY,
      title_zh   TEXT    NOT NULL,
      title_en   TEXT    NOT NULL DEFAULT '',
      sections   TEXT    NOT NULL DEFAULT '[]',
      sort       INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    /* ── 邮箱验证码 ──────────────────────────────── */
    CREATE TABLE IF NOT EXISTS email_codes (
      email      TEXT    NOT NULL,
      purpose    TEXT    NOT NULL,
      code_hash  TEXT    NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (email, purpose)
    );

    /* ── 数字分身每日用量 ──────────────────────────
     * subject 形如 u:12（登录用户）/ g:<访客标识> / ip:1.2.3.4（访客兜底）
     * day 是北京时间的 YYYY-MM-DD，见 lib/assistant-quota.ts */
    CREATE TABLE IF NOT EXISTS assistant_usage (
      day     TEXT    NOT NULL,
      subject TEXT    NOT NULL,
      used    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, subject)
    );
  `);

  // 首次启动（两张表都还空着）时，把仓库里现有的静态内容灌进去，保证一篇不丢。
  seedContent(d);
}
/**
 * 取数据库连接（首次调用时打开并建表）。
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
