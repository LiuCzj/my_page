'use client';

/**
 * 数字分身的常驻入口：一颗**贴边吸附**的浮动 Q 版头像。
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
 * 【2026-10-06 第一版：可拖动 + 记住位置】
 * 站长的反馈很直接：「一直固定在右下角，我想调整成可以随意移动」。
 * 固定角落的坏处是它可能正好压着某段正文（尤其窄屏或读到页面底部时），
 * 而正文位置逐页不同、无法预先避开 —— 那就把决定权交给访客。
 *
 * 【2026-10-06 第二版：贴边吸附 + 收起（本次改动）】
 * 第一版能拖了，但拖完停在哪儿就是哪儿 —— 停在页面正中间一样会压住正文，
 * 而且**半个按钮悬在中间**比贴着角更碍眼。访客真正想要的不是「自由摆放」，
 * 是「别挡着我读字」。所以改成两件事：
 *
 *   ① **吸附**：松手时按按钮中心离哪边近，自动贴到左边缘或右边缘。
 *      垂直位置保留 —— 高度是访客自己挑的，水平位置则由「屏幕边」这个唯一合理答案决定。
 *   ② **收起**：贴边之后按钮再往屏幕外挪一截，只露出 EXPOSE 那么多。
 *      不挡字的同时，还看得出「这儿有个东西」。
 *
 * 【⚠️ 为什么「收起」是往屏幕外挪，而不是缩小或变透明】
 * 缩小会让 48px 的角色图糊成一团；变透明会让它在深色底上直接消失。
 * 只有「挪出去一部分」既保留了完整的视觉形象（看得出是个人），又真的让出了宽度。
 *
 * 【⚠️ 露多少：EXPOSE 这个值是在浏览器里量出来的，不是拍的】
 * 项目有一条既有规矩：「全站可点元素实测最短边 ≥44px」。
 * 贴边露出 EXPOSE=30px 时，静止状态的可见点击区是 30×56 —— **宽度低于这条线**。
 * 为什么还是选了 30 而不是 44（44 只能藏 12px，几乎看不出「收起」）：
 *   · 屏幕边缘是 Fitts 定律里的特殊位置 —— 手指往边上推会被屏幕边界「兜住」，
 *     不存在推过头的问题，命中难度远低于同样宽度的页面内元素；
 *   · 而且**按下的一瞬间它就会滑出来**（pointerdown 即展开），
 *     真正需要「瞄准」的只有按下那一下，之后手指底下已经是一个完整的 56px 圆。
 * 两个因素叠起来，30px 在真机上是够用的。如果站长觉得还是太窄，
 * 把 EXPOSE 改成 44 即可（一行）。
 *
 * 【实现要点（四条，缺一个都会出 bug）】
 *
 * ① **拖动与点击必须区分开**。
 *    如果监听 pointerdown 就直接当作「要拖」，那单击也走一遍拖动逻辑，
 *    松手时按「拖到了哪儿」处理，就再也打不开聊天了。
 *    做法是记录按下时的坐标，只有移动超过阈值（DRAG_THRESHOLD px）才进入拖动状态；
 *    没超过阈值的抬手，按「点击」处理 → 打开聊天。
 *
 * ② **拖动中用绝对定位，静止时用「贴边 + 位移」**。
 *    拖动过程中位置是自由的两个数（x / bottom），只能用 left + bottom 直接摆。
 *    静止时则回到 `left:16` 或 `right:16` 这样的**贴边锚点**，再用 translateX 做「收起」的位移。
 *    这样渲染不依赖 `window.innerWidth` —— 否则服务端渲染时算不出 x，首帧会错位、hydration 会报错。
 *
 * ③ **只有 transform 参与过渡**。
 *    吸附那一下必须是**瞬间**的（磁铁吸上去的感觉），所以 left / bottom 不加 transition；
 *    「收起 / 展开」是渐进的，只给 transform 加。
 *
 * ④ **必须夹在视口内**。
 *    拖动时如果允许越界，按钮会跑到视口外，之后再也抓不回来
 *    （刷新能恢复，但访客不知道）。所以拖动过程中就实时夹取。
 *
 * 【位置怎么存、什么时候读】
 * 存 localStorage（键 twin-entry-pos-v2），形如 { side, bottom }。
 * ⚠️ 位置必须在**挂载后**读，不能在渲染时读 —— 服务端没有 localStorage，
 * 首帧读会让 SSR 与客户端渲染出不同位置，hydration 直接报错。
 * 所以初值是「右下角、贴边」，挂载后 effect 再补上记住的位置。
 * ⚠️ 键名带 v2：第一版存的是 `{ dx, dy }`（相对右下角的自由偏移），形状完全不同，
 *    继续用同一个键会解析出错误的位置。换键比写迁移代码更省事，代价只是访客的位置偏好重置一次。
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

/** 位置持久化的键。v2 = 吸附版（第一版的 dx/dy 形状不同，必须换键） */
const POS_KEY = 'twin-entry-pos-v2';
/** 超过这么多像素才算「在拖动」，否则当点击。8px 是触屏上手指自然抖动的常见幅度 */
const DRAG_THRESHOLD = 8;
/** 按钮与视口边缘的留白。完全贴边时投影会被裁掉、也难点中 */
const EDGE_GAP = 16;
/** 按钮尺寸（与 className 里的 size-14 一致），算边界时要用它 */
const BTN_SIZE = 56;
/**
 * 贴边收起后露出的宽度。
 * ⚠️ 这个值低于项目自己的 44px 触控线，是**权衡后的选择** ——
 * 理由见文件头「露多少」那一段，改之前先读。
 */
