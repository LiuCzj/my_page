'use client';

/** 重置密码面板：接管邮件里那个 `?reset=<token>` 链接。 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/** 重置接口的错误码 → 走字典 */
type ResetErrorCode = 'bad_request' | 'weak_password' | 'invalid_token' | 'expired_token';

/** 最短密码长度（与后端 reset 接口一致） */
const MIN_LEN = 8;

/**
 * 重置密码浮层。检测到 URL 上有 `?reset=` 才渲染，其余时候返回 null。
 * @returns 重置表单，或 null
 */
export default function ResetPasswordPanel() {
  const { d } = useI18n();

  /** 从 URL 取到的 token；null 表示当前不是重置场景 */
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* 挂载后才读 URL，不能在渲染期读 —— 这是客户端组件，但服务端预渲染时 */
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('reset');
    if (t) setToken(t);
  }, []);

  if (!token) return null;

  /** 把 token 从地址栏抹掉，并关闭面板 */
  const close = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.toString());
    setToken(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (password.length < MIN_LEN) {
      setNotice({ kind: 'err', text: d.comments.errors.weak_password });
      return;
    }
    if (password !== confirm) {
      setNotice({ kind: 'err', text: d.comments.resetMismatch });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        const table = d.comments.errors as Record<string, string | undefined>;
        setNotice({ kind: 'err', text: table[data.code as ResetErrorCode] ?? d.comments.errors.generic });
        return;
      }

      setNotice({ kind: 'ok', text: d.comments.resetDone });
      // 成功后把 token 从地址栏清掉（见文件头说明），但**保留面板**让用户看到成功提示
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url.toString());
      setToken('');
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none';
  const btnCls =
    'btn-primary';

  /** 已成功：只显示结果和一个关闭按钮 */
  if (token === '') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-bold text-foreground">{d.comments.resetTitle}</h2>
          <p className="mt-3 text-sm text-foreground">{d.comments.resetDone}</p>
          <button type="button" onClick={close} className={`${btnCls} mt-4 w-full`}>
            {d.comments.backToLogin}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-bold text-foreground">{d.comments.resetTitle}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{d.comments.resetHint}</p>

        {notice && (
          <p
            role="status"
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
              notice.kind === 'ok'
                ? 'border-border bg-secondary text-secondary-foreground'
                : 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400'
            }`}
          >
            {notice.text}
          </p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              {d.comments.fieldPassword}
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
            <span className="mt-1 block text-xs text-muted-foreground">{d.comments.fieldPasswordHint}</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              {d.comments.fieldPasswordConfirm}
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={btnCls}>
              {busy ? d.comments.working : d.comments.resetSubmit}
            </button>
            <button
              type="button"
              onClick={close}
              className="cursor-pointer text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              {d.comments.cancelReply}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
