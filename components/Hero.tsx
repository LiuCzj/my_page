'use client';

/**
 * 首屏：整屏居中竖排。自上而下 ——
 *   ① 头像（常亮彩色；悬停时放大 + 轻微侧转 + 外圈虚线环开始慢转）
 *   ② 问候行「你好，我是 锦创AI」，名字逐字落笔入场；汉字走楷体，拉丁字母走同一套字的拉丁搭档，
 *      两个字体都是自托管的子集，任何设备渲染一致（见 globals.css 的 @font-face）
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

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import TerminalCard from './TerminalCard';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';

export default function Hero() {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();
  const { identity } = site;

  /*
   * 手机端顶部留白收到 pt-2：和 app/page.tsx 的 pt-2 合起来只有 16px。
   * 原来这两处相加是 64px，在 667px 高的屏上顶栏到头像之间空掉一整条，
   * 看着像内容没加载出来（用户 2026-10-03 截图指出）。
   * 桌面端保留 pt-6 —— 大屏上这段留白是「呼吸」，不是「空」。
   */
  return (
    <section className="relative pt-2 pb-10 sm:pt-6 sm:pb-14">
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* ① 头像。
            后面那枚模糊圆是「光从头像后面透出来」的效果，它比头像大一圈、
            被 blur 化掉边缘，所以不需要真的画一圈边框 —— 它是静态氛围，不参与任何动画。

            【为什么把外圈那枚虚线环删掉了】
            那圈线转起来只是「头像旁边有个东西在动」。眼睛会把「转的线」和
            「被圈住的照片」分开读，结论是「照片还是死的，是线在动」——
            这正是上一版被指出的问题。
            现在改成**头像本体自己在动**：呼吸（纵向略大的缩放）+ 轻微晃动（±0.9°），
            两个量写在同一条 keyframes 里（见 globals.css 的 avatar-breathe），
            因为 transform 只有一个属性，分两条 keyframes 会互相覆盖。

            【动画挂外层、hover 挂内层，也是同一个原因】
            呼吸动画和悬停放大都写 transform。挂同一个元素上，
            CSS transition 会去补间动画每帧写的值，呼吸会被悬停拖出残影。
            分层之后：外层专心呼吸，内层专心做悬停反馈，互不干扰。 */}
        <div className="group relative shrink-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-14px] -z-10 rounded-full bg-accent/25 blur-2xl sm:inset-[-18px]"
          />

          {/* 呼吸层：头像本体自己在呼吸 + 轻微晃动 */}
          <div className="animate-avatar-breathe motion-reduce:animate-none">
            {/* 头像尺寸：手机上 112px、sm 以上 144px。
                手机上给小一档是因为首屏竖排一整条（头像→名字→一句话→角色→按钮），
                在 667px 高的屏上，头像每多 16px 就要多滚一截才看得到下面的角色和按钮。 */}
            <div className="h-28 w-28 overflow-hidden rounded-full shadow-lg ring-1 ring-accent/40 transition duration-300 group-hover:scale-[1.06] group-hover:ring-accent/80 motion-reduce:transition-none sm:h-36 sm:w-36">
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

        {/* ①.5 状态徽章（2026-10-04 新增）。
            参考 shivypatel.com 的「Available」：先用一句话交代「这个人现在接不接洽」，
            比堆自我介绍更能让人决定要不要往下聊。
            青绿点是辅助色 --accent-2 目前唯一的用处，见 globals.css 的说明。 */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.02, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-3 py-1 text-xs font-semibold text-muted-foreground sm:mt-8"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-2" />
          {d.hero.status}
        </motion.div>

        {/* ② 问候行。
            徽章已经撑开了头像与标题之间的留白，这里收到 mt-3 即可。 */}
        {/*
          手机端字号从 text-4xl 收到 text-3xl：2026-10-03 用 390px 视口截图实测，
          「你好，我是 锦创AI」在 36px 下约 396px 宽，超过视口减去左右内边距后的 358px，
          名字最后一个字母被右边缘切掉。30px 下约 330px，放得下。
          桌面端保持 text-6xl —— 那里有足够宽度。
        */}
        <h1 className="mt-3 text-3xl leading-[1.25] tracking-tight text-foreground sm:mt-4 sm:text-6xl sm:leading-[1.15]">
          {/* 前缀先落位（0.05s 起），名字随后逐字入场（0.14s 起）——
              前缀抢在名字前面 0.09 秒，读起来是「先听到招呼，再看见署名」，
              而不是两件事同时拍在脸上。 */}
          <motion.span
            className="inline-block font-black"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            {d.hero.greeting}
          </motion.span>{' '}
          <span className="sr-only">{identity.name}</span>
          <AnimatedName text={identity.name} reduceMotion={!!reduceMotion} />
        </h1>

        {/* ③ 一句话 */}
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-xl">
          {d.hero.bio}
        </p>

        {/*
          ③.5 终端卡 —— 首屏的「在场感」。
          夹在「一句话」和「动作行」中间：上面讲「我是谁」，下面给「你能做什么」，
          中间这段补的是「我正在做什么」，首屏原来缺的就是这一层「这个人还活着」的证据。
          宽度收到 max-w-md：首屏是居中竖排，卡铺满整幅会把它读成一个横向区块，
          和上下两段居中的文字不成一路。
        */}
        <div className="mt-8 w-full max-w-md">
          <TerminalCard />
        </div>

        {/*
          ④ 动作行已整块删除（2026-10-03）。原来这里是「数字分身角色 + 查看我的项目」，
          两块都搬走了：
          · 角色 → components/TwinEntry.tsx，改成右下角常驻的浮动头像。理由见那个文件：
            它挂在首屏末尾时既是第五个元素、又要滚回顶部才点得到。
          · 按钮 → 直接删。去项目的入口顶栏与页脚都有，那是全站级入口，不该在首屏重复一遍。
          于是首屏现在只有四件东西：头像 / 名字 / 一句话 / 终端卡 —— 一条线读完。
        */}
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
