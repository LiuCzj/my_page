'use client';

/**
 * 磁贴区：籍贯、最喜欢的工具、技术栈、工具、连接。
 *
 * 【为什么是磁贴而不是一列一节】
 * 五块内容性质完全不同（一个图形、两个清单、一组链接），排成等高卡片阵列最丑。
 * 这里用一张不规则网格：籍贯占两列（地球需要横向空间）、
 * 最喜欢的工具挤在右侧窄列、技术栈整条铺开（滚动条需要宽度）、
 * 工具和连接再分成 2:1。尺寸差异本身就是层次。
 *
 * 【每块磁贴的表情，两条通道】每块带一个 data-cursor-emoji：
 * 桌面上鼠标扫过时，系统箭头由 components/CustomCursor.tsx 换成对应表情（地球块是 ✈️），
 * 触屏没有光标可换，改成点一下在指尖弹一下那枚表情（见 Tile 的 onDown）。
 * CustomCursor 只在真鼠标设备上挂载，触屏不会触发任何光标隐藏，见那里的说明与 globals.css 里那条被门控的规则。
 *
 * 【技术栈的分组怎么不丢】三个组名钉在上方当图例，下面一条长带滚全部条目。
 * 不给每组单开一条带：条目少的组比磁贴还窄，一滚就必然同时露出两份一样的标签。
 */

import { motion } from 'framer-motion';
import { Brain, Globe2, Heart, Link2, Maximize2, Wrench, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import DottedGlobe from '@/components/DottedGlobe';
import Marquee from '@/components/Marquee';
import SocialLinks from '@/components/SocialLinks';
import ContactModal, { type ContactModalVariant } from '@/components/ContactModal';
import ToolIcon from '@/components/ToolIcon';
import SkillAdmin from '@/components/admin/SkillAdmin';
import type { SkillGroupRecord } from '@/lib/content';
import { site, type ToolGlyph } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal, CARD_REVEAL, CARD_STAGGER } from '@/lib/use-reveal';
import { useScrollFocus } from '@/lib/use-scroll-fx';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 一块磁贴。
 *
 * 动画和悬停反馈都挂在同一个 <li> 上，但走的是两条互不干扰的通道：
 * 入场由 framer 写内联 transform，悬停只改 border-color 与 box-shadow
 * （transition 也显式限定成这两项）。如果这里写 transition-all，
 * CSS 会去补间 framer 每帧设的 transform，入场动画会被拖出残影。
 *
 * 刻意不做悬停位移：站里「抬一下」的语义留给真正可点的东西，
 * 这几块只是展示，给的是边缘高亮。
 *
 * 【第三条通道：焦点接力高光】
 * 除了「鼠标指在哪、哪块亮」，还有一条跟着滚动走的：
 * 哪块磁贴靠近视口中心，它就自己亮起来，离开时暗下去（见 lib/use-scroll-fx.ts）。
 * 往下滚的时候，高光在几块磁贴之间依次传递 —— 视线被这条光带着往下走，
 * 不需要箭头，也不需要编号。它只写覆盖层的 opacity，不碰 transform，
 * 所以和上面两条通道都不冲突。
 */
/**
 * 磁贴的装饰色相（2026-10-04 用户要求「颜色更丰富」后新增）。
 *
 * 【它只改两处】标题行那枚小图标的颜色、以及卡片右上角那团极淡的晕染。
 * 正文、标题、按钮、状态一律不受影响 —— 也就是说这几块磁贴在语义上仍然只有
 * 「交互蓝 / 成功青绿 / 品牌紫」三色，多出来的颜色纯粹是画上去的层次。
 * 色值来自 globals.css 的 --tint-* 装饰色板（深浅两档各自调过明度）。
 *
 * 【为什么给每块不同的色相】五块磁贴内容性质本来就不同（一个球、两个清单、
 * 一条技能带、一排工具），原来它们只有「有没有暖色」这一种区别，
 * 扫过去是一片同色的方块。各给一个色相之后，视线能靠颜色先分区、再读内容。
 */
type TileTint = 'sky' | 'teal' | 'violet' | 'coral' | 'amber';

