/**
 * 顶栏控件的统一样式（2026-10-05 新增）。
 *
 * 【为什么抽成共享常量】顶栏右侧那一排控件分散在四个组件里
 * （`AuthMenu` / `LanguageToggle` / `theme-toggle` / `MusicPlayer`），
 * 之前每个组件各写一份自己的按钮类名 —— 值虽然接近，但写法重复，
 * 改一次要改四处，早晚会漂成「登录是方的、主题是圆的」。
 * 收敛到这里之后，顶栏控件只有一个外观来源。
 * （同一条思路见 globals.css 里的 `--dur-1/--dur-2/--dur-3`。）
 *
 * 【2026-10-05 改版：从「方框 + 边框」改成「圆形 + 极淡底色」】
 * 改前是 `rounded-lg border border-border bg-card` —— 一排小方块，
 * 站长原话是「干嘛用那么丑的框」。方框的问题在于：它把「控件」和「卡片」画成了一种东西，
 * 而顶栏这一排是**工具**不是内容，不该有卡片那样的实底和描边。
 * 现在：无边框、无描边，只靠一层极淡的底色成圆，悬停加深一档。
 *
 * 【底色为什么用 `bg-foreground/[0.06]` 而不是写死的灰】
 * `--foreground` 在亮色档是深色、暗色档是浅色 —— 同一行类名在两套主题下
 * 分别得到「浅灰圆」和「浅灰圆」，不需要写 `dark:` 分支。
 * 写死的灰必然在其中一套主题下偏色。
 *
 * 【尺寸】按钮 40px、图标 20px。40 是触控下限 44 的近似值，
 * 但这一排是鼠标优先的密集控件（手机上主要靠抽屉），
 * 40 能在 64px 的顶栏里留出呼吸；图标 20px 是「一眼认得出是什么」的下限 ——
 * 改前的 18px 在截图上确实偏小（站长反馈「有些内容显得太小」）。
 */

/** 顶栏图标统一尺寸（px）。四个控件的图标必须一样大 */
export const TOPBAR_ICON_SIZE = 20;

/** 圆形图标按钮：主题 / 语言 / 音乐 / 静音 */
export const TOPBAR_CONTROL =
  'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/75 transition-colors duration-200 hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** 胶囊按钮：登录 / 昵称。和圆形同一套底色，只是横向撑开装得下字 */
export const TOPBAR_PILL =
  'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3.5 text-[13px] font-semibold text-foreground/80 transition-colors duration-200 hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * 播放中那枚音乐按钮的额外装饰：一圈主导色描边。
 * 【为什么只给「正在播放」加环】顶栏这一排控件默认长得一样（这是对的，它们是同级工具），
 * 只有音乐有「状态」这件事 —— 用一圈环把「它在响」这件事报出来，
 * 其余控件没有状态，也就不需要任何高亮。
 */
export const TOPBAR_CONTROL_ACTIVE =
  'ring-2 ring-accent/70 ring-offset-2 ring-offset-background';
