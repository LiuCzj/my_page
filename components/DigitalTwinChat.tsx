'use client';

/**
 * 数字分身聊天区。
 *
 * 【它做什么】
 * 访客在这里直接问「你有哪些作品」「怎么联系你」，问题经 app/api/assistant/route.ts
 * 转给大模型，模型的回流按 token 逐字打出来（打字机效果），看起来是在跟本人聊天。
 *
 * 【三个刻意的设计】
 * 1. 欢迎语不存进 messages，而是每次从 config 现取 —— 这样切到中/英文它立刻跟着变，
 *    也不会出现「历史记录里躺着一种语言、界面已是另一种语言」的割裂。
 * 2. 历史存 localStorage（键 twin-chat），上限 config.assistant.maxHistory 条。
 *    选 localStorage 而不是内存：刷新、跳去项目页再回来，对话还在，面试演示时不会当场失忆。
 * 3. 失败的那条气泡带「重试」，重发时先把这条错误气泡删掉再发，
 *    避免把同一个问题重复塞进上下文里多花一份 token。
 *
 * 【SSE 解析为什么要自己拼 buffer】
 * 网络块（chunk）的边界和 SSE 的行边界不对齐：一个 chunk 可能只到 "data: {\"con" 就断了，
 * 也可能一次给两行。所以必须：累积 buffer → 按换行切 → 只处理完整行 → 把最后那段不完整的
 * 留下个循环。直接对 chunk 做 JSON.parse 是新手最常见的翻车点。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { site } from '@/config/site';

/** 一条聊天消息 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 助手消息的状态：pending=正在流式接收，done=完成，error=失败 */
  state?: 'pending' | 'done' | 'error';
  /** 失败时后端返回的错误码，用于翻译成当前语言的提示 */
  errorCode?: string;
}

const STORAGE_KEY = 'twin-chat';
/** 与后端 MAX_CONTENT_LEN 保持一致，前端先挡一道，省一次往返 */
const MAX_INPUT_LEN = 2000;

/**
 * 生成消息 id。
 *
 * 【为什么不用 crypto.randomUUID()】
 * 它是 Web Crypto 的一部分，只在「安全上下文」下存在 —— 也就是 HTTPS 或 localhost。
 * 手机通过 http://192.168.x.x:3000 访问局域网开发服务时属于非安全上下文，
 * 那时 crypto.randomUUID 是 undefined，调用直接抛 TypeError，
 * 表现就是「手机上点发送毫无反应」而电脑 localhost 一切正常。
 *
 * id 只在本次会话的列表里当 React key 用，不需要全局唯一，
 * 所以时间戳 + 自增序号 + 随机段足够，且任何上下文都可用。
 */
let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 把模型输出压成干净的纯文本。
 *
 * 【为什么提示词里禁了还要在这里再处理一遍】
 * 实测四次真实调用里有一次仍然吐了 `**加粗**` —— 提示词对格式只是「倾向」，不是保证，
 * 而聊天区是 whitespace-pre-wrap 的纯文本渲染，星号会原样露在界面上。
 * 所以这里做确定性的清理，而不是继续往提示词里堆话。
 *
 * 只处理界面会露馅的几种行内标记，不做真正的 Markdown 渲染器：
 * 给聊天气泡引一个 markdown 库，代价远大于收益。
 *
 * @param raw 模型返回的原始文本
 * @returns 去掉行内强调符号后的文本
 */
function toPlainText(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*\*([^\n]+?)\*\*/g, '$1') // **bold 跨字** 的兜底
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 行首 # 标题
    .replace(/\*\s/g, '· '); // 剩余的 * 项目符号换成中间点
}

/**
 * 读取本地历史。
 * @returns 解析失败或版本不对时返回 null，让调用方回落到「只显示欢迎语」
 */
function loadHistory(): ChatMessage[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // 只认结构完整的项，并且丢掉上一次会话里残留的 pending 状态（否则界面会一直转圈）
    return parsed
      .filter(
        (m: any) =>
          m && typeof m.id === 'string' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      )
      .map((m: any): ChatMessage => ({
        id: m.id,
        role: m.role,
        content: m.content,
        state: m.role === 'assistant' ? 'done' : undefined,
      }));
  } catch {
    return null;
  }
}

