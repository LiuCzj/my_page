'use client';

/** 桌面端的「让位」容器：聊天面板展开时，把正文挤到左边，不再被面板压住。 */

import type { ReactNode } from 'react';
import { useTwinChat } from '@/lib/twin-chat-context';

/** 面板 400 + 右边距 16 + 正文与面板之间的呼吸位 16 */
const PANEL_RESERVED_PX = 432;

export default function ChatInset({ children }: { children: ReactNode }) {
  const { open } = useTwinChat();

  return (
    <div
      /* md:pr-* 而不是 lg:pr-*：见文件头「重大修正」第 ② 点。 */
      className={`transition-[padding] duration-300 ease-out ${open ? 'md:pr-[432px]' : ''}`}
      style={{ ['--chat-inset' as string]: `${PANEL_RESERVED_PX}px` }}
    >
      {children}
    </div>
  );
}
