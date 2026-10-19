'use client';

/** 注销账号浮层：图形验证码 + 当前密码 + 邮箱验证码，三层都过才真的删。 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import EditorPanel from '@/components/admin/EditorPanel';
import CaptchaField, { type CaptchaValue } from '@/components/CaptchaField';
import { FIELD, HINT, LABEL, SEND_BTN } from '@/components/form-styles';

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
  /** 当前密码。注销要重新证明「你是本人」，不能只靠已登录的会话 */
  const [password, setPassword] = useState('');
  /** 图形验证码 */
  const [captcha, setCaptcha] = useState<CaptchaValue>({ id: '', text: '' });
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
    setPassword('');
    // 图形验证码只清用户填的那半，id 留着（服务端那张图还在有效期内）—— 同 AuthPanel 的处理
    setCaptcha((c) => ({ ...c, text: '' }));
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
        body: JSON.stringify({
          code,
          password,
          captchaId: captcha.id,
          captchaText: captcha.text,
        }),
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
            className="btn-soft"
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

        {/* 图形验证码：第一层，最便宜的一道 */}
        <CaptchaField value={captcha} onChange={setCaptcha} idPrefix="delete" />

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
          <p className={HINT}>{d.comments.fieldCodeHint}</p>
        </div>

        {/* 当前密码：第三层。 */}
        <div>
          <label className={LABEL} htmlFor="delete-password">
            {d.comments.fieldPassword}
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
          />
        </div>
      </form>
    </EditorPanel>
  );
}
