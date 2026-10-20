'use client';

/** 磁贴区：籍贯、最喜欢的工具、技术栈、工具、连接。 */

import { motion } from 'framer-motion';
import { Brain, Globe2, Heart, Link2, Maximize2, Wrench, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import DottedGlobe from '@/components/DottedGlobe';
import Marquee from '@/components/Marquee';
import SectionBand from '@/components/SectionBand';
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

/** 一块磁贴。 */
/** 磁贴的装饰色相。 */
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
  id,
  cursorEmoji,
  delay,
  tint = 'sky',
  hero = false,
  action,
  children,
}: {
  span: string;
  /** 标题左侧那枚小图标。 */
  icon?: React.ReactNode;
  title: string;
  /** 锚点 id。站内搜索直接跳到这里，滚动时按顶栏高度留出余量 */
  id?: string;
  cursorEmoji: string;
  delay: number;
  /** 装饰色相，见上面的 TileTint 说明 */
  tint?: TileTint;
  /** 是不是「主角卡」。只有地球卡开这个开关。 */
  hero?: boolean;
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

  /** 鼠标邻近发光：把指针位置写进 --gx / --gy，让那团径向渐变跟着走。 */
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

  /** 触屏没有光标，所以桌面那套「箭头换成 ✈️ / ❤️ / 🔧」在手机上物理上不存在 ——不是漏做了，是那块屏幕上根本没有一个可以替换的东西。 */
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
      id={id}
      {...reveal(delay)}
      data-cursor-emoji={cursorEmoji}
      onPointerMove={onMove}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        // 浏览器接管了纵向下滚（pointercancel）—— 这一下是划页面，不是在点球
        pending.current = null;
      }}
      className={`card ${
        hero ? 'card-hero p-5 sm:p-6' : 'p-4 sm:p-5 hover:border-accent/70'
      } ${id ? 'scroll-mt-[calc(var(--header-h)+1rem)]' : ''} group/tile relative flex list-none flex-col overflow-hidden transition-[border-color] duration-200 ease-out ${span}`}
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
      {/* 焦点接力高光：一条 accent 内描边 + 一团很淡的外发光，opacity 由滚动位置驱动。 */}
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

/** 技能条目的样式常量原来在这里（SKILL_TAG），第二期删掉了。 */

/** 触屏弹印活多久。比 emoji-pop 那条 1.1s 的动画略长，让它淡完再被摘掉 */
const STAMP_MS = 1150;

/** 抬手时允许的位移上限（px）。比滚动条的 8px 宽一档。 */
const TAP_SLOP = 12;
/** 按下到抬手超过这么久就不算点 —— 那是按住在看，不是想让它弹个表情 */
const TAP_MS = 700;

/** 触屏下名字钉多久。2.8 秒不是随手取的：这一排里最长的「Scikit-learn」 */
const PIN_MS = 2800;

