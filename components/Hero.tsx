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

        {/* ② 问候行
            mt-6 而不是 mt-8：手机上首屏是竖排一整条，这里省下的 8px 留给下面的角色。
            sm 以上回到 32px，标题和头像之间要有足够的呼吸。 */}
        {/*
          手机端字号从 text-4xl 收到 text-3xl：2026-10-03 用 390px 视口截图实测，
          「你好，我是 锦创AI」在 36px 下约 396px 宽，超过视口减去左右内边距后的 358px，
          名字最后一个字母被右边缘切掉。30px 下约 330px，放得下。
          桌面端保持 text-6xl —— 那里有足够宽度。
        */}
        <h1 className="mt-6 text-3xl leading-[1.25] tracking-tight text-foreground sm:mt-8 sm:text-6xl sm:leading-[1.15]">
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
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-2xl">
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
 * 名字的动效：**落笔**。
 *
 * 三步，依次发生，做完后就安静下来：
 *   ① 逐字入场：每字从两侧（左右交替）带着模糊和旋转汇拢到中线上，错开 90ms。
 *      「模糊 → 清晰」是关键 —— 笔画由虚到实，读起来像写的那一笔正在落墨；
 *      没有这一层的话就只是「四个字飞进来摆好」，是位移不是落笔。
 *   ② 落笔线：全部落位后，名字下方那条 accent 细线从中间向两端展开（0.55s）。
 *      它是「写完了、收笔」的句号，也把这一行从「标题」锚成「署名」。
 *   ③ 扫光：一道高光从字的左侧扫到右侧（见 globals.css 的 name-shine）。
 *      之后每 8 秒自己再扫一次 —— 页面放着不动时名字仍有呼吸，
 *      但它不位移、不抖动，正在读字的人不会被骚扰。
 *
 * 【为什么不再做「每字轮流上下浮动」的循环】
 * 上一版有一条例行的逐字波浪（每 5 秒整词抖一轮）。名字是页面唯一一处
 * 持续运动的文字，它一动，视线就被从下面的简介和按钮上拽走一次 ——
 * 抖动的收益是「页面像活的」，代价是「一直在抢注意力」，这笔账不划算。
 * 改成每 8 秒一次扫光：同样活着，但只在字面上掠过，不改变一个字的位置。
 *
 * 【按字符分派字体】
 * 「锦创AI」是中文 + 拉丁混排。汉字走楷体（font-xingkai），拉丁字母走 font-accent
 * （同一套字里的拉丁搭档）。两档现在都指向自托管的霞鹜文楷子集
 * （见 globals.css 的 @font-face），所以中英是同一种笔意写出来的，
 * 而且任何设备上渲染一致 —— 不再有「安卓机没有楷体、退回宋体」这回事。
 *
 * 拆成一个个 span 会破坏读屏与选中，所以动画层是 aria-hidden，
 * 真正给读屏的是旁边那枚 sr-only 的完整名字。
 * reduceMotion 为真时只去掉动画，字体分派照旧 —— 否则这一档下拉丁字母会落回
 * 系统默认字（多数情况下是 sans-serif），跟汉字连看都不像一路。
 */
function AnimatedName({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const chars = Array.from(text);
  /**
   * 汉字走楷体，其余（拉丁字母、数字）走同一套字里的拉丁搭档。
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
    return isCJK ? 'font-xingkai' : 'font-accent';
  };

  /**
   * 入场的起始横移：左右交替，整段读起来是「从两侧汇拢到中线」，
   * 而不是一排字被同一个力推着走。
   * 幅度 16px 而不是几十像素：这是「落位」，不是「飞进来」。
   */
  const entryX = (i: number) => (i % 2 === 0 ? -16 : 16);

  /**
   * 入场的起始旋转：和横移同侧同号，字是「转着正过来」的。
   * 9° 是能看出倾斜、又不会让人以为字歪了的上限。
   */
  const entryRotate = (i: number) => (i % 2 === 0 ? -9 : 9);

  /** 第一个字的起步时刻，以及字与字之间错开的量 */
  const BASE_DELAY = 0.14;
  const STEP_DELAY = 0.09;

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
    /*
      外层是普通 span 而不是 motion 组件，也不挂 whileHover：
      名字不是一个可点的东西，而站里「抬一下」的语义是留给真正可点的元素的
      （同一条原则见 components/Dashboard.tsx 的 Tile：磁贴只给边缘高亮，不做悬停位移）。
      给一个不可点的署名加悬停反馈，等于告诉别人「这里能点」。
    */
    <span aria-hidden="true" className="relative inline-flex font-semibold text-accent">
      {chars.map((c, i) => (
        <motion.span
          key={`${c}-${i}`}
          className={`inline-block origin-bottom ${fontFor(c)}`}
          style={{ willChange: 'transform, opacity, filter' }}
          initial={{
            opacity: 0,
            x: entryX(i),
            y: '0.4em',
            scale: 0.74,
            rotate: entryRotate(i),
            filter: 'blur(9px)',
          }}
          animate={{
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            filter: 'blur(0px)',
          }}
          transition={{
            // 四条曲线分开写：位置/旋转走同一条「缓出」，透明度先到位
            // （字先显形、再走完最后一段路），模糊收得最快 ——
            // 笔画在对焦，不是整块字在飘。
            default: { duration: 0.68, delay: BASE_DELAY + i * STEP_DELAY, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.4, delay: BASE_DELAY + i * STEP_DELAY, ease: 'easeOut' },
            filter: { duration: 0.5, delay: BASE_DELAY + i * STEP_DELAY, ease: 'easeOut' },
          }}
        >
          {c}
        </motion.span>
      ))}

      {/*
        扫光层：把同一串字再渲染一遍，用 background-clip:text 只显示渐变扫过字形的那一段，
        所以亮起来的是笔画本身，而不是一块盖在字上面的矩形光斑。
        【为什么逐字复制而不是整串一个 span】上面那层是每字一个 inline-block，
        整串渲染的字距和它会差一两个像素，扫光时会看出两层字错位。
        延迟到逐字入场结束之后才显示：入场途中字还在飞，那时的高光扫不出形状。
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
        transition={{ duration: 0.3, delay: BASE_DELAY + chars.length * STEP_DELAY }}
      >
        {chars.map((c, i) => (
          <span key={`${c}-${i}`} className={`inline-block ${fontFor(c)}`}>
            {c}
          </span>
        ))}
      </motion.span>

      {/*
        落笔线：全部字落位后，从中间向两端展开。
        origin-center + scaleX 0→1 是「从中间往两头写」，origin-left 会读成「从左往右划」，
        后者和上面那道扫光撞成同一个方向。
        宽度取 100% 而不是字宽之外再留白：它是这一行的下划线，不是分隔符。
      */}
      <motion.span
        aria-hidden="true"
        className="absolute -bottom-1 left-0 right-0 h-[3px] origin-center rounded-full bg-accent/45"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{
          duration: 0.55,
          delay: BASE_DELAY + chars.length * STEP_DELAY + 0.12,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </span>
  );
}
