'use client';

/** 首屏终端卡：一张模拟终端窗口的小卡片。 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Terminal } from 'lucide-react';
import { site, type LocalizedText } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useHydrationSafeReducedMotion } from '@/lib/use-reveal';

/* 全部提到文件顶部：这几个数是这张卡的「手感」所在，散在 effect 里的话，想调快慢得先通读一遍逻辑。 */

/** 每敲一个字符的间隔。55ms 是「看得清每个字」和「别让人干等」的折中 */
const TYPE_MS = 55;
/** 命令敲完、到吐出第一行输出之间的停顿。这一拍是「命令真的跑了一下」的错觉来源 */
const OUTPUT_DELAY_MS = 320;
/** 输出逐行打印的间隔。比敲字快一档：结果是一块「刷」出来的，不是一字字挤出来的 */
const OUTPUT_LINE_MS = 160;
/** 全部显示完之后停多久再切下一条。够读完最长的一条输出，又不至于让人以为卡住了 */
const HOLD_MS = 2800;

/* 光标闪烁动画定义在 app/globals.css 的 @theme 里（--animate-terminal-caret） */

/** 一条命令：要「敲」出来的那一行 + 它要打印的输出行 */
interface TerminalCommand {
  cmd: string;
  output: string[];
}

/**
 * 把 config/site.ts 里的真实数据拼成终端要「执行」的几条命令。
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
    /* ② 技能：一个分组一行，后面跟它的小节名（如果有）。 */
    {
      cmd: 'cat skills.txt',
      output: skills.map((group) => {
        const sub = group.sections
          .map((s) => pick(s.label))
          .filter(Boolean)
          .join(' / ');
        return sub ? `${pick(group.title)} — ${sub}` : pick(group.title);
      }),
    },
    // ③ 作品：一个项目一行，slug 在前、标题在后，读起来就是一次 ls 的输出。
    //    条目直接来自 config，占位项目也照原样列出，不做额外筛选。
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
 * @param props.className 外部追加的类名（定位、宽度、外边距交给调用方），默认 undefined
 * @returns 一张可点击切换命令的终端卡片
 */
export default function TerminalCard({ className }: { className?: string }) {
  const { d, pick } = useI18n();
  /** 渲染多少字符。 */
  const reduceMotion = useHydrationSafeReducedMotion();

  /** 命令列表按当前语言重算：pick 的引用随语言变化，所以切语言时这里会重建，输出内容跟着换语言，而 cmd 本身（代码）保持不变。 */
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

  /** 切到下一条命令，并把两个计数清零重新开始。 */
  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % total);
    setTyped(0);
    setOutLines(0);
  }, [total]);

  /** 驱动整条流水线的唯一 effect。 */
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
          {/* 三个圆点。刻意做成中性色，**不用**经典的红黄绿。 */}
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

        {/* ── 终端正文 ── */}
        <span className="block min-h-[6.5rem] px-3.5 py-3 font-mono text-[13px] leading-relaxed sm:text-sm">
          {/* 命令行。提示符 $ 是卡里仅有的两处蓝之一 */}
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
