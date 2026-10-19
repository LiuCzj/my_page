'use client';

/** 数字分身的常驻入口：一颗**四边吸附**的浮动 Q 版头像。 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

/** 位置持久化的键。v3 = 四边吸附（v2 存的是 side/bottom，形状不同，必须换键） */
const POS_KEY = 'twin-entry-pos-v3';
/** 超过这么多像素才算「在拖动」，否则当点击。8px 是触屏上手指自然抖动的常见幅度 */
const DRAG_THRESHOLD = 8;
/** 按钮与视口边缘的留白。完全贴边时投影会被裁掉、也难点中 */
const EDGE_GAP = 16;
/** 按钮尺寸（与 className 里的 size-14 一致），算边界时要用它 */
const BTN_SIZE = 56;
/** 贴边收起后露出的宽度 */
const EXPOSE = 30;
/** 收起时往屏幕外挪的距离 */
const HIDDEN = EDGE_GAP + BTN_SIZE - EXPOSE;
/** 拖动结束后，多久之内的 click 视为「那次拖动补发的」而吞掉 */
const CLICK_SUPPRESS_MS = 300;

/** 贴到哪条边 */
type Edge = 'left' | 'right' | 'top' | 'bottom';
const EDGES: Edge[] = ['left', 'right', 'top', 'bottom'];

/**
 * 落定后的位置。
 * @field edge  贴的边
 * @field along 沿边方向的偏移：left/right 时是按钮**底边**距视口底部的距离；top/bottom 时是按钮**左边缘**距视口左侧的距离
 */
interface Dock {
  edge: Edge;
  along: number;
}

/** 拖动过程中的自由位置（绝对坐标） */
interface FreePos {
  /** 按钮左边缘的 x 坐标 */
  x: number;
  /** 按钮底边距视口底部的距离 */
  bottom: number;
}

/**
 * 顶栏下沿的缓存值。getComputedStyle 会触发样式重算，不能每次 pointermove 都调。
 * 挂载与 resize 时刷新一次即可。
 */
let panelTopCache = 64;

/**
 * 读一次顶栏下沿（--panel-top 是 calc 表达式，getComputedStyle 会算成 px）
 * @returns 顶栏下沿的 y 坐标
 */
function measurePanelTop(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--panel-top').trim();
  const px = parseFloat(raw);
  panelTopCache = Number.isFinite(px) ? px : 64;
  return panelTopCache;
}

/** 自由位置的合法范围。bottom 从下往上量：越小越靠底，越大越靠顶 */
function bounds() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    vw,
    vh,
    minX: EDGE_GAP,
    maxX: Math.max(EDGE_GAP, vw - EDGE_GAP - BTN_SIZE),
    minBottom: EDGE_GAP,
    // 贴到上边时不能压住顶栏，所以上限是「顶栏下沿」而不是视口顶端
    maxBottom: Math.max(EDGE_GAP, vh - panelTopCache - BTN_SIZE),
  };
}

/** 把自由位置夹进可视范围：拖动时实时调用，否则按钮会被甩到视口外抓不回来 */
function clampFree(x: number, bottom: number): FreePos {
  const b = bounds();
  return {
    x: Math.min(b.maxX, Math.max(b.minX, x)),
    bottom: Math.min(b.maxBottom, Math.max(b.minBottom, bottom)),
  };
}

/** 把沿边偏移夹进合法范围（读存档与 resize 时用） */
function clampAlong(edge: Edge, along: number): number {
  const b = bounds();
  const lo = edge === 'left' || edge === 'right' ? b.minBottom : b.minX;
  const hi = edge === 'left' || edge === 'right' ? b.maxBottom : b.maxX;
  return Math.min(hi, Math.max(lo, along));
}

/** 落定态换算成绝对坐标（拖动起点要用） */
function dockToFree(dock: Dock): FreePos {
  const b = bounds();
  if (dock.edge === 'left') return { x: b.minX, bottom: dock.along };
  if (dock.edge === 'right') return { x: b.maxX, bottom: dock.along };
  if (dock.edge === 'top') return { x: dock.along, bottom: b.maxBottom };
  return { x: dock.along, bottom: b.minBottom };
}

/**
 * 由自由位置求**最近的边**。
 * 四条边都参与比较 —— 只比左右的话，落在上下边缘附近时纵向不会动，等于没吸附。
 * @param pos 松手时的自由位置
 * @returns 贴边 + 沿边偏移
 */
