'use client';

/**
 * 注销账号浮层：图形验证码 + 当前密码 + 邮箱验证码，三层都过才真的删。
 *
 * 【为什么是三层】这个操作不可逆（账号 + 全部评论一起没），挡的是三种不同的东西：
 *   · 图形验证码 → 挡脚本（批量提交、拿泄漏的会话列表去撞）
 *   · 当前密码   → 挡「拿到会话但不知道密码的人」（共用电脑、会话被偷）
 *   · 邮箱验证码 → 挡「连邮箱也被拿到」，同时留一条「你确定吗」的缓冲
 * 顺序按验证成本从低到高：图形码看一眼就填，密码要回忆，邮箱码得切到邮箱去抄。
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

        {/*
          当前密码：第三层。
          【为什么放在最后】它是三层里唯一「用户可能想不起来」的一道。
          放在末尾，用户先做完确定能做完的两步，卡在密码上时前面的填写不会白费。
          autoComplete="current-password" 让密码管理器认得这是「已有密码」而不是「新密码」。
        */}
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
