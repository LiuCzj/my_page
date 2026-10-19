'use client';

/** 登录 / 注册 / 找回密码浮层。 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth, type AuthUser } from '@/lib/auth-context';
import EditorPanel from '@/components/admin/EditorPanel';
import CaptchaField, { type CaptchaValue } from '@/components/CaptchaField';
import { FIELD, HINT, LABEL, SEND_BTN } from '@/components/form-styles';

/** 浮层的三个页签。导出是因为 AuthMenu 要用它标注「点的是哪颗按钮」 */
export type AuthTab = 'login' | 'register' | 'forgot';

export default function AuthPanel({
  open,
  onClose,
  initialTab = 'login',
}: {
  open: boolean;
  onClose: () => void;
  /** 打开时停在哪个页签。 */
  initialTab?: AuthTab;
}) {
  const { d, fill } = useI18n();
  const { setUser } = useAuth();
  /** 登录后要 router.refresh() 让服务端组件重算（/notes、/projects 的管理员入口是服务端渲染的） */
  const router = useRouter();

  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  /** 图形验证码：id 由服务端给，text 是用户填的 */
  const [captcha, setCaptcha] = useState<CaptchaValue>({ id: '', text: '' });
  const [busy, setBusy] = useState<null | 'auth' | 'code'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** 重发倒计时（秒）。0 = 可点 */
  const [cooldown, setCooldown] = useState(0);

  /* 每次「打开」时按 initialTab 归位。 */
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setNotice(null);
  }, [open, initialTab]);

  /** 倒计时每秒减一 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  /** 错误码 → 当前语言的说明 */
  const errText = (c?: string): string => {
    const table = d.comments.errors as Record<string, string | undefined>;
    return (c && table[c]) || d.comments.errors.generic;
  };

  /** 关闭时把敏感字段清掉，下次打开不会残留上次输入的密码 */
  const close = () => {
    setPassword('');
    setConfirmPassword('');
    setCode('');
    /* 图形验证码只清用户填的那半 —— id 留着，服务端那张图还在有效期内。 */
    setCaptcha((c) => ({ ...c, text: '' }));
    setNotice(null);
    onClose();
  };

  /** 发注册验证码 */
  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    setBusy('code');
    setNotice(null);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'register' }),
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
    setBusy('auth');
    setNotice(null);
    try {
      if (tab === 'forgot') {
        const res = await fetch('/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        // 后端对「邮箱不存在」也回 ok（防账号枚举），所以措辞是「如果这个邮箱注册过」
        setNotice(
          data.ok ? { kind: 'ok', text: d.comments.forgotSent } : { kind: 'err', text: errText(data.code) },
        );
        return;
      }

      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        tab === 'login'
          ? { email, password }
          : {
              email,
              code,
              password,
              confirmPassword,
              displayName,
              captchaId: captcha.id,
              captchaText: captcha.text,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.ok) {
        setNotice({ kind: 'err', text: errText(data.code) });
        return;
      }

      // 注册成功后端已建好会话（注册即登录），拿到的 user 直接写进全局登录态
      setUser(data.user as AuthUser);
      close();
      // 让服务端组件带着新 cookie 重算一次 —— 否则 /notes、/projects 的「新建/编辑」入口
      // 还是按「未登录」渲染，登录完依然看不到（用户实测反馈）。
      router.refresh();
    } catch {
      setNotice({ kind: 'err', text: errText('network') });
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const title =
    tab === 'forgot' ? d.comments.forgotTitle : tab === 'login' ? d.auth.loginTitle : d.auth.registerTitle;

  const tabBtn = (t: AuthTab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(t);
        setNotice(null);
      }}
      className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-md px-3 text-xs font-semibold transition-colors ${
        tab === t ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  const submitLabel = busy === 'auth'
    ? d.comments.working
    : tab === 'login'
      ? d.comments.doLogin
      : tab === 'register'
        ? d.comments.doRegister
        : d.comments.forgotSubmit;

  return (
    <EditorPanel
      title={title}
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
            type="submit"
            form="auth-form"
            disabled={busy !== null}
            className="btn-primary"
          >
            {submitLabel}
          </button>
        </>
      }
    >
      {/* 字段顺序按常见注册表单排。 */}
      <form id="auth-form" onSubmit={submit} className="space-y-4">
        {tab !== 'forgot' && (
          <div className="flex items-center gap-1">
            {tabBtn('login', d.comments.tabLogin)}
            {tabBtn('register', d.comments.tabRegister)}
          </div>
        )}

        {tab === 'forgot' && (
          <p className="text-xs leading-relaxed text-muted-foreground">{d.comments.forgotHint}</p>
        )}

        {/* 昵称（只有注册要） */}
        {tab === 'register' && (
          <div>
            <label className={LABEL} htmlFor="auth-name">
              {d.comments.fieldName}
            </label>
            <input
              id="auth-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={FIELD}
            />
            <p className={HINT}>{d.comments.fieldNameHint}</p>
          </div>
        )}

        {/* 邮箱。注册时右边挂「发送验证码」 */}
        <div>
          <label className={LABEL} htmlFor="auth-email">
            {d.comments.fieldEmail}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
            {tab === 'register' && (
              <button type="button" onClick={sendCode} disabled={busy !== null || cooldown > 0} className={SEND_BTN}>
                {busy === 'code'
                  ? d.comments.codeSending
                  : cooldown > 0
                    ? fill(d.comments.codeCountdown, { seconds: cooldown })
                    : d.comments.sendCode}
              </button>
            )}
          </div>
        </div>

        {/* 图形验证码（只有注册要） */}
        {tab === 'register' && <CaptchaField value={captcha} onChange={setCaptcha} idPrefix="auth" />}

        {/* 邮箱验证码（只有注册要） */}
        {tab === 'register' && (
          <div>
            <label className={LABEL} htmlFor="auth-code">
              {d.comments.fieldCode}
            </label>
            <input
              id="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${FIELD} font-mono tracking-[0.4em]`}
            />
            <p className={HINT}>{d.comments.fieldCodeHint}</p>
          </div>
        )}

        {/* 密码 */}
        {tab !== 'forgot' && (
          <div>
            <label className={LABEL} htmlFor="auth-password">
              {d.comments.fieldPassword}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />
            {tab === 'register' && <p className={HINT}>{d.comments.fieldPasswordHint}</p>}
          </div>
        )}

        {/* 再输一次密码（只有注册要） */}
        {tab === 'register' && (
          <div>
            <label className={LABEL} htmlFor="auth-password2">
              {d.comments.fieldPasswordConfirm}
            </label>
            <input
              id="auth-password2"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={FIELD}
            />
          </div>
        )}

        {tab === 'login' && (
          <button
            type="button"
            onClick={() => {
              setTab('forgot');
              setNotice(null);
            }}
            className="cursor-pointer bg-transparent p-0 text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            {d.comments.forgot}
          </button>
        )}

        {tab === 'forgot' && (
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setNotice(null);
            }}
            className="cursor-pointer bg-transparent p-0 text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            {d.comments.backToLogin}
          </button>
        )}
      </form>
    </EditorPanel>
  );
}
