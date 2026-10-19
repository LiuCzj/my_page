/** 认证相关的所有有效期常量，集中在这一处。 */

/** 邮箱验证码（注册 / 注销）的有效期：10 分钟。 */
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;

/** 找回密码 token 的有效期：1 小时。 */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** 邮箱验证**链接**的有效期：24 小时。 */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** 邮箱验证码有效期的分钟数（邮件正文与界面文案要写给人看，避免文案与常量各写一遍） */
export const EMAIL_CODE_TTL_MINUTES = EMAIL_CODE_TTL_MS / 60_000;

/** 重置链接有效期的小时数（同上：给文案用，别在字典里硬写「1」） */
export const RESET_TTL_HOURS = RESET_TTL_MS / 3_600_000;
