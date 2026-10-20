/** 数字分身的每日调用配额：访客按浏览器标识计次、同一 IP 兜底，登录用户按账号计次，管理员不限。 */

import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getCurrentUser, isAdmin } from './auth';
import { getDb } from './db';

/** 访客标识 cookie 名 */
const VISITOR_COOKIE = 'jc_twin_vid';
/** 访客标识有效期（天） */
const VISITOR_DAYS = 365;
/** 用量记录保留天数，超过即删 */
const KEEP_DAYS = 7;

/** 每日上限，可用环境变量覆盖。0 表示该类身份当天不能提问 */
function limits(): { guest: number; user: number; ip: number } {
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
  };
  return {
    guest: num(process.env.ASSISTANT_DAILY_GUEST, 1),
    user: num(process.env.ASSISTANT_DAILY_USER, 3),
    ip: num(process.env.ASSISTANT_IP_DAILY_MAX, 10),
  };
}

/**
 * 取用量记录用的日期键。
 * @param now 毫秒时间戳
 * @returns 北京时间的 YYYY-MM-DD（固定 +8 偏移，不依赖服务器时区）
 */
export function dayKey(now: number = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 上次清理的日期键：同一天只清一次 */
let lastSweep = '';

/**
 * 删掉保留期之外的用量记录。
 * @param day 当前日期键
 */
function sweep(day: string): void {
  if (lastSweep === day) return;
  lastSweep = day;
  getDb()
    .prepare('DELETE FROM assistant_usage WHERE day < ?')
    .run(dayKey(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000));
}

/**
 * 记一次用量。
 * @param subject 计数主体，形如 u:12 / g:<访客标识> / ip:1.2.3.4
 * @param limit 该主体当天上限
 * @returns 记完后的已用次数；已达上限返回 null（本次未记）
 */
function consume(subject: string, limit: number): number | null {
  if (limit <= 0) return null;

  const db = getDb();
  const day = dayKey();
  // WHERE 不满足时 UPSERT 不执行，changes 为 0 —— 这就是「超限」信号
  const info = db
    .prepare(
      `INSERT INTO assistant_usage (day, subject, used) VALUES (?, ?, 1)
       ON CONFLICT(day, subject) DO UPDATE SET used = used + 1 WHERE used < ?`,
    )
    .run(day, subject, limit);

  if (info.changes === 0) return null;

  const row = db
    .prepare('SELECT used FROM assistant_usage WHERE day = ? AND subject = ?')
    .get(day, subject) as { used: number } | undefined;
  return row?.used ?? 1;
}

/**
 * 读某主体当天已用次数，不写库。
 * @param subject 计数主体
 * @returns 已用次数，没有记录返回 0
 */
function usedOf(subject: string): number {
  const row = getDb()
    .prepare('SELECT used FROM assistant_usage WHERE day = ? AND subject = ?')
    .get(dayKey(), subject) as { used: number } | undefined;
  return row?.used ?? 0;
}

/** 是否走 HTTPS：与 lib/auth.ts 的 cookie Secure 判定同源 */
async function isHttps(): Promise<boolean> {
  const forced = process.env.COOKIE_SECURE;
  if (forced === '0' || forced === 'false') return false;
  if (forced === '1' || forced === 'true') return true;
  const proto = (await headers()).get('x-forwarded-proto') ?? '';
  return proto.split(',')[0].trim().toLowerCase() === 'https';
}

/**
 * 取访客标识，没有就新发一个。
 * @returns 长度 22 的 base64url 标识
 */
async function visitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;

  const id = randomBytes(16).toString('base64url');
  jar.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isHttps(),
    path: '/',
    maxAge: VISITOR_DAYS * 24 * 60 * 60,
  });
  return id;
}

/** 一次配额判定的结果 */
export interface QuotaState {
  /** 本次是否放行 */
  allowed: boolean;
  /** 该类身份的每日上限；null 表示不限 */
  limit: number | null;
  /** 今天已用次数（放行时含本次） */
  used: number;
  /** 判定身份，用于日志与前端提示 */
  kind: 'admin' | 'user' | 'guest';
}

/**
 * 判定并记一次调用配额。必须在真正请求模型之前调用；固定答案与安全拒答不应调用。
 * @param ip 客户端 IP，访客的兜底额度按它计
 * @returns 判定结果
 */
export async function takeQuota(ip: string): Promise<QuotaState> {
  const { guest, user, ip: ipMax } = limits();
  sweep(dayKey());

  const me = await getCurrentUser();
  if (me && isAdmin(me.email)) {
    return { allowed: true, limit: null, used: 0, kind: 'admin' };
  }

  if (me) {
    const used = consume(`u:${me.id}`, user);
    return { allowed: used !== null, limit: user, used: used ?? user, kind: 'user' };
  }

  // 访客：先查同一 IP 的兜底额度，避免清 cookie 后无限提问
  if (usedOf(`ip:${ip}`) >= ipMax) {
    return { allowed: false, limit: guest, used: guest, kind: 'guest' };
  }

  const vid = await visitorId();
  const used = consume(`g:${vid}`, guest);
  if (used === null) {
    return { allowed: false, limit: guest, used: guest, kind: 'guest' };
  }

  // 只在放行后记 IP，被拒的请求不占 IP 额度
  consume(`ip:${ip}`, ipMax);
  return { allowed: true, limit: guest, used, kind: 'guest' };
}
