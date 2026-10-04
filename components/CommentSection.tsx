'use client';

/**
 * 笔记详情页底部的评论区。
 *
 * 【四种状态，一套组件】
 *   1. 未登录      → 「登录 / 注册 / 忘记密码」三个视图
 *   2. 已登录未验证 → 「去邮箱点确认链接」+ 重发按钮
 *   3. 已登录已验证 → 发表框（含「回复某人」态）
 * 为什么不做成多个组件：它们共享同一份「我是谁」的状态，拆开就要把状态提到父级，
 * 或者每个组件各拉一次 /api/auth/me。一个组件里分几个分支更省，也更好读。
 *
 * 【为什么「读」不需要登录】
 * 访客点进来应该能直接看到别人聊了什么。把评论列表藏起来逼人注册，
 * 是把自己的门槛架在了别人的耐心上。只有「写」才要身份。
 *
 * 【为什么所有错误都走字典】
 * API 回的是稳定错误码（disposable_email / rate_limited …），不是英文句子。
 * 组件拿码去字典里查当前语言的说明 —— 这样加一门语言不用改后端，
 * 后端也不用关心用户在看哪种语言。
 *
 * 【回复为什么只做一层】
 * 顶层评论 + 回复，回复不再嵌套回复。理由：三层以上的缩进在手机屏上会把正文挤成
 * 一条竖线，而且讨论串一深就没人能看清谁在回谁 —— 这是绝大多数评论区的实际做法
 * （GitHub、Reddit 之外，几乎都收在一层）。
 * 回复「某条回复」时，parentId 仍然挂到那条回复的父评论上，视觉上仍是同一层。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAuth, type AuthUser } from '@/lib/auth-context';

/**
 * 当前用户。直接复用全局登录态里的类型（lib/auth-context.ts 的 AuthUser），
 * 不再本地重复定义一份 —— 两边字段一旦不同步，赋值处就会莫名报类型错。
 */
type CurrentUser = AuthUser;

/** 一条评论 */
interface Comment {
  id: number;
  noteSlug: string;
  body: string;
  createdAt: number;
  authorName: string;
  mine: boolean;
  parentId: number | null;
  canDelete: boolean;
}

interface CommentSectionProps {
  /** 笔记的 slug（文件名去掉扩展名），用来取该篇的评论 */
  slug: string;
}

/** 评论最长字数（与 app/api/comments/route.ts 的 BODY_MAX 保持一致） */
const BODY_MAX = 1000;

/** 未登录时表单的三个视图 */
type AuthTab = 'login' | 'register' | 'forgot';

/**
 * 把时间戳转成「几分钟前」这类相对说法。
 *
 * 【为什么自己写而不用库】只需要这一处，为它装 date-fns / dayjs 不值得。
 * 用 Intl.RelativeTimeFormat 而不是手拼字符串，是为了自动跟随语言
 * （中文出「3 分钟前」，英文出「3 minutes ago」），不用自己维护两套文案。
 *
 * @param ts 时间戳（毫秒）
 * @param lang 当前界面语言
 * @returns 相对时间描述
 */
