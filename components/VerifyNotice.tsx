'use client';

/**
 * 邮箱验证链接的落地提示。
 *
 * 【它解决什么问题】
 * `app/api/auth/verify/route.ts` 处理完链接后，会把用户重定向回首页并挂一个
 * `?verified=ok|expired|invalid`。但在 2026-10-05 之前，**全站没有任何代码读这个参数** ——
 * 用户点完邮件里的链接回到首页，屏幕上什么都没发生：不知道成功没成功，
 * 也不知道失败了该怎么办。字典里那三句提示语早就写好了，只是没人用。
 * 这个组件就是那个缺失的消费者。
 *
 * 【为什么挂在 app/layout.tsx 而不是首页】
 * 和 ResetPasswordPanel 同一个理由：验证链接的落点由 SITE_URL 决定，
 * 可能落到首页、笔记页或任何页面，所以它必须是全局的。
 *
 * 【为什么读完就立刻把参数从地址栏抹掉】
 * 不抹的话用户一刷新就再弹一次。而这次的结果早已处理完毕（后端是一次性的），
 * 重复展示只会让人以为「又验证了一遍」。用 history.replaceState 而不是 router.replace，
 * 是为了不触发一次导航 —— 我们只是想让地址栏干净，不需要重新渲染整页。
 *
 * 【为什么用 useEffect 读 URL】
 * 这是客户端组件，但服务端预渲染时没有 window，渲染期直接读会炸。
 * 放进 effect 还有个附带好处：服务端与首帧客户端都渲染 null，不存在 hydration 不匹配。
 *
 * 【为什么不做进出动画】
 * 它是一次性的结果提示，不是需要吸引注意的交互；而且加动画就要处理
 * prefers-reduced-motion（见 lib/use-reveal.ts 那套约定），收益不抵复杂度。
 */

import { useEffect, useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** 服务端 verify 路由会带回的三种结果 */
type VerifiedStatus = 'ok' | 'expired' | 'invalid';

/** 白名单校验：URL 上的值是用户可以随便改的，不校验就会渲染出 undefined */
const VALID_STATUSES: readonly string[] = ['ok', 'expired', 'invalid'];

/**
 * 验证结果提示条。只有 URL 上带着合法的 `?verified=` 才渲染，其余时候返回 null。
 *
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
