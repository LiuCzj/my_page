'use client';

/** 数字分身聊天区。 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
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

/** 手机档底部抽屉的「三档高度」。 */
const SNAP_HALF_VH = 55;
/** 把手 + 窗头露出的高度（px）：peek 档时抽屉只留这么多，其余都在屏幕外 */
const PEEK_HEIGHT = 72;
/** 「猜你想问」自动收起的时间（毫秒）：手机上它占掉小半个面板，收起后消息区才够用 */
const SUGGEST_HIDE_MS = 15_000;

/** 抽屉三档 */
type SheetSnap = 'peek' | 'half' | 'full';

/** 生成消息 id。 */
let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 把模型输出压成干净的纯文本。
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
      // 空的助手消息（上次被中断、失败或超时）读回来会渲染成一个空气泡，直接丢掉
      .filter((m: any) => m.role === 'user' || m.content.trim() !== '')
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
  // 当前路由：后端据此把「访客正在看的那篇笔记」整篇注入提示词
  const pathname = usePathname();
  /** 聊天窗是悬浮面板：开合由外部（首屏角色、顶栏「问分身」、移动端抽屉）通过 Context 控制 */
  const { open, closeChat } = useTwinChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending'>('idle');
  const [notice, setNotice] = useState('');
  const [mounted, setMounted] = useState(false);
  /** 「猜你想问」是否还露着：打开时展示，超时或发出第一条消息后收起 */
  const [showSuggestions, setShowSuggestions] = useState(true);

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

  /** 面板展开时：Esc 关闭 + 把光标直接放进输入框（省掉一次点击）。 */
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

  /* 每次打开重新计时：到点把「猜你想问」收起来，高度让给消息区 */
  useEffect(() => {
    if (!open) return;
    setShowSuggestions(true);
    const timer = window.setTimeout(() => setShowSuggestions(false), SUGGEST_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  /** 消息区滚动跟随。 */
  const lastScrollKey = useRef('');
  useEffect(() => {
    if (!open) {
      // 关闭时清空指纹：下次打开会重新滚到底，让访客先看到最新那条
      lastScrollKey.current = '';
      return;
    }
    const last = messages[messages.length - 1];
    const key = last ? `${last.id}:${last.content.length}:${last.state ?? ''}` : 'empty';
    if (key === lastScrollKey.current) return;
    lastScrollKey.current = key;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, open]);

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
            // 当前路由：后端据此把「访客正在读的那篇笔记」整篇注入提示词
            pagePath: pathname,
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
          setMessages((prev) =>
            prev.flatMap((m) => {
              if (m.id !== replyId) return [m];
              // 一个字都没收到就停了：把这条抽掉，别留一个空气泡在那儿
              return m.content.trim() ? [{ ...m, state: 'done' as const }] : [];
            }),
          );
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
    // pathname 必须进依赖：换页后要拿到新的路由，漏了会把旧页当作「当前页」发出去
    [lang, pathname, persist],
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
      // 已经开口了就收起快捷问题，把高度让给对话
      setShowSuggestions(false);

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

  /** 抽屉必然要盖住内容。原来它从顶栏下方一路铺到屏幕底 —— 访客打开后 */
  const [snap, setSnap] = useState<SheetSnap>('half');
  /** snap 的 ref 镜像，只给「需要读它但不能把它列进依赖」的回调用（见 onSheetPointerUp）。 */
  const snapRef = useRef<SheetSnap>('half');
  /** 拖动中的实时垂直偏移（px，向下为正）。null = 没在拖 */
  const [sheetDragY, setSheetDragY] = useState<number | null>(null);
  /** 拖动中要临时关掉过渡，否则跟手会「追不上手指」 */
  const sheetGesture = useRef<{
    startY: number;
    /** 按下时抽屉的 top 值（px） */
    startTop: number;
    dragging: boolean;
  } | null>(null);
  /** 面板外层节点，用来量当前 top、算夹取范围 */
  const sheetRef = useRef<HTMLDivElement>(null);

  /** 顶栏下沿的屏幕坐标 —— 抽屉的 top 下限（再往上就盖住顶栏的按钮了）。 */
  const readPanelTop = useCallback(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--panel-top').trim();
    const px = parseFloat(raw);
    // --panel-top 是 calc(var(--header-h) + ...) 这种表达式，getComputedStyle 会算成 px 值；
    // 万一拿到百分比之类的意外值，回落到 64px（--header-h）也不至于崩
    return Number.isFinite(px) ? px : 64;
  }, []);

  /** 把某一档换算成具体的 top（px） */
  const snapToTop = useCallback(
    (s: SheetSnap, viewportH: number, panelTop: number): number => {
      if (s === 'full') return panelTop;
      if (s === 'peek') return viewportH - PEEK_HEIGHT;
      return panelTop + Math.max(0, viewportH * (1 - SNAP_HALF_VH / 100) - panelTop);
    },
    [],
  );

  /**
   * 把任意 top 归到最近的一档。
   * @param top 松手时的实际 top（px）
   */
  const nearestSnap = useCallback(
    (top: number, viewportH: number, panelTop: number): SheetSnap => {
      const candidates: SheetSnap[] = ['peek', 'half', 'full'];
      let best: SheetSnap = 'half';
      let bestDist = Infinity;
      for (const s of candidates) {
        const dist = Math.abs(snapToTop(s, viewportH, panelTop) - top);
        if (dist < bestDist) {
          bestDist = dist;
          best = s;
        }
      }
      return best;
    },
    [snapToTop],
  );

  /** 拖动过程中，把实时 top 夹在「不允许盖住顶栏」和「不允许整块拖出屏幕」之间 */
  const clampTop = useCallback((top: number, viewportH: number, panelTop: number) => {
    // 上限 = peek 档的位置（再往下就只剩一条缝了，等于不可用）
    const minTop = panelTop;
    const maxTop = viewportH - PEEK_HEIGHT;
    return Math.max(minTop, Math.min(maxTop, top));
  }, []);

  /** 把 snap 同步进 ref（渲染后执行，保证 ref 永远等于屏幕上看到的那一档） */
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  /** 指针按下把手 */
  const onSheetPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = sheetRef.current;
    if (!el) return;
    sheetGesture.current = {
      startY: e.clientY,
      startTop: el.getBoundingClientRect().top,
      dragging: false,
    };
    // 同上：拿不到捕获也能拖，失败就退化成「手指移出把手后断线」
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  /** 指针移动：超过 8px 才认定是拖动，单纯点一下不触发 */
  const onSheetPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = sheetGesture.current;
      if (!g) return;
      if (!g.dragging) {
        if (Math.abs(e.clientY - g.startY) < 8) return;
        g.dragging = true;
      }
      const viewportH = window.innerHeight;
      const panelTop = readPanelTop();
      // 手指往上（clientY 变小）→ 抽屉要变高 → top 变小，所以是 + deltaY
      const nextTop = clampTop(g.startTop + (e.clientY - g.startY), viewportH, panelTop);
      setSheetDragY(nextTop - g.startTop);
    },
    [clampTop, readPanelTop],
  );

  /** 指针抬起：吸附到最近一档；若吸附到 peek 就关闭 */
  const onSheetPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const g = sheetGesture.current;
      sheetGesture.current = null;
      if (!g) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setSheetDragY(null);
      if (!g.dragging) {
        // 单击把手 = 在「半高 / 全屏」之间切换。这是给不方便拖的人留的快捷方式
        setSnap((prev) => (prev === 'full' ? 'half' : 'full'));
        return;
      }
      const viewportH = window.innerHeight;
      const panelTop = readPanelTop();
      const settledTop = clampTop(g.startTop + (e.clientY - g.startY), viewportH, panelTop);
      const target = nearestSnap(settledTop, viewportH, panelTop);

      /* 拖到底的意图通常是「把挡路的东西挪开」，不是「关掉它」。 */
      /* `onSheetPointerUp` 是 useCallback，依赖里一旦漏掉 `snap` */
      if (target !== 'peek') {
        setSnap(target);
        return;
      }
      if (snapRef.current === 'peek') {
        // 已经是「一条」了还往下拖 → 这才算明确要关
        closeChat();
        setSnap('half'); // 下次打开回到半高，而不是继续停在「一条」
        return;
      }
      setSnap('peek');
    },
    [clampTop, closeChat, nearestSnap, readPanelTop],
  );

  const onSheetPointerCancel = useCallback(() => {
    sheetGesture.current = null;
    setSheetDragY(null);
  }, []);

  /** 手机档抽屉的 top 值（px）。 */
  const MD_BREAKPOINT = 768;

  /** 软键盘把输入框埋了这件事。 */
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

  const [viewportH, setViewportH] = useState(0);
  /** 视口宽度，只在「是否 ≥md」这一个用途上参与判断（值本身不用于布局） */
  const [viewportW, setViewportW] = useState(0);
  useEffect(() => {
    const measure = () => {
      setViewportH(window.innerHeight);
      setViewportW(window.innerWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /** 生效的 top。 */
  const sheetTop = (() => {
    if (viewportH === 0) return null;
    const panelTop = readPanelTop();
    if (viewportW >= MD_BREAKPOINT) return panelTop; // 桌面档：顶栏下方的右侧栏
    if (kbInset > 0) return panelTop; // 键盘弹起：铺满键盘之上的区域
    return snapToTop(snap, viewportH, panelTop); // 手机档：三档吸附
  })();

  /** 面板是否走「半透明 + 背景模糊」。 */
  const translucent =
    viewportW > 0 &&
    viewportW < MD_BREAKPOINT &&
    snap === 'half' &&
    kbInset === 0 &&
    sheetDragY === null;

  /** 关闭时整块不渲染 —— 这是「消息多了网页不再变长」的前提之一。 */
  if (!open) return null;

  return (
    /* 悬浮面板定位。**两段形态，分界点是 md(768px)，与 ChatInset 的让位阈值严格对齐**。 */
    <div
      id="digital-twin-chat"
      ref={sheetRef}
      /* 手机档的三档高度是算出来的（见 snapToTop），必须由 JS 提供； */
      className="fixed inset-x-0 top-[var(--sheet-top,var(--panel-top))] bottom-[var(--sheet-kb,0px)] z-[80] flex flex-col transition-[top,transform] duration-[280ms] ease-[cubic-bezier(0.33,1,0.68,1)] md:inset-x-auto md:bottom-4 md:left-auto md:right-4 md:h-auto md:max-h-[720px] md:w-[400px]"
      style={{
        ['--sheet-top' as string]: sheetTop !== null ? `${sheetTop}px` : undefined,
        ['--sheet-kb' as string]: kbInset > 0 ? `${kbInset}px` : undefined,
        /* 拖动跟手：只动 transform（合成层）。松手后清空，回到 top 的过渡 */
        transform: sheetDragY !== null ? `translateY(${sheetDragY}px)` : undefined,
        transitionProperty: sheetDragY !== null ? 'none' : undefined,
      }}
      role="dialog"
      aria-label={d.chat.title}
    >
        {/* 它是**整条**可抓的横杠区，不是只有那根 4px 的线 —— 4px 的目标太难点中，手指按不准。所以外面这层给了 44px 的触控高度（全站触控下限），里面的圆杠只负责「看起来能抓」。 */}
        <button
          type="button"
          aria-label={d.chat.sheetHandle}
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerCancel}
          className="flex h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
        >
          <span
            aria-hidden="true"
            className={`h-1 w-9 rounded-full bg-muted-foreground/40 transition-opacity ${
              sheetDragY !== null ? 'opacity-100' : 'opacity-70'
            }`}
          />
        </button>
        <section
          id="ask-twin"
          /* peek 档（缩成一条）时把整个面板体藏起来，只留上面那根把手。 */
          className={`${
            snap === 'peek' && sheetDragY === null ? 'hidden' : 'flex'
          } h-full min-h-0 flex-1 flex-col overflow-hidden border border-border shadow-2xl md:flex md:rounded-2xl ${
            /* 半透明只给「手机 + 半开档」这一种情形，见下面那段说明 */
            translucent ? 'bg-card/70 backdrop-blur-md' : 'bg-card'
          }`}
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
      {/* 一键提问：别人最常问你的三个问题。超时或已开口即收起，把高度让给对话 */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${
          showSuggestions ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        }`}
        inert={!showSuggestions}
        aria-hidden={!showSuggestions}
      >
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
        className={`${showSuggestions ? 'mt-3' : 'mt-0'} flex items-end gap-2`}
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
