/**
 * 邮箱验证码：注册与注销共用同一套。
 *
 * 【为什么从「点邮件里的链接」改成「填 6 位码」】
 * 用户要求流程和常见网站一致：注册要收验证码、注销也要收验证码。
 * 对用户来说码比链接顺手（不用切浏览器标签）；对我们来说，码还多了一个好处 ——
 * 它是**限次**的，而链接只要泄漏就一直能用。
 *
 * 【为什么存哈希不存明文】和 session token 同一个道理：库万一泄漏，
 * 拿到哈希也反推不出还能用的码。
 *
 * 【为什么要限尝试次数】6 位数字只有 100 万种，不限制的话脚本能刷穿。
 * 超过 MAX_ATTEMPTS 次直接作废，必须重新发码 —— 重发有独立的限流（见 send-code 路由）。
 *
 * 【为什么主键是 (email, purpose)】同一个邮箱在同一个用途下只保留**一个**有效码：
 * 重发就覆盖旧的，不会留下一堆还能用的历史码。purpose 分开是为了让
 * 「注册用的码」不能拿去注销账号（两件事的风险等级完全不同）。
 */

import { createHash, randomInt } from 'node:crypto';
import { getDb } from './db';

/** 验证码用途：注册 / 注销 */
export type CodePurpose = 'register' | 'delete';

/** 有效期：10 分钟。够用户切到邮箱抄码，又不至于留着大半天 */
const TTL_MS = 10 * 60 * 1000;
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
 *
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
    .run(email, purpose, hashCode(code), now + TTL_MS, now);

  return code;
}

/**
 * 校验验证码。
 *
 * 【为什么失败要分三种】前端提示不一样：「过期了」要重新发，「错了」要重新输，
 * 「试太多次」要重新发 —— 混成一句「验证码不对」会让用户反复输同一个码。
 *
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
 *
 * 【为什么用完要删】同一枚码不该能用第二次 —— 尤其注销这种不可逆操作。
 *
 * @param email 邮箱
 * @param purpose 用途
 */
export function consumeCode(email: string, purpose: CodePurpose): void {
  getDb().prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
}
