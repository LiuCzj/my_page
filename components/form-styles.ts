/**
 * 认证表单的共享样式（2026-10-05 新增）。
 *
 * 【为什么抽出来】`FIELD` / `LABEL` / `SEND_BTN` 原来在 `AuthPanel.tsx` 和
 * `DeleteAccountPanel.tsx` 里各写了一份，现在又多了个 `CaptchaField.tsx` 要用 ——
 * 三份手抄同样的类名，改一处就会漂（「注册的输入框是圆的、注销的是方的」这类 bug 就是这么来的）。
 * 收敛到这里之后，认证表单的控件只有一个外观来源。
 * （同一条思路见 `lib/topbar.ts` 收敛顶栏控件。）
 *
 * 【视觉口径】
 * - 输入框：白底 + 细边框 + 8px 圆角。表单里用边框是**对的**（和顶栏控件不同）——
 *   输入框需要明确告诉用户「这里可以打字」，边框就是这个边界；顶栏那一排是工具，才不需要边框。
 * - 焦点态走 `focus:border-ring`：只在获得焦点时把边框染成强调色，
 *   不用外发光，免得整张表单看起来在闪。
 * - `SEND_BTN` 的 min-h 是 44px：手机上它是紧挨输入框的主操作，得够手指点。
 */

/** 输入框 */
export const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';

/** 字段名 */
export const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

/** 字段下方的灰色说明文字 */
export const HINT = 'mt-1 text-xs leading-relaxed text-muted-foreground';

/** 次级按钮（发送验证码 / 换一张） */
export const SEND_BTN =
  'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent px-3 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50';