/** 工具的一行：一排图标，名字平时不出现 —— 鼠标停在哪个图标上就在它正下方浮出来，手机上改成点一下钉住 2.8 秒。 */
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
 * @param props.skillGroups 技术栈分组。**必须从数据库读好当 props 传进来** ——
 * @param props.skillGroups 技术栈分组。**必须从数据库读好当 props 传进来** ——
 * @param props.canEditSkills 当前访问者是不是管理员，决定技术栈那块要不要出现「编辑技术栈」。
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
    <div>
      {/* ── 这一页的章节名 ──────────────────────── */}
      <SectionBand
        tone="about"
        index="01"
        latin="ABOUT"
        id="about-title"
        title={d.about.title}
        lead={d.about.lead}
        /* ── 那张插画挪到了这里 ──────────────────── */
        aside={
          <img
            src="/images/hero-scene.jpg"
            alt={pick(site.identity.heroSceneAlt)}
            width={640}
            height={640}
            loading="lazy"
            decoding="async"
            className="size-28 rounded-2xl object-cover ring-1 ring-border sm:size-40"
          />
        }
      />

      <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* ① 籍贯：地名摆在标题行（左边），地球占满下面一块。
            地名一旦放到球的右侧，这块就读成了「一张图 + 一段说明」的两栏排版；
            让地球跨两行、右侧两格各占一行，两边高度就对上了。 */}
        <Tile
          span="sm:col-span-2 sm:row-span-2"
          /* 标题图标用 Globe2（地球），不用原来那枚 MapPin（地图针）。 */
          icon={<Globe2 size={13} />}
          title={`${d.location.label} · ${pick(location.label)}`}
          cursorEmoji="✈️"
          delay={0}
          tint="sky"
          /* 地球卡是首屏以下第一块、也是面积最大的一块，让它当「主角卡」：
             更大圆角 + 一圈彩色描边 + 更重投影，页面从此有了视觉重心。 */
          hero
          action={
            <button
              ref={globeZoomButtonRef}
              type="button"
              onClick={openGlobeZoom}
              aria-haspopup="dialog"
              aria-expanded={globeZoomed}
              aria-label={d.location.zoom}
              className="btn-soft"
            >
              <Maximize2 size={14} aria-hidden="true" />
              <span>{d.location.zoom}</span>
            </button>
          }
        >
          {/* 仍保留 cobe 的真实经纬地形和可拖拽旋转；蓝色海洋、青绿陆地点阵与球面阴影 */}
          <div className="relative mt-1 h-[190px] overflow-hidden sm:h-[210px]">
            {!globeZoomed && (
              <div className="absolute left-1/2 top-[-26px] w-[460px] -translate-x-1/2">
                <DottedGlobe coordinates={location.coordinates} className="w-[460px]" />
              </div>
            )}
          </div>
        </Tile>

        {/* ② 最喜欢的工具：右侧上格 */}
        <Tile id="favorite-tools" span="sm:col-span-1 sm:row-span-1" icon={<Heart size={13} />} title={d.favorite.title} cursorEmoji="❤️" delay={CARD_STAGGER} tint="coral">
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

        {/* 滚起来之后完全看不出「SQL」属于哪一组、这一串到哪儿换组 ——图例那行组名和带子里的内容对不上号，等于把六份信息搅成一份。 */}
        <Tile
          id="skills"
          span="sm:col-span-3 sm:row-span-1"
          icon={<Brain size={13} />}
          title={d.skills.title}
          cursorEmoji="🧠"
          delay={CARD_STAGGER * 3}
          tint="violet"
          /* action 槽放「编辑技术栈」，只有管理员看得到。Tile 的 action 本来就渲染在标题行右侧 */
          action={canEditSkills ? <SkillAdmin groups={skillGroups} /> : undefined}
        >
          <div className="space-y-6">
            {skillGroups.map((g) => (
              /* ── 技术栈：从「标签云」改成「目录」────── */
              <div
                key={g.id}
                className="grid gap-2 border-t border-border/40 pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_1fr] sm:gap-6"
              >
                {/* 组名走 font-song（系统宋体栈）而不是 font-display —— 组名是 */}
                <span className="font-song text-lg font-bold leading-snug text-foreground">
                  {pick(g.title)}
                </span>

                <div className="flex flex-col gap-3">
                  {g.sections.map((s, si) => (
                    <div key={si} className="flex flex-col gap-1">
                      {pick(s.label) && (
                        <span className="text-[13px] font-semibold text-muted-foreground">{pick(s.label)}</span>
                      )}
                      <ul className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        {s.items.map((item, i) => (
                          <li key={i} className="text-[15px] leading-relaxed break-words text-foreground/85">
                            {i > 0 && (
                              <span aria-hidden="true" className="mr-2.5 text-muted-foreground/50">
                                ·
                              </span>
                            )}
                            {pick(item)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {/* ⑤ 工具：整条铺开。只摆图标，名字等鼠标停上去才出现（实现与取舍见上面 ToolRow） */}
        <Tile id="tools" span="sm:col-span-3 sm:row-span-1" icon={<Wrench size={13} />} title={d.tools.title} cursorEmoji="🔧" delay={CARD_STAGGER * 4} tint="amber">
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
