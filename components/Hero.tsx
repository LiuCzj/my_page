'use client';

/**
 * 首屏：头像 + 名字 + 一句话介绍 + 个人特色 + 极简 AI 小机器人 + 问分身入口。
 *
 * 【这一屏的层次】
 * 左：头像 → 中：名字、一句话介绍、特色文案、问分身按钮 → 右：小机器人。
 * 窄屏（< sm）自动变成一列纵向排布，机器人排在文字下方，不与其他元素抢宽度。
 *
 * 【小机器人的实现约束】
 * 纯内联 SVG + framer-motion，不引任何图片、不用 WebGL/粒子/3D。
 * 配色只用站点已有的 accent / background 令牌，所以深浅色与中英文切换都不需要额外适配。
 * 待机动画刻意做得极小（上下 3px、4.5 秒一轮 + 偶尔眨一次眼），
 * 并且在 useReducedMotion 为真时整体关闭 —— 系统里开了「减少动态效果」的用户看到的就是静止图形。
 */

import { motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Sparkles } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function Hero() {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();
  const { identity } = site;
  /** 聊天窗的开合状态：机器人负责切换，CTA 只负责打开 */
  const { open, openChat, toggleChat } = useTwinChat();

  return (
    <section className="pt-2 pb-10 sm:pb-14">
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:gap-8 sm:text-left lg:gap-10">
        {/* 头像 */}
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-accent/30 shadow-lg sm:h-28 sm:w-28">
          <img
            src={identity.avatar}
            alt={pick(identity.avatarAlt)}
            width={112}
            height={112}
            className="h-full w-full object-cover"
          />
        </div>

        {/* 文字区 */}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {identity.name.replace(identity.nameAccent, '')}
            <span className="text-accent">{identity.nameAccent}</span>
          </h1>

          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            {pick(identity.tagline)}
          </p>

          {/* 个人特色：从「关于我」提到首屏，做成一枚强调标签 */}
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
            <Sparkles size={14} aria-hidden="true" />
            {pick(identity.signature)}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <button
              type="button"
              onClick={openChat}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
            >
              <MessageCircle size={16} aria-hidden="true" />
              {d.hero.askTwin}
            </button>
          </div>
        </div>

        {/* 极简 AI 小机器人：点一下开聊天窗，再点一下关 */}
        <div className="group relative shrink-0">
          <motion.button
            type="button"
            onClick={toggleChat}
            aria-label={d.hero.robotAria}
            aria-expanded={open}
            whileHover={reduceMotion ? undefined : { scale: 1.05 }}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className={`flex h-28 w-28 cursor-pointer items-center justify-center rounded-3xl outline-offset-4 transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-ring sm:h-32 sm:w-32 ${
              open ? 'bg-accent/10' : ''
            }`}
          >
            {/* 待机浮动：幅度只有 3px，慢到几乎察觉不到，但足以让它不像一张死图 */}
            <motion.span
              className="block"
              animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <RobotMark />
            </motion.span>
          </motion.button>

          {/* 悬停提示：文字跟着开合状态变，所以鼠标一停就知道这一下是开还是关 */}
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          >
            {open ? d.hero.robotHintClose : d.hero.robotHintOpen}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * 小机器人图形本体（内联 SVG，尺寸靠 class 断点控制）。
 *
 * 颜色全部走站点令牌：机身 fill-accent、面屏 fill-background、五官 fill/stroke-accent，
 * 所以深色模式下机身是亮蓝、面屏是深蓝黑，浅色模式正好相反，两种主题都成立。
 */
function RobotMark() {
  const reduceMotion = useReducedMotion();

  return (
    <svg width={96} height={96} viewBox="0 0 120 120" aria-hidden="true" className="h-24 w-24 sm:h-28 sm:w-28">
      {/* 天线 */}
      <line x1="60" y1="20" x2="60" y2="10" className="stroke-accent" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="8" r="4" className="fill-accent" />

      {/* 两侧耳罩 */}
      <rect x="12" y="42" width="9" height="20" rx="4.5" className="fill-accent" />
      <rect x="99" y="42" width="9" height="20" rx="4.5" className="fill-accent" />

      {/* 机身与面屏 */}
      <rect x="20" y="20" width="80" height="64" rx="22" className="fill-accent" />
      <rect x="31" y="31" width="58" height="42" rx="15" className="fill-background" />

      {/* 眼睛：偶尔眨一下（scaleY 压扁再回弹），transform-box 让缩放围绕各自中心 */}
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        animate={reduceMotion ? undefined : { scaleY: [1, 1, 0.15, 1, 1] }}
        transition={{ duration: 5, times: [0, 0.86, 0.9, 0.94, 1], repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="48" cy="49" r="5.5" className="fill-accent" />
        <circle cx="72" cy="49" r="5.5" className="fill-accent" />
      </motion.g>

      {/* 微笑 */}
      <path
        d="M49 60 Q60 68 71 60"
        className="stroke-accent"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* 底座 */}
      <rect x="42" y="88" width="36" height="16" rx="8" className="fill-accent" opacity="0.55" />
      <circle cx="60" cy="96" r="3.5" className="fill-background" />
    </svg>
  );
}
