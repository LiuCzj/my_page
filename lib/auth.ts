/** 认证层：密码哈希 + 会话管理。 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getDb } from './db';

/** 会话 cookie 名 */
export const SESSION_COOKIE = 'jc_session';
/** 会话有效期（天）。到期需重新登录 */
const SESSION_DAYS = 30;

/** 数据库里的用户行 */
export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  email_verified: number;
  verify_token: string | null;
  verify_sent_at: number | null;
  /** 找回密码用的 token（与注册验证分开） */
  reset_token: string | null;
  reset_sent_at: number | null;
  created_at: number;
}

/**
 * 判断某个邮箱是不是管理员。
 * @param email 待检查的邮箱
 * @returns 是否具备管理员权限
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** 返回给前端的用户信息（**绝不包含** password_hash / verify_token） */
export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: number;
  /** 是否管理员（由 ADMIN_EMAILS 判定）。 */
  isAdmin: boolean;
}

/**
 * 把数据库行转成可以安全返回给浏览器的形状。
 * @param row 数据库行
 * @returns 只含公开字段的用户对象
 */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    isAdmin: isAdmin(row.email),
  };
}

/**
 * 生成密码哈希。格式：`scrypt$<salt hex>$<key hex>`。
 * @param password 明文密码
 * @returns 可直接入库的哈希串
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * 校验密码。
 * @param password 用户提交的明文
 * @param stored 库里的哈希串
 * @returns 是否匹配
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 生成一个新会话 token（明文只在这一刻存在，入库的是它的哈希） */
function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 会话 token 的存储形式 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * 为用户建立会话，并把 token 写进 httpOnly cookie。
 * @param userId 用户 id
 */
export async function createSession(userId: number): Promise<void> {
  const token = newSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  getDb()
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now, expiresAt);

  /** 要不要给 cookie 加 Secure。 */
  const forced = process.env.COOKIE_SECURE;
  const proto = (await headers()).get('x-forwarded-proto') ?? '';
  const secure =
    forced === '0' || forced === 'false'
      ? false
      : forced === '1' || forced === 'true'
        ? true
        : proto.split(',')[0].trim().toLowerCase() === 'https';

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/**
 * 取当前登录用户。
 * @returns 已登录返回用户对象，未登录返回 null
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as UserRow | undefined;

  if (!row) {
    // 会话不存在或已过期：顺手把过期行清掉，避免表无限增长
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    return null;
  }

  return toPublicUser(row);
}

/** 结束当前会话：删库里的行 + 清 cookie。 */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
  }
  jar.delete(SESSION_COOKIE);
}
