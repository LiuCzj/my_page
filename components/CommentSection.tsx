'use client';

/** 笔记详情页底部的评论区。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import AuthPanel, { type AuthTab } from '@/components/AuthPanel';

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

/**
 * 把时间戳转成「几分钟前」这类相对说法。
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
 * @param props.slug 所属笔记的 slug
 * @returns 评论区（列表 + 回复 + 登录/注册/找回密码 + 注销）
 */
export default function CommentSection({ slug }: CommentSectionProps) {
  const { d, lang } = useI18n();

  /** 登录态来自全局 AuthProvider（顶栏的账号入口与这里共用同一份）。 */
  const { user, setUser } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  /** 评论草稿 */
  const [draft, setDraft] = useState('');

  /** 登录 / 注册浮层。表单统一用 AuthPanel（顶栏那套），这里只负责开与关 —— 避免第二份实现跟不上服务端校验 */
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>('login');
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

  /** 首次挂载只拉评论列表 —— 登录态由全局 AuthProvider 负责（见上面的说明），这里不再自己查一次 /api/auth/me（否则每进一篇笔记就多打一次无用请求）。 */
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  /**
   * 把扁平的评论列表整理成「顶层 + 回复」两层结构。
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

  /** 打开登录 / 注册浮层 */
  const openAuth = (t: AuthTab) => {
    setAuthTab(t);
    setNotice(null);
    setAuthOpen(true);
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

  /* 注销账号的入口已搬到顶栏的账号菜单（components/AuthMenu.tsx → DeleteAccountPanel）。 */

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
    'btn-primary';
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
          /* 未登录：只给一个入口，表单统一走 AuthPanel */
          <>
            <div className="card p-4">
              <p className="text-sm text-foreground">{d.comments.loginPrompt}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => openAuth('login')} className={btnCls}>
                  {d.comments.tabLogin}
                </button>
                <button type="button" onClick={() => openAuth('register')} className={linkBtnCls}>
                  {d.comments.tabRegister}
                </button>
              </div>
            </div>
            <AuthPanel open={authOpen} onClose={() => setAuthOpen(false)} initialTab={authTab} />
          </>
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
