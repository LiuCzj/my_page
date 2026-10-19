'use client';

/** 邮箱验证链接的落地提示。 */

import { useEffect, useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** 服务端 verify 路由会带回的三种结果 */
type VerifiedStatus = 'ok' | 'expired' | 'invalid';

/** 白名单校验：URL 上的值是用户可以随便改的，不校验就会渲染出 undefined */
const VALID_STATUSES: readonly string[] = ['ok', 'expired', 'invalid'];

/**
 * 验证结果提示条。只有 URL 上带着合法的 `?verified=` 才渲染，其余时候返回 null。
 * @returns 提示条，或 null
 */
export default function VerifyNotice() {
  const { d } = useI18n();

  /** 当前要展示的结果；null 表示当前不是「点完验证链接回来」的场景 */
  const [status, setStatus] = useState<VerifiedStatus | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('verified');
    if (!raw || !VALID_STATUSES.includes(raw)) return;

    setStatus(raw as VerifiedStatus);

    // 立刻抹掉参数（见文件头说明），刷新不会重复弹
    url.searchParams.delete('verified');
    window.history.replaceState({}, '', url.toString());
  }, []);

  if (!status) return null;

  const isOk = status === 'ok';
  const text = isOk
    ? d.comments.verifiedOk
    : status === 'expired'
      ? d.comments.verifiedExpired
      : d.comments.verifiedInvalid;

  const Icon = isOk ? CircleCheck : TriangleAlert;

  return (
    <div
      role="status"
      aria-live="polite"
      /* top 走 --panel-top（贴住顶栏再留 8px），与聊天面板共用同一个几何来源 */
      className="fixed left-1/2 z-[90] w-[min(92vw,26rem)] -translate-x-1/2"
      style={{ top: 'var(--panel-top)' }}
    >
      <div
        className={`flex items-start gap-2.5 rounded-[var(--radius-card)] border bg-card p-3 shadow-[var(--shadow-2)] ${
          isOk ? 'border-accent-2/45' : 'border-destructive/45'
        }`}
      >
        <Icon
          size={16}
          aria-hidden="true"
          className={`mt-0.5 shrink-0 ${isOk ? 'text-accent-2' : 'text-destructive'}`}
        />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">{text}</p>
        <button
          type="button"
          onClick={() => setStatus(null)}
          /* min-h-44：手机上这是一颗要手指点的按钮，不能只有文字那么高 */
          className="-m-1 inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary"
        >
          {d.comments.verifiedDismiss}
        </button>
      </div>
    </div>
  );
}
