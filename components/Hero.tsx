'use client';

/**
 * 首屏：桌面端「个人介绍 + 终端名片」双栏，手机端纵向单列。
 *   ① 问候和品牌名字（名字逐字解码，字体自托管）
 *   ② 简介与「查看项目 / AI 问答」入口
 *   ③ 头像名片与可交互终端，个人信息仍读取现有站点配置
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

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import TerminalCard from './TerminalCard';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

export default function Hero() {
  const { d, pick } = useI18n();
  /**
   * 必须走 hydration-safe 版本：这里的结果直接决定 initial 属性写不写，
   * 用裸的 useReducedMotion 会让服务端（null→false）和开了减少动态效果的手机（true）
   * 渲染出不同的 style，触发 hydration mismatch（2026-10-04 实测确认）。
   */
  const reduceMotion = useHydrationSafeReducedMotion();
  const { identity } = site;
  const { open, toggleChat } = useTwinChat();

  return (
    <section className="relative py-2 pb-10 sm:py-6 sm:pb-14">
      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-9 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-sm font-bold tracking-[0.12em] text-muted-foreground sm:text-base"
          >
            {d.hero.greeting}
          </motion.p>

          <h1 className="mt-1 text-6xl leading-[1.05] tracking-tight text-foreground sm:text-7xl lg:text-8xl">
            <span className="sr-only">{identity.name}</span>
            <AnimatedName text={identity.name} reduceMotion={!!reduceMotion} />
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-xl">
            {d.hero.bio}
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
            <motion.a
              href="#projects"
              whileHover={reduceMotion ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-[0_10px_26px_-14px_hsl(var(--accent)/0.8)] transition-shadow hover:shadow-[0_14px_30px_-13px_hsl(var(--accent)/0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {d.hero.viewProjects}
              <ArrowRight size={16} aria-hidden="true" />
            </motion.a>
            <motion.button
              type="button"
              onClick={toggleChat}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={open ? d.chat.close : d.nav.chat}
              whileHover={reduceMotion ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${open ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5'}`}
            >
              {open ? <X size={16} aria-hidden="true" /> : <MessageCircle size={16} aria-hidden="true" className="text-accent" />}
              {open ? d.chat.close : d.nav.chat}
            </motion.button>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-full max-w-xl lg:ml-auto"
        >
          <div className="relative isolate overflow-hidden rounded-[1.75rem] border border-border bg-card p-4 shadow-[0_26px_70px_-42px_hsl(var(--foreground)/0.42)] sm:rounded-[2rem] sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 opacity-70"
              style={{
                backgroundImage:
                  'linear-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.45) 1px, transparent 1px)',
                backgroundSize: '34px 34px',
                maskImage: 'linear-gradient(to bottom, black, transparent 88%)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-14 -z-10 size-56 animate-hero-float rounded-full bg-[radial-gradient(circle,hsl(var(--warm)/0.25),hsl(var(--warm)/0.06)_48%,transparent_72%)] blur-2xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-12 -left-10 -z-10 size-48 rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.19),transparent_70%)] blur-2xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-8 top-12 -z-10 size-36 animate-hero-orbit rounded-full border border-warm/30 sm:right-12 sm:top-10"
            >
              <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warm shadow-[0_0_16px_hsl(var(--warm)/0.8)]" />
            </span>

            <div className="relative flex items-center gap-4 rounded-2xl border border-border/80 bg-background/85 p-3.5 backdrop-blur-sm sm:p-4">
              <div className="animate-avatar-breathe motion-reduce:animate-none">
                <div className="group/avatar relative size-[4.5rem] shrink-0 sm:size-20">
                  <span aria-hidden="true" className="absolute -inset-1 rounded-full bg-warm/20 blur-md" />
                  <div className="relative size-full overflow-hidden rounded-full border-2 border-card ring-1 ring-warm/50 transition-transform duration-300 group-hover/avatar:scale-[1.04]">
                    <img
                      src={identity.avatar}
                      alt={pick(identity.avatarAlt)}
                      width={144}
                      height={144}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-warm sm:text-xs">
                  PROFILE / PORTFOLIO
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-relaxed text-foreground sm:text-base">
                  {pick(identity.tagline)}
                </p>
              </div>
              <span aria-hidden="true" className="ml-auto hidden size-10 shrink-0 items-center justify-center rounded-xl bg-warm/10 text-warm sm:flex">
                <MessageCircle size={19} />
              </span>
            </div>

            <div className="relative mt-4 sm:mt-5">
              <TerminalCard />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-warm" />
                {d.terminal.title}
              </span>
              <span>AI · DATA · PROJECTS</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * 名字的动效：**解码 + 落定**（2026-10-04 重做）。
 *
 * 【为什么重做】上一版是「逐字从两侧小幅度飞入 + 模糊对焦」，
 * 位移只有 16px、旋转只有 9°，实际页面里几乎看不出来（用户反馈「动效不明显」）。
 * 这一版换成两步，每一步都是「一眼能看见」的量级：
 *   ① 解码：每个字先在**同宽度的随机字**里快速跳变，从左到右逐个锁定成真字 ——
 *      读起来像 AI 正在把这个名字算出来。中文用中文池、拉丁用拉丁池。
 *   ② 锁定瞬间：该字放大 1.5 倍 + 泛光，再收回 1 —— 一次「落定」的冲击
 *      （keyframes 见 globals.css 的 name-lock）。
 * 最后接原有的扫光（名字下方那条下划线已按用户要求去掉）。
 *
 * 【乱码为什么不会把行宽搞乱】
 * 每一格渲染两层：一层是**不可见的真字**（占位、把这一格宽度定死），
 * 一层是绝对定位居中的乱码。乱码再宽也只在自己那一格里居中溢出，不会推挤相邻字。
 * 中文是等宽字本来就不会变；拉丁字母（A / I 宽窄差很多）靠这层占位兜住。
 *
 * 【按字符分派字体】
 * 「锦创AI」是中文 + 拉丁混排。汉字走楷体（font-xingkai），拉丁字母走 font-accent
 * （同一套字里的拉丁搭档）。两档都指向自托管的霞鹜文楷子集，
 * 所以中英是同一种笔意写出来的，且任何设备渲染一致。
 *
 * 【无 JS / reduceMotion】初始 state 就是真字、全部锁定，静态下名字照常显示；
 * reduceMotion 时 useEffect 直接返回，不启动解码。
 * 动画层是 aria-hidden，真正给读屏的是旁边那枚 sr-only 的完整名字。
 */

/** 解码用的字符池：中文取「科技 / AI」语感的字，拉丁取宽窄接近的大写与数字 */
const CJK_POOL = Array.from(
  '锦创智算模型网络节点算法数据代码智能科技未来量子芯片矩阵向量梯度训练推理生成探索构建架构系统平台开源迭代优化部署云原生边缘并行分布式图谱语义检索增强对齐微调蒸馏卷积循环注意力变换',
);
const LATIN_POOL = Array.from('AIOCDENRSXZKMWHBQP0123456789');

/** 三段 CJK 码位区间：扩展A（3400–4DBF）/ 统一表意文字（4E00–9FFF）/ 兼容表意文字（F900–FAFF） */
function isCJKChar(c: string): boolean {
  const code = c.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/** 汉字走楷体，其余（拉丁字母、数字）走同一套字里的拉丁搭档 */
const fontFor = (c: string) => (isCJKChar(c) ? 'font-xingkai' : 'font-accent');

/** 取一个「同池」的随机字 */
const randGlyph = (c: string) => {
  const pool = isCJKChar(c) ? CJK_POOL : LATIN_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
};

/** 第 i 个字的锁定时刻 = LOCK_BASE + i * LOCK_STEP（ms）；SCRAMBLE_TICK 是乱码刷新间隔 */
const LOCK_BASE = 320;
const LOCK_STEP = 140;
const SCRAMBLE_TICK = 42;

function AnimatedName({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const chars = Array.from(text);
  /** 当前显示的字（解码期间是随机字）。初始为真字 —— 保证 SSR / 无 JS 下名字正常 */
  const [shown, setShown] = useState<string[]>(chars);
  /** 每个字是否已锁定成真字。初始全部锁定（同上） */
  const [locked, setLocked] = useState<boolean[]>(() => chars.map(() => true));
  /** 第几次播放。+1 就重播一遍解码（重新进入视口 / 悬停时触发） */
  const [runId, setRunId] = useState(0);
  /** 正在播放中 —— 避免连续触发叠在一起 */
  const running = useRef(false);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const n = chars.length;
    const lockAt = (i: number) => LOCK_BASE + i * LOCK_STEP;
    const t0 = performance.now();
    running.current = true;

    // 先整体进入乱码态：让用户看到的是「跳动的字」，而不是先亮一下再跳
    setShown(chars.map((c) => randGlyph(c)));
    setLocked(chars.map(() => false));

    const id = window.setInterval(() => {
      const t = performance.now() - t0;
      const nextShown: string[] = new Array(n);
      const nextLocked: boolean[] = new Array(n);
      let allLocked = true;
      for (let i = 0; i < n; i++) {
        if (t >= lockAt(i)) {
          nextShown[i] = chars[i];
          nextLocked[i] = true;
        } else {
          nextShown[i] = randGlyph(chars[i]);
          nextLocked[i] = false;
          allLocked = false;
        }
      }
      setShown(nextShown);
      setLocked(nextLocked);
      if (allLocked) {
        window.clearInterval(id);
        running.current = false;
      }
    }, SCRAMBLE_TICK);

    return () => {
      window.clearInterval(id);
      running.current = false;
    };
  }, [reduceMotion, text, runId]);

  /**
   * 【重播】解码原来只在「刷新页面」时看得见（用户反馈「其他时候根本看不出」）。
   * 现在两个时机重播：
   *   · 名字**重新进入视口**（往下滚走、再滚回来）—— 用 IntersectionObserver；
   *     首次进入不算（初始本来就可见，否则会和 mount 那次撞在一起）。
   *   · 鼠标**悬停**在名字上。
   * 刻意不做定时循环：定时重播会变成「页面一直在跳」，比看不见更烦。
   */
  useEffect(() => {
    if (reduceMotion) return;
    const el = hostRef.current;
    if (!el) return;
    let wasVisible = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !wasVisible) setRunId((n) => n + 1);
          wasVisible = e.isIntersecting;
        }
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  /** 悬停重播。播放中不响应，免得来回扫过时叠成一团 */
  const replay = () => {
    if (!reduceMotion && !running.current) setRunId((n) => n + 1);
  };

  /** 全部锁定完成的时刻（秒）—— 扫光等它 */
  const settleAt = (LOCK_BASE + chars.length * LOCK_STEP) / 1000;

  return (
    /*
      外层是普通 span，不挂 whileHover 的位移 —— 名字不是可点的东西，
      站里「抬一下」的语义留给真正可点的元素（同一条原则见 Dashboard 的 Tile）。
      这里只挂 onMouseEnter 触发「重播解码」：它改的是字的内容、不是位置，
      读起来是「它又在算这个名字」，不会被误读成「这里能点」。
    */
    <span
      ref={hostRef}
      aria-hidden="true"
      onMouseEnter={replay}
      className="relative inline-flex font-semibold text-brand"
    >
      {chars.map((c, i) => (
        <span key={`${c}-${i}`} className={`relative inline-block ${fontFor(c)}`}>
          {/* 占位层：不可见时也把这一格的宽度定死（= 真字宽度），乱码跳变时整行不抖。
              锁定后它转为可见并挂上「落定」动画 */}
          <span className={locked[i] ? 'animate-name-lock inline-block' : 'invisible inline-block'}>
            {c}
          </span>
          {/* 乱码层：绝对定位居中。锁定时它与占位层完全重合（同一个字），直接不渲染 */}
          {!locked[i] && (
            <span className="absolute inset-0 flex items-center justify-center opacity-55 blur-[0.6px]">
              {shown[i]}
            </span>
          )}
        </span>
      ))}

      {/*
        扫光层：把同一串字再渲染一遍，用 background-clip:text 只显示渐变扫过字形的那一段，
        所以亮起来的是笔画本身，而不是一块盖在字上面的矩形光斑。
        【为什么逐字复制而不是整串一个 span】上面那层是每字一个 inline-block，
        整串渲染的字距和它会差一两个像素，扫光时会看出两层字错位。
        等全部锁定之后才显示：解码途中字还在跳，那时的高光扫不出形状。
      */}
      <motion.span
        aria-hidden="true"
        className="animate-name-shine pointer-events-none absolute inset-0 select-none bg-[length:220%_100%] bg-clip-text text-transparent"
        style={{
          backgroundImage:
            'linear-gradient(100deg, transparent 38%, hsl(0 0% 100% / 0.92) 50%, transparent 62%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: settleAt }}
      >
        {chars.map((c, i) => (
          <span key={`${c}-${i}`} className={`inline-block ${fontFor(c)}`}>
            {c}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
