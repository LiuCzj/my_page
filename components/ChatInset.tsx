'use client';

/**
 * 桌面端的「让位」容器。
 *
 * 【解决的问题】
 * 聊天面板是 fixed 贴在右侧的，展开后会盖住正文右半边。
 * 而正文本身是 max-w-3xl 居中，两侧本来就有一大片空白 —— 那片空白完全可以借用。
 *
 * 【做法】
 * 面板展开时给这一层加右侧内边距（面板 400px + 距右 16px + 16px 呼吸位 = 432px），
 * 里面的 mx-auto 居中就会在「剩下的宽度」里重新居中，正文整体左移，不再被遮挡。
 *
 * 【为什么只在 lg(≥1024px) 生效】
 * 640~1023 这段宽度里，扣掉 432px 只剩不到 300px 给正文，比遮挡更难读；
 * 所以那个区间仍然让面板作为浮层盖在上面（手机端同理，按你说的不动）。
 *
 * 【过渡】只过渡 padding，不动 transform，避免整页文字在展开瞬间出现重排闪烁。
 */

import type { ReactNode } from 'react';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function ChatInset({ children }: { children: ReactNode }) {
  const { open } = useTwinChat();

  return (
    <div
      className={`transition-[padding] duration-300 ease-out ${open ? 'lg:pr-[432px]' : ''}`}
    >
      {children}
    </div>
  );
}
