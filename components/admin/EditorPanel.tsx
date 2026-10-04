'use client';

/**
 * 浮层外壳：遮罩 + 面板 + 标题 + 关闭。全站的弹层（登录、笔记/项目编辑器）都用它。
 *
 * 【为什么必须用 Portal 渲染到 document.body】
 * 这不是洁癖，是一个真实踩过的 bug：登录面板原来直接渲染在顶栏组件里，
 * 而顶栏是 `sticky z-50 backdrop-blur-md` ——
 *   · `backdrop-filter` 会让元素成为 `position: fixed` 后代的**包含块**，
 *     于是面板的 `fixed inset-0` 不再相对视口，而是被塞进顶栏那条 56px 高的横条里；
 *   · `z-50` 又让顶栏自成层叠上下文，面板里写的 `z-[120]` 只在那一层内有效，
 *     跑不到页面内容之上。
 * 结果是：点「登录」，面板出现在网页**后面**（用户报的「巨大 bug」）。
 * 挂到 body 上就一次性绕开这两个坑，也顺带让浮层不受任何祖先的 overflow/transform 影响。
 *
 * 【Esc 关闭】键盘用户不必去找关闭按钮。遮罩点击也关 —— 这是弹层的通用预期。
 *
 * 【移动端】内边距在窄屏收到 p-3、面板宽度走 w-full，配合 max-h 与自身滚动，
 * 手机上不会顶出屏幕；关闭按钮 36px、底部按钮 40px，都够手指点。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function EditorPanel({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 底部操作条（保存 / 取消） */
  footer: React.ReactNode;
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

  const panel = (
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
          <button
            type="button"
            onClick={onClose}
            aria-label={d.admin.cancel}
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={16} aria-hidden="true" />
          </button>
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
