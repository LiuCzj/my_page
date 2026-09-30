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
 * 【表情光标】每块带一个 data-cursor-emoji，鼠标扫过时系统箭头由
 * components/CustomCursor.tsx 换成对应表情（地球块是 ✈️，这是他要的效果）。
 * 触屏设备不会触发任何隐藏，见那里的说明与 globals.css 里那条被门控的规则。
 *
 * 【技术栈的分组怎么不丢】每一组单独一行滚动，行首钉一个不滚的组名，
 * 滚动区在组名右侧。相邻两行方向相反，所以「来回滚动」的观感在同一个块里就成立。
 */

import { motion } from 'framer-motion';
import { Brain, Heart, Link2, MapPin, Wrench } from 'lucide-react';
import DottedGlobe from '@/components/DottedGlobe';
import Marquee from '@/components/Marquee';
import SocialLinks from '@/components/SocialLinks';
import ContactModal, { type ContactModalVariant } from '@/components/ContactModal';
import ToolIcon from '@/components/ToolIcon';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';
import { useRef, useState } from 'react';

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
  cursorEmoji,
  delay,
  children,
}: {
  span: string;
  icon: React.ReactNode;
  title: string;
  cursorEmoji: string;
  delay: number;
  children: React.ReactNode;
}) {
  const reveal = useReveal();
  const glowRef = useRef<HTMLSpanElement>(null);

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

  return (
    <motion.li
      {...reveal(delay)}
      data-cursor-emoji={cursorEmoji}
      onPointerMove={onMove}
      className={`group/tile relative flex list-none flex-col overflow-hidden rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-out hover:border-accent/50 hover:shadow-md sm:p-5 ${span}`}
    >
      {/* 发光层。accent 透明度定在 0.16：再高就会把上面那行 12px 的灰字压到看不清 */}
      <span
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100"
        style={{
          background:
            'radial-gradient(200px circle at var(--gx, 50%) var(--gy, 50%), hsl(var(--accent) / 0.16), transparent 70%)',
        }}
      />
      <h3 className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>
      <div className="relative mt-3 flex min-w-0 flex-1 flex-col justify-center">{children}</div>
    </motion.li>
  );
}

/** 滚动条里的一枚标签。用 inline-flex 是因为标签现在可能带一枚图标 */
const CHIP =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground';

export default function Dashboard() {
  const { d, pick } = useI18n();
  const { location } = site.identity;
  const { favoriteTools, skills, tools } = site;
  const [modal, setModal] = useState<ContactModalVariant | null>(null);


  return (
    <div className="pb-2">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* ① 籍贯：地球 + 地名，占两列 */}
        <Tile span="sm:col-span-2" icon={<MapPin size={13} />} title={d.location.label} cursorEmoji="✈️" delay={0}>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
            <DottedGlobe
              coordinates={location.coordinates}
              className="h-[132px] w-[132px] shrink-0 sm:h-[148px] sm:w-[148px]"
            />
            <p className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
              {pick(location.label)}
            </p>
          </div>
        </Tile>

        {/* ② 最喜欢的工具 */}
        <Tile span="sm:col-span-1" icon={<Heart size={13} />} title={d.favorite.title} cursorEmoji="❤️" delay={0.06}>
          <ul className="space-y-2">
            {favoriteTools.map((t) => (
              <li
                key={t.kind}
                className="flex items-center gap-2.5 rounded-md border border-border bg-secondary/60 px-3 py-2"
              >
                <ToolIcon
                  glyph={t.kind === 'github' ? 'github' : undefined}
                  label={pick(t.label)}
                  size={22}
                />
                <span className="min-w-0 truncate text-sm font-semibold text-secondary-foreground">
                  {pick(t.label)}
                </span>
              </li>
            ))}
          </ul>
        </Tile>

        {/* ③ 技术栈：三行滚动，行首钉住组名 */}
        <Tile span="sm:col-span-3" icon={<Brain size={13} />} title={d.skills.title} cursorEmoji="🧠" delay={0.12}>
          <div className="space-y-2">
            {skills.map((group, gi) => (
              <div key={gi} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-bold leading-tight text-muted-foreground sm:w-28">
                  {pick(group.title)}
                </span>
                <Marquee
                  reverse={gi % 2 === 1}
                  duration={gi === 0 ? '52s' : '44s'}
                  gap="0.5rem"
                  className="min-w-0 flex-1 py-0.5"
                >
                  {group.items.map((item, i) => (
                    <span key={i} className={CHIP}>
                      {pick(item)}
                    </span>
                  ))}
                </Marquee>
              </div>
            ))}
          </div>
        </Tile>

        {/* ④ 工具：18 条切成两半，各占一行、方向相反。
            不是把同一份内容滚两遍 —— 那样两行永远一模一样，只是噪音 */}
        <Tile span="sm:col-span-2" icon={<Wrench size={13} />} title={d.tools.title} cursorEmoji="🔧" delay={0.18}>
          <div className="space-y-2">
            {[
              tools.slice(0, Math.ceil(tools.length / 2)),
              tools.slice(Math.ceil(tools.length / 2)),
            ].map((row, ri) => (
              <Marquee key={ri} reverse={ri === 1} duration={ri === 0 ? '38s' : '46s'} gap="0.5rem">
                {row.map((t, i) => (
                  <span key={i} className={CHIP}>
                    <ToolIcon glyph={t.icon} label={pick(t.label)} size={16} />
                    {pick(t.label)}
                  </span>
                ))}
              </Marquee>
            ))}
          </div>
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
