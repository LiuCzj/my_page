'use client';

/**
 * 首屏：整屏居中竖排。自上而下 ——
 *   ① 头像（常亮彩色；悬停时放大 + 轻微侧转 + 外圈虚线环开始慢转）
 *   ② 问候行「你好，我是 锦创AI」，名字逐字入场，走系统衬线栈
 *   ③ 一句话：一位喜欢研究 AI 的工程师。
 *   ④ 动作行：数字分身机器人（点击开合聊天窗）+ 查看我的项目
 *
 * 首屏不放联系方式图标：磁贴区最后一块「连接」给的就是同一份入口，
 * 一处出现一次就够，两块一样的图标只会让人觉得页面在凑内容。
 *
 * 【逐字入场只作用在名字上】
 * 前缀「你好，我是」继续用站点的无衬线黑体，一屏里只有名字一处是衬线，对比才成立。
 * 名字不加 font-black：Windows 的宋体没有真黑体字重，浏览器只能用合成假粗，
 * 在这个字号下会糊成一团 —— 体量交给字号。
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 */

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import RobotMark from './RobotMark';
import StarField from './StarField';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function Hero() {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();
  const { identity } = site;
  /** 聊天窗的开合状态：机器人负责切换（顶栏「问分身」是另一个入口） */
  const { open, toggleChat } = useTwinChat();

  return (
    <section className="relative pt-6 pb-10 sm:pb-14">
      {/* 星点层：绝对定位铺满这一屏，pointer-events-none 所以不挡任何点击 */}
      <StarField />

      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* ① 头像。后面那枚模糊圆是「光从头像后面透出来」的效果，
            它比头像大一圈、被 blur 化掉边缘，所以不需要真的画一圈边框 */}
        <div className="group relative shrink-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-14px] -z-10 rounded-full bg-accent/25 blur-2xl sm:inset-[-18px]"
          />
          {/*
            悬停才出现的慢转虚线环。不悬停时 opacity-0，所以平时是一张干净的圆头像。
            触屏没有悬停这回事（手机浏览器把它模拟成「点住不放」，谁也不会去点自己的头像），
            所以 coarse 指针下这圈直接常亮常转 —— 14 秒一圈慢到只是「活着」，不抢注意力。
            它是纯装饰、绝对定位，多显示出来不会顶开任何内容。
          */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] opacity-0 transition-opacity duration-300 group-hover:animate-spin-slow group-hover:opacity-100 pointer-coarse:animate-spin-slow pointer-coarse:opacity-100 motion-reduce:hidden"
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
          <div className="group relative flex shrink-0 flex-col items-center">
            <motion.button
              type="button"
              onClick={toggleChat}
              aria-label={d.hero.robotAria}
              aria-expanded={open}
              whileHover={reduceMotion ? undefined : { scale: 1.05 }}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              className={`flex size-16 cursor-pointer items-end justify-center rounded-full border border-border pb-1 outline-offset-4 transition-colors hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-ring sm:size-20 ${
                open ? 'border-accent/60 bg-accent/10' : ''
              }`}
            >
              {/* 机器人 viewBox 是 120×128，宽高按 15:16 给，别压扁 */}
              <RobotMark blink className="h-11 w-[41px] sm:h-14 sm:w-[52px]" />
            </motion.button>

            {/* 悬停提示：文字跟着开合状态变，鼠标一停就知道这一下是开还是关 */}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 pointer-coarse:hidden"
            >
              {open ? d.hero.robotHintClose : d.hero.robotHintOpen}
            </span>
            {/*
              触屏看不到上面那条 —— 它靠 :hover 才显形，而手机没有悬停，
              结果就是这颗机器人「点了才知道会发生什么」。
              所以 coarse 指针下把同一句话直接排在机器人下面常驻，
              文案照样跟着开合状态换。这条在流里，父级因此改成竖排居中，
              否则按钮会被这行更宽的字顶到左边去。
            */}
            <p className="hidden whitespace-nowrap pt-2 text-xs font-semibold text-muted-foreground pointer-coarse:block">
              {open ? d.hero.robotHintClose : d.hero.robotHintOpen}
            </p>
          </div>

          {/* visited:text-foreground 不是多余的：Chrome 会把点过的链接换成它自己的
              visited 颜色，优先级高到连内联 color 都盖得住（实测：写 rgb(0,0,255)
              仍解析成 rgb(235,236,240)）。不写这条，第二次进来的访客会看到一行
              几乎透明的按钮文字。 */}
          <a
            href="#projects"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent visited:border-border visited:text-foreground sm:px-5"
          >
            {d.hero.viewProjects}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * 名字的动效：**入场 + 之后每 5 秒一轮的逐字波动**。
 *
 * 外层 span 负责入场（淡入 + 从下方 14px 升起，每字错开 70ms）；
 * 内层 span 负责循环（整词按 90ms 间隔依次上浮 6px 再落下，一轮 1.1 秒，歇 4.2 秒再来）。
 * 拆两层是因为这两个动画都要写 transform —— 挂在一个元素上会互相覆盖。
 *
 * 幅度刻意压到 6px：这是"活着"的信号，不是杂技。周期 5 秒一轮，
 * 看第二眼才会注意到，不会一直骚扰正在读字的人。
 *
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 * reduceMotion 为真时直接渲染普通 span：没有动画，视觉结果和播完一模一样。
 */
function AnimatedName({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const chars = Array.from(text);

  if (reduceMotion) {
    return (
      <span aria-hidden="true" className="font-display font-semibold text-accent">
        {text}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="inline-flex font-display font-semibold text-accent">
      {chars.map((c, i) => (
        <motion.span
          key={`${c}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="inline-block"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 1.1,
              times: [0, 0.5, 1],
              repeat: Infinity,
              repeatDelay: 4.2,
              delay: 1 + i * 0.09,
              ease: 'easeInOut',
            }}
          >
            {c}
          </motion.span>
        </motion.span>
      ))}
    </span>
  );
}
