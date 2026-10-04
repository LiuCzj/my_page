'use client';

/**
 * 注销账号浮层：先把验证码发到**本人邮箱**，填回来才真的删。
 *
 * 【为什么注销也要验证码】这个操作不可逆（账号 + 全部评论一起没）。
 * 光靠一个已登录的会话不够 —— 那可能只是别人趁你离开电脑时点的。
 * 码发到账号自己的邮箱，等于「只有能收这封信的人才能注销这个账号」。
 *
 * 【邮箱为什么是只读的】注销的收件人只能是当前登录用户自己的邮箱。
 * 服务端也是这个口径（不收请求体里的邮箱），前端把邮箱显示出来只是让用户确认「发到哪儿了」。
 *
 * 【为什么不用 window.confirm 收尾】原来只用一句 confirm 挡一道，太轻。
 * 现在「发码 → 填码 → 提交」本身就是三重确认，不再叠一个原生弹窗。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import EditorPanel from '@/components/admin/EditorPanel';

const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';
const SEND_BTN =
  'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-accent px-3 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50';

export default function DeleteAccountPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { d, fill } = useI18n();
  const router = useRouter();
  const { user, setUser } = useAuth();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'code' | 'delete'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const errText = (c?: string): string => {
    const table = d.comments.errors as Record<string, string | undefined>;
    return (c && table[c]) || d.comments.errors.generic;
  };

  const close = () => {
    setCode('');
    setNotice(null);
    onClose();
  };

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    setBusy('code');
    setNotice(null);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'delete' }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNotice({ kind: 'err', text: errText(data.code) });
        return;
      }
      setNotice({ kind: 'ok', text: d.comments.codeSent });
      setCooldown(60);
    } catch {
      setNotice({ kind: 'err', text: errText('network') });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy('delete');
    setNotice(null);
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNotice({ kind: 'err', text: errText(data.code) });
        return;
      }
      // 账号已经没了：清掉本地登录态并让服务端组件重算（评论区的登录框要变回未登录）
      setUser(null);
      close();
      router.refresh();
    } catch {
      setNotice({ kind: 'err', text: errText('network') });
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <EditorPanel
      title={d.comments.deleteAccount}
      onClose={close}
      footer={
        <>
          {notice && (
            <span
              className={`mr-auto text-xs font-semibold ${
                notice.kind === 'ok' ? 'text-accent-2' : 'text-destructive'
              }`}
            >
              {notice.text}
            </span>
          )}
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {d.admin.cancel}
          </button>
          <button
            type="submit"
            form="delete-form"
            disabled={busy !== null}
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'delete' ? d.comments.working : d.comments.deleteAccount}
          </button>
        </>
      }
    >
      <form id="delete-form" onSubmit={submit} className="space-y-4">
        {/* 后果说清楚，且用警示色 —— 这是不可逆操作 */}
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
          <p className="text-xs leading-relaxed font-semibold text-destructive">
            {d.comments.deleteAccountHint}
          </p>
        </div>

        <div>
          <span className={LABEL}>{d.comments.fieldEmail}</span>
          <div className="flex items-stretch gap-2">
            {/* 只读：收件人只能是当前账号自己的邮箱 */}
            <input value={user?.email ?? ''} readOnly className={`${FIELD} opacity-70`} />
            <button type="button" onClick={sendCode} disabled={busy !== null || cooldown > 0} className={SEND_BTN}>
              {busy === 'code'
                ? d.comments.codeSending
                : cooldown > 0
                  ? fill(d.comments.codeCountdown, { seconds: cooldown })
                  : d.comments.sendCode}
            </button>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="delete-code">
            {d.comments.fieldCode}
          </label>
          <input
            id="delete-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={`${FIELD} font-mono tracking-[0.4em]`}
          />
          <p className="mt-1 text-xs text-muted-foreground">{d.comments.fieldCodeHint}</p>
        </div>
      </form>
    </EditorPanel>
  );
}
