'use client';

/**
 * 桌面端的「让位」容器：聊天面板展开时，把正文挤到左边，不再被面板压住。
 *
 * 【解决的问题】
 * 聊天面板是 fixed 贴在右侧的，展开后会盖住正文右半边。
 * 而正文本身是 max-w-3xl / max-w-5xl 居中，两侧本来就有一大片空白 —— 那片空白完全可以借用。
 *
 * 【做法】
 * 面板展开时给这一层加右侧内边距（面板 400px + 距右 16px + 16px 呼吸位 = 432px），
 * 里面的 mx-auto 居中就会在「剩下的宽度」里重新居中，正文整体左移，不再被遮挡。
 *
 * 【2026-10-06 重大修正：从「只在首页生效」改成「全站生效」】
 * 改前这个组件只包在 app/page.tsx 里，而且只在 lg(≥1024px) 生效。后果是：
 *   · /notes、/notes/[slug]、/projects 三页**根本没有让位**，面板直接盖住正文
 *     （站长截图反馈的「左边还有那么多空白，但文字被挡住了」就是这个）；
 *   · 640~1023px 这一段，即使在首页也照样被盖住。
 * 现在两件事一起改：
 *   ① 组件挪到 app/layout.tsx，包住 PageTransition —— **全站所有页面**自动生效，
 *      以后新增页面也不用记得再加一次（这才是「不管到哪都自动调整」）；
 *   ② 阈值从 lg 降到 **md(≥768px)**：768px 扣掉 432px 还剩 336px，
 *      刚好放得下 3xl 正文（768px）在窄屏下的收缩态，可读。
 *
 * 【为什么 768px 以下不让位，而是改由面板自己变形态】
 * 768px 以下扣掉 432px 后剩不到 336px，正文会挤成一条竖线，比遮挡更难读。
 * 所以这个区间不做让位，改由 DigitalTwinChat 让面板
 * **从右侧滑出改成贴底**（见那边的 md:/max-md: 分支），
 * 也就是「窄屏用底部抽屉、宽屏用侧边让位」——两种形态各自解决自己那段宽度的问题。
 * ⚠️ 两处的分界点必须**都是 md(768px)**：一个让位、一个换形态，
 * 分界点不一致会出现「让了位但面板还是抽屉」或反之的错配。
 *
 * 【过渡】只过渡 padding，不动 transform，避免整页文字在展开瞬间出现重排闪烁。
 * 【只加 padding-right 不加 padding-left】面板在右侧，让位只需腾出右边；
 * 左边照样留白，正文的「居中」在剩余空间里重新计算，视觉重心仍然是稳的。
 */

import type { ReactNode } from 'react';
import { useTwinChat } from '@/lib/twin-chat-context';

/** 面板 400 + 右边距 16 + 正文与面板之间的呼吸位 16 */
const PANEL_RESERVED_PX = 432;

export default function ChatInset({ children }: { children: ReactNode }) {
  const { open } = useTwinChat();

  return (
    <div
      /*
        md:pr-* 而不是 lg:pr-*：见文件头「2026-10-06 重大修正」第 ② 点。
        transition-[padding] 只动 padding，duration 与面板自己的滑入时长对齐，
        两边同时开始、同时结束，读起来是「一个动作」而不是「先挤开、再滑出」。
      */
      className={`transition-[padding] duration-300 ease-out ${open ? 'md:pr-[432px]' : ''}`}
      style={{ ['--chat-inset' as string]: `${PANEL_RESERVED_PX}px` }}
    >
      {children}
    </div>
  );
}