export default function DigitalTwinChat() {
  const { d, pick, fill, lang } = useI18n();
  /** 聊天窗现在是悬浮面板：开合由外部（首屏机器人、CTA、关于我入口）通过 Context 控制 */
  const { open, closeChat } = useTwinChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending'>('idle');
  const [notice, setNotice] = useState('');
  const [mounted, setMounted] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  /** 用于「停止」按钮和组件卸载时中断还没读完的流 */
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 挂载后再读 localStorage：服务端渲染时没有 window，
  // 首帧统一渲染成「只有欢迎语」，客户端首帧也如此，之后 effect 再补历史，避免 hydration 报错。
  useEffect(() => {
    setMounted(true);
    const history = loadHistory();
    if (history && history.length) setMessages(history);
  }, []);

  // 卸载时收尾：留着半截的流会触发「在已卸载组件上 setState」告警
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * 面板展开时：Esc 关闭 + 把光标直接放进输入框（省掉一次点击）。
   * 面板是「非模态」的 —— 不挡背景、不加遮罩，所以这里只做这两件事，
   * 不做焦点圈禁，也不锁背景滚动，访客可以一边看页面一边聊。
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChat();
    };
    document.addEventListener('keydown', onKeyDown);
    // 等一帧再聚焦，避免在面板尚未布局完成时 focus 失效
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, closeChat]);

  // 新内容进来就滚到底部。block:'nearest' 只在确实超出可视区时滚动，不会把页面拽走
  useEffect(() => {
    if (status === 'sending') endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, status]);

  /** 持久化，并按 config 上限裁掉最老的消息 */
  const persist = useCallback((next: ChatMessage[]) => {
    const trimmed = next.slice(-site.assistant.maxHistory);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // 隐私模式或配额满时 localStorage 会抛错。这里不弹错扰民：
      // 丢历史的代价只是「刷新后回到欢迎语」，聊天本身照常可用。
    }
  }, []);

  /**
   * 发送一条消息并把回复流式写进对应气泡。
   * @param history 本次请求要带给模型的消息序列（已含刚生成的用户提问）
   * @param replyId 承接流式文本的助手消息 id
   */
  const runStream = useCallback(
    async (history: ChatMessage[], replyId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('sending');
      setNotice('');

      let ok = false;
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lang,
            messages: history
              .filter((m) => m.state !== 'error')
              .map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let code = 'upstream_error';
          try {
            const body = await res.json();
            if (body?.error) code = String(body.error);
          } catch {
            // 非 JSON 错误体（比如网关返回了一段 HTML），沿用默认码
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, state: 'error', errorCode: code, content: '' } : m,
            ),
          );
          return;
        }

        if (!res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, state: 'error', errorCode: 'network', content: '' } : m,
            ),
          );
          return;
        }

        const contentType = res.headers.get('content-type') ?? '';

        if (contentType.includes('text/event-stream')) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          /** 从一行 SSE 里取出增量文本；取不到就返回空串 */
          const takeDelta = (line: string): string => {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) return '';
            const data = trimmedLine.slice(5).trim();
            if (!data || data === '[DONE]') return '';
            try {
              const parsed = JSON.parse(data);
              return parsed?.choices?.[0]?.delta?.content ?? '';
            } catch {
              return '';
            }
          };

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // 只消费完整行，最后一段可能不完整，留在 buffer 里等下一个 chunk
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            let added = '';
            for (const line of lines) added += takeDelta(line);

            if (added) {
              // 必须用函数式更新：闭包里的 messages 是旧值，直接 setMessages([...]) 会覆盖掉并发追加
              setMessages((prev) =>
                prev.map((m) => (m.id === replyId ? { ...m, content: m.content + added } : m)),
              );
            }
          }
          // 收尾：流里最后一段没有换行的残包
          const tail = takeDelta(buffer);
          if (tail) setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: m.content + tail } : m)));
        } else {
          // 有些网关会忽略 stream:true，回一整个 JSON。这条分支保证它也能显示，而不是空白气泡
          const json = await res.json();
          const content: string =
            json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? '';
          if (!content) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId ? { ...m, state: 'error', errorCode: 'upstream_error', content: '' } : m,
              ),
            );
            return;
          }
          setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content, state: 'done' } : m)));
        }

        ok = true;
        setMessages((prev) => {
          const finalized = prev.map((m) => (m.id === replyId ? { ...m, state: 'done' as const } : m));
          persist(finalized);
          return finalized;
        });
      } catch (err) {
        // 主动停止（含组件卸载）不算错误：保留已经打出来的部分
        if ((err as Error)?.name === 'AbortError') {
          setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, state: 'done' } : m)));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, state: 'error', errorCode: 'network', content: '' } : m,
            ),
          );
        }
      } finally {
        setStatus('idle');
        if (!ok) {
          setMessages((current) => {
            persist(current);
            return current;
          });
        }
      }
    },
    [lang, persist],
  );

  /** 发送输入框内容（或一键提问按钮塞进来的内容） */
  const send = useCallback(
    (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!text) {
        setNotice(d.chat.errorEmpty);
        textareaRef.current?.focus();
        return;
      }
      if (text.length > MAX_INPUT_LEN) {
        setNotice(d.chat.errorTooLong);
        return;
      }
      setNotice('');

      const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text };
      const replyMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        state: 'pending',
      };
      const history = [...messages, userMsg];

      setMessages([...history, replyMsg]);
      setInput('');
      persist(history.concat(replyMsg));
      void runStream(history.concat(replyMsg), replyMsg.id);
    },
    [input, messages, persist, runStream, d.chat.errorEmpty, d.chat.errorTooLong],
  );

  /** 重试：删掉出错的气泡（以及它对应的那条提问），重新走一次 */
  const retry = useCallback(
    (errorId: string) => {
      const errorIndex = messages.findIndex((m) => m.id === errorId);
      if (errorIndex < 0) return;
      // 出错气泡前面那条一定是对应的提问；往前取到它
      const questionIndex = errorIndex - 1;
      const question = messages[questionIndex];
      if (!question || question.role !== 'user') return;

      const history = messages.slice(0, questionIndex);
      const replyMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        state: 'pending',
      };
      const next = [...history, question, replyMsg];
      setMessages(next);
      persist(next);
      void runStream([question], replyMsg.id);
    },
    [messages, persist, runStream],
  );

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setNotice('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 同 persist：清不掉不影响本次会话
    }
  }, []);

  const busy = status === 'sending';
  const bubbleBase =
    'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed';

  /**
   * 软键盘把输入框埋了这件事。
   * iOS Safari 弹键盘时**不缩小布局视口**，只是把可视区域往上盖一层 ——
   * 这块面板是 position:fixed + bottom:0，它的底边仍按「整屏」算，
   * 于是键盘正好压在输入框上，用户打字时看不见自己打了什么。
   * 页面本身能滚，但 fixed 元素不跟着滚，所以系统那套「聚焦时滚到可见」也救不了它。
   *
   * 解法是盯着 visualViewport：它报的是「键盘之上还剩多少」，
   * 布局高 − 可视高 − 可视区顶部偏移 就是被吃掉的高度，直接抬面板的 bottom。
   * 键盘收起后这个数归 0，那时**不写内联 bottom**，交回 Tailwind 的 bottom-0 / sm:bottom-4，
   * 否则桌面端右下角窗口的 16px 下边距会被顶成贴底。
   */
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () =>
      setKbInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  /**
   * 关闭时整块不渲染 —— 这是「消息多了网页不再变长」的前提之一：
   * 面板不占文档流，页面高度与聊天内容彻底解耦。
   */
  if (!open) return null;

  return (
    /*
     * 悬浮面板定位。
     * 手机端：贴在固定顶栏（实测 109px）下方，左右贴边撑到屏幕底部。
     * ≥sm：收成右下角 400px 宽的窗口，但 top 仍从 120px 起 ——
     *   面板层级 z-[80] 高于顶栏 z-50，若让它顶到视口上方就会盖住顶栏的语言/主题按钮。
     * 高度一律用 top + bottom 夹出来，不用 100dvh 算，避免出现量到 96px 那种差一位数的错位。
     * kbInset 见上面那段：键盘弹起时把底边抬到键盘上方，否则输入框被埋。
     */
    <div
      className="fixed inset-x-0 bottom-0 top-[112px] z-[80] sm:inset-x-auto sm:bottom-4 sm:left-auto sm:right-4 sm:top-[120px] sm:h-auto sm:max-h-[720px] sm:w-[400px]"
      style={kbInset > 0 ? { bottom: kbInset } : undefined}
      role="dialog"
      aria-label={d.chat.title}
    >
      <section
        id="ask-twin"
        className="flex h-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:rounded-2xl"
        aria-labelledby="ask-twin-title"
      >
        {/* 窗头：标题 + 清空 + 关闭。shrink-0 保证它不随消息滚动消失 */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="ask-twin-title" className="text-base font-bold text-card-foreground">
              {d.chat.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{d.chat.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Trash2 size={14} aria-hidden="true" />
                {d.chat.clear}
              </button>
            )}
            <button
              type="button"
              onClick={closeChat}
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={d.chat.close}
              title={d.chat.close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

      {/* 消息区：唯一会滚动的部分。min-h-0 是 flex 子项能内部滚动的必要条件 */}
      {/* overscroll-contain：消息列表滚到头时不再带着整页一起动。
          手机上少了这一句，往上翻历史翻到顶会顺手把背后的页面也拖走，回来时位置就丢了 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex gap-2">
          <span className="mt-1 shrink-0 text-[11px] font-bold text-muted-foreground">{d.chat.twin}</span>
          <div className={`${bubbleBase} border border-border bg-secondary text-secondary-foreground`}>
            {pick(site.assistant.greeting)}
          </div>
        </div>

        {(mounted ? messages : []).map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <span className="mt-1 shrink-0 text-[11px] font-bold text-muted-foreground">{d.chat.twin}</span>
            )}
            <div className="flex flex-col items-start gap-1">
              <div
                className={`${bubbleBase} ${
                  m.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-border bg-secondary text-secondary-foreground'
                }`}
                // 流式追加的内容要播报给读屏用户
                aria-live={m.state === 'pending' ? 'polite' : undefined}
              >
                {m.role === 'assistant' ? toPlainText(m.content) : m.content}
                {m.state === 'pending' && (
                  <span className="ml-0.5 inline-block animate-pulse" aria-hidden="true">
                    ▍
                  </span>
                )}
              </div>

              {m.state === 'error' && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-destructive">
                    {d.chat.errorFailed}
                    {m.errorCode ? ` · ${fill(d.chat.errorDetail, { reason: d.chat.reasons[m.errorCode as keyof typeof d.chat.reasons] ?? m.errorCode })}` : ''}
                  </span>
                  <span className="text-muted-foreground">{d.chat.errorFallback}</span>
                  <button
                    type="button"
                    onClick={() => retry(m.id)}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-accent px-3 py-2 font-semibold text-accent transition hover:bg-accent/15"
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    {d.chat.retry}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* 底部固定区：一键提问 + 输入框 + 免责说明。shrink-0 让它始终贴在面板底部 */}
      <div className="shrink-0 border-t border-border px-4 py-3">
      {/* 一键提问：别人最常问你的三个问题 */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {d.chat.quickAsk}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {site.assistant.quickQuestions.map((q) => (
            <button
              key={q.en}
              type="button"
              disabled={busy}
              onClick={() => send(q[lang])}
              className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pick(q)}
            </button>
          ))}
        </div>
      </div>

      {/* 输入区：Enter 发送，Shift+Enter 换行 */}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          rows={2}
          maxLength={MAX_INPUT_LEN}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={d.chat.placeholder}
          aria-label={d.chat.placeholder}
          className="min-h-[44px] min-w-0 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {d.chat.stop}
          </button>
        ) : (
          <button
            type="submit"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
          >
            <Send size={16} aria-hidden="true" />
            {d.chat.send}
          </button>
        )}
      </form>

        {notice && <p className="mt-2 text-xs font-semibold text-destructive">{notice}</p>}

        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{d.chat.disclaimer}</p>
      </div>
      </section>
    </div>
  );
}
