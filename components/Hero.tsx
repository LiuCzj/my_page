'use client';

/**
 * 首屏：整屏居中竖排。自上而下 ——
 *   ① 头像（常亮彩色；悬停时放大 + 轻微侧转 + 外圈虚线环开始慢转）
 *   ② 问候行「你好，我是 锦创AI」，名字逐字入场，走系统衬线栈
 *   ③ 一句话：一位喜欢研究 AI 的工程师。
 *   ④ 动作行：数字分身机器人（点击开合聊天窗）+ 查看我的项目 + 与数字分身聊聊
 *   ⑤ 五个联系方式图标
 *
 * 【头像为什么不再有灰度态】
 * 之前那版是「常驻黑白、悬停转彩色」，照搬了参考站。但黑白头像在中文语境里读起来像
 * 「这个人已经不在了」，所以这里改成：彩色常亮，悬停给的是动作而不是换色。
 *
 * 【逐字入场只作用在名字上】
 * 前缀「你好，我是」继续用站点的无衬线黑体，一屏里只有名字一处是衬线，对比才成立。
 * 名字不加 font-black：Windows 的宋体没有真黑体字重，浏览器只能用合成假粗，
 * 在这个字号下会糊成一团 —— 体量交给字号。
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import RobotMark from './RobotMark';
import SocialLinks from './SocialLinks';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function Hero() {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();
  const { identity } = site;
  /** 聊天窗的开合状态：机器人负责切换，CTA 只负责打开 */
  const { open, openChat, toggleChat } = useTwinChat();
  const [modal, setModal] = useState<ContactModalVariant | null>(null);

  return (
    <section className="pt-6 pb-10 sm:pb-14">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* ① 头像 */}
        <div className="group relative shrink-0">
          {/* 悬停才出现的慢转虚线环。不悬停时 opacity-0，所以平时是一张干净的圆头像 */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] opacity-0 transition-opacity duration-300 group-hover:animate-spin-slow group-hover:opacity-100 motion-reduce:hidden"
          >
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              className="stroke-accent"
              strokeWidth="0.9"
              strokeDasharray="1.6 5"
              strokeLinecap="round"
            />
          </svg>

          <div className="h-32 w-32 overflow-hidden rounded-full shadow-lg ring-1 ring-accent/30 transition duration-300 group-hover:-rotate-2 group-hover:scale-[1.05] group-hover:ring-accent/70 motion-reduce:transition-none sm:h-36 sm:w-36">
            <img
              src={identity.avatar}
              alt={pick(identity.avatarAlt)}
              width={144}
              height={144}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* ② 问候行 */}
        <h1 className="mt-8 text-4xl leading-[1.25] tracking-tight text-foreground sm:text-6xl sm:leading-[1.15]">
          <span className="font-black">{d.hero.greeting}</span>{' '}
          <span className="sr-only">{identity.name}</span>
          <AnimatedName text={identity.name} reduceMotion={!!reduceMotion} />
        </h1>

        {/* ③ 一句话 */}
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-2xl">
          {d.hero.bio}
        </p>

        {/* ④ 动作行 */}
        <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-3 sm:gap-4">
          {/* 数字分身机器人：点一下开聊天窗，再点一下关 */}
          <div className="group relative shrink-0">
            <motion.button
              type="button"
              onClick={toggleChat}
              aria-label={d.hero.robotAria}
              aria-expanded={open}
              whileHover={reduceMotion ? undefined : { scale: 1.05 }}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              className={`flex size-24 cursor-pointer items-end justify-center rounded-2xl pb-1 outline-offset-4 transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-ring sm:size-28 ${
                open ? 'bg-accent/10' : ''
              }`}
            >
              {/* viewBox 是 120×140，所以宽高比按 6:7 给，避免被压扁 */}
              <RobotMark blink className="h-24 w-[82px] sm:h-28 sm:w-[96px]" />
            </motion.button>

            {/* 悬停提示：文字跟着开合状态变，鼠标一停就知道这一下是开还是关 */}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
            >
              {open ? d.hero.robotHintClose : d.hero.robotHintOpen}
            </span>
          </div>

          <a
            href="#projects"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent sm:px-5"
          >
            {d.hero.viewProjects}
            <ArrowRight size={15} aria-hidden="true" />
          </a>

          <button
            type="button"
            onClick={openChat}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 sm:px-5"
          >
            <MessageCircle size={16} aria-hidden="true" />
            {d.hero.askTwin}
          </button>
        </div>

        {/* ⑤ 联系方式：与顶栏、页脚同一份实现，44px 触控区 */}
        <div role="group" aria-label={d.hero.contactLabel} className="mt-8 flex items-center justify-center gap-1">
          <SocialLinks size={19} itemClassName="size-11" onOpenModal={setModal} />
        </div>
      </div>

      <ContactModal open={modal !== null} variant={modal ?? 'notice'} onClose={() => setModal(null)} />
    </section>
  );
}

/**
 * 名字的逐字入场。
 *
 * 每个字从下方 14px 淡入升起，间隔 70ms —— 这个节奏是「一句话被说出来」的速度，
 * 再快看不清、再慢显得卡。位移只给 14px，不足以推挤周围文字（外层是 inline-block）。
 *
 * reduceMotion 为真时直接渲染普通 span：没有动画、没有内联样式，
 * 但视觉结果和动画播完一模一样。
 */
function AnimatedName({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
  };
  const child: Variants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  };

  const chars = Array.from(text);

  if (reduceMotion) {
    return (
      <span aria-hidden="true" className="font-display font-semibold text-accent">
        {text}
      </span>
    );
  }

  return (
    <motion.span
      aria-hidden="true"
      className="inline-flex font-display font-semibold text-accent"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {chars.map((c, i) => (
        <motion.span key={`${c}-${i}`} variants={child} className="inline-block">
          {c}
        </motion.span>
      ))}
    </motion.span>
  );
}
