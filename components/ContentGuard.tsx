'use client';

/** 内容保护：非管理员不能选中 / 复制笔记与项目正文。 */

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

interface ContentGuardProps {
  /** 由服务端 canEdit 取反传入 */
  enabled: boolean;
}

export default function ContentGuard({ enabled }: ContentGuardProps) {
  const { d } = useI18n();

  useEffect(() => {
    if (!enabled) return;

    /** 事件目标是否落在 [data-protect] 容器内 */
    const inProtected = (target: EventTarget | null): boolean => {
      let el = target instanceof Element ? target : null;
      while (el) {
        if (el.hasAttribute('data-protect')) return true;
        el = el.parentElement;
      }
      return false;
    };

    /** 复制：先拦默认行为，再写一行出处。clipboardData 只在 copy 回调里可写 */
    const onCopy = (e: ClipboardEvent) => {
      if (!inProtected(e.target)) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', `${d.guard.copyNotice}${window.location.href}`);
    };

    const onCut = (e: ClipboardEvent) => {
      if (inProtected(e.target)) e.preventDefault();
    };

    /** 拖拽也是绕过复制的一条路 */
    const onDragStart = (e: DragEvent) => {
      if (inProtected(e.target)) e.preventDefault();
    };

    // 捕获阶段：保证先于内容区自己的处理器执行
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('dragstart', onDragStart, true);
    return () => {
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('dragstart', onDragStart, true);
    };
  }, [enabled, d]);

  return null;
}