function nearestDock(pos: FreePos): Dock {
  const b = bounds();
  const centerX = pos.x + BTN_SIZE / 2;
  // 中心距顶部的距离：bottom 从下往上量，所以先换成 y 再算
  const centerY = b.vh - (pos.bottom + BTN_SIZE / 2);

  const dist: Record<Edge, number> = {
    left: centerX,
    right: b.vw - centerX,
    // 贴顶的下限是顶栏下沿，所以从那里起算
    top: Math.max(0, centerY - panelTopCache),
    bottom: b.vh - centerY,
  };

  let edge: Edge = 'right';
  let best = Infinity;
  for (const k of EDGES) {
    if (dist[k] < best) {
      best = dist[k];
      edge = k;
    }
  }
  return { edge, along: clampAlong(edge, edge === 'left' || edge === 'right' ? pos.bottom : pos.x) };
}

/**
 * 读取记住的位置。
 * @returns 没存过 / 解析失败 / 形状不对时返回默认「右下角贴边」
 */
function loadDock(): Dock {
  const fallback: Dock = { edge: 'right', along: EDGE_GAP };
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!EDGES.includes(parsed?.edge)) return fallback;
    if (typeof parsed.along !== 'number' || !Number.isFinite(parsed.along)) return fallback;
    return { edge: parsed.edge, along: clampAlong(parsed.edge, parsed.along) };
  } catch {
    return fallback;
  }
}

/**
 * 贴边吸附的数字分身入口按钮。
 * @returns 一颗可拖动、松手吸附到**最近一条边**的悬浮头像；聊天面板已打开时返回 null（让位给面板）
 */
