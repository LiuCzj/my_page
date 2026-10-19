/** 音频地址签名：HMAC-SHA256 + 过期时间。 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 签名有效期 */
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

/** 签发时刻按整小时取整。 */
const TOKEN_BUCKET_MS = 60 * 60 * 1000;

/** 未配置 AUDIO_SECRET 时的进程内兜底密钥 */
let ephemeralSecret: string | null = null;

function secret(): string {
  const configured = process.env.AUDIO_SECRET?.trim();
  if (configured) return configured;
  if (!ephemeralSecret) ephemeralSecret = randomBytes(32).toString('hex');
  return ephemeralSecret;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * @param now 当前毫秒时间戳，测试可注入
 * @param now 当前毫秒时间戳，测试可注入
 * @returns `有效期.签名`
 */
export function issueAudioToken(now: number = Date.now()): string {
  const bucket = Math.floor(now / TOKEN_BUCKET_MS) * TOKEN_BUCKET_MS;
  const exp = String(bucket + TOKEN_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

/** @returns 签名正确且未过期返回 true */
export function verifyAudioToken(token: string, now: number = Date.now()): boolean {
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;

  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= now) return false;

  // 定长比较，避免按位试探
  const given = Buffer.from(sig);
  const want = Buffer.from(sign(exp));
  return given.length === want.length && timingSafeEqual(given, want);
}
