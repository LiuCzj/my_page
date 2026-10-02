'use client';

/**
 * 首屏：整屏居中竖排。自上而下 ——
 *   ① 头像（常亮彩色；悬停时放大 + 轻微侧转 + 外圈虚线环开始慢转）
 *   ② 问候行「你好，我是 锦创AI」，名字逐字入场；汉字走行楷，拉丁字母走衬线展示字
 *   ③ 一句话：喜欢用人话讲解复杂问题。
 *   ④ 动作行：数字分身角色（点击开合聊天窗）+ 查看我的项目
 *
 * 背景那张粒子网不在这一屏里 —— 它是全站一层 fixed 画布，挂在 app/layout.tsx，
 * 所以滚到磁贴区、项目区它也还在。这一屏自己不铺死黑底：
 * 颜色全部走主题令牌，亮色档和暗色档都由令牌切，切到亮色时不会出现「白字配白底」。
 *
 * 首屏不放联系方式图标：磁贴区那块「连接」给的就是同一份入口，
 * 一处出现一次就够，两块一样的图标只会让人觉得页面在凑内容。
 *
 * 【逐字入场只作用在名字上】
 * 前缀「你好，我是」继续用站点的无衬线黑体，一屏里只有名字一处是行楷，对比才成立。
 * 名字不加 font-black：楷体系字体没有真黑体字重，浏览器只能用合成假粗，
 * 在这个字号下会糊成一团 —— 体量交给字号。
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 */

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import HeroMascot from './HeroMascot';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function Hero() {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();
  const { identity } = site;
  /** 聊天窗的开合状态：角色负责切换（顶栏「问分身」是另一个入口） */
  const { open, toggleChat } = useTwinChat();

  return (
    <section className="relative pt-6 pb-10 sm:pb-14">
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

          <div className="h-32 w-32 overflow-hidden rounded-full shadow-lg ring-1 ring-accent/40 transition duration-300 group-hover:-rotate-2 group-hover:scale-[1.05] group-hover:ring-accent/80 motion-reduce:transition-none sm:h-36 sm:w-36">
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

        {/* ④ 动作行
            【为什么竖排不横排】角色图本身 160~208 高，按钮和它并排就会被垂直居中到
            半空里 —— 手机上是「小人左边空一块、右边飘一个按钮」，桌面上也一样飘着。
            改成上下排：先角色，再按钮，都在中轴线上，窄屏宽屏同一个读法。 */}
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-4">
          {/* 数字分身角色：点一下开聊天窗，再点一下关。
              要做成 Q 版比例，得换一张按 Q 版比例画的角色图，代码把现有图裁圆拼不出这个比例。 */}
          <div className="group relative flex shrink-0 flex-col items-center">
            <motion.button
              type="button"
              onClick={toggleChat}
              aria-label={d.hero.robotAria}
              aria-expanded={open}
              whileHover={reduceMotion ? undefined : { scale: 1.06 }}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="cursor-pointer rounded-3xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <HeroMascot className="pointer-events-none h-40 w-40 sm:h-52 sm:w-52" />
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
              结果就是这颗角色「点了才知道会发生什么」。
              所以 coarse 指针下把同一句话直接排在角色下面常驻，
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
 * 【逐字拆开还顺便解决了一个字体事故】
 * 「锦创AI」是中文 + 拉丁混排。行楷那套字栈里的拉丁字母是中文字体自带的，
 * 大写 I 长得很像数字 7，所以必须**按字符分派字体**：
 *   汉字 → font-xingkai（行楷）
 *   字母/数字 → font-display（这条栈第一位是 Georgia，拉丁字母本来就是它最拿手的）
 * 两套字体都染强调紫，看不出接缝。
 *
 * 幅度刻意压到 6px：这是"活着"的信号，不是杂技。周期 5 秒一轮，
 * 看第二眼才会注意到，不会一直骚扰正在读字的人。
 *
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 * reduceMotion 为真时只去掉动画，字体分派照旧 —— 否则这一档下拉丁字母会落回行楷栈，
 * 大写 I 看起来就是 7。
 */
function AnimatedName({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const chars = Array.from(text);
  /**
   * 汉字走行楷，其余（拉丁字母、数字）走拉丁优先的那条栈。
   * 按码位区间判断而不是写正则：正则里放字面汉字的话，区间边界长什么样肉眼根本检查不了，
   * 编辑器或转码动一下就可能悄悄失效。
   * 三段：CJK 扩展A（3400–4DBF）、CJK 统一表意文字（4E00–9FFF）、CJK 兼容表意文字（F900–FAFF）。
   */
  const fontFor = (c: string) => {
    const code = c.codePointAt(0) ?? 0;
    const isCJK =
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff);
    return isCJK ? 'font-xingkai' : 'font-display';
  };

  if (reduceMotion) {
    return (
      <span aria-hidden="true" className="font-semibold text-accent">
        {chars.map((c, i) => (
          <span key={`${c}-${i}`} className={fontFor(c)}>
            {c}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="inline-flex font-semibold text-accent">
      {chars.map((c, i) => (
        <motion.span
          key={`${c}-${i}`}
          className={`inline-block ${fontFor(c)}`}
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