export default function TwinEntry() {
  const { d } = useI18n();
  /** open 决定要不要让位；openChat 是打开动作（顶栏、页脚用的是同一个 Context） */
  const { open, openChat } = useTwinChat();

  /** 落定后的位置，也是渲染静止态用的值 */
  const [dock, setDock] = useState<Dock>({ edge: 'right', along: EDGE_GAP });
  /** 拖动中的自由位置；null 表示「当前没在拖」 */
  const [dragPos, setDragPos] = useState<FreePos | null>(null);
  /** 挂载后才读 localStorage，避免 hydration 不一致 */
  const [mounted, setMounted] = useState(false);

  /** 「展开」的三个触发源。任何一个为真，按钮就滑回完整可见 */
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  /** 拖动刚结束时浏览器会补一个 click，那一下不该打开聊天 */
  const suppressClickUntil = useRef(0);

  /** 拖动过程中的最新位置，供 onPointerUp 读取 */
  const livePosRef = useRef<FreePos | null>(null);

  /** 一次指针交互的临时数据。放 ref 不放 state */
  const gesture = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseBottom: number;
    dragging: boolean;
  } | null>(null);

  // 挂载后补上记住的位置。夹一次是必要的：上一次可能是在更大的窗口里存的
  useEffect(() => {
    measurePanelTop();
    setMounted(true);
    setDock(loadDock());
  }, []);

  /* 窗口尺寸变化：重新量顶栏、并把位置夹回可视范围 */
  useEffect(() => {
    if (!mounted) return;
    const onResize = () => {
      measurePanelTop();
      setDock((prev) => ({ ...prev, along: clampAlong(prev.edge, prev.along) }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mounted]);

  /** 把位置写进 localStorage。失败（隐私模式 / 配额满）就静默放弃，不影响使用 */
  const persistDock = useCallback((next: Dock) => {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      // 记不住位置的代价只是「下次回到右下角」，按钮本身照常可用
    }
  }, []);

  /** 指针按下：记录起点，但先不进入拖动状态 —— 是否算拖动要等移动超过阈值才决定 */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // 只响应主键（左键 / 单指）。右键和中键留给浏览器自身行为
      if (e.button !== 0) return;
      setPressed(true);
      const base = dockToFree(dock);
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: base.x,
        baseBottom: base.bottom,
        dragging: false,
      };
      // 捕获指针：手指/鼠标移出按钮范围后事件仍然发给这个元素
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 拿不到捕获也能拖，只是指针移出按钮后可能断线；不打扰访客
      }
    },
    [dock],
  );

  /** 指针移动：越过阈值后开始实时更新位置 */
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    const rawX = g.baseX + (e.clientX - g.startX);
    // 屏幕坐标 y 向下增大，而 bottom 向上增大 —— 所以这里是「减」
    const rawBottom = g.baseBottom - (e.clientY - g.startY);

    if (!g.dragging) {
      const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      if (moved < DRAG_THRESHOLD) return; // 还没到阈值，当作可能的点击，先不动
      g.dragging = true;
    }
    const next = clampFree(rawX, rawBottom);
    livePosRef.current = next;
    setDragPos(next);
  }, []);

  /** 指针抬起：松手吸附到最近的边 */
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = gesture.current;
      gesture.current = null;
      setPressed(false);
      if (!g) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // 指针已经被系统释放（比如触屏被判定成滚动）时会抛，忽略即可
      }

      if (!g.dragging) return; // 单击：什么都不做，等 click 事件来开面板

      // 只用时间戳封住「刚刚那次拖动补发的 click」，不用布尔标志（会卡死）
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;

      const from = livePosRef.current ?? { x: g.baseX, bottom: g.baseBottom };
      const settled = nearestDock(from);
      livePosRef.current = null;
      setDock(settled);
      persistDock(settled);
      setDragPos(null);
    },
    [persistDock],
  );

  /** 指针被系统取消（来电、手势抢占）：放弃本次手势，位置退回按下前的值 */
  const onPointerCancel = useCallback(() => {
    gesture.current = null;
    livePosRef.current = null;
    setPressed(false);
    setDragPos(null);
  }, []);

  // 面板占了右下角，按钮让位。不写动画 —— 让位是瞬间的，渐变反而会跟面板的滑入打架
  if (open) return null;

  const dragging = dragPos !== null;
  /** 展开的四个触发源：悬停 / 聚焦 / 按下 / 拖动中 */
  const revealed = hovered || focused || pressed || dragging;
  /** 收起 = 沿贴的那条边往屏幕外挪一截，只露出 EXPOSE */
  const hidden = revealed ? 0 : HIDDEN;

  /*
    两套定位，二选一：
    · 拖动中：left + bottom 绝对定位，跟手；
    · 静止：贴哪条边就用哪条边的 CSS 锚点（left/right/top/bottom），
      再用 transform 做「收起」的位移。transform 是唯一带过渡的属性。
  */
  const style: React.CSSProperties = dragging
    ? { left: dragPos.x, right: 'auto', top: 'auto', bottom: dragPos.bottom, transform: 'none' }
    : dock.edge === 'left'
      ? { left: EDGE_GAP, right: 'auto', top: 'auto', bottom: dock.along, transform: `translateX(${-hidden}px)` }
      : dock.edge === 'right'
        ? { right: EDGE_GAP, left: 'auto', top: 'auto', bottom: dock.along, transform: `translateX(${hidden}px)` }
        : dock.edge === 'top'
          ? { top: panelTopCache, bottom: 'auto', left: dock.along, right: 'auto', transform: `translateY(${-hidden}px)` }
          : { bottom: EDGE_GAP, top: 'auto', left: dock.along, right: 'auto', transform: `translateY(${hidden}px)` };

  return (
    <button
      type="button"
      /* click 在「指针单击」和「键盘 Enter/Space」下都会触发，所以只要把「拖动刚结束那一下」挡掉 */
      onClick={(e) => {
        if (Date.now() < suppressClickUntil.current) {
          // 这次 click 是拖动补发的，不是「想打开」——吞掉
          suppressClickUntil.current = 0;
          e.preventDefault();
          return;
        }
        openChat();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // 桌面：鼠标靠近就滑出来。触屏不触发这两个事件，靠上面的 pressed 展开
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // 键盘 Tab 到它也要展开，否则焦点圈会画在屏幕外
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // 复用首屏那套文案（「数字分身聊天窗开关」），读屏与顶栏、页脚三处口径一致
      aria-label={d.hero.robotAria}
      aria-haspopup="dialog"
      className={`fixed z-[70] flex size-14 items-center justify-center rounded-full border border-border bg-card shadow-lg touch-none ${
        dragging ? 'cursor-grabbing transition-none' : 'cursor-grab transition-transform duration-200 ease-out'
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:border-accent/60`}
      style={style}
    >
      {/* alt 留空 + aria-hidden：按钮本身已有 aria-label，图再报一遍名字就是重复 */}
      <img
        src="/images/mascot-q.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-12 select-none object-contain"
      />
    </button>
  );
}
