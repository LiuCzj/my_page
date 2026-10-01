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
import { Brain, Heart, Link2, MapPin, Wrench } from 'lucide-react';
import DottedGlobe from '@/components/DottedGlobe';
import Marquee from '@/components/Marquee';
import SocialLinks from '@/components/SocialLinks';
import ContactModal, { type ContactModalVariant } from '@/components/ContactModal';
import ToolIcon from '@/components/ToolIcon';
import { site, type ToolGlyph } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import { useEffect, useRef, useState } from 'react';

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
 */
function Tile({
  span,
  icon,
  title,
  heading,
  cursorEmoji,
  delay,
  children,
}: {
  span: string;
  icon: React.ReactNode;
  title: string;
  /**
   * 跟在眉标后面的一行正文级标题。只有「籍贯」用：
   * 那块要读出来的是地名，12px 全大写带字距的眉标是给「技术栈」这种分类词用的，
   * 拿它排「中国湖南省邵阳市」会把地名压成一条装饰线。
   */
  heading?: string;
  cursorEmoji: string;
  delay: number;
  children: React.ReactNode;
}) {
  const reveal = useReveal();
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
      {...reveal(delay)}
      data-cursor-emoji={cursorEmoji}
      onPointerMove={onMove}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        // 浏览器接管了纵向下滚（pointercancel）—— 这一下是划页面，不是在点球
        pending.current = null;
      }}
      className={`group/tile relative flex list-none flex-col overflow-hidden rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-out hover:border-accent/50 hover:shadow-md sm:p-5 ${span}`}
    >
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
      <h3 className="relative flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span className="self-center text-accent">{icon}</span>
          {title}
        </span>
        {heading && (
          <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {heading}
          </span>
        )}
      </h3>
      <div className="relative mt-3 flex min-w-0 flex-1 flex-col justify-center">{children}</div>
    </motion.li>
  );
}

/** 滚动条里的一枚标签。用 inline-flex 是因为标签现在可能带一枚图标 */
const CHIP =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground';

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
            <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary/70 transition-colors duration-200 group-hover/tool:border-accent/60 group-data-[tool-pin=1]/tool:border-accent/60">
              <span className="sr-only">{name}</span>
              <ToolIcon glyph={t.icon} label={name} size={20} />
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded bg-card px-1 text-[11px] font-semibold leading-4 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/tool:opacity-100 group-data-[tool-pin=1]/tool:opacity-100"
            >
              {name}
            </span>
          </span>
        );
      })}
    </Marquee>
  );
}

export default function Dashboard() {
  const { d, pick } = useI18n();
  const { location } = site.identity;
  const { favoriteTools, skills, tools } = site;
  const [modal, setModal] = useState<ContactModalVariant | null>(null);


  return (
    <div className="pb-2">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* ① 籍贯：地名就摆在标题行（左边），地球占满下面一块。
            地名一旦放到球的右侧，这块就读成了「一张图 + 一段说明」的两栏排版；
            它要的是一行标题 + 一颗球。 */}
        <Tile
          span="sm:col-span-2"
          icon={<MapPin size={13} />}
          title={d.location.label}
          heading={pick(location.label)}
          cursorEmoji="✈️"
          delay={0}
        >
          {/* 【为什么是「裁开」而不是「缩小」】
              点阵的密度是固定的，把整颗球缩进小方框里，每个点就只剩不到一像素 ——
              浅色底上糊成一片灰雾，大陆完全读不出来。
              所以反过来：球给到 460px，靠外层 overflow-hidden 只露出上面一条
              （裁窗 190/210px）。露出的那一段从北极到北纬 5° 左右，
              邵阳（北纬 27.2°）落在这条带的中下部，转到正面就看得见。
              top 的 -26px 是把球往上推、让圆盘顶端正好贴进裁窗，不留一条空白。 */}
          <div className="relative mt-1 h-[190px] overflow-hidden sm:h-[210px]">
            <div className="absolute left-1/2 top-[-26px] w-[460px] -translate-x-1/2">
              <DottedGlobe coordinates={location.coordinates} className="w-[460px]" />
            </div>
          </div>
        </Tile>

        {/* ② 最喜欢的工具 */}
        <Tile span="sm:col-span-1" icon={<Heart size={13} />} title={d.favorite.title} cursorEmoji="❤️" delay={0.06}>
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

        {/* ③ 技术栈：三个组名钉在上方当图例，下面一条长带滚全部条目。
            为什么不是"每组一条带"—— 条目少的组（业务分析只有 4 个短标签）比磁贴还窄，
            一滚就必然同时露出两份一样的标签，这正是他指出的重复。
            合成一条长带后单份宽度远超容器，滚动里任何时刻只有一份。 */}
        <Tile span="sm:col-span-3" icon={<Brain size={13} />} title={d.skills.title} cursorEmoji="🧠" delay={0.12}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {skills.map((g, i) => (
              <span key={i} className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {pick(g.title)}
              </span>
            ))}
          </div>
          <Marquee duration="64s" gap="0.5rem" className="mt-2.5">
            {skills.flatMap((g, gi) =>
              g.items.map((item, i) => (
                <span key={`${gi}-${i}`} className={CHIP}>
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent/70" />
                  {pick(item)}
                </span>
              )),
            )}
          </Marquee>
        </Tile>

        {/* ④ 工具：只摆图标，名字等鼠标停上去才出现（实现与取舍见上面 ToolRow） */}
        <Tile span="sm:col-span-2" icon={<Wrench size={13} />} title={d.tools.title} cursorEmoji="🔧" delay={0.18}>
          <ToolRow row={tools} duration="52s" pick={pick} />
        </Tile>

        {/* ⑤ 连接 */}
        <Tile span="sm:col-span-1" icon={<Link2 size={13} />} title={d.connect.title} cursorEmoji="🔗" delay={0.24}>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <SocialLinks size={19} itemClassName="size-11" onOpenModal={setModal} />
          </div>
        </Tile>
      </ul>

      <ContactModal open={modal !== null} variant={modal ?? 'notice'} onClose={() => setModal(null)} />
    </div>
  );
}
