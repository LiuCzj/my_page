'use client';

/**
 * 联系方式弹窗：微信公众号二维码 / 联系邮箱 / 「尚未配置」提示，三种形态共用一个组件。
 *
 * 【为什么合成一个组件】
 * 顶栏和页脚都要放这五个入口。分开各写一遍浮层的话，无障碍行为就会不一致
 * （很容易漏掉 Esc 关闭和焦点管理，键盘用户和读屏用户根本关不掉）。
 * 合成一个组件后，两处调用的是同一份实现。
 *
 * 【无障碍要点（本组件的核心价值）】
 * 1. role="dialog" + aria-modal="true" + aria-labelledby 指向标题
 * 2. 打开时焦点移入「关闭」按钮；关闭后焦点还给触发它的图标（否则键盘用户会掉回页首）
 * 3. Esc 关闭；点击遮罩关闭；Tab 在弹窗内部循环（焦点圈禁），不会跑到弹窗背后的页面
 * 4. 打开期间锁 body 滚动，避免背景在手机上跟着滑
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';

/** 弹窗三种形态 */
export type ContactModalVariant = 'wechat' | 'email' | 'notice';

interface ContactModalProps {
  /** 是否可见。父组件用 state 控制，一次只允许开一个 */
  open: boolean;
  variant: ContactModalVariant;
  onClose: () => void;
}

/** 参与焦点圈禁的可聚焦元素选择器 */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ContactModal({ open, variant, onClose }: ContactModalProps) {
  const { d, fill } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  /** 记录打开弹窗前焦点在哪，关闭时还回去 */
  const openerRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');

  // 打开时记下触发元素（必须在 focus 之前取，因为 focus 之后 activeElement 就变了）
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  /** 关闭并把焦点还给触发它的图标 */
  const handleClose = useCallback(() => {
    onClose();
    openerRef.current?.focus?.();
  }, [onClose]);

  // Esc 关闭 + 焦点圈禁：监听 document 而不是 panel，
  // 因为点击遮罩时焦点可能还在 body 上，只监听 panel 会漏掉 Esc。
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // 循环：最后一个元素按 Tab 回到第一个，第一个按 Shift+Tab 回到最后一个
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // 锁背景滚动：手机上弹窗后面的页面不再跟着滑
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 初始焦点放进关闭按钮
    closeBtnRef.current?.focus();
    // 邮箱形态：自动全选，用户 Ctrl+C 就能走
    if (variant === 'email') emailInputRef.current?.select();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      setCopied('');
    };
  }, [open, variant, handleClose]);

  if (!open) return null;

  /**
   * 复制邮箱。
   * 先走标准 Clipboard API；它要求安全上下文（https 或 localhost），
   * 而你以后部署到 http 内网或用手机 IP 直接访问 dev 服务时会失败，
   * 所以保留 execCommand 兜底 —— 它已被标记 deprecated，因此只在主路径抛错时才用。
   */
  const copyEmail = async () => {
    const address = site.contact.email.address;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        throw new Error('clipboard unavailable');
      }
      setCopied('ok');
    } catch {
      const input = emailInputRef.current;
      let ok = false;
      if (input) {
        input.select();
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
      }
      setCopied(ok ? 'ok' : 'fail');
    }
  };

  const accountName = site.contact.wechat.accountName;
  /** 二维码路径：config 里留空表示站长还没上传自己的二维码 */
  const qrcode = site.contact.wechat.qrcode;
  const titles: Record<ContactModalVariant, string> = {
    wechat: d.contact.wechatTitle,
    email: d.contact.emailTitle,
    notice: d.contact.notConfiguredTitle,
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      // 点遮罩关闭：只在点到自己（而不是冒泡自面板）时触发。
      // 用 pointerdown 而不是 mousedown —— 触屏上 mousedown 要等整套
      // 「touchstart → touchend → 合成 mouse」走完才来，点一下要慢半拍才关，
      // 而且中途手指挪动一点就会被判定成滚动而根本不触发。
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* 半透明遮罩：bg-black/60 与主题无关，深色浅色的暗化效果都成立 */}
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="contact-modal-title" className="text-base font-bold">
            {titles[variant]}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label={d.contact.close}
          >
            <X size={18} />
          </button>
        </div>

        {variant === 'wechat' && (
          <div className="mt-4 flex flex-col items-center">
            {/*
              二维码路径由 config 提供，允许留空（换图或临时下架时不必改组件）。
              留空时显示提示文字，而不是让 <img> 破图挂在弹窗里。
            */}
            {qrcode ? (
              <img
                src={qrcode}
                alt={fill(d.contact.wechatHint, { account: accountName || site.identity.name })}
                width={180}
                height={180}
                loading="lazy"
                className="h-auto w-[180px] max-w-full rounded-xl border border-border bg-white p-2"
              />
            ) : (
              <div className="flex h-[180px] w-[180px] max-w-full items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 text-center text-xs text-muted-foreground">
                {d.contact.qrcodeMissing}
              </div>
            )}
            {/* 这句说明文字看的是「公众号名称填了没」，跟上面图片是否上传是两件事 */}
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {accountName
                ? fill(d.contact.wechatHint, { account: accountName })
                : d.contact.wechatHintFallback}
            </p>
          </div>
        )}

        {variant === 'email' && (
          <div className="mt-4">
            <div className="flex gap-2">
              <input
                ref={emailInputRef}
                type="text"
                readOnly
                value={site.contact.email.address}
                onFocus={(e) => e.target.select()}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                aria-label={d.contact.emailTitle}
              />
              <button
                type="button"
                onClick={copyEmail}
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-accent bg-accent/15 px-3 text-sm font-semibold text-accent transition hover:bg-accent/25"
              >
                {copied === 'ok' ? d.contact.copied : d.contact.copy}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {copied === 'fail' ? d.contact.copyFailed : d.contact.emailHint}
            </p>
            <a
              href={`mailto:${site.contact.email.address}`}
              className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {d.contact.openMail}
            </a>
          </div>
        )}

        {variant === 'notice' && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">{d.contact.notConfiguredBody}</p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
            >
              {d.contact.notConfiguredAction}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
