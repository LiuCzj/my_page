/**
 * 邮件发送：注册后的验证邮件。
 *
 * 【它是「挡临时邮箱」这条链上的关键一环】
 * 域名黑名单只能挡已知的那些，MX 检查只能挡瞎编的域名 —— 临时邮箱服务大多两者都能通过。
 * 真正让临时邮箱失效的是这一步：注册后必须点开邮件里的链接才算激活，
 * 而临时邮箱要么根本收不到（发信被拒），要么用户不会去点（那邮箱十分钟后就没了）。
 *
 * 【为什么 SMTP 没配就拒绝注册，而不是静默放行】
 * 如果 SMTP 没配却允许注册，用户会得到一个「注册成功但永远收不到验证邮件」的账号 ——
 * 卡死在中间态，既不能评论、也不知道问题在哪。宁可当场报错说清楚：
 * 「服务端还没配置邮件服务」。运维一眼就知道要补 .env。
 *
 * 【环境变量】
 *   SMTP_HOST   例如 smtp.qq.com
 *   SMTP_PORT   465（SSL）或 587（STARTTLS）
 *   SMTP_USER   登录用户名（通常是完整邮箱）
 *   SMTP_PASS   授权码 / 应用专用密码（**不是**邮箱登录密码）
 *   SMTP_FROM   发件人显示地址，不填则用 SMTP_USER
 *   SITE_URL    站点根地址，用来拼验证链接，例如 https://www.jinc.de5.net
 */

import nodemailer, { type Transporter } from 'nodemailer';

/** 模块级缓存：transporter 内部维持连接池，每次重建会浪费握手开销 */
let cached: Transporter | null = null;

/** SMTP 是否已配置齐全 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER);
}

/**
 * 取 transporter（未配置时返回 null）。
 *
 * @returns nodemailer 的 transporter，或 null 表示环境变量不全
 */
