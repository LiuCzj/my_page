'use client';

/** 浮层外壳：遮罩 + 面板 + 标题 + 关闭。全站的弹层（登录、笔记/项目编辑器）都用它。 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function EditorPanel({
  title,
  onClose,
  children,
  footer,
  full = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 底部操作条（保存 / 取消） */
  footer: React.ReactNode;
  /** true = 铺满视口（写正文用），false = 居中浮层 */
  full?: boolean;
}) {
  const { d } = useI18n();
  /** SSR 阶段没有 document，挂载后才渲染 Portal */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // 打开期间锁住背景滚动，避免在浮层里滚动时把底下的页面一起带跑
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  const closeBtn = (
    <button type="button" onClick={onClose} aria-label={d.admin.cancel} className="btn-icon shrink-0">
      <X size={16} aria-hidden="true" />
    </button>
  );

  const panel = full ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex flex-col bg-background"
    >
      {/* 操作条放顶栏：底部不留 footer，正文才能一直铺到屏幕最下面 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 sm:px-6">
        <h2 className="shrink-0 text-base font-bold text-foreground">{title}</h2>
        <div className="ml-auto flex min-w-0 items-center gap-2">{footer}</div>
        {closeBtn}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {children}
      </div>
    </div>
  ) : (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-sm sm:p-6">
      {/* 遮罩层：点击关闭。放在面板之前、absolute 铺满，不挡面板自身的点击 */}
      <button
        type="button"
        aria-label={d.admin.cancel}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 my-2 w-full max-w-3xl rounded-xl border border-border bg-card text-card-foreground shadow-2xl sm:my-4"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          {closeBtn}
        </header>

        <div className="px-4 py-4 sm:px-5">{children}</div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          {footer}
        </footer>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
