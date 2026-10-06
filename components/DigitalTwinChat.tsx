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
 * 手机档底部抽屉的「三档高度」。
 *
 * 【为什么是 top 而不是 height】
 * 抽屉的外层是 `fixed top-[var(--panel-top)] bottom-0`（上下都贴死），
 * 它的高度是**被 top 夹出来的**。所以「调高度」在这套定位里就等于「调 top」：
 * top 越小 → 抽屉越高。这样不用在任何地方写 height，
 * 也就不会和 `bottom` 上的软键盘抬升（kbInset）打架 —— 两者作用在不同的边上。
 *
 * 【三档的取值依据】
 * · half  = 55dvh：手机上调出键盘后剩下的可视高度大约 45~50dvh，
 *   抽屉占 55% 时上方还留得下一两行正文，访客知道「自己还在哪一页」。
 * · full  = 顶栏下方到底：即 top 取 --panel-top 本身，抽屉铺满整屏。
 * · peek  = 只露出一条把手（约 72px 的窗头），拖到这里松手 = 关闭。
 *   用「露一条边」而不是「直接关」是为了**可逆**：误拖到底还能拖回来，
 *   不会一松手面板就没了、还得重新点开心想「我刚才干了什么」。
 *
 * ⚠️ 单位是 dvh 而不是 vh：手机上 vh 不随地址栏收放变化，
 * 用 vh 会出现「拖到半高度时底部被地址栏切掉一截」。
 */
const SNAP_HALF_VH = 55;
/** 把手 + 窗头露出的高度（px）：peek 档时抽屉只留这么多，其余都在屏幕外 */
const PEEK_HEIGHT = 72;