function relativeTime(ts: number, lang: string): string {
  const diffSec = Math.round((ts - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diffSec);

  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  // 超过一个月就直接给日期，比「47 天前」好读
  return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN');
}

/**
 * 评论区。
 *
 * @param props.slug 所属笔记的 slug
 * @returns 评论区（列表 + 回复 + 登录/注册/找回密码 + 注销）
 */
export default function CommentSection({ slug }: CommentSectionProps) {
  const { d, lang } = useI18n();

  /**
   * 登录态来自全局 AuthProvider（顶栏的账号入口与这里共用同一份）。
   *
   * 【为什么不再自己 fetch /api/auth/me】改造前只有评论区用登录态，各存一份没问题；
   * 现在顶栏也要用。两边各存一份的话，从顶栏登录之后评论区仍是「未登录」，
   * 得刷新整页才同步 —— 那是典型的「两个真相来源」bug。
   *
   * undefined = 还在查；null = 确定未登录。
   */
  const { user, setUser } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  /** 表单字段 */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [draft, setDraft] = useState('');

  /** 未登录时的视图 */
  const [tab, setTab] = useState<AuthTab>('login');
  /** 正在回复哪条评论（null = 发顶层评论） */
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);

  /** 正在提交什么（null = 空闲），用来禁用按钮并显示「处理中」 */
  const [busy, setBusy] = useState<null | 'auth' | 'post' | 'delete' | 'forgot'>(null);
  /** 提示条：kind 决定颜色 */
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /** 提交后把焦点放回输入框，省一次手动点击 */
  const draftRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 把 API 的错误码翻成当前语言的说明。
   *
   * @param code 后端返回的错误码
   * @returns 可显示的文案；未知码退回通用提示
   */
  const errText = useCallback(
    (code: string | undefined): string => {
      const table = d.comments.errors as Record<string, string | undefined>;
      return (code && table[code]) || d.comments.errors.generic;
    },
    [d],
  );

  /** 拉评论列表 */
  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.ok) setComments(data.comments as Comment[]);
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setLoadingList(false);
    }
  }, [slug, d]);

  /**
   * 首次挂载只拉评论列表 —— 登录态由全局 AuthProvider 负责（见上面的说明），
   * 这里不再自己查一次 /api/auth/me（否则每进一篇笔记就多打一次无用请求）。
   */
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  /**
   * 把扁平的评论列表整理成「顶层 + 回复」两层结构。
   *
   * 【为什么在客户端做】服务端返回的是一张扁平表（一条 SQL 就够），
   * 建树放在这里做，省得后端为了嵌套结构写递归查询。
   *
   * 【孤儿回复怎么处理】父评论被删掉时，子回复也会被级联删掉（见 db 的外键），
   * 所以正常不会出现孤儿。但万一有（比如手动改库），这里把它当作顶层评论显示，
   * 而不是直接丢掉 —— 宁可位置不完美，也不要让用户的话凭空消失。
   *
   * @returns 顶层评论数组，每条带自己的 replies
   */
  const tree = useMemo(() => {
    const tops: Array<Comment & { replies: Comment[] }> = [];
    const byId = new Map<number, Comment & { replies: Comment[] }>();

    for (const c of comments) {
      if (c.parentId == null) {
        const node = { ...c, replies: [] };
        tops.push(node);
        byId.set(c.id, node);
      }
    }
    for (const c of comments) {
      if (c.parentId == null) continue;
      const parent = byId.get(c.parentId);
      if (parent) parent.replies.push(c);
      else tops.push({ ...c, replies: [] }); // 孤儿：提到顶层显示
    }
    return tops;
  }, [comments]);

  /** 登录或注册 */
  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy('auth');
    setNotice(null);

    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = tab === 'login' ? { email, password } : { email, password, displayName };

    try {
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

      setUser(data.user as CurrentUser);
      setPassword('');
      setNotice(tab === 'register' ? { kind: 'ok', text: d.comments.registered } : null);
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(null);
    }
  };

  /** 发送找回密码邮件 */
  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy('forgot');
    setNotice(null);

    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      // 后端对「邮箱不存在」也回 ok（防账号枚举），所以这里的提示措辞是
      // 「如果这个邮箱注册过」—— 不能让用户从提示里推断出邮箱是否注册过
      setNotice(
        data.ok
          ? { kind: 'ok', text: d.comments.forgotSent }
          : { kind: 'err', text: errText(data.code) },
      );
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(null);
    }
  };

  /** 登出 */
  const doLogout = async () => {
    if (busy) return;
    setBusy('auth');
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setReplyTo(null);
      setNotice({ kind: 'ok', text: d.comments.loggedOut });
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(null);
    }
  };

  /*
    注销账号的入口已搬到顶栏的账号菜单（components/AuthMenu.tsx → DeleteAccountPanel）。
    理由：它是**账号级**操作，不该挂在某一篇笔记的评论区下面；而且新流程要「先收邮箱验证码」，
    和这里「发评论」的上下文没有关系。
  */

  /** 发表评论或回复 */
  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const text = draft.trim();
    if (!text) {
      setNotice({ kind: 'err', text: d.comments.errors.empty_body });
      return;
    }
    if (text.length > BODY_MAX) {
      setNotice({ kind: 'err', text: d.comments.errors.too_long });
      return;
    }

    setBusy('post');
    setNotice(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, body: text, parentId: replyTo?.id ?? null }),
      });
      const data = await res.json();

      if (!data.ok) {
        setNotice({ kind: 'err', text: errText(data.code) });
        return;
      }

      // 追加到列表末尾（列表按时间正序），不重拉整个列表 —— 少一次往返
      setComments((prev) => [...prev, data.comment as Comment]);
      setDraft('');
      setReplyTo(null);
      draftRef.current?.focus();
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(null);
    }
  };

  /** 删除一条评论（自己的，或管理员删任意） */
  const deleteComment = async (id: number) => {
    if (busy) return;
    if (!window.confirm(d.comments.confirmDelete)) return;

    setBusy('delete');
    try {
      const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        setNotice({ kind: 'err', text: errText(data.code) });
        return;
      }
      // 删父评论会级联删掉它的回复，所以本地也要把子回复一并移除，
      // 否则界面上会留下一批没有父节点的孤儿
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
      if (replyTo?.id === id) setReplyTo(null);
    } catch {
      setNotice({ kind: 'err', text: d.comments.errors.network });
    } finally {
      setBusy(null);
    }
  };

  /** 开始回复某条评论：把焦点送到输入框 */
  const startReply = (c: Comment) => {
    setReplyTo({ id: c.parentId ?? c.id, name: c.authorName });
    draftRef.current?.focus();
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none';
  const btnCls =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
  const linkBtnCls =
    'cursor-pointer text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50';

  /** 单条评论的渲染（顶层与回复共用，靠 depth 控制缩进） */
  const renderComment = (c: Comment, depth: 0 | 1) => (
    <li key={c.id} className={depth === 0 ? 'border-l-2 border-border pl-4' : 'border-l-2 border-border/60 pl-4'}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-foreground">{c.authorName}</span>
        <time className="text-xs text-muted-foreground" dateTime={new Date(c.createdAt).toISOString()}>
          {relativeTime(c.createdAt, lang)}
        </time>
        {user?.emailVerified && (
          <button type="button" onClick={() => startReply(c)} className={linkBtnCls}>
            {d.comments.reply}
          </button>
        )}
        {c.canDelete && (
          <button
            type="button"
            onClick={() => deleteComment(c.id)}
            disabled={busy === 'delete'}
            className="cursor-pointer text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-red-500 hover:underline disabled:opacity-50"
          >
            {d.comments.delete}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
        {c.body}
      </p>
    </li>
  );

  return (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="flex items-baseline gap-2 text-lg font-bold text-foreground">
        {d.comments.title}
        {comments.length > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">
            {d.comments.count.replace('{count}', String(comments.length))}
          </span>
        )}
      </h2>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-lg border px-3 py-2 text-xs font-semibold ${
            notice.kind === 'ok'
              ? 'border-border bg-secondary text-secondary-foreground'
              : 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400'
          }`}
        >
          {notice.text}
        </p>
      )}

      {loadingList ? (
        <p className="mt-6 text-sm text-muted-foreground">{d.comments.working}</p>
      ) : tree.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{d.comments.empty}</p>
      ) : (
        <ul className="mt-6 space-y-5">
          {tree.map((top) => (
            <li key={top.id} className="space-y-4">
              <ul className="space-y-4">{renderComment(top, 0)}</ul>
              {top.replies.length > 0 && (
                <ul className="ml-4 space-y-4 sm:ml-8">{top.replies.map((r) => renderComment(r, 1))}</ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        {user === undefined ? (
          <p className="text-sm text-muted-foreground">{d.comments.working}</p>
        ) : user === null ? (
          /* ── 未登录：登录 / 注册 / 找回密码 ── */
          <div className="card p-4">
            <div className="flex gap-1 rounded-lg bg-secondary p-1">
              {(['login', 'register'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setNotice(null);
                  }}
                  className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    tab === t ? 'bg-background text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t === 'login' ? d.comments.tabLogin : d.comments.tabRegister}
                </button>
              ))}
            </div>

            {tab === 'forgot' ? (
              <form onSubmit={submitForgot} className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">{d.comments.forgotHint}</p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    {d.comments.fieldEmail}
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={busy === 'forgot'} className={btnCls}>
                    {busy === 'forgot' ? d.comments.working : d.comments.forgotSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setNotice(null);
                    }}
                    className={linkBtnCls}
                  >
                    {d.comments.backToLogin}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitAuth} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    {d.comments.fieldEmail}
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </label>

                {tab === 'register' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                      {d.comments.fieldName}
                    </span>
                    <input
                      type="text"
                      required
                      maxLength={24}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={inputCls}
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {d.comments.fieldNameHint}
                    </span>
                  </label>
                )}

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    {d.comments.fieldPassword}
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                  {tab === 'register' && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {d.comments.fieldPasswordHint}
                    </span>
                  )}
                </label>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={busy === 'auth'} className={btnCls}>
                    {busy === 'auth'
                      ? d.comments.working
                      : tab === 'login'
                        ? d.comments.doLogin
                        : d.comments.doRegister}
                  </button>
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('forgot');
                        setNotice(null);
                      }}
                      className={linkBtnCls}
                    >
                      {d.comments.forgot}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        ) : !user.emailVerified ? (
          /* ── 已登录未验证 ── */
          <div className="card p-4">
            <p className="text-sm text-foreground">{d.comments.needVerify}</p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNotice({ kind: 'ok', text: d.comments.resent })}
                className={btnCls}
              >
                {d.comments.resend}
              </button>
              <button type="button" onClick={doLogout} disabled={busy === 'auth'} className={linkBtnCls}>
                {d.comments.doLogout}
              </button>
            </div>
          </div>
        ) : (
          /* ── 已登录已验证：发表框 ── */
          <form onSubmit={submitComment}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {replyTo
                  ? d.comments.replyTo.replace('{name}', replyTo.name)
                  : user.displayName}
              </span>
              <span className="flex items-center gap-3">
                {replyTo && (
                  <button type="button" onClick={() => setReplyTo(null)} className={linkBtnCls}>
                    {d.comments.cancelReply}
                  </button>
                )}
                <button type="button" onClick={doLogout} disabled={busy === 'auth'} className={linkBtnCls}>
                  {d.comments.doLogout}
                </button>
              </span>
            </div>
            <textarea
              ref={draftRef}
              rows={4}
              maxLength={BODY_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={d.comments.placeholder}
              className={`${inputCls} resize-y`}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {draft.length} / {BODY_MAX}
              </span>
              <button type="submit" disabled={busy === 'post'} className={btnCls}>
                {busy === 'post' ? d.comments.submitting : d.comments.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
