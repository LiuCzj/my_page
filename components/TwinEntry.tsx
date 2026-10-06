'use client';

/**
 * 数字分身的常驻入口：一颗可以**拖到任意位置**的浮动 Q 版头像。
 *
 * 【为什么从首屏搬到这里】
 * 原来那个挥手角色孤零零挂在首屏最底下（终端卡之后），问题有三个：
 *   1. 它是首屏的第五个元素，前四个（头像 / 名字 / 一句话 / 终端卡）已经讲完了
 *      「我是谁」，它再出来只是多一个动作，读起来像吉祥物贴纸，不像入口；
 *   2. 只有滚回页面顶部才能点它 —— 读到笔记区想提问，得先滚回去；
 *   3. 它占了 208px 高，把首屏拉长了一截。
 * 搬到右下角之后：首屏干净了，入口反而**更**显眼（滚动时一直在视野里）。
 *
 * 【为什么默认在右下角，而不是左下角】
 * 左下角已经有一颗快捷键提示按钮（components/ShortcutLayer.tsx 的「?」）。
 * 更关键的是：桌面端的聊天面板本身就从**右侧**滑出（md:right-4 md:bottom-4，400px 宽），
 * 入口和面板同侧、同角，点下去面板从按钮的位置长出来，方向和位置都对得上。
 *
 * 【2026-10-06 新增：可拖动 + 记住位置】
 * 站长的反馈很直接：「一直固定在右下角，我想调整成可以随意移动」。
 * 固定角落的坏处是它可能正好压着某段正文（尤其窄屏或读到页面底部时），
 * 而正文位置逐页不同、无法预先避开 —— 那就把决定权交给访客。
 *
 * 【实现要点（三条，缺一个都会出 bug）】
 *
 * ① **拖动与点击必须区分开**。
 *    如果监听 pointerdown 就直接当作「要拖」，那单击也走一遍拖动逻辑，
 *    松手时按「拖到了哪儿」处理，就再也打不开聊天了。
 *    做法是记录按下时的坐标，只有移动超过阈值（DRAG_THRESHOLD px）才进入拖动状态；
 *    没超过阈值的抬手，按「点击」处理 → 打开聊天。
 *
 * ② **位移用 transform，不用 left/top**。
 *    left/top 会触发 layout（每帧重新计算盒子位置），transform 只走合成层，
 *    跟手度完全不同。而且按钮的基准位置是 `right-4 bottom-4`，
 *    用 translate 做**相对偏移**最自然：默认偏移 0 0 = 原来的右下角位置。
 *
 * ③ **必须夹在视口内**。
 *    拖到边缘时如果允许继续拖，按钮会跑到视口外，之后再也抓不回来
 *    （刷新能恢复，但访客不知道）。所以松手前把最终的 translate 夹到
 *    「按钮完整可见」的范围内 —— 上下左右各留 8px 呼吸位。
 *
 * 【位置怎么存、什么时候读】
 * 存 localStorage（键 twin-entry-pos），形如 { dx, dy }（相对默认右下角的偏移）。
 * ⚠️ 位置必须在**挂载后**读，不能在渲染时读 —— 服务端没有 localStorage，
 * 首帧读会让 SSR 与客户端渲染出不同位置，hydration 直接报错。
 * 所以初值是 { dx:0, dy:0 }（= 默认右下角），挂载后 effect 再补上记住的位置。
 *
 * 【面板打开时整颗按钮让位（返回 null）】
 * 桌面端面板正好占着右下角，按钮留着会被压在下面（面板 z-80 > 按钮 z-70），
 * 露出一角反而像没关干净。面板自己有关闭按钮（×）和 Esc，不需要这颗按钮再充当开关。
 *
 * 【为什么用 Q 版角色图而不是一个通用聊天图标】
 * 这个站的核心特色就是「有一个数字分身」——用人物形象，访客一眼知道点开的是「人」
 * 而不是又一个客服弹窗。图是 public/images/mascot-q.png（首屏原来那张，512×512 透明 PNG），
 * 这里缩到 48px 显示；它本来就要为首屏加载，搬到这里没有增加任何请求。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

/** 位置持久化的键。只有一个按钮用它，不需要版本号 */
const POS_KEY = 'twin-entry-pos';
/** 超过这么多像素才算「在拖动」，否则当点击。8px 是触屏上手指自然抖动的常见幅度 */
const DRAG_THRESHOLD = 8;
/** 按钮贴边的最小留白：完全贴边时投影会被裁掉、也难点中 */
const EDGE_GAP = 8;
/** 按钮尺寸（与 className 里的 size-14 一致），夹取时需要用它算边界 */
const BTN_SIZE = 56;
/**
 * 拖动结束后，多久之内的 click 视为「那次拖动补发的」而吞掉。
 * 300ms 的依据：浏览器补发 click 与 pointerup 几乎同时（同一个事件循环附近），
 * 真实的人**不可能**在 300ms 内完成「松手 → 再点一下」。
 */
