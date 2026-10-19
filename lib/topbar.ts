/** 顶栏控件的统一样式。 */

/** 顶栏图标统一尺寸（px）。四个控件的图标 + 联系方式图标必须一样大 */
export const TOPBAR_ICON_SIZE = 22;

/** 联系方式图标尺寸。 */
export const TOPBAR_SOCIAL_ICON_SIZE = 22;

/** 音量浮层（点音量按钮弹出的滑块）的宽度与定位微调量。 */
export const TOPBAR_POPOVER_WIDTH = 260;

/** 圆形图标按钮：主题 / 语言 / 音乐 / 静音 */
export const TOPBAR_CONTROL =
  'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/75 transition-colors duration-200 hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** 胶囊按钮：登录 / 昵称。和圆形同一套底色，只是横向撑开装得下字 */
export const TOPBAR_PILL =
  'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3.5 text-[13px] font-semibold text-foreground/80 transition-colors duration-200 hover:bg-foreground/[0.12] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** 播放中那枚音乐按钮的额外装饰：一圈主导色描边。 */
export const TOPBAR_CONTROL_ACTIVE =
  'ring-2 ring-accent/70 ring-offset-2 ring-offset-background';
