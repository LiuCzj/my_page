/** 邮箱准入检查：把一次性（临时）邮箱挡在注册之外。 */

import { resolveMx } from 'node:dns/promises';
import { DISPOSABLE_DOMAINS_RAW } from './disposable-domains';

/** 一次性邮箱域名集合。 */
const DISPOSABLE_DOMAINS: Set<string> = new Set([
  ...DISPOSABLE_DOMAINS_RAW.split('\n').filter(Boolean),
  ...(process.env.DISPOSABLE_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
]);

/**
 * 取出邮箱的域名部分并规范化。
 * @param email 完整邮箱地址
 * @returns 小写域名；解析不出域名时返回 null
 */
function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  // 去掉结尾的点（"a@b.com." 这种），否则黑名单匹配会漏
  return domain.replace(/\.$/, '') || null;
}

/**
 * 判断邮箱是否为一次性邮箱。
 * @param email 待检查的邮箱
 * @returns true 表示应拒绝注册
 */
export function isDisposableEmail(email: string): boolean {
  const domain = domainOf(email);
  if (!domain) return true;

  let candidate = domain;
  for (;;) {
    if (DISPOSABLE_DOMAINS.has(candidate)) return true;

    const dot = candidate.indexOf('.');
    // 没有下一个点了，说明已经查到最后一级，结束
    if (dot < 0) return false;
    candidate = candidate.slice(dot + 1);
  }
}

/**
 * 基本格式校验。
 * @param email 待检查的邮箱
 * @returns 格式是否可接受
 */
export function isEmailShapeOk(email: string): boolean {
  const value = email.trim();
  if (value.length < 6 || value.length > 254) return false;
  if (/\s/.test(value)) return false;

  const domain = domainOf(value);
  if (!domain) return false;
  // 域名必须有点（不接受 localhost 这类无点域名）
  if (!domain.includes('.')) return false;
  // 标签不能以点或连字符开头/结尾（"a@-b.com" / "a@b-.com" 都是无效域名）
  if (/(^|\.)-|-($|\.)/.test(domain)) return false;
  if (/(^|\.)\.|\.($|\.)/.test(domain)) return false;
  // 顶级域至少两位字母（挡掉 "a@b.c" 这类）
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (!/^[a-z]{2,}$/.test(tld)) return false;

  return true;
}

/**
 * 查询域名是否有 MX 记录（即能不能收信）。
 * @param email 待检查的邮箱
 * @returns true 表示域名可收信（或无法判断，按可收信处理）
 */
export async function canReceiveMail(email: string): Promise<boolean> {
  const domain = domainOf(email);
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return true;
  }
}