const CLICK_SUPPRESS_MS = 300;

/** 相对默认位置（右下角）的偏移 */
interface Pos {
  dx: number;
  dy: number;
}

/**
 * 把偏移夹到「按钮完整可见」的范围内。
 *
 * 【为什么按视口算而不是按文档算】按钮是 position:fixed，
 * 它的参照系是**视口**而不是整页 —— 页面滚动时按钮不动，所以只跟视口尺寸有关。
 *
 * 【⚠️ 这里曾经算错过，务必先看懂再动】
 * 默认 class 是 `right-4 bottom-4`，也就是按钮**已经贴着右下角**。
 * 所以 translate 的偏移量不是「自由坐标」，而是**从一个已贴边的位置再往外挪多少**：
 *   · dx < 0 → 往左走（有空间，最多走到视口左边缘）
 *   · dx > 0 → 往右走（**一点空间都没有**，右边已是边界）
 *   · dy < 0 → 往上走（有空间）；dy > 0 → 往下走（无空间）
 * 早先的版本把四个方向都按 `vw - 16 - BTN_SIZE` 夹，等于给「往右/往下」也留了整个屏幕宽 ——
 * 于是往右一拖按钮直接飞出视口（站长反馈的「能把它移到网页外面」就是这么来的），
 * 而往左/往上却正常（因为那个方向的边界值恰好是对的）。
 *
 * 正确边界（视口坐标）：
 *   左边缘最远 dx = -(vw - 右边距 16 - 按钮宽 - EDGE_GAP)
 *   上边缘最远 dy = -(vh - 下边距 16 - 按钮高 - EDGE_GAP)
 *   右/下方向上限恒为 0
 *
 * @param pos 待夹取的偏移（相对右下角的 translate 值）
 * @returns 夹取后的偏移
 */
function clampPos(pos: Pos): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  /**
   * 从默认位置出发，往左/往上各还能走多远（正值，配合取负使用）。
   * 减 16 是默认的 right-4/bottom-4；再减一个 EDGE_GAP 让按钮不贴着屏幕边
   * （完全贴边时投影会被裁掉、也难点中）。
   */
  const maxLeft = Math.max(0, vw - 16 - BTN_SIZE - EDGE_GAP);
  const maxUp = Math.max(0, vh - 16 - BTN_SIZE - EDGE_GAP);
  return {
    // 上限是 0 而不是 maxLeft：默认已在最右，往右没有空间
    dx: Math.max(-maxLeft, Math.min(0, pos.dx)),
    // 同理，默认已在最下
    dy: Math.max(-maxUp, Math.min(0, pos.dy)),
  };
}

/**
 * 读取记住的位置。
 * @returns 解析失败 / 没有存过时返回默认 { dx:0, dy:0 }
 */
function loadPos(): Pos {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return { dx: 0, dy: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.dx !== 'number' || typeof parsed?.dy !== 'number') {
      return { dx: 0, dy: 0 };
    }
    return { dx: parsed.dx, dy: parsed.dy };
  } catch {
    return { dx: 0, dy: 0 };
  }
}

/**
 * 右下角常驻的数字分身入口按钮（可拖动）。
 *
 * @returns 一颗可拖动的悬浮头像按钮；聊天面板已打开时返回 null（让位给面板）
 */
