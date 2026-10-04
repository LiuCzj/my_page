'use client';

/**
 * 登录 / 注册 / 找回密码浮层。
 *
 * 【注册为什么是「先发码、再填表」】2026-10-04 按用户要求改成常见网站的流程：
 *   1. 填邮箱 → 点「发送验证码」→ 服务端往这个邮箱发一个 6 位码（10 分钟有效）
 *   2. 填「验证码 + 密码 + 再输一次密码 + 昵称」→ 提交
 * 密码输两遍是防手滑（少打/多打一个字符，之后再也登不上）。
 * 码本身证明了邮箱归属，所以注册成功后账号**直接是已激活**，不用再去点邮件链接。
 *
 * 【为什么复用 d.comments.* 的文案】这就是同一张表单（同一批字段、同一批错误码），
 * 只是从评论区搬到了一个独立浮层里。为它另起一份，两边迟早会漂移。
 * 顶栏特有的几个词（登录/登出/账号/管理员）放在 d.auth 里。
 *
 * 【发送按钮的 60 秒冷却】和常见网站一致：倒计时期间按钮禁用并显示剩余秒数。
 * 服务端还有一层独立的限流（同 IP 8 次/10 分钟），前端这层只是为了让用户别白点。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth, type AuthUser } from '@/lib/auth-context';
import EditorPanel from '@/components/admin/EditorPanel';

type AuthTab = 'login' | 'register' | 'forgot';

const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';
/** 发送验证码按钮（次级按钮）。min-h-44：手机上它是紧挨输入框的主操作，得够手指点 */
const SEND_BTN =
  'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-accent px-3 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50';

export default function AuthPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d, fill } = useI18n();
  const { setUser } = useAuth();
  /** 登录后要 router.refresh() 让服务端组件重算（/notes、/projects 的管理员入口是服务端渲染的） */
  const router = useRouter();

  const [tab, setTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<null | 'auth' | 'code'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** 重发倒计时（秒）。0 = 可点 */
  const [cooldown, setCooldown] = useState(0);

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
          : { email, code, password, confirmPassword, displayName };

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
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </>
      }
    >
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

        {/* 验证码（只有注册要） */}
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
            <p className="mt-1 text-xs text-muted-foreground">{d.comments.fieldCodeHint}</p>
          </div>
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
            <p className="mt-1 text-xs text-muted-foreground">{d.comments.fieldNameHint}</p>
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
            {tab === 'register' && (
              <p className="mt-1 text-xs text-muted-foreground">{d.comments.fieldPasswordHint}</p>
            )}
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
