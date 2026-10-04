'use client';

/**
 * 首屏终端卡：一张模拟终端窗口的小卡片。
 *
 * 【它要干什么】
 * 逐字「敲」出一条命令行 → 停一拍 → 逐行打印输出 → 停一会儿 → 敲下一条，如此循环。
 * 访客点一下卡片（或聚焦后回车/空格）立刻切到下一条命令。
 * 目的很直白：让访客一眼看到「这个人在写代码」，比一行静态的自我介绍更有记忆点。
 *
 * 【为什么只显示当前这一条，不做滚屏回放】
 * 真正的终端会把历史命令一条条往上堆。这里刻意不堆：
 * 这张卡在**首屏**，高度每多一行都会把下面的角色、按钮往下推。
 * 堆到第 4、5 条时卡片会长成一柱，首屏的节奏就散了。
 * 所以每条命令自成一个画面，用固定的最小高度兜住，输出逐行出现时卡片不会一抽一抽地长。
 *
 * 【为什么命令用 setTimeout 自己驱动，而不是 framer-motion】
 * 逐字敲、逐行印、停一拍再切，是一个「多阶段、阶段之间还要互相接力」的状态机。
 * 用 setTimeout 写成一个由 (typed, outLines) 两个计数驱动的 effect，每个阶段只有一句
 * 「排一个定时器、到点把计数 +1」，读起来就是一条直线；
 * 交给 motion 的 variants 反而要把「谁先谁后」编码进一大堆 delay 里，改一个节奏要动一串数。
 *
 * 【减少动态效果（prefers-reduced-motion）】
 * 项目硬规矩（见 app/globals.css 末尾那条全局规则）。这里用 useReducedMotion() 拿开关：
 * 为真时**不排任何定时器**，命令与输出一次性铺满，只保留「点一下切下一条」。
 * 注意是「静态呈现」而不是「不渲染」—— 内容照样看得见，只是不逐字动。
 *
 * 【颜色】
 * 全部走语义令牌：bg-card / text-foreground / text-muted-foreground / border-border /
 * bg-secondary / text-accent。accent 是紫、全站唯一强调色，所以卡里**只有**提示符 `$`
 * 和光标两处是紫，其余都是中性色。绝不写死 #xxx —— 那样深浅两套主题必崩一套。
 *
 * 【文案 vs 命令】
 * 窗口标题、提示语、无障碍标签是**界面文案**，走字典（d.terminal.title / hint / aria）；
 * 命令本身是**代码**，不进字典 —— 从 config/site.ts 取真实数据拼出来，
 * 用 pick() 取当前语言的写法。所以切到英文时，命令不变、输出的内容跟着变。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { site, type LocalizedText } from '@/config/site';
import { useI18n } from '@/lib/i18n';

/* ── 节奏常量 ─────────────────────────────────────────────────
 * 全部提到文件顶部：这几个数是这张卡的「手感」所在，
 * 散在 effect 里的话，想调快慢得先通读一遍逻辑。
 * ─────────────────────────────────────────────────────────── */

/** 每敲一个字符的间隔。55ms 是「看得清每个字」和「别让人干等」的折中 */
const TYPE_MS = 55;
/** 命令敲完、到吐出第一行输出之间的停顿。这一拍是「命令真的跑了一下」的错觉来源 */
const OUTPUT_DELAY_MS = 320;
/** 输出逐行打印的间隔。比敲字快一档：结果是一块「刷」出来的，不是一字字挤出来的 */
const OUTPUT_LINE_MS = 160;
/** 全部显示完之后停多久再切下一条。够读完最长的一条输出，又不至于让人以为卡住了 */
const HOLD_MS = 2800;

/*
 * 光标闪烁的动画定义在 app/globals.css 的 @theme 里（--animate-terminal-caret）。
 *
 * 【为什么不写在这个文件里】本项目所有 keyframes 都集中在 globals.css 那一个
 * @theme 块（avatar-breathe / mascot-breathe / mascot-shadow / orbit / emoji-pop /
 * name-shine），新加一条也放那儿：组件内联 <style> 会随组件重复注入，
 * 还把「全站动效一览」拆散到各个组件里，调动画时要满仓库找。
 * 这里用 Tailwind 类名 animate-terminal-caret 引用它。
 *
 * 【为什么不用 Tailwind 自带的 animate-pulse】animate-pulse 是 1 → 0.5 → 1 的
 * 平滑淡入淡出，读起来像「呼吸」；终端光标要的是「硬闪」：亮一半、灭一半，
 * 中间不许补间。globals.css 里那条用 steps(1, end) 把补间掐掉，才是方块状硬闪。
 *
 * 【减少动态效果时会发生什么】base 层那条全局规则会把 animation-duration 压到
 * 0.001ms，动画瞬间跑完停在 100% 帧（opacity: 1），光标退化成静态实心块 —— 不动，但看得见。
 */

/** 一条命令：要「敲」出来的那一行 + 它要打印的输出行 */
interface TerminalCommand {
  cmd: string;
  output: string[];
}