const EXPOSE = 30;
/**
 * 收起时往屏幕外挪的距离。
 *
 * ⚠️ **必须把 EDGE_GAP 也算进去**，否则露出来的不是 EXPOSE 那么多。
 * 按钮静止时先被 `right: EDGE_GAP` 推离边缘 16px，那 16px 也是可见的，
 * 所以真正露出的宽度 = EDGE_GAP + BTN_SIZE - HIDDEN。
 * 想让它正好等于 EXPOSE，HIDDEN 就得是 `EDGE_GAP + BTN_SIZE - EXPOSE`。
 * （早先漏了 EDGE_GAP 这一项，结果露出 46px，看着根本没「收起」。）
 */
const HIDDEN = EDGE_GAP + BTN_SIZE - EXPOSE;
/**
 * 拖动结束后，多久之内的 click 视为「那次拖动补发的」而吞掉。
 * 300ms 的依据：浏览器补发 click 与 pointerup 几乎同时（同一个事件循环附近），
 * 真实的人**不可能**在 300ms 内完成「松手 → 再点一下」。
 */
const CLICK_SUPPRESS_MS = 300;

/** 贴到哪一边 */
type Side = 'left' | 'right';

/** 落定后的位置：贴边 + 距视口底部多远 */
interface Dock {
  side: Side;
  /** 按钮**底边**到视口底部的距离 */
  bottom: number;
}

/** 拖动过程中的自由位置（两个方向都是绝对坐标） */
interface FreePos {
  /** 按钮**左边缘**的 x 坐标 */
  x: number;
  bottom: number;
}

/** 把距底部的距离夹进可视范围（resize 与读取存档时都要用） */
function clampBottom(bottom: number): number {
  const vh = window.innerHeight;
  const max = Math.max(EDGE_GAP, vh - EDGE_GAP - BTN_SIZE);
  return Math.min(max, Math.max(EDGE_GAP, bottom));
}

/** 把自由位置夹进可视范围：拖动时实时调用，否则按钮会被甩到视口外抓不回来 */
function clampFree(x: number, bottom: number): FreePos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxX = Math.max(EDGE_GAP, vw - EDGE_GAP - BTN_SIZE);
  const maxBottom = Math.max(EDGE_GAP, vh - EDGE_GAP - BTN_SIZE);
  return {
    x: Math.min(maxX, Math.max(EDGE_GAP, x)),
    bottom: Math.min(maxBottom, Math.max(EDGE_GAP, bottom)),
  };
}