/** 抽屉三档 */
type SheetSnap = 'peek' | 'half' | 'full';

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
  /** 聊天窗是悬浮面板：开合由外部（首屏角色、顶栏「问分身」、移动端抽屉）通过 Context 控制 */
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
   * ============ 手机档底部抽屉：可拖拽调高度 ============
   *
   * 【为什么需要它】<768px 时正文不让位（让位会把正文挤成一条竖线），
   * 抽屉必然要盖住内容。原来它从顶栏下方一路铺到屏幕底 —— 访客打开后
   * 完全看不到自己在哪一页。允许拖拽后：想专注问答就拉满，想边看边问就拉到半高。
   *
   * 【和 TwinEntry（右下角那颗可拖动的分身按钮）是同一套思路】
   *   pointerdown 记起点 → move 超过阈值才算拖 → up 落定并吸附 → 夹在合法范围内。
   * 区别只有一处：那颗按钮夹的是「屏幕四边」，这里夹的是「三档高度之间」。
   *
   * 【为什么拖动时用 translateY 而不是改 top】
   * 改 top 会触发 layout（每帧重算盒子位置），translation 只走合成层。
   * 拖动期间给整块面板加 translateY(偏移)，松手时才把偏移换算成新的 top 并清零 —— 
   * 视觉上完全连续，代价只有一次 layout。
   */
  const [snap, setSnap] = useState<SheetSnap>('half');
  /**
   * snap 的 ref 镜像，只给「需要读它但不能把它列进依赖」的回调用（见 onSheetPointerUp）。
   * 为什么不干脆把 snap 加进 useCallback 依赖：那会让 handler 每次换档都重建、
   * 绑到新的指针捕获上下文上，拖动中途换档时反而更容易出怪问题；
   * ref 是这里更稳的做法。
   */
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

  /**
   * 顶栏下沿的屏幕坐标 —— 抽屉的 top 下限（再往上就盖住顶栏的按钮了）。
   * 从 --panel-top 读，保证与 CSS 里那份只有同一个来源。
   */
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

      /*
        【收起为什么不直接关，而是先缩成「一条」】
        站长在手机上拖到底的原始诉求是「把挡路的东西挪开」，不是「关掉它」。
        如果拖到底=立刻关闭，那么「只想把它调矮一点」这个更常见的意图
        会因为拖过头而变成「面板没了，还得重新点开」—— 手机上拖动本来就容易过头。
        两段式（先缩成一条 → 再拖才关）把这两个意图分开：
          · 拖到底 = 缩成一条把手，正文全露出来，随时能拉回来（可逆）
          · 已经在「一条」上还继续往下拖 = 明确要关（不可逆，但意图清晰）
        而且关闭本来就有三个入口（面板 ×、Esc、顶栏），不缺这一个。
      */
      /*
        ⚠️ 判「当前是不是已经在 peek 档」必须读 snapRef，不能读闭包里的 snap。
        `onSheetPointerUp` 是 useCallback，依赖里一旦漏掉 `snap`
        （很容易漏 —— 「读状态」比「写状态」隐蔽得多），
        闭包里的 snap 就会永远停在首次渲染的值，表现是
        「已经缩成一条了，再拖还是缩回一条，永远关不掉」。
        snapRef 每次都跟着最新值同步，从根上避开这类 stale closure；
        也不在 setSnap 的 updater 里调 closeChat（updater 必须是纯函数）。
      */
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

  /**
   * 手机档抽屉的 top 值（px）。
   *
   * ⚠️ **≥768px 时固定返回 panelTop**（= 顶栏下沿），不是当前吸附档。
   * 桌面档的右侧栏同样读 --sheet-top（见 JSX 里的 class，md 没有覆盖 top），
   * 如果这里还返回「半高档」的位置，右侧栏会被钉在屏幕中间而不是顶栏下方。
   * 所以断点判断在 JS 里也要做一次 —— 阈值与 CSS 的 md: 严格一致（都是 768）。
   */
  const MD_BREAKPOINT = 768;

  /**
   * 软键盘把输入框埋了这件事。
   * iOS Safari 弹键盘时**不缩小布局视口**，只是把可视区域往上盖一层 ——
   * 这块面板是 position:fixed + bottom:0，它的底边仍按「整屏」算，
   * 于是键盘正好压在输入框上，用户打字时看不见自己打了什么。
   * 页面本身能滚，但 fixed 元素不跟着滚，所以系统那套「聚焦时滚到可见」也救不了它。
   *
   * 解法是盯着 visualViewport：它报的是「键盘之上还剩多少」，
   * 布局高 − 可视高 − 可视区顶部偏移 就是被吃掉的高度，直接抬面板的 bottom。
   * 键盘收起后这个数归 0，那时**不写内联 bottom**，交回 Tailwind 的 bottom-0 / md:bottom-4，
   * 否则桌面端右下角窗口的 16px 下边距会被顶成贴底。
   *
   * ⚠️ **必须声明在 sheetTop 之前**：sheetTop 要读它（键盘弹起时切 full 档），
   * 而 const 有 TDZ —— 顺序放反了运行时会抛 ReferenceError（tsc 不一定报）。
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

  /**
   * 生效的 top。
   * 就绪前（viewportH=0）返回 null → 不写变量 → class 里的 fallback 是 --panel-top，
   * 与改造前行为一致，所以首帧不闪。
   *
   * ⚠️ **键盘弹起时强制铺满**（`kbInset > 0` → 忽略当前档位、直接按 full 算）。
   * 两个原因：
   *   ① 点了输入框就是要专心打字，此时再留半屏正文没有意义；
   *   ② 更关键的是**避免两个「高度来源」互相打架** —— 键盘抬高 bottom（抽屉变矮）、
   *      而某些安卓浏览器弹键盘时 innerHeight 也会缩小（抽屉的 top 又往上跑），
   *      两者叠加会把抽屉挤成一条缝、输入框都看不见。
   *      直接切 full 之后 top 钉在 --panel-top，高度完全由 bottom 决定，方向单一、不会打架。
   */
  const sheetTop = (() => {
    if (viewportH === 0) return null;
    const panelTop = readPanelTop();
    if (viewportW >= MD_BREAKPOINT) return panelTop; // 桌面档：顶栏下方的右侧栏
    if (kbInset > 0) return panelTop; // 键盘弹起：铺满键盘之上的区域
    return snapToTop(snap, viewportH, panelTop); // 手机档：三档吸附
  })();

  /**
   * 面板是否走「半透明 + 背景模糊」。
   *
   * 【触发条件】只在**手机档的半开档**（`<768` 且 `snap === 'half'`、且没弹键盘）成立。
   *
   * 【为什么不做「检测是否盖住文字」】
   * 手机上抽屉只要展开就必然盖住下半屏的正文 —— 几何检测算出来的结果永远是「遮挡」，
   * 等于白算一遍，还多一次整页 DOM 遍历的开销。按档位决定更简单、也更符合直觉：
   * 拉满 = 专心问答（不透明），拉到半高 = 边看边问（半透明）。
   *
   * 【为什么是「半透明底 + backdrop-blur」而不是整体 opacity】
   * 整体 opacity 会把面板里的聊天文字、按钮一起变淡，读起来很吃力 ——
   * 而站长明确要求「不能透明到看不清图案」。backdrop-blur 让**背后的正文**糊成一片
   * 但轮廓可辨（知道下面是什么、能对上下文），面板自己的内容则完全清晰。
   *
   * 【透明度取值】70% 底 + md 模糊 —— **实测对比出来的**（55% / 70% / 85% 三档并排试过）：
   *   · 55%：面板自己的标题都糊进背景了，两边的字互相干扰，两边都读不清（站长要的「不能透明到看不清」的下限）；
   *   · 85%：和 80% 观感几乎一样，看不出「透」，等于白做；
   *   · **70%**：面板文字清晰可读，同时抽屉顶边能看见背后正文的模糊轮廓 —— 平衡点。
   * 模糊用 md（12px）而不是 lg：手机上 backdrop-blur 是每帧重算的合成开销，lg 会在低端机上掉帧。
   */
  const translucent =
    viewportW > 0 &&
    viewportW < MD_BREAKPOINT &&
    snap === 'half' &&
    kbInset === 0 &&
    sheetDragY === null;

  /**
   * 关闭时整块不渲染 —— 这是「消息多了网页不再变长」的前提之一：
   * 面板不占文档流，页面高度与聊天内容彻底解耦。
   */
  if (!open) return null;

  return (
    /*
     * 悬浮面板定位。**两段形态，分界点是 md(768px)，与 ChatInset 的让位阈值严格对齐**：
     *
     * · <md（手机 + 小屏平板）：贴顶栏下方、左右贴边撑到屏幕底部（**底部抽屉**）。
     *   这一区间正文不做让位（让位会把它挤成一条竖线），所以也不该让面板变成
     *   一个横在中间的 400px 小窗 —— 底部抽屉至少把上半屏的正文完整留给访客。
     * · ≥md：收成右下角 400px 宽的窗口，同时 ChatInset 给正文加 432px 右内边距，
     *   正文左移、面板占住那片空白，两者互不干扰。
     *
     * 【为什么 2026-10-06 把分界点从 sm(640) 改成 md(768)】
     * 改前 640~767 这段宽度里，面板已经变成 400px 小窗贴在右侧，
     * 而 ChatInset 的让位当时要 lg(1024) 才生效 —— 于是这段宽度两头不靠：
     * 面板已经窄到不像抽屉，正文又还没开始让位，结果就是盖得一塌糊涂。
     * 现在两边的阈值统一到 md：要么「抽屉 + 不让位」，要么「侧栏 + 让位」，没有中间态。
     *
     * 【top 为什么用 --panel-top 而不是写死像素】
     * 面板只要顶边和顶栏高度对不上，真机上就会出现两种错：压住顶栏的语言/主题按钮，
     * 或者浮在半空、和顶栏之间露出一条背景缝（看着像布局崩了）。
     * 顶栏高度只有 globals.css 里 --header-h 一个来源，面板跟着它算，这两种错都不会发生。
     * 高度一律用 top + bottom 夹出来，不用 100dvh 算，避免出现量到 96px 那种差一位数的错位。
     * kbInset 见上面那段：键盘弹起时把底边抬到键盘上方，否则输入框被埋。
     */
    <div
      id="digital-twin-chat"
      ref={sheetRef}
      /*
        【定位为什么全部走 class + CSS 变量，而不是内联 top/bottom】
        手机档的三档高度是算出来的（见 snapToTop），必须由 JS 提供；
        但 ≥md 的右侧栏形态是固定写法（top 仍跟 --panel-top、bottom 改成 16px）。
        如果手机档的值写成内联样式，它的优先级高于任何 class，
        桌面档会连 top/bottom 一起被内联值顶掉 —— 右侧栏会错位。
        所以：JS 只往 CSS 变量里写值，class 负责「在哪个断点用哪个变量」——
        md 变体在基础变体之后定义、同权重，天然覆盖，不需要 !important。
        （桌面档的 top 没有被 md 覆盖，仍然读 --sheet-top →
          此时 JS 给的值恰好等于 --panel-top，与改造前完全一致。）
      */
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
      {/*
        ===== 拖拽把手（仅手机档）=====
          它是**整条**可抓的横杠区，不是只有那根 4px 的线 —— 4px 的目标太难点中，
          手指按不准。所以外面这层给了 44px 的触控高度（全站触控下限），
          里面的圆杠只负责「看起来能抓」。

          touch-none 必不可少：手机浏览器默认把纵向拖动当滚页面，
          不加这个的话手指一往下拉，页面跟着滚，抽屉纹丝不动。

          点击（不拖）＝ 在半高 / 全屏之间切换 —— 给不方便精细拖动的人留的快捷路径。
          所以它是个 <button>，键盘 Enter/Space 也能触发；拖动则由 pointer 事件接管，
          两者靠「是否超过 8px」区分（与 TwinEntry 同一套阈值逻辑）。
        */}
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
          /*
            peek 档（缩成一条）时把整个面板体藏起来，只留上面那根把手。
            不这么做的话，72px 的高度会让 header/消息区/输入框全被 flex 压扁，
            挤成一团糊在一条缝里 —— 比直接藏掉难看得多，也没有信息量。
          */
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
