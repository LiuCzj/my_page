/**
 * 认证层：密码哈希 + 会话管理。
 *
 * 【密码为什么用 scrypt 而不是 bcrypt】
 * bcrypt 要装原生模块（node-gyp 编译），而 scrypt 是 Node 内置的 `node:crypto` 里的，
 * 强度相当、零依赖。少一个原生依赖意味着服务器上少一处可能编译失败的地方。
 *
 * 【为什么不用 JWT】
 * JWT 是「服务端不存状态、靠签名自证」的方案，代价是**没法主动吊销** ——
 * 用户点登出，那个 token 在过期前依然有效。这里把会话存进数据库，
 * 登出就是删一行，立即失效。个人站点的量级，多一次查询换可撤销性，值。
 *
 * 【为什么 token 要存哈希】
 * 数据库万一泄漏，明文 token 等于所有人的登录态直接被人拿走。
 * 存 SHA-256 之后，拿到库也反推不出可用的 token（token 本身是 32 字节随机数，不可枚举）。
 */

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
  /** 找回密码用的 token（与注册验证分开，见 lib/db.ts 的说明） */
  reset_token: string | null;
  reset_sent_at: number | null;
  created_at: number;
}

/**
 * 判断某个邮箱是不是管理员。
 *
 * 【为什么用环境变量而不是数据库字段】
 * 这个仓库是 public 的。管理员邮箱写在 config/site.ts 里就等于公开告诉别人
 * 「用这个邮箱注册的账号权限更高」—— 攻击者可以专门盯着它。
 * 放环境变量（ADMIN_EMAILS，逗号分隔）就只存在于服务器上。
 *
 * 【为什么不建角色表】
 * 这个站只有一个管理员（站长本人）。加一张 roles 表、一套权限判断、一个后台界面，
 * 是为了一个永远只有一个成员的集合付出的复杂度。真要多人管理再迁移不迟。
 *
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
  /**
   * 是否管理员（由 ADMIN_EMAILS 判定）。
   * 带上它是为了让界面能显示「管理员」标记 —— 站长改完 ADMIN_EMAILS 后
   * 一眼就能确认权限到底生效没有（前提是**重启过服务**，见 .env.example 的说明）。
   * 它只是「自己看自己」的信息，不构成任何权限：真正的闸门在每个写接口里。
   */
  isAdmin: boolean;
}

/**
 * 把数据库行转成可以安全返回给浏览器的形状。
 *
 * 单独抽一个函数是为了防止「某个接口顺手 return 了整个 row」这类泄漏 ——
 * 只要所有出口都走这里，密码哈希就不会漏出去。
 *
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
 *
 * 把算法名写进字符串，是为了以后换算法时能识别旧格式并平滑迁移
 * （不然一堆无法区分的哈希，只能强制所有人改密码）。
 *
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
 *
 * 用 timingSafeEqual 而不是 `===`：字符串比较会在第一个不同的字符处提前返回，
 * 攻击者能通过测量响应时间逐位猜出哈希。定长比较把时间差抹平。
 *
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
 *
 * 【httpOnly】JS 读不到，XSS 也偷不走。
 * 【sameSite: lax】挡跨站 POST 伪造（CSRF）；用 lax 而不是 strict，是因为
 *   strict 下从外部链接点进来会丢登录态，体验太差。
 * 【secure】只在**真的是 HTTPS** 时才带。
 *
 *   踩过的坑（2026-10-04）：原来是 `NODE_ENV === 'production'`，
 *   而站长手机是用 `http://192.168.10.211:3000` 这种**局域网 HTTP** 访问的 ——
 *   Secure cookie 在 HTTP 下浏览器**根本不存**，表现是「登录完一刷新就掉」，
 *   连带服务端每次都判定未登录、管理员的编辑入口也不渲染。
 *   所以改成看**请求协议**（x-forwarded-proto），HTTP 环境自动不带 Secure。
 *   想强制就用 COOKIE_SECURE=0（关）/ 1（开）。
 *
 * @param userId 用户 id
 */
export async function createSession(userId: number): Promise<void> {
  const token = newSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  getDb()
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now, expiresAt);

  /**
   * 要不要给 cookie 加 Secure。
   * 优先级：显式开关 COOKIE_SECURE → 请求头 x-forwarded-proto。
   * 拿不到协议头时按「非 HTTPS」处理 —— 宁可 cookie 可用，也不要登录不上。
   */
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
 *
 * 顺带做两件清理：过期的会话行删掉；用户的验证状态一并读出来
 * （前端要靠它决定显示「可以评论」还是「请先验证邮箱」）。
 *
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

/**
 * 结束当前会话：删库里的行 + 清 cookie。
 */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
  }
  jar.delete(SESSION_COOKIE);
}