export default function TwinEntry() {
  const { d } = useI18n();
  /** open 决定要不要让位；openChat 是打开动作（顶栏、页脚用的是同一个 Context） */
  const { open, openChat } = useTwinChat();

  /** 已落定的位置（松手后的最终值，也是渲染用的值） */
  const [pos, setPos] = useState<Pos>({ dx: 0, dy: 0 });
  /** 拖动过程中的实时位置；null 表示「当前没在拖」 */
  const [dragPos, setDragPos] = useState<Pos | null>(null);
  /** 挂载后才读 localStorage，避免 hydration 不一致（见文件头第 4 段） */
  const [mounted, setMounted] = useState(false);
  /**
   * 拖动刚结束时浏览器会补一个 click，那一下不该打开聊天。
   *
   * ⚠️ **存的是「时间戳」而不是布尔标志**（2026-10-06 修）。
   * 布尔标志有个死角：它靠「onClick 一定会被调用一次」来复位。
   * 但拖动结束时浏览器**不保证**补发 click —— 手机上手指离开元素、或者
   * `touch-none` 把默认行为改掉时都可能不补。那样标志会永远停在 true，
   * 之后**每一次点击都打不开面板**，而且刷新才恢复，极难排查。
   * 改存时间戳：只吞掉「拖动结束后 CLICK_SUPPRESS_MS 之内」的那个 click，
   * 超时自动失效，标志不会卡死。
   */
  const suppressClickUntil = useRef(0);

  /**
   * 一次指针交互的临时数据。放 ref 不放 state：
   * 这些值每一帧都在变（尤其 last），用 state 会触发无意义的重渲染。
   */
  const gesture = useRef<{
    /** 指针按下时在屏幕上的位置 */
    startX: number;
    startY: number;
    /** 按下时按钮已有的偏移（拖动是从这个基准上加的） */
    baseDx: number;
    baseDy: number;
    /** 是否已越过阈值、进入「真在拖」的状态 */
    dragging: boolean;
  } | null>(null);

  // 挂载后补上记住的位置。夹一次是必要的：上一次可能是在更大的窗口里存的
  useEffect(() => {
    setMounted(true);
    setPos(clampPos(loadPos()));
  }, []);

  /*
    窗口尺寸变化时重新夹一次位置。
    不改的话：在大屏上把按钮拖到很靠左，缩到手机宽度后它就出界了。
    只在尺寸真的变化时算，且不加节流 —— resize 触发频率可控，夹取本身是常数级。
  */
  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setPos((prev) => clampPos(prev));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mounted]);

  /** 把位置写进 localStorage。失败（隐私模式/配额满）就静默放弃，不影响使用 */
  const persistPos = useCallback((next: Pos) => {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      // 记不住位置的代价只是「下次回到右下角」，按钮本身照常可用
    }
  }, []);

  /**
   * 指针按下：记录起点，但**先不进入拖动状态** ——
   * 是否算拖动要等移动超过阈值才决定（见文件头要点 ①）。
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // 只响应主键（左键 / 单指）。右键和中键留给浏览器自身行为
      if (e.button !== 0) return;
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseDx: pos.dx,
        baseDy: pos.dy,
        dragging: false,
      };
      /*
        捕获指针：手指/鼠标移出按钮范围后事件仍然发给这个元素。
        没有它的话，快速拖动时指针一离开按钮，move 事件就断了，按钮会「甩不掉」。

        ⚠️ 必须包 try：指针已经不活跃（合成事件、或系统在按下与这次调用之间
        把它回收了）时会抛 NotFoundError。不包的话这个异常会冒到 window 上、
        在控制台留一条红字，而它其实完全不影响功能 —— gesture.current 在上面
        已经赋值好了，捕获失败只是退化成「快速拖可能甩不掉」，不该当作错误。
        与下面 releasePointerCapture 的处理保持对称。
      */
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 拿不到捕获也能拖，只是指针移出按钮后可能断线；不打扰访客
      }
    },
    [pos.dx, pos.dy],
  );

  /**
   * 指针移动：越过阈值后开始实时更新位置。
   * 只有在「已进入拖动」或「本次移动确实超过阈值」时才 setState，
   * 单纯点击产生的微小抖动不会引起任何重渲染。
   */
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    const rawDx = g.baseDx + (e.clientX - g.startX);
    const rawDy = g.baseDy + (e.clientY - g.startY);

    if (!g.dragging) {
      const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
      if (moved < DRAG_THRESHOLD) return; // 还没到阈值，当作可能的点击，先不动
      g.dragging = true;
    }
    // 拖动中也不越界，实时夹取 —— 否则按钮会跟手跑到屏幕外，看着像丢了
    setDragPos(clampPos({ dx: rawDx, dy: rawDy }));
  }, []);

  /**
   * 指针抬起，分两种情况：
   *   · 没进入过拖动 → 这是一次**点击**，交给随后的 click 事件去打开聊天；
   *   · 拖动过 → 落定位置并持久化，并**吞掉**随后那个 click（不打开聊天）。
   *     （拖完手一松就弹窗会很烦，访客只是想把它挪开。）
   */
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // 指针已经被系统释放（比如触屏被判定成滚动）时会抛，忽略即可
      }

      if (!g.dragging) return; // 单击：什么都不做，等 click 事件来开面板

      // 只用时间戳封住「刚刚那次拖动补发的 click」，不用布尔标志（会卡死，见 ref 声明处）
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
      // 以最后一次实时位置为准落定；dragPos 为 null 说明这次移动没产生有效更新，保持原值
      setDragPos((live) => {
        const settled = clampPos(live ?? { dx: g.baseDx, dy: g.baseDy });
        setPos(settled);
        persistPos(settled);
        return null;
      });
    },
    [persistPos],
  );

  /** 指针被系统取消（来电、手势抢占）：放弃本次手势，位置退回按下前的值 */
  const onPointerCancel = useCallback(() => {
    gesture.current = null;
    setDragPos(null);
  }, []);

  // 面板占了右下角，按钮让位。不写动画 —— 让位是瞬间的，渐变反而会跟面板的滑入打架
  if (open) return null;

  // 拖动中用实时位置，其余时候用落定位置
  const shown = dragPos ?? pos;

  return (
    <button
      type="button"
      /*
        【点击 = 打开面板，这里是唯一的入口】
        click 事件在「指针单击」和「键盘 Enter/Space」下都会触发，
        所以不需要再区分键盘与指针 —— 只要把「拖动刚结束那一下」挡掉即可。
        挡的方式是比时间戳（见 suppressClickUntil 声明处的说明）：
        只有刚刚拖动过、且那个 click 落在抑制窗口内才吞掉，其余一律打开面板。
      */
      onClick={(e) => {
        if (Date.now() < suppressClickUntil.current) {
          // 这次 click 是拖动补发的，不是「想打开」——吞掉，并把窗口立刻关掉
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
      // 复用首屏那套文案（「数字分身聊天窗开关」），读屏与顶栏、页脚三处口径一致
      aria-label={d.hero.robotAria}
      aria-haspopup="dialog"
      /*
        定位与层级：
        · fixed right-4 bottom-4 —— 默认落在聊天面板将来展开的位置
        · translate(dx,dy) —— 访客拖动后的偏移（见文件头要点 ②）
        · touch-none —— 触屏上禁掉浏览器默认的滚动手势，否则拖动会变成滚页面
        · z-[70] —— 低于聊天面板（z-80）、高于顶栏（z-50）
        · size-14（56px）—— 比全站 44px 触控下限再大一档
        · 拖动中关掉 hover 缩放与过渡，否则跟手时按钮自己还在动，读起来很怪
      */
      className={`fixed right-4 bottom-4 z-[70] flex size-14 items-center justify-center rounded-full border border-border bg-card shadow-lg touch-none ${
        dragPos ? 'cursor-grabbing' : 'cursor-grab'
      } transition-[border-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:border-accent/60`}
      style={{ transform: `translate(${shown.dx}px, ${shown.dy}px)` }}
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