/** 色相 → Tailwind 工具类。集中成一张表，避免在 JSX 里写三元表达式拼类名 */
const TINT_ICON: Record<TileTint, string> = {
  sky: 'text-tint-sky',
  teal: 'text-tint-teal',
  violet: 'text-tint-violet',
  coral: 'text-tint-coral',
  amber: 'text-tint-amber',
};

/** 色相 → 角落晕染用的 CSS 变量名（值由 globals.css 按主题给出） */
const TINT_VAR: Record<TileTint, string> = {
  sky: '--tint-sky',
  teal: '--tint-teal',
  violet: '--tint-violet',
  coral: '--tint-coral',
  amber: '--tint-amber',
};

function Tile({
  span,
  icon,
  title,
  cursorEmoji,
  delay,
  tint = 'sky',
  action,
  children,
}: {
  span: string;
  /**
   * 标题左侧那枚小图标。
   * 【2026-10-04 改成可选】籍贯那块去掉了定位针 —— 标题行已经是「籍贯 · 中国湖南省邵阳市」，
   * 前面再挂一枚地图针只是把同一件事说第三遍。不传即为纯文字标题。
   */
  icon?: React.ReactNode;
  title: string;
  cursorEmoji: string;
  delay: number;
  /** 装饰色相，见上面的 TileTint 说明 */
  tint?: TileTint;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reveal = useReveal(CARD_REVEAL);
  /** 焦点接力：这块磁贴离视口中心越近，下面那层高光越亮 */
  const { ref: focusRef, focus } = useScrollFocus<HTMLLIElement>();
  const glowRef = useRef<HTMLSpanElement>(null);
  /** 触屏弹印：手指点一下，这块的表情就在指尖位置弹出来 */
  const [stamp, setStamp] = useState<{ x: number; y: number; id: number } | null>(null);
  const stampTimer = useRef(0);
  const stampSeq = useRef(0);
  /** 按在地球上、还没抬手的那一点。按下的一刻还不知道这一下是点是拖，先存着 */
  const pending = useRef<{ x: number; y: number; sx: number; sy: number; t: number } | null>(null);

  useEffect(() => () => window.clearTimeout(stampTimer.current), []);

  /**
   * 鼠标邻近发光：把指针位置写进 --gx / --gy，让那团径向渐变跟着走。
   * 直接改 DOM style 而不是 setState —— 每帧 setState 会让整棵 React 子树重渲染，
   * 一个纯跟随效果不该付这个代价。
   */
  const onMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const glow = glowRef.current;
    if (!glow) return;
    const rect = e.currentTarget.getBoundingClientRect();
    glow.style.setProperty('--gx', `${e.clientX - rect.left}px`);
    glow.style.setProperty('--gy', `${e.clientY - rect.top}px`);
  };

  /** 弹印 + 发光一起到位：桌面上这两样都跟着鼠标，触屏只补一个会显得亮了一半 */
  const stampAt = (gx: number, gy: number) => {
    const glow = glowRef.current;
    if (glow) {
      glow.style.setProperty('--gx', `${gx}px`);
      glow.style.setProperty('--gy', `${gy}px`);
    }
    window.clearTimeout(stampTimer.current);
    stampSeq.current += 1;
    setStamp({ x: gx, y: gy, id: stampSeq.current });
    stampTimer.current = window.setTimeout(() => setStamp(null), STAMP_MS);
  };

  /**
   * 触屏没有光标，所以桌面那套「箭头换成 ✈️ / ❤️ / 🔧」在手机上物理上不存在 ——
   * 不是漏做了，是那块屏幕上根本没有一个可以替换的东西。
   * 这里给它的等价物：手指点在哪，表情就在哪弹一下（动画见 globals.css 的 emoji-pop）。
   *
   * 三条避让：
   * - 只认非鼠标。鼠标有 :hover，再弹一个印子只会挡住内容。
   * - 点在 a / button 上不弹。链接和按钮各有自己的动作，抢它们的点击会既挡住内容
   *   又让人以为点错了。
   * - 收尾用定时器而不是 animationend。全局那条 prefers-reduced-motion 会把
   *   animation-duration 压成 0.001ms，事件立刻就来，印子等于没出现过。
   *
   * 【地球为什么走「抬手才弹」这一支】那块球是要按住左右拖的，按下去的一刻
   * 分不清这一下是点还是拖：立刻弹的话，每转一次球都掉出一架 ✈️。
   * 所以地球上的点先存下来，抬手时确认没拖过、也没按太久，才当这是一下点击。
   */
  const onDown = (e: React.PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const gx = e.clientX - rect.left;
    const gy = e.clientY - rect.top;
    if (target.closest('canvas')) {
      pending.current = { x: gx, y: gy, sx: e.clientX, sy: e.clientY, t: e.timeStamp };
      const glow = glowRef.current;
      if (glow) {
        glow.style.setProperty('--gx', `${gx}px`);
        glow.style.setProperty('--gy', `${gy}px`);
      }
      return;
    }
    pending.current = null;
    stampAt(gx, gy);
  };

  const onUp = (e: React.PointerEvent<HTMLLIElement>) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP) return;
    if (e.timeStamp - p.t > TAP_MS) return;
    stampAt(p.x, p.y);
  };

  return (
    <motion.li
      ref={focusRef}
      {...reveal(delay)}
      data-cursor-emoji={cursorEmoji}
      onPointerMove={onMove}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        // 浏览器接管了纵向下滚（pointercancel）—— 这一下是划页面，不是在点球
        pending.current = null;
      }}
      className={`card group/tile relative flex list-none flex-col overflow-hidden p-4 transition-[border-color] duration-200 ease-out hover:border-accent/70 sm:p-5 ${span}`}
    >
      {/* 右上角那团晕染：色相跟着 tint 走。透明度压在 0.14，
          再高就会把标题行那串 12px 的灰字压得发闷（原来只有暖色一档时是 0.16）。 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 z-0 size-48 rounded-full opacity-80 blur-3xl"
        style={{
          background: `radial-gradient(circle, hsl(var(${TINT_VAR[tint]}) / 0.14), transparent 70%)`,
        }}
      />
      {/*
        焦点接力高光：一条 accent 内描边 + 一团很淡的外发光，opacity 由滚动位置驱动。
        内描边（inset 1px）而不是改 border-color：改 border 会和 hover 那条
        hover:border-accent/50 抢同一个属性，鼠标停在卡上时会看到边框跳一下。
        外发光用负 spread（-12px）压住范围，否则这块卡的辉光会溢到隔壁卡上。
      */}
      <motion.span
        aria-hidden="true"
        style={{
          opacity: focus,
          boxShadow:
            'inset 0 0 0 1px hsl(var(--accent) / 0.45), 0 0 30px -12px hsl(var(--accent) / 0.4)',
        }}
        className="pointer-events-none absolute inset-0 rounded-xl"
      />

      {/* 发光层。accent 透明度定在 0.16：再高就会把上面那行 12px 的灰字压到看不清。
          触屏走 stamp 这一支：弹印还在的时候就把这层点亮，印子淡掉它跟着退回 0 */}
      <span
        ref={glowRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          stamp ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100'
        }`}
        style={{
          background:
            'radial-gradient(200px circle at var(--gx, 50%) var(--gy, 50%), hsl(var(--accent) / 0.16), transparent 70%)',
        }}
      />
      {stamp && (
        // key 换一次就重挂一次，连点两块地方时动画才会从头弹，而不是停在上一帧
        <span
          key={stamp.id}
          aria-hidden="true"
          className="pointer-events-none absolute z-20 animate-emoji-pop text-2xl leading-none"
          style={{ left: stamp.x, top: stamp.y }}
        >
          {cursorEmoji}
        </span>
      )}
      {/* 标题图标、类别名与可选快捷操作共用一行，避免缩放按钮覆盖卡片内容。 */}
      <h3 className="relative flex items-center justify-between gap-x-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span className={`self-center ${TINT_ICON[tint]}`}>{icon}</span>
          {title}
        </span>
        {action}
      </h3>
      <div className="relative mt-3 flex min-w-0 flex-1 flex-col justify-center">{children}</div>
    </motion.li>
  );
}

/**
 * 将首页点阵地球放大到独立弹层中，让访客能看清地形并继续拖动旋转。
 * 打开期间锁住背景滚动；Escape、遮罩与关闭按钮均可关闭，键盘焦点留在弹层内。
 *
 * @param props.open 是否显示弹层
 * @param props.onClose 关闭弹层的回调
 * @param props.coordinates 地球标记坐标，纬度/经度（度）
 * @param props.triggerRef 打开弹层的按钮引用，用于关闭后恢复键盘焦点
 * @returns 弹层 Portal；关闭时不渲染
 */
function GlobeZoomDialog({
  open,
  onClose,
  coordinates,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  coordinates: [number, number];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { d, pick } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // 弹层只有一个可聚焦控件，Tab 循环回关闭按钮，不让焦点落到遮罩背后的页面。
      if (event.key === 'Tab' && closeRef.current) {
        event.preventDefault();
        closeRef.current.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="globe-zoom-title"
        aria-describedby="globe-zoom-hint"
        className="relative flex max-h-[min(92dvh,760px)] w-full max-w-2xl flex-col items-center overflow-auto rounded-3xl border border-border bg-card px-4 pb-6 pt-3 text-card-foreground shadow-2xl sm:px-8 sm:pb-8"
      >
        <div className="flex min-h-11 w-full items-center justify-between gap-3">
          <span aria-hidden="true" className="size-11" />
          <h2 id="globe-zoom-title" className="text-base font-bold text-foreground sm:text-lg">
            {d.location.zoomTitle}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={d.location.closeZoom}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-1 flex w-full justify-center">
          <DottedGlobe coordinates={coordinates} className="w-[min(78vw,420px)]" />
        </div>
        <p className="-mt-3 text-sm font-semibold text-foreground">{pick(site.identity.location.label)}</p>
        <p id="globe-zoom-hint" className="mt-1 text-center text-xs text-muted-foreground">
          {d.location.zoomHint}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 技能条目。
 *
 * 【改前它和工具条里的标签是同一套】圆角药丸 + 边框 + 内嵌一枚 accent 色小点。
 * 一屏三十来枚同款，读起来就是「一堵墙」—— 分不出哪是组名、哪是条目。
 * 改成更轻的标签：去边框、去每枚小点、底色压淡一档、字号收一档，
 * 把「重量」整个让给组标题，层级才立得起来。
 *
 * 【为什么没有 whitespace-nowrap】原来照抄了工具条的写法（那是给跑马灯用的，条目必须单行）。
 * 但技能里有「表格数据专用深度学习模型（TabNet、FT-Transformer、TabTransformer 等）」
 * 这种超长条目 —— nowrap 会让它顶出卡片右边缘、被 overflow-hidden 切掉
 * （2026-10-04 用 390 视口实测被切 101px，用户反馈「手机上内容被挡住」）。
 * 所以这里允许换行，长条目在自己那一格里折成两三行。
 */
const SKILL_TAG =
  /*
   * 【2026-10-04 改】字号 12px → 13px、底色由半透明改不透明。
   * 12px 是这套标签最挤的一档，一屏三十来枚读起来发虚；
   * bg-secondary/50 的半透明底压在近白背景上会和背景糊在一起（亮色档尤其明显），
   * 改成不透明的 bg-secondary，边界立刻清楚，深浅两档都成立。
   */
  'inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[13px] font-medium break-words text-muted-foreground';

/** 触屏弹印活多久。比 emoji-pop 那条 1.1s 的动画略长，让它淡完再被摘掉 */
const STAMP_MS = 1150;

/**
 * 抬手时允许的位移上限（px）。比滚动条的 8px 宽一档：
 * 按在球上手指难免漂一点，但把球转出十几像素已经不是「点一下」的意图了。
 */
const TAP_SLOP = 12;
/** 按下到抬手超过这么久就不算点 —— 那是按住在看，不是想让它弹个表情 */
const TAP_MS = 700;

/**
 * 触屏下名字钉多久。2.8 秒不是随手取的：这一排里最长的「Scikit-learn」
 * 和相邻两枚挤在一起的读法，扫读一遍就要两秒上下，
 * 再短就成了「看清之前已经没了」。再长会让人觉得页面卡住 —— 手指已经移开了
 * 字还赖在那。同一条图标再点一次会重新计时。
 */
const PIN_MS = 2800;

/**
 * 工具的一行：一排图标，名字平时不出现 —— 鼠标停在哪个图标上就在它正下方浮出来，
 * 手机上改成点一下钉住 2.8 秒。
 *
 * 【为什么名字跟着图标走，而不是钉在整块的最左边】
 * 整块共用一条说明位时，指针在第 12 个图标上、字却出现在最左边，
 * 眼睛得在两者之间来回找。所以每一列自己带一行标签位。
 *
 * 【为什么两条通道：CSS :hover + 手动打标记】
 * :hover 这条必须留着，而且不能用 React state 替代 —— 无缝循环是把同一份内容渲染两遍，
 * 所以「Pandas」在 DOM 里有两个节点；state 记的是名字，两个节点会一起亮，
 * 手只碰着一个、名字却在屏幕上出现两次。:hover 只作用在你真正指着的那个节点。
 * 触屏没有 :hover（手机浏览器会把它模拟成「点住不放」，时机完全对不上），
 * 所以再加一条：点一下给那个节点打一个 data-tool-pin 标记，2.8 秒后摘掉。
 * 记的同样是**哪个 DOM 节点**而不是哪个名字，理由和上面一模一样。
 *
 * 【三条尺寸约束】
 * 1. 标签用绝对定位：不占宽度，「Scikit-learn」这种长名字不会把相邻图标撑开。
 * 2. 列高 58px = 图标 36 + 4 + 标签 16 + 2 余量。滚动条是 overflow-hidden 的，
 *    标签必须整个待在这 58px 里，否则会被齐根裁掉 —— 这也是不走浮层 tooltip 的原因。
 * 3. 标签带 bg-card 底：不加它，浮出来的字会压在相邻图标上糊成一团。
 *
 * 名字同时以 sr-only 留在每个图标里 —— 读屏软件不该只能拿到一个没有名字的方块。
 */
function ToolRow({
  row,
  reverse = false,
  duration,
  pick,
}: {
  row: { label: { zh: string; en: string }; icon?: ToolGlyph }[];
  reverse?: boolean;
  duration: string;
  pick: (t: { zh: string; en: string }) => string;
}) {
  /** 当前被钉住的那个节点 + 它的摘除计时器。同一时刻只允许有一个 */
  const pinned = useRef<{ el: HTMLElement | null; timer: number }>({ el: null, timer: 0 });
  /** 钉住期间让这一排停住，理由见 Marquee 的 paused 注释 */
  const [held, setHeld] = useState(false);
  /** 手指落点，抬手时用来分辨「点这枚图标」和「横扫这一排」 */
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => window.clearTimeout(pinned.current.timer), []);

  const pin = (el: HTMLElement) => {
    const cur = pinned.current;
    window.clearTimeout(cur.timer);
    // 先摘掉上一个，再钉这一个：连点两枚图标时不会留下两处文字
    if (cur.el && cur.el !== el) cur.el.removeAttribute('data-tool-pin');
    el.setAttribute('data-tool-pin', '1');
    cur.el = el;
    setHeld(true);
    cur.timer = window.setTimeout(() => {
      el.removeAttribute('data-tool-pin');
      if (pinned.current.el === el) pinned.current.el = null;
      setHeld(false);
    }, PIN_MS);
  };

  return (
    <Marquee reverse={reverse} duration={duration} gap="0.5rem" paused={held}>
      {row.map((t, i) => {
        const name = pick(t.label);
        return (
          <span
            key={i}
            onPointerDown={(e) => {
              touchStart.current = { x: e.clientX, y: e.clientY };
              // 手指按下的位置也属于这块磁贴，不拦一下会连磁贴的表情弹印一起触发，
              // 一次点击同时冒出名字和 🔧，两个都是解释「这是什么」的，留一个就够
              if (e.pointerType !== 'mouse') e.stopPropagation();
            }}
            onPointerUp={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (e.pointerType === 'mouse') return;
              // 拖这条带子时手指也会划过图标，那种「点」不算点，否则一拖就把名字钉住了
              if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
              pin(e.currentTarget);
            }}
            className="group/tool relative flex h-[58px] w-9 shrink-0 flex-col items-center"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary/70 transition-colors duration-200 group-hover/tool:border-accent/80 group-data-[tool-pin=1]/tool:border-accent/80">
              <span className="sr-only">{name}</span>
              <ToolIcon glyph={t.icon} label={name} size={20} />
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded bg-card px-1 text-[11px] font-semibold leading-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/tool:opacity-100 group-data-[tool-pin=1]/tool:opacity-100"
            >
              {name}
            </span>
          </span>
        );
      })}
    </Marquee>
  );
}

/**
 * @param props.skillGroups 技术栈分组。**必须从数据库读好当 props 传进来** ——
 *   本文件是客户端组件，直接 import lib/content 会把 better-sqlite3 打进浏览器包、构建直接失败。
 * @param props.canEditSkills 当前访问者是不是管理员，决定技术栈那块要不要出现「编辑技术栈」。
 *   这只是体验优化：真正的闸门在 /api/admin/skills（未登录 401、非管理员 403），
 *   绕过界面直接打接口一样会被挡。
 */
export default function Dashboard({
  skillGroups,
  canEditSkills = false,
}: {
  skillGroups: SkillGroupRecord[];
  canEditSkills?: boolean;
}) {
  const { d, pick } = useI18n();
  const { location } = site.identity;
  const { favoriteTools, tools } = site;
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const [globeZoomed, setGlobeZoomed] = useState(false);
  const globeZoomButtonRef = useRef<HTMLButtonElement>(null);

  const openGlobeZoom = useCallback(() => setGlobeZoomed(true), []);
  const closeGlobeZoom = useCallback(() => setGlobeZoomed(false), []);

  return (
    <div className="pb-2">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* ① 籍贯：地名摆在标题行（左边），地球占满下面一块。
            地名一旦放到球的右侧，这块就读成了「一张图 + 一段说明」的两栏排版；
            它要的是一行标题 + 一颗球。

            【2026-10-04 改：地名并进标题行、去掉地图图标、删掉球上的浮标】
            原来标题只写「籍贯」，地名做成一枚浮在球左下角的胶囊 ——
            同一件事在一小块里出现两次；那枚胶囊还压在海面，窄屏下会和小人抢位置
            （代码里已经为它挪过两次位置）。
            现在标题写成「籍贯 · 中国湖南省邵阳市」。保留「籍贯」二字是因为它是这一格的含义，
            去掉就只剩一串地名、读不出这是「老家」；图标一并去掉，标题行已经有字。
            浮标删除后，那块位置归还给球面。

            【为什么占 2 列 2 行】右侧那一列要能同时放下「最喜欢的工具」和「连接」两块。
            地球只占一行的话，右边那一格会被地球的高度拉成一条 400 多像素的空柱 ——
            三行工具名飘在中间，上下各空一大片。
            让地球跨两行、右侧两格各占一行，两边高度就对上了。 */}
        <Tile
          span="sm:col-span-2 sm:row-span-2"
          /*
           * 标题图标用 Globe2（地球），不用原来那枚 MapPin（地图针）。
           * 【为什么】站长先说过「不要那个地图图标」，后来又要「其他卡片都有图标，籍贯也得有」——
           * 所以换成和这一格内容（一颗点阵地球）直接对应的地球图标：
           * 既补回了图标，又和他明确否掉的那枚不是同一个。
           */
          icon={<Globe2 size={13} />}
          title={`${d.location.label} · ${pick(location.label)}`}
          cursorEmoji="✈️"
          delay={0}
          tint="sky"
          action={
            <button
              ref={globeZoomButtonRef}
              type="button"
              onClick={openGlobeZoom}
              aria-haspopup="dialog"
              aria-expanded={globeZoomed}
              aria-label={d.location.zoom}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Maximize2 size={14} aria-hidden="true" />
              <span>{d.location.zoom}</span>
            </button>
          }
        >
          {/*
            仍保留 cobe 的真实经纬地形和可拖拽旋转；蓝色海洋、青绿陆地点阵与球面阴影
            让它读起来更像地球，而不是灰色示意球。首屏磁贴只露上半球以保持网格高度，
            想看完整球面可点标题行的「放大地球」进入同一交互的大图。
          */}
          <div className="relative mt-1 h-[190px] overflow-hidden sm:h-[210px]">
            {!globeZoomed && (
              <div className="absolute left-1/2 top-[-26px] w-[460px] -translate-x-1/2">
                <DottedGlobe coordinates={location.coordinates} className="w-[460px]" />
              </div>
            )}
          </div>
        </Tile>

        {/* ② 最喜欢的工具：右侧上格 */}
        <Tile span="sm:col-span-1 sm:row-span-1" icon={<Heart size={13} />} title={d.favorite.title} cursorEmoji="❤️" delay={CARD_STAGGER} tint="coral">
          <ul className="space-y-2">
            {favoriteTools.map((t) => (
              <li
                key={pick(t.label)}
                className="flex items-center gap-2.5 rounded-md border border-border bg-secondary/60 px-3 py-2"
              >
                <ToolIcon glyph={t.icon} label={pick(t.label)} size={22} />
                <span className="min-w-0 truncate text-sm font-semibold text-secondary-foreground">
                  {pick(t.label)}
                </span>
              </li>
            ))}
          </ul>
        </Tile>

        {/* ③ 连接：右侧下格。和上一格同一列，两块各吃地球一半的高度，
            这一列就不会出现空柱。 */}
        <Tile span="sm:col-span-1 sm:row-span-1" icon={<Link2 size={13} />} title={d.connect.title} cursorEmoji="🔗" delay={CARD_STAGGER * 2} tint="teal">
          <div className="flex flex-wrap items-center justify-center gap-1">
            <SocialLinks size={19} itemClassName="size-11" onOpenModal={setModal} />
          </div>
        </Tile>

        {/* ④ 技术栈：整条铺开，每组各自一行，组名和它自己的条目钉在一起。
            【为什么不用一条长带混滚】各组的条目首尾相接一起滚，
            滚起来之后完全看不出「SQL」属于哪一组、这一串到哪儿换组 ——
            图例那行组名和带子里的内容对不上号，等于把六份信息搅成一份。
            每组单独配一条滚动带也不行：条目少的组会同时露出两份一样的标签。
            静态换行同时避开这两个问题。 */}
        <Tile
          span="sm:col-span-3 sm:row-span-1"
          icon={<Brain size={13} />}
          title={d.skills.title}
          cursorEmoji="🧠"
          delay={CARD_STAGGER * 3}
          tint="violet"
          /* action 槽放「编辑技术栈」，只有管理员看得到。Tile 的 action 本来就渲染在标题行右侧 */
          action={canEditSkills ? <SkillAdmin groups={skillGroups} /> : undefined}
        >
          <div className="space-y-4">
            {skillGroups.map((g) => (
              <div
                key={g.id}
                className="flex flex-col gap-2 border-t border-border/40 pt-3 first:border-t-0 first:pt-0"
              >
                {/* 组标题：改前是 12px 灰色大写，和下面的标签同色同重，扫读时分不出
                    「组名」和「条目」。现在加粗、换成主文字色，左边加一枚 accent 短竖条当标记 ——
                    一屏看下去，先看到各组，再看到每组下面的条目，层级才立得住。 */}
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-accent" />
                  {pick(g.title)}
                </span>

                {/*
                  小节。label 为空串时不画小标题 —— 渲染层不该强制数据必须带小标题，
                  否则「只想平铺几个标签」的组存进库之后就会平白多出一行空白。
                  （pick('') 返回空串，React 渲染空串等于什么都不画，所以这里不用额外判断。）
                */}
                {g.sections.map((s, si) => (
                  <div key={si} className="flex flex-col gap-1.5">
                    {pick(s.label) && (
                      <span className="text-[13px] font-semibold text-muted-foreground">{pick(s.label)}</span>
                    )}
                    <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                      {s.items.map((item, i) => (
                        <span key={i} className={SKILL_TAG}>
                          {pick(item)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Tile>

        {/* ⑤ 工具：整条铺开。只摆图标，名字等鼠标停上去才出现（实现与取舍见上面 ToolRow） */}
        <Tile span="sm:col-span-3 sm:row-span-1" icon={<Wrench size={13} />} title={d.tools.title} cursorEmoji="🔧" delay={CARD_STAGGER * 4} tint="amber">
          <ToolRow row={tools} duration="52s" pick={pick} />
        </Tile>
      </ul>

      <ContactModal open={modal !== null} variant={modal ?? 'notice'} onClose={() => setModal(null)} />
      <GlobeZoomDialog
        open={globeZoomed}
        onClose={closeGlobeZoom}
        coordinates={location.coordinates}
        triggerRef={globeZoomButtonRef}
      />
    </div>
  );
}