/**
 * 把 config/site.ts 里的真实数据拼成终端要「执行」的几条命令。
 *
 * 刻意做成模块级纯函数、只依赖传入的 pick：
 * 它不碰任何 React 状态，输入输出一一对应，想在别处复用或单测都不用改。
 * 全部条目来自站点配置，这里**不编造任何数据** —— 站点里没有的东西不会出现在输出里。
 *
 * @param pick 按当前语言取一条 LocalizedText 的取值函数（来自 useI18n）
 * @returns 4~6 条命令，按「先自报家门、再亮技能、再看作品、最后收个尾」的顺序排列
 */
function buildCommands(pick: (text: LocalizedText) => string): TerminalCommand[] {
  const { identity, skills, projects, favoriteTools } = site;
  /** 输出里的分隔符。抽成常量是为了中英两版看起来一致，也方便以后想换就换一处 */
  const SEP = ' · ';

  return [
    // ① 自报家门：名字 + 那句「记忆点」。这是访客最先该拿到的两个信息。
    {
      cmd: 'whoami',
      output: [identity.name, pick(identity.signature)],
    },
    // ② 技能：只列每个分组的组名，用 · 串成一行。
    //    不展开条目 —— 六组、每组四五条，铺开会把这张首屏卡撑成一面墙。
    //    组名已经足够让人知道「他会哪几个方向」，细节留给下面真正的技术栈区块。
    {
      cmd: 'cat skills.txt',
      output: [skills.map((group) => pick(group.title)).join(SEP)],
    },
    // ③ 作品：一个项目一行，slug 在前、标题在后，读起来就是一次 ls 的输出。
    //    条目直接来自 config，连第三条占位项目也照原样列出 —— 不替站长筛内容。
    {
      cmd: 'ls projects/',
      output: projects.map((project) => `${project.slug}/  ${pick(project.title)}`),
    },
    // ④ 擅长方向：echo 一个环境变量，正好适合把一串值打平在一行里。
    {
      cmd: 'echo $EXPERTISE',
      output: [identity.expertise.map(pick).join(SEP)],
    },
    // ⑤ 常用工具：收个尾，也呼应磁贴区那块「最喜欢的工具」。
    {
      cmd: 'cat ~/.tools',
      output: [favoriteTools.map((tool) => pick(tool.label)).join(SEP)],
    },
  ];
}

/**
 * 终端光标。
 *
 * 做成独立组件而不是内联一段 span：它在「正在敲的命令行末尾」和「下一条命令的提示符后面」
 * 两个位置各出现一次，抽出来只写一遍样式，两处不会跑偏。
 *
 * aria-hidden：它纯装饰，读屏软件不该为一个闪动的方块念一句东西。
 * 高度用 em 而不是固定 px：字号在 sm 断点会变大，em 让光标跟着一起长，不用写两套。
 *
 * @returns 一枚闪烁的方块光标
 */
function Caret() {
  return (
    <span
      aria-hidden="true"
      // animate-terminal-caret 在 globals.css 的 @theme 里定义，内含 steps(1, end) 硬闪的说明
      className="ml-0.5 inline-block h-[1.05em] w-[0.5em] translate-y-[0.12em] animate-terminal-caret bg-accent"
    />
  );
}

/**
 * 首屏终端卡。
 *
 * 整张卡就是一个 <button>：点哪儿都能切下一条命令，触屏天然可用，
 * 键盘也能用原生回车/空格触发 —— 不用给 div 手动挂 onClick、再补键盘事件和 tabIndex。
 * 代价是按钮内部只允许放 phrasing content，所以卡里所有排版容器都用 <span> + display 类，
 * 而不是 <div>/<p>（那在 <button> 里是无效 HTML）。视觉上完全一样。
 *
 * @param props.className 外部追加的类名（定位、宽度、外边距交给调用方），默认 undefined
 * @returns 一张可点击切换命令的终端卡片
 */
