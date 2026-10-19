/** 认证表单的共享样式。 */

/** 输入框 */
export const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';

/** 字段名 */
export const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

/** 字段下方的灰色说明文字 */
export const HINT = 'mt-1 text-xs leading-relaxed text-muted-foreground';

/**
 * 次级按钮（发送验证码 / 换一张）。
 * 无边框胶囊 + 极淡 accent 底 —— 和 .btn-soft 同一套语言，只是把「底色」换成强调色，
 * 用来区分「这是表单里的次级动作，但它是这支表单的重点」。
 */
export const SEND_BTN =
  'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-accent/10 px-3.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-50';
