'use client';

/** 首屏 = 这本册子的**封面**。 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import TerminalCard from './TerminalCard';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

export default function Hero() {
  const { d } = useI18n();
  /** 必须走 hydration-safe 版本：这里的结果直接决定 initial 属性写不写，用裸的 useReducedMotion 会让服务端（null→false）和开了减少动态效果的手机（tru */
  const reduceMotion = useHydrationSafeReducedMotion();
  const { identity } = site;
  const { open, toggleChat } = useTwinChat();

  return (
    /* ── 封面 ────────────────────────────── */
    <section className="relative pb-2 sm:pb-4">
      {/* 名字背后的一团冷光：让「锦创AI」读起来像浮在光里，而不是平铺在底色上。 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 mx-auto h-64 max-w-[30rem] rounded-full opacity-50 blur-3xl dark:opacity-80"
        style={{
          background: 'radial-gradient(closest-side, hsl(var(--brand) / 0.26), transparent 72%)',
        }}
      />
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="text-sm font-bold tracking-[0.12em] text-muted-foreground sm:text-base"
      >
        {d.hero.greeting}
      </motion.p>

      {/* 名字：独占一行，字号 60 → 72 → 128px。 */}
      <h1 className="mt-2 text-6xl leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[8rem]">
        <span className="sr-only">{identity.name}</span>
        <AnimatedName text={identity.name} reduceMotion={!!reduceMotion} />
      </h1>

      {/* 名字下面是两栏：左边「我是谁」，右边「我平时怎么说话」（终端卡）。 */}
      <div className="mt-10 grid gap-8 lg:mt-16 lg:grid-cols-12 lg:gap-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="order-2 flex flex-col lg:order-1 lg:col-span-5"
        >
          {/* 这一句改走宋体（--font-display）。全站正文是系统黑体，只有名字是楷体 ——首屏缺一个「中间声部」。 */}
          <p className="font-display max-w-lg text-xl leading-relaxed text-foreground/85 sm:text-2xl">
            {d.hero.bio}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <motion.a
              href="#projects"
              whileHover={reduceMotion ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-[0_10px_26px_-14px_hsl(var(--accent)/0.8)] transition-shadow duration-200 hover:shadow-[0_14px_30px_-13px_hsl(var(--accent)/0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${open ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent/5'}`}
            >
              {open ? <X size={16} aria-hidden="true" /> : <MessageCircle size={16} aria-hidden="true" className="text-accent" />}
              {open ? d.chat.close : d.nav.chat}
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 lg:order-2 lg:col-span-7"
        >
          <TerminalCard />
        </motion.div>
      </div>
    </section>
  );
}

/** 名字的动效：**解码 + 落定**。 */

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
    if (reduceMotion) {
      /* 减少动态效果：不播解码 —— 但**必须把字恢复成真字**，不能只 return。 */
      setShown(chars);
      setLocked(chars.map(() => true));
      return;
    }
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

  /** 现在两个时机重播。 */
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
    /* 外层是普通 span，不挂 whileHover 的位移 —— 名字不是可点的东西，站里「抬一下」的语义留给真正可点的元素（同一条原则见 Dashboard 的 Tile）。 */
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

      {/* 扫光层：把同一串字再渲染一遍，用 background-clip:text 只显示渐变扫过字形的那一段，所以亮起来的是笔画本身，而不是一块盖在字上面的矩形光斑。 */}
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