export default function TerminalCard({ className }: { className?: string }) {
  const { d, pick } = useI18n();
  const reduceMotion = useReducedMotion();

  /**
   * 命令列表按当前语言重算：pick 的引用随语言变化，所以切语言时这里会重建，
   * 输出内容跟着换语言，而 cmd 本身（代码）保持不变。
   */
  const commands = useMemo(() => buildCommands(pick), [pick]);
  const total = commands.length;

  /** 当前显示到第几条命令 */
  const [index, setIndex] = useState(0);
  /** 当前这条命令已经「敲」出来的字符数 */
  const [typed, setTyped] = useState(0);
  /** 当前这条命令已经打印出来的输出行数 */
  const [outLines, setOutLines] = useState(0);

  const current = commands[index];
  const cmd = current.cmd;
  const output = current.output;

  /**
   * 切到下一条命令，并把两个计数清零重新开始。
   *
   * 用函数式 setState（setIndex(i => ...)）而不是读 index 闭包值：
   * 这个回调会被定时器和点击两处同时用到，函数式写法不依赖「调用时 index 是多少」，
   * 定时器到点的那一刻哪怕 index 已经变过，取到的也是最新值，不会跳错条。
   */
  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % total);
    setTyped(0);
    setOutLines(0);
  }, [total]);

  /**
   * 驱动整条流水线的唯一 effect。
   *
   * 每次只做「一件事」：根据当前进度排一个定时器，到点把某个计数 +1（或切下一条），
   * 计数一变 effect 重跑，于是自动推进到下一阶段。三个阶段依次是：
   *   ① 还有字没敲完 → 隔 TYPE_MS 再敲一个字
   *   ② 字敲完了、还有输出行没印 → 印一行（第一行前多停一拍，见 OUTPUT_DELAY_MS）
   *   ③ 都显示完了 → 停 HOLD_MS 后切下一条
   *
   * 返回的清理函数清掉本次定时器：计数每次变化、组件卸载、或切了减少动态效果时，
   * 上一条挂起的定时器都会被取消，不会出现两条流水线并行推进的鬼影。
   *
   * reduceMotion 为真时直接 return —— 一个定时器都不排，页面完全静止（见文件头说明）。
   */
  useEffect(() => {
    if (reduceMotion) return;

    if (typed < cmd.length) {
      const id = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
      return () => window.clearTimeout(id);
    }

    if (outLines < output.length) {
      // 第一行输出多停一拍：命令刚敲完就立刻吐结果，读起来像「根本没执行」。
      // 后面的行则用较短的固定间隔，让结果是一块「刷」出来的。
      const wait = outLines === 0 ? OUTPUT_DELAY_MS : OUTPUT_LINE_MS;
      const id = window.setTimeout(() => setOutLines((n) => n + 1), wait);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(advance, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [typed, outLines, cmd.length, output.length, reduceMotion, advance]);

  // 渲染层统一做「要不要按动画进度裁剪」的判断：
  // 减少动态效果时直接给全量，逐字/逐行的中间态一律跳过。
  // 这样上面那个 effect 只需要管动画这一档，静态档的渲染逻辑不掺在里面。
  const visibleCmd = reduceMotion ? cmd : cmd.slice(0, typed);
  const visibleOutput = reduceMotion ? output : output.slice(0, outLines);
  const done = reduceMotion || (typed >= cmd.length && outLines >= output.length);

  return (
    <>
      <button
        type="button"
        onClick={advance}
        // aria-label 用字典里的 aria 文案，读屏拿到的是「这是什么、点一下会怎样」，
        // 而不是把卡里那一堆命令和输出逐个念一遍。
        aria-label={d.terminal.aria}
        className={`card card-hoverable group/term block w-full cursor-pointer overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className ?? ''}`}
      >
        {/* ── 窗口标题栏 ── */}
        <span className="flex items-center gap-2.5 border-b border-border bg-secondary/60 px-3.5 py-2.5">
          {/*
            三个圆点。刻意做成中性色，**不用**经典的红黄绿：
            那三种色相一进来，全站「只有一支紫」的规矩当场就破了。
            中性灰点在深浅两套主题里都成立，也不跟 accent 抢眼。
            aria-hidden：纯装饰，不给读屏添噪音。
          */}
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          </span>

          {/* 标题：沿用磁贴区那套「图标 + 大写小字」的眉标写法，全站一个语言 */}
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Terminal size={13} aria-hidden="true" className="text-accent" />
            {d.terminal.title}
          </span>

          {/* 提示语常驻：触屏没有悬停，靠它才知道这卡能点（和 Hero 里角色提示同样的考虑） */}
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
            {d.terminal.hint}
          </span>
        </span>

        {/*
          ── 终端正文 ──
          min-h 兜住高度：输出是一行行出现的，没有它卡片会随着每行输出往上长一截，
          首屏上看着就是一跳一跳的。

          【为什么从 9rem 收到 6.5rem】2026-10-03 用 CDP 按 390×844 真机视口截图实测，
          9rem（144px）在只输出一两行时会在卡里留出约 170px 的空白 —— 一张卡片近三成
          是空的，比「偶尔跳一下」更难看。最长的一条输出是 `ls projects/`（3 行），
          加上命令行与末尾提示符共 5 行 × 21px ≈ 105px，再算上 py-3 的 24px，
          6.5rem（104px）足够兜住绝大多数命令，只有最长的 `ls projects/` 会多长一行。
        */}
        <span className="block min-h-[6.5rem] px-3.5 py-3 font-mono text-[13px] leading-relaxed sm:text-sm">
          {/* 命令行。提示符 $ 是卡里仅有的两处紫之一 */}
          <span className="block break-words text-foreground">
            <span className="text-accent">$</span> <span>{visibleCmd}</span>
            {/* 还在敲的时候，光标跟在这一行末尾 */}
            {!done && <Caret />}
          </span>

          {/* 输出行：全部走副文本色，和「输入」区分开，不抢命令行的注意力 */}
          {visibleOutput.map((line, i) => (
            // 用 index 当 key 是安全的：这些行只是静态字符串，不重排、不增删
            <span key={i} className="block break-words text-muted-foreground">
              {line}
            </span>
          ))}

          {/* 全部显示完后另起一行给出下一个提示符，光标在那里闪 —— 像真的在等人输入 */}
          {done && (
            <span className="block text-foreground">
              <span className="text-accent">$</span> <Caret />
            </span>
          )}
        </span>
      </button>
    </>
  );
}
