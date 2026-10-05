'use client';

/**
 * 首屏 = 这本册子的**封面**。
 *
 * 【2026-10-05 三版定稿的过程，留档以免反复】
 * 一版：左右两栏（左文字、右插画），体量相当 —— 首屏没有主角。
 * 二版：名字独占一行 128px，插画上抬压进名字行右侧空白。
 * 三版（现在）：**插画整个撤掉**，画面感交给背景（这一页自己的紫光 + 透视网格）。
 *
 * 【为什么撤掉插画 —— 站长问「好端端的放张插画在那干嘛」，他问得对】
 * 那张 Q 版插画（人物指着显示器）**不携带任何关于这个人的信息**：
 * 换个人物、换个显示器，它可以是任何人的主页。它占着首屏最大的位置，
 * 却在说一件谁都能说的话；画风（Q 版/二次元）还会把整页气质往「可爱」拉。
 * 封面的分工应该是「背景负责画面、文字负责信息」—— 一张通用插画两头都不占。
 * 插画没删，挪去了「关于我」那一页（见 components/Dashboard.tsx 的章节头），
 * 那里才是「需要一张人像」的地方。
 *
 * 【现在这一屏有什么】问候 → 名字（128px，全宽）→ 左「我是谁」/ 右「我平时怎么说话」（终端卡）。
 * 终端卡顶上来接替插画：它是首屏唯一会自己动、而且内容只关于这个人的东西。
 *
 * 【一屏里有三种字】名字走楷体（--font-xingkai，自托管霞鹜文楷子集）、
 * 那句介绍走宋体（--font-display，自托管思源宋体子集）、其余走系统黑体。
 * 三级声音是刻意排的：这一屏要立得住「不止一种字体」，靠的不是花哨，是分工。
 * ⚠️ 两份字体都是**手工裁的子集**，往这两种字里加新文案必须回去补字并重新生成，
 * 漏了不会报错，只会静默退回系统字体 —— 手机和电脑长得不一样。
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
  const { d } = useI18n();
  /**
   * 必须走 hydration-safe 版本：这里的结果直接决定 initial 属性写不写，
   * 用裸的 useReducedMotion 会让服务端（null→false）和开了减少动态效果的手机（true）
   * 渲染出不同的 style，触发 hydration mismatch（2026-10-04 实测确认）。
   */
  const reduceMotion = useHydrationSafeReducedMotion();
  const { identity } = site;
  const { open, toggleChat } = useTwinChat();

  return (
    /*
      ── 封面（2026-10-05 重做两版）──────────────────────────────
      【第一版】名字和插画各占一栏、体量相当 —— 首屏没有主角。
      【第二版】名字独占一整行、字号 128px；插画上抬压进名字行右侧空白。
      【第三版（现在）】**把插画整个撤掉**。

      【为什么撤掉插画】站长的原话是「好端端的放张插画在那干嘛」。这个问题问得对：
      那张 Q 版插画（人物指着显示器）**不携带任何关于这个人的信息** ——
      换个人物、换个显示器，它可以是任何人的主页。它占着首屏最大的那块位置，
      却在说一件谁都能说的话；而且它的画风（Q 版/二次元）会把整页的气质往「可爱」拉。
      封面的画面感不该由一张通用插画提供。

      【那画面感交给谁】交给**背景**：这一页自己的紫光（SectionBand 的 cover 光）+ 那层透视网格。
      整页只有「光 + 网格 + 一个大字」，信息全部由文字承担，视觉全部由背景承担。
      插画没有消失，它挪去了「关于我」那一页（它是「关于这个人」的一页，那里才需要一张人像）。
    */
    <section className="relative pb-2 sm:pb-4">
      {/*
        名字背后的一团冷光：让「锦创AI」读起来像浮在光里，而不是平铺在底色上。
        · -z-10 压在文字之下、页面背景之上（外层 wrapper 有 z-10，自成一个层叠上下文）；
        · 浅色主题把 opacity 压到 50：暖白底上这团紫光比深色底显眼得多，不压会显脏；
        · 模糊 + 低透明度，只提供「有光」的感觉，不参与任何信息表达。
        （SectionBand 的 cover 光在整页尺度上铺底，这一团是贴着名字的、更近的一层。）
      */}
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

      {/*
        名字：独占一行，字号 60 → 72 → 128px。
        leading-[0.95] 是故意的 —— 行高压到比字号还小，让这一行读起来是「一块字」
        而不是「一行带行距的文字」，这是海报式大标题的写法。
      */}
      <h1 className="mt-2 text-6xl leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[8rem]">
        <span className="sr-only">{identity.name}</span>
        <AnimatedName text={identity.name} reduceMotion={!!reduceMotion} />
      </h1>

      {/*
        名字下面是两栏：左边「我是谁」，右边「我平时怎么说话」（终端卡）。
        终端卡从「插画下面」挪到了这里 —— 它本来就是首屏唯一会自己动、
        而且内容只关于这个人的东西，让它顶上来接替插画的位置，比一张通用插画合适得多。
        手机上 order-1/2 把终端卡排到文字前面（名字 → 会动的那个 → 说明，读起来顺）。
      */}
      <div className="mt-10 grid gap-8 lg:mt-16 lg:grid-cols-12 lg:gap-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="order-2 flex flex-col lg:order-1 lg:col-span-5"
        >
          {/*
            这一句改走宋体（--font-display）。全站正文是系统黑体，只有名字是楷体 ——
            首屏缺一个「中间声部」。宋体横细竖粗的对比在 24px 上刚好读得出，
            名字（楷体）→ 这句话（宋体）→ 正文（黑体）三级声音就立住了。
            ⚠️ 宋体那份是手工裁的子集，加新文案要回去补字（见 globals.css 的 @font-face 说明）。
          */}
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
    if (reduceMotion) {
      /*
       * 减少动态效果：不播解码 —— 但**必须把字恢复成真字**，不能只 return。
       *
       * 【为什么不能只 return】useHydrationSafeReducedMotion() 在挂载前一律返回 false
       * （两端首轮必须渲染一致，理由见 lib/use-reveal.ts）。所以上面那次 effect
       * 已经按「有动画」跑过一遍，把 shown 设成了随机字、locked 全设成 false。
       * 这里直接 return 的话，那串乱码就永远留在屏幕上 ——
       * 2026-10-05 用 --rm=1 实测确认：名字显示成「锦索创语AZIQ」，刷新也不好。
       *
       * 【为什么 setState 在这里是安全的】effect 的依赖是 [reduceMotion, text, runId]，
       * 恢复动作不会改动这三个值，所以不会自激成循环；最多多渲染一帧。
       */
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