/** 按钮静止时在水平方向上的锚点（贴边位置，不含「收起」的位移） */
function anchorX(side: Side): number {
  return side === 'right' ? window.innerWidth - EDGE_GAP - BTN_SIZE : EDGE_GAP;
}

/**
 * 读取记住的位置。
 * @returns 没存过 / 解析失败 / 形状不对时返回默认「右下角贴边」
 */
function loadDock(): Dock {
  const fallback: Dock = { side: 'right', bottom: EDGE_GAP };
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.side !== 'left' && parsed?.side !== 'right') return fallback;
    if (typeof parsed.bottom !== 'number' || !Number.isFinite(parsed.bottom)) return fallback;
    return { side: parsed.side, bottom: clampBottom(parsed.bottom) };
  } catch {
    return fallback;
  }
}

/**
 * 贴边吸附的数字分身入口按钮。
 *
 * @returns 一颗可拖动、松手吸附到左右边缘的悬浮头像；聊天面板已打开时返回 null（让位给面板）
 */
export default function TwinEntry() {
  const { d } = useI18n();
  /** open 决定要不要让位；openChat 是打开动作（顶栏、页脚用的是同一个 Context） */
  const { open, openChat } = useTwinChat();

  /** 落定后的位置（贴边 + 高度），也是渲染静止态用的值 */
  const [dock, setDock] = useState<Dock>({ side: 'right', bottom: EDGE_GAP });
  /** 拖动中的自由位置；null 表示「当前没在拖」 */
  const [dragPos, setDragPos] = useState<FreePos | null>(null);
  /** 挂载后才读 localStorage，避免 hydration 不一致（见文件头「位置怎么存」） */
  const [mounted, setMounted] = useState(false);

  /**
   * 「展开」的三个触发源。任何一个为真，按钮就滑回完整可见。
   * 分开记而不是合成一个布尔量：触屏没有 hover，鼠标设备没有「按下」的持续态，
   * 合成之后没法表达「触屏按下即展开」这条规则。
   */
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

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
   * 拖动过程中的最新位置。
   *
   * 【为什么 state 和 ref 各存一份】`dragPos`（state）负责**渲染**；
   * 这个 ref 负责让 `onPointerUp` 拿到**最新值**而不必把 `dragPos` 写进依赖数组
   * —— 否则拖动过程中每一帧都会重建一次事件处理器。
   *
   * ⚠️ 不要改用「在 setDragPos 的更新函数里做副作用」那种写法（早先就是那样）：
   * 更新函数必须是**纯**的，React 在严格模式下会故意调用两次来检测副作用，
   * 于是 setDock / persistDock 也会跟着跑两遍。这里两次调用恰好是幂等的，
   * 但依赖「恰好幂等」是运气，不是设计。
   */
  const livePosRef = useRef<FreePos | null>(null);

  /**
   * 一次指针交互的临时数据。放 ref 不放 state：
   * 这些值每一帧都在变，用 state 会触发无意义的重渲染。
   */
  const gesture = useRef<{
    /** 指针按下时在屏幕上的位置 */
    startX: number;
    startY: number;
    /** 按下时按钮已有的位置（拖动是从这个基准上加的） */
    baseX: number;
    baseBottom: number;
    /** 是否已越过阈值、进入「真在拖」的状态 */
    dragging: boolean;
  } | null>(null);

  // 挂载后补上记住的位置。夹一次是必要的：上一次可能是在更大的窗口里存的
  useEffect(() => {
    setMounted(true);
    setDock(loadDock());
  }, []);

  /*
    窗口尺寸变化时重新夹一次高度。
    不改的话：在大屏上把按钮放到很靠下的位置，缩到手机高度后它就出界了。
    水平方向不用管 —— 贴边锚点是 left:16 / right:16，本来就跟着视口走。
  */
  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setDock((prev) => ({ ...prev, bottom: clampBottom(prev.bottom) }));
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

  /**
   * 指针按下：记录起点，但**先不进入拖动状态** ——
   * 是否算拖动要等移动超过阈值才决定（见文件头要点 ①）。
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // 只响应主键（左键 / 单指）。右键和中键留给浏览器自身行为
      if (e.button !== 0) return;
      setPressed(true);
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: anchorX(dock.side),
        baseBottom: dock.bottom,
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
    [dock.side, dock.bottom],
  );

  /**
   * 指针移动：越过阈值后开始实时更新位置。
   * 只有在「已进入拖动」或「本次移动确实超过阈值」时才 setState，
   * 单纯点击产生的微小抖动不会引起任何重渲染。
   */
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
    // 拖动中也不越界，实时夹取 —— 否则按钮会跟手跑到屏幕外，看着像丢了
    const next = clampFree(rawX, rawBottom);
    livePosRef.current = next; // 供 onPointerUp 读取（见 livePosRef 的说明）
    setDragPos(next);
  }, []);

  /**
   * 指针抬起，分两种情况：
   *   · 没进入过拖动 → 这是一次**点击**，交给随后的 click 事件去打开聊天；
   *   · 拖动过 → **吸附**到最近的边缘并落定，再吞掉随后那个 click。
   *     （拖完手一松就弹窗会很烦，访客只是想把它挪开。）
   */
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

      // 只用时间戳封住「刚刚那次拖动补发的 click」，不用布尔标志（会卡死，见 ref 声明处）
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;

      /*
        吸附判据：按钮**中心**在视口左半边就贴左，右半边就贴右。
        用中心而不是左边缘 —— 按钮宽 56px，用左边缘的话「刚好跨过中线」时
        会判成贴左，但视觉上它明明更靠右，吸过去会显得很突兀。
      */
      const from = livePosRef.current ?? { x: g.baseX, bottom: g.baseBottom };
      const centerX = from.x + BTN_SIZE / 2;
      const side: Side = centerX < window.innerWidth / 2 ? 'left' : 'right';
      const settled: Dock = { side, bottom: clampBottom(from.bottom) };
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
  /** 收起 = 往屏幕外挪一截，只露出 EXPOSE */
  const hiddenX = revealed ? 0 : dock.side === 'right' ? HIDDEN : -HIDDEN;

  /*
    两套定位，二选一（见文件头要点 ②）：
      · 拖动中：left + bottom 绝对定位，transform 关掉（跟手，不能有过渡）
      · 静止时：贴边锚点（left:16 或 right:16）+ translateX 做收起位移
    静止态不依赖 window.innerWidth，所以服务端也能渲染出正确的位置。
  */
  const style: React.CSSProperties = dragging
    ? { left: dragPos.x, right: 'auto', bottom: dragPos.bottom, transform: 'none' }
    : {
        left: dock.side === 'left' ? EDGE_GAP : 'auto',
        right: dock.side === 'right' ? EDGE_GAP : 'auto',
        bottom: dock.bottom,
        transform: `translateX(${hiddenX}px)`,
      };

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
      // 桌面：鼠标靠近就滑出来。触屏不触发这两个事件，靠上面的 pressed 展开
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // 键盘 Tab 到它也要展开，否则焦点圈会画在屏幕外
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // 复用首屏那套文案（「数字分身聊天窗开关」），读屏与顶栏、页脚三处口径一致
      aria-label={d.hero.robotAria}
      aria-haspopup="dialog"
      /*
        层级与交互：
        · z-[70] —— 低于聊天面板（z-80）、高于顶栏（z-50）
        · size-14（56px）—— 比全站 44px 触控下限再大一档
        · touch-none —— 触屏上禁掉浏览器默认的滚动手势，否则拖动会变成滚页面
        · 只有 transform 有过渡（收起 / 展开）；拖动中整体关掉，否则跟手时按钮自己还在动
        · 位置全部走 style（见上面的 style 常量），这里不写 left/right/bottom 类
      */
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