function getTransporter(): Transporter | null {
  if (cached) return cached;
  if (!isMailConfigured()) return null;

  const port = Number(process.env.SMTP_PORT);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 是隐式 SSL；587 用 STARTTLS（先明文再升级）。按端口自动选，少一个要配的开关
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

/**
 * 拼验证链接。
 *
 * 优先用环境变量 SITE_URL；没配时退回请求头里的 host（由调用方传入），
 * 这样本地开发不配 SITE_URL 也能点开链接。
 *
 * @param fallbackOrigin 兜底的站点根地址（形如 https://example.com）
 * @param token 验证 token
 * @returns 完整的验证链接
 */
export function buildVerifyUrl(fallbackOrigin: string, token: string): string {
  const base = (process.env.SITE_URL || fallbackOrigin).replace(/\/+$/, '');
  return `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

/**
 * 发验证邮件。
 *
 * @param to 收件邮箱
 * @param verifyUrl 验证链接
 * @param displayName 收件人昵称（用于称呼）
 * @returns 发送成功返回 true；SMTP 未配置返回 false；发送异常抛出
 * @throws 邮件服务连不上或认证失败时抛出，由调用方转成可读错误
 */
export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  displayName: string,
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';

  await transporter.sendMail({
    from: `"锦创AI" <${from}>`,
    to,
    subject: '确认你的邮箱 · 锦创AI',
    // 纯文本兜底：部分客户端（或用户设置）不渲染 HTML，没有这一份会看到空白
    text: `${displayName}，你好：\n\n请点开下面的链接确认邮箱，之后就能在笔记下留言了：\n\n${verifyUrl}\n\n如果不是你本人操作，忽略这封邮件即可。\n\n—— 锦创AI`,
    html: renderHtml(displayName, verifyUrl, {
      heading: '确认邮箱',
      body: '请点下面的按钮确认邮箱，之后就能在笔记下面留言了。',
      button: '确认邮箱',
      footer: '如果不是你本人操作，忽略这封邮件即可。',
    }),
  });

  return true;
}

/** 邮件模板的可变文案（验证信与重置信共用同一套骨架） */
interface MailCopy {
  heading: string;
  body: string;
  button: string;
  footer: string;
}

/**
 * 邮件正文（HTML）。
 *
 * 【为什么用表格布局和行内样式】邮件客户端的 CSS 支持极不统一，
 * Outlook 至今不认 flex/grid，Gmail 会剥掉 <style> 里的部分规则。
 * 表格 + 行内样式是最笨但最稳的写法 —— 在邮件里，稳比优雅重要。
 *
 * 【为什么是浅底】这里不能跟站点的深色主题。多数客户端在深色模式下
 * 会把浅底邮件反色处理，而自己写深底的邮件会被它们再处理一次，结果常常是黑底黑字。
 * 浅底 + 深字是唯一在两种模式下都安全的组合。
 *
 * 【为什么文案走参数】验证信和重置信用同一套骨架（同样的间距、按钮、兜底链接），
 * 只有几处文字不同。复制一份 HTML 意味着以后改样式要改两处，早晚会不一致。
 *
 * @param displayName 称呼
 * @param actionUrl 按钮指向的链接
 * @param copy 各处文案
 * @returns 邮件 HTML
 */
function renderHtml(displayName: string, actionUrl: string, copy: MailCopy): string {
  const { heading, body, button, footer } = copy;
  return `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f4f6;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 28px 8px;">
      <div style="font-size:15px;font-weight:600;color:#26215c;">锦创AI</div>
    </td></tr>
    <tr><td style="padding:8px 28px 0;">
      <p style="margin:0 0 14px;font-size:15px;color:#2c2c2a;">${escapeHtml(displayName)}，你好：</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#5f5e5a;">
        ${escapeHtml(body)}
      </p>
    </td></tr>
    <tr><td style="padding:0 28px 24px;">
      <a href="${actionUrl}" style="display:inline-block;padding:11px 22px;background:#534ab7;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(button)}</a>
    </td></tr>
    <tr><td style="padding:0 28px 26px;">
      <p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#888780;">
        按钮点不开的话，把下面这个链接复制到浏览器打开：
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#534ab7;word-break:break-all;">${actionUrl}</p>
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid #eceae4;">
      <p style="margin:0;font-size:12px;color:#888780;">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * 拼重置密码链接。
 *
 * @param fallbackOrigin 兜底的站点根地址
 * @param token 重置 token
 * @returns 完整链接
 */
export function buildResetUrl(fallbackOrigin: string, token: string): string {
  const base = (process.env.SITE_URL || fallbackOrigin).replace(/\/+$/, '');
  return `${base}/?reset=${encodeURIComponent(token)}`;
}

/**
 * 发重置密码邮件。
 *
 * 【为什么要单独一封、而不是复用验证邮件】
 * 两件事的语义完全不同：验证是「证明这个邮箱是你的」，重置是「有人要改你的密码」。
 * 混在一起会让用户收到「确认你的邮箱」却发现自己密码被改了，非常吓人。
 * 分开写也让重置邮件能明确提示「如果不是你本人操作，请忽略」。
 *
 * @param to 收件邮箱
 * @param resetUrl 重置链接
 * @param displayName 称呼
 * @returns 发送成功返回 true；SMTP 未配置返回 false；发送异常抛出
 * @throws 邮件服务连不上或认证失败时抛出
 */
export async function sendResetEmail(
  to: string,
  resetUrl: string,
  displayName: string,
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';

  await transporter.sendMail({
    from: `"锦创AI" <${from}>`,
    to,
    subject: '重置你的密码 · 锦创AI',
    text: `${displayName}，你好：\n\n有人请求重置这个邮箱在锦创AI的登录密码。\n点开下面的链接设置新密码（1 小时内有效）：\n\n${resetUrl}\n\n如果不是你本人操作，忽略这封邮件即可 —— 你的密码不会被改动。\n\n—— 锦创AI`,
    html: renderHtml(displayName, resetUrl, {
      heading: '重置密码',
      body: '有人请求重置这个邮箱在锦创AI的登录密码。点下面的按钮设置新密码，链接 1 小时内有效。',
      button: '设置新密码',
      footer: '如果不是你本人操作，忽略这封邮件即可 —— 你的密码不会被改动。',
    }),
  });

  return true;
}

/**
 * HTML 转义。
 *
 * 昵称是用户自己填的，会出现在邮件里。不转义的话，一个叫
 * `<img src=x onerror=...>` 的用户就能往别人的邮件里塞脚本。
 *
 * @param s 原始字符串
 * @returns 转义后的字符串
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
