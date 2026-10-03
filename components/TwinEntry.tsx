'use client';

/**
 * 数字分身的常驻入口：右下角一颗浮动的 Q 版头像。
 *
 * 【为什么从首屏搬到这里】
 * 原来那个挥手角色孤零零挂在首屏最底下（终端卡之后），问题有三个：
 *   1. 它是首屏的第五个元素，前四个（头像 / 名字 / 一句话 / 终端卡）已经讲完了
 *      「我是谁」，它再出来只是多一个动作，读起来像吉祥物贴纸，不像入口；
 *   2. 只有滚回页面顶部才能点它 —— 读到笔记区想提问，得先滚回去；
 *   3. 它占了 208px 高，把首屏拉长了一截。
 * 搬到右下角之后：首屏干净了，入口反而**更**显眼（滚动时一直在视野里）。
 *
 * 【为什么在右下角，而不是左下角】
 * 左下角已经有一颗快捷键提示按钮（components/ShortcutLayer.tsx 的「?」）。
 * 更关键的是：桌面端的聊天面板本身就从**右侧**滑出（sm:right-4 sm:bottom-4，400px 宽），
 * 入口和面板同侧、同角，点下去面板从按钮的位置长出来，方向和位置都对得上。
 *
 * 【面板打开时整颗按钮让位（返回 null）】
 * 桌面端面板正好占着右下角，按钮留着会被压在下面（面板 z-80 > 按钮 z-70），
 * 露出一角反而像没关干净。面板自己有关闭按钮（×）和 Esc，不需要这颗按钮再充当开关。
 *
 * 【为什么用 Q 版角色图而不是一个通用聊天图标】
 * 这个站的核心特色就是「有一个数字分身」——用人物形象，访客一眼知道点开的是「人」
 * 而不是又一个客服弹窗。图是 public/images/mascot-q.png（首屏原来那张，512×512 透明 PNG），
 * 这里缩到 48px 显示；它本来就要为首屏加载，搬到这里没有增加任何请求。
 */

import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

/**
 * 右下角常驻的数字分身入口按钮。
 *
 * @returns 一颗固定悬浮的头像按钮；聊天面板已打开时返回 null（让位给面板）
 */
export default function TwinEntry() {
  const { d } = useI18n();
  /** open 决定要不要让位；openChat 是打开动作（顶栏、页脚用的是同一个 Context） */
  const { open, openChat } = useTwinChat();

  // 面板占了右下角，按钮让位。不写动画 —— 让位是瞬间的，渐变反而会跟面板的滑入打架
  if (open) return null;

  return (
    <button
      type="button"
      onClick={openChat}
      // 复用首屏那套文案（「数字分身聊天窗开关」），读屏与顶栏、页脚三处口径一致
      aria-label={d.hero.robotAria}
      aria-haspopup="dialog"
      /*
        定位与层级：
        · fixed bottom-4 right-4 —— 桌面端正好落在聊天面板将来展开的位置
        · z-[70] —— 低于聊天面板（z-80）、高于顶栏（z-50）；面板一开它就让位，不会真的被压住
        · size-14（56px）—— 比全站 44px 触控下限再大一档，它是首屏之外唯一的常驻入口
        · 底部留 16px：手机上有底部安全区（iPhone 的横条），贴太紧会被系统手势盖住
      */
      className="fixed right-4 bottom-4 z-[70] flex size-14 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-lg transition-[transform,border-color] duration-200 hover:scale-105 hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      {/* alt 留空 + aria-hidden：按钮本身已有 aria-label，图再报一遍名字就是重复 */}
      <img
        src="/images/mascot-q.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-12 select-none object-contain"
      />
    </button>
  );
}
