/** 邮箱验证码：注册与注销共用同一套。 */

import { createHash, randomInt } from 'node:crypto';
import { getDb } from './db';
import { EMAIL_CODE_TTL_MS } from './auth-ttl';

/** 验证码用途：注册 / 注销 */
export type CodePurpose = 'register' | 'delete';

/** 同一枚码最多被试几次 */
const MAX_ATTEMPTS = 5;

/** 数据库里的行 */
interface CodeRow {
  email: string;
  purpose: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
}

/** 校验结果 */
export type VerifyResult = 'ok' | 'expired' | 'invalid' | 'too_many';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * 生成并保存一枚验证码（覆盖该邮箱在该用途下的旧码）。
 * @param email 邮箱（调用方需已归一化为小写）
 * @param purpose 用途
 * @returns 明文验证码 —— 只在这一刻存在，交给邮件发送，绝不入库
 */
export function issueCode(email: string, purpose: CodePurpose): string {
  // 6 位数字，允许前导零（所以是 padStart 而不是直接 String(randomInt(100000,999999))）
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();

  getDb()
    .prepare(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(email, purpose) DO UPDATE SET
         code_hash  = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts   = 0,
         created_at = excluded.created_at`,
    )
    .run(email, purpose, hashCode(code), now + EMAIL_CODE_TTL_MS, now);

  return code;
}

/**
 * 校验验证码。
 * @param email 邮箱
 * @param purpose 用途
 * @param code 用户填的码
 * @returns 校验结果
 */
export function verifyCode(email: string, purpose: CodePurpose, code: string): VerifyResult {
  const row = getDb()
    .prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?')
    .get(email, purpose) as CodeRow | undefined;

  if (!row) return 'invalid';
  if (row.expires_at <= Date.now()) return 'expired';
  if (row.attempts >= MAX_ATTEMPTS) return 'too_many';

  if (row.code_hash !== hashCode(code)) {
    // 记一次失败尝试。用 SQL 自增而不是「读出来 +1 写回去」，避免并发下丢计数
    getDb()
      .prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?')
      .run(email, purpose);
    return 'invalid';
  }

  return 'ok';
}

/**
 * 用掉一枚码（校验通过后调用）。
 * @param email 邮箱
 * @param purpose 用途
 */
export function consumeCode(email: string, purpose: CodePurpose): void {
  getDb().prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
}
