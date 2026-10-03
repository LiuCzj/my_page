/**
 * 邮箱准入检查：把一次性（临时）邮箱挡在注册之外。
 *
 * 【三道防线，为什么都要】
 * 1. 域名黑名单 —— 挡已知的临时邮箱服务，命中即拒绝。快，但列不全（新服务不断冒出来）。
 * 2. MX 记录检查 —— 确认这个域名真的能收信。某些随便编的域名会被挡掉。
 *    注意：临时邮箱服务大多**有** MX 记录，所以这一条挡不住它们，它挡的是「瞎编的域名」。
 * 3. 验证邮件（lib/mailer.ts 负责）—— 关键防线。注册后必须点邮件里的链接才算激活，
 *    临时邮箱收不到（或没人去收），账号就永远停在未激活状态，发不了评论。
 *
 * 【关于黑名单的完整性（2026-10-03 的教训）】
 * 最初这里手写了约 130 个常见域名，结果用户拿 `necub.com` 一试就漏了 ——
 * 那是个真实存在的一次性邮箱域名，只是不在手写名单里。
 * 现在换成公开仓库的完整清单（9203 条，见 lib/disposable-domains.ts），
 * 但**这依然不可能穷尽**：新域名每天都在出现。
 * 所以黑名单的价值是「拦掉绝大多数随手一试」，最终把关的永远是第 3 条（邮件验证）。
 * 单靠黑名单做不到「绝不出现临时邮箱」，这也是为什么流程里必须有邮件验证。
 */

import { resolveMx } from 'node:dns/promises';
import { DISPOSABLE_DOMAINS_RAW } from './disposable-domains';

/**
 * 一次性邮箱域名集合。
 *
 * 数据来自 lib/disposable-domains.ts（公开清单，9203 条），
 * 再叠加环境变量 DISPOSABLE_EMAIL_DOMAINS 里的追加项 ——
 * 遇到清单没收录的新服务，不用改代码，加个环境变量就能补上。
 *
 * 用 Set 而不是数组：判定时是 O(1) 查找；数组要扫九千条，每次注册都白烧一次。
 */
const DISPOSABLE_DOMAINS: Set<string> = new Set([
  ...DISPOSABLE_DOMAINS_RAW.split('\n').filter(Boolean),
  ...(process.env.DISPOSABLE_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
]);

/**
 * 取出邮箱的域名部分并规范化。
 *
 * 用 lastIndexOf('@') 而不是 split('@')[1]：虽然规范上 @ 不该出现在本地部分，
 * 但现实中确实存在带引号的本地部分（"a@b"@example.com）。
 * 从最后一个 @ 切开更接近「真正的域名在哪」。
 *
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
 *
 * 【子域名怎么处理】`xxx.mailinator.com` 同样是一次性邮箱，所以不能只做精确匹配。
 * 但**不能**拿九千条黑名单逐个 endsWith —— 那是九千次字符串比较，每次注册都跑一遍太浪费。
 * 改成反过来：把待查域名按点逐级拆短，最多查三四次 Set。
 *   例：a.b.mailinator.com → 依次查 "a.b.mailinator.com" / "b.mailinator.com"
 *                            / "mailinator.com" / "com"
 * 任何一级命中即拒绝。
 *
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
 *
 * 刻意不做严格的 RFC 正则 —— 那类正则长且容易误伤正常邮箱
 * （真实存在的邮箱里有一堆 RFC 允许但看起来奇怪的形式）。
 * 这里只挡明显不成立的：没有 @、域名没有点、含空格、标签首尾是连字符或点。
 *
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
 *
 * 【为什么查询失败时返回 true（放行）】
 * DNS 是网络调用，会超时、会被防火墙挡、会在容器里解析失败。
 * 如果失败就拒绝，那么在服务器 DNS 出问题的那段时间里，**所有正常用户都注册不了** ——
 * 这个代价比「放进来一个瞎编的域名」大得多。而且瞎编的域名最终会被邮件验证挡住
 * （发不出去就是发不出去），所以这里放行是安全的。
 *
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
