/** 邮件发送：验证码邮件（注册 / 注销）、重置密码邮件，以及遗留的验证链接邮件。 */

import nodemailer, { type Transporter } from 'nodemailer';
import { EMAIL_CODE_TTL_MINUTES } from './auth-ttl';

/** 模块级缓存：transporter 内部维持连接池，每次重建会浪费握手开销 */
let cached: Transporter | null = null;

/** SMTP 是否已配置齐全 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER);
}

/**
 * 取 transporter（未配置时返回 null）。
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
      body: '请点下面的按钮确认邮箱，之后就能在笔记下面留言了。',
      button: '确认邮箱',
      footer: '如果不是你本人操作，忽略这封邮件即可。',
    }),
  });

  return true;
}

/** 邮件模板的可变文案（验证信与重置信共用同一套骨架） */
interface MailCopy {
  body: string;
  button: string;
  footer: string;
}

/**
 * 邮件正文（HTML）。
 * @param displayName 称呼
 * @param actionUrl 按钮指向的链接
 * @param copy 各处文案
 * @returns 邮件 HTML
 */
function renderHtml(displayName: string, actionUrl: string, copy: MailCopy): string {
  const { body, button, footer } = copy;
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
      body: '有人请求重置这个邮箱在锦创AI的登录密码。点下面的按钮设置新密码，链接 1 小时内有效。',
      button: '设置新密码',
      footer: '如果不是你本人操作，忽略这封邮件即可 —— 你的密码不会被改动。',
    }),
  });

  return true;
}

/**
 * 发「验证码」邮件（注册 / 注销）。
 * @param to 收件邮箱
 * @param code 6 位验证码（明文）
 * @param purpose 用途：register（注册）/ delete（注销）
 * @param displayName 称呼（注销时是已登录用户的昵称，注册时还没有昵称）
 * @returns 发送成功返回 true；SMTP 未配置返回 false；发送异常抛出
 * @throws 邮件服务连不上或认证失败时抛出
 */
export async function sendCodeEmail(
  to: string,
  code: string,
  purpose: 'register' | 'delete',
  displayName = '',
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const isDelete = purpose === 'delete';
  const who = displayName ? `${displayName}，你好：` : '你好：';
  /* 有效期分钟数从 lib/auth-ttl.ts 推导，不在文案里硬写「10」。 */
  const codeMinutes = EMAIL_CODE_TTL_MINUTES;

  const action = isDelete ? '注销账号' : '注册账号';
  const bodyText = isDelete
    ? '有人请求注销这个邮箱在锦创AI的账号。注销会**永久删除**你的账号和全部评论，无法恢复。'
    : '请把下面的验证码填回注册页面，完成注册。';
  const footer = isDelete
    ? '如果不是你本人操作，请立刻忽略这封邮件，并考虑修改密码 —— 你的账号不会被注销。'
    : '如果不是你本人操作，忽略这封邮件即可，不会有任何影响。';

  await transporter.sendMail({
    from: `"锦创AI" <${from}>`,
    to,
    subject: `${code} 是你的${action}验证码 · 锦创AI`,
    text: `${who}\n\n${bodyText}\n\n验证码：${code}\n\n${codeMinutes} 分钟内有效。\n\n${footer}\n\n—— 锦创AI`,
    html: renderCodeHtml(code, {
      who,
      heading: `${action}验证码`,
      body: bodyText.replace(/\*\*/g, ''),
      footer,
      minutes: codeMinutes,
    }),
  });

  return true;
}

/**
 * 验证码邮件的 HTML。
 * @param code 验证码
 * @param copy 文案（`minutes` 为有效期分钟数，由 lib/auth-ttl.ts 推导，勿在模板里写死）
 * @returns 邮件 HTML
 */
function renderCodeHtml(
  code: string,
  copy: { who: string; heading: string; body: string; footer: string; minutes: number },
): string {
  const { who, heading, body, footer, minutes } = copy;
  return `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f4f6;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:28px 28px 8px;">
      <div style="font-size:15px;font-weight:600;color:#26215c;">锦创AI</div>
    </td></tr>
    <tr><td style="padding:8px 28px 0;">
      <p style="margin:0 0 14px;font-size:15px;color:#2c2c2a;">${escapeHtml(who)}</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#5f5e5a;">${escapeHtml(body)}</p>
    </td></tr>
    <tr><td style="padding:0 28px 20px;">
      <div style="background:#f4f2fb;border:1px solid #ddd8f2;border-radius:10px;padding:18px;text-align:center;">
        <div style="font-size:12px;color:#888780;margin-bottom:8px;">${escapeHtml(heading)}</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#534ab7;">${escapeHtml(code)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:0 28px 24px;">
      <p style="margin:0;font-size:12px;line-height:1.7;color:#888780;">验证码 ${minutes} 分钟内有效，请勿转发给他人。</p>
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid #eceae4;">
      <p style="margin:0;font-size:12px;line-height:1.7;color:#888780;">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * HTML 转义。
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
