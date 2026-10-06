'use client';

/**
 * 背景音乐控件：播放/暂停 + 静音 + 音量。
 *
 * 【为什么是两枚按钮 + 一条滑块】「默认静音」意味着访客点「播放」之后**是听不到声音的**，
 * 还得再点一下取消静音。把这两件事拆成两枚按钮，状态一眼看得见（音量图标是划掉的）；
 * 合成一枚「循环切换三种状态」的按钮会让访客猜自己现在在哪一档。
 * 音量单独用滑块表达，因为它是**连续量**而不是开关 —— 三档按钮表达不了「60%」。
 *
 * 【正在播放时给什么反馈】播放中那枚会换成暂停图标，并多出一圈主导色描边。
 * 顶栏这一排控件默认长得完全一样（它们是同级工具），只有音乐有「状态」这回事，
 * 所以也只有它需要高亮 —— 其余控件没有状态，也就不该有任何高亮。
 *
 * 【文件缺失时怎么办】**整块不渲染**，并且在控制台留一条警告说明原因。
 * 试过另一种做法——把两枚按钮变成灰色禁用态、悬停提示「暂时没有可播放的音乐」。
 * 那对站长是清楚的，但对**访客**来说是页面上挂着两个点不动的灰按钮，很怪。
 * 现在的取舍：访客看不到任何东西（页面上不留半个坏控件），
 * 站长打开控制台一眼就能看到「音源加载失败 + 路径」，不至于「明明配了却没有」。
 *
 * 【状态从哪来】全部走 lib/music-context.tsx —— 顶栏和手机抽屉里的控件共用同一份，
 * 各自渲染 <audio> 会同时播两条音轨。
 *
 * 【2026-10-06 新增音量：为什么分两种 variant】
 * 同一份控件有两种宿主，宿主对「浮层」的容纳能力完全不同：
 *   · `popover`（顶栏）：顶栏只有 64px 高，塞不下滑块，所以滑块**按需弹出**。
 *   · `inline`（手机抽屉）：抽屉本身就是一个可滚动的浮层，
 *     在里面再弹一个浮层有两个麻烦 —— 定位上下文多一层、还可能被抽屉的
 *     `overflow-y-auto` 裁掉。所以抽屉里让滑块**常驻平铺**在那一行。
 *
 * 【2026-10-06 第二次改：浮层开合改成「点击开合、移开不关」+ 触屏点按钮=静音】
 * 站长这次的口径（推翻了上一版的 hover 展开/移开收起）：
 *   · **鼠标移开后控件不消失**，只有点浮层外部或按 Esc 才关 —— 上一版移开就收，
 *     用户从按钮移到滑块的那段路上浮层会闪掉，根本拖不到底。
 *   · 因为「移开不关」与「移开即关」互斥，悬停展开就没有意义了：
 *     展开之后反正不会自动收，那不如**只由点击控制开合**，行为更可预期。
 *     （保留 `onMouseEnter` 展开会造成「飘过按钮就弹出浮层、还得手动关」的骚扰。）
 *   · **触屏设备**（`hover: none`）点这颗按钮 = **直接切换静音**，不弹浮层 ——
 *     手机上拖一条 260px 的滑块本来就别扭，而「一键静音」是触屏最高频的动作。
 *     触屏要调音量仍然可以走手机抽屉里的 inline 常驻滑块。
 *
 * 【设备判断为什么用 JS 而不是 CSS】「点按钮做什么」是两个不同的行为分支，
 * CSS 做不了。用 `matchMedia('(hover: hover) and (pointer: fine)')`
 * （与 components/Marquee.tsx 同一个判断），并在 `useEffect` 里设 state ——
 * 不能在首帧读，否则服务端渲染出 A、客户端渲染出 B，hydration 会报不一致。
 * state 初值取 `false`（= 当触屏处理），挂载后立刻纠正：
 * 触屏上首帧就是对的，桌面端只差一次 effect，肉眼无感且不会闪错行为。
 *
 * 【2026-10-06 第三次改：按钮的两次点击语义 + 进度环 + 音符浮动】
 * 站长的原话是「这个按钮点的时候可以调节音量，再点一次按钮又可以快速静音」，
 * 澄清后确切含义是：**浮层开着的时候点按钮 = 快速静音**（不是收起浮层）。
 * 于是桌面端这颗按钮有两个动作，按浮层的开合状态分派：
 *   · 浮层关着 → 点开浮层（去拖滑块）
 *   · 浮层开着 → 直接切静音（「关掉声音」是这一刻最可能想要的，比收起浮层有用得多）
 * 收起浮层仍然有两条路：点浮层外部、按 Esc —— 都还在，没有丢。
 *
 * 【为什么静音后浮层不自动收起】静音只是把喇叭关掉，人往往还想接着拖滑块
 * 把声音调小一点再开。自动收起会强迫他重新点开一遍。所以静音不动浮层。
 *
 * 【播放/暂停按钮为什么多了两样东西】
 *   · **进度环**：播放时按钮外圈画一圈主导色的弧，长度 = 播放进度。
 *     数据显示「有没有在出声」太弱（只有一个图标换形状），进度环把
 *     「放到哪儿了」也一并说清 —— 这是站长要的「圆圈间接显示播放进度」。
 *     暂停时退回 TOPBAR_CONTROL_ACTIVE 那圈静态高亮（表示「挂着的是这首歌」）。
 *   · **音符浮动**：播放时图标上下轻轻动（见 globals.css 的 --animate-music-float）。
 *
 * 【进度环怎么做】两层绝对定位的 span 叠在按钮里，都 `pointer-events-none`：
 *   · 底层 `inset-0 rounded-full`，用 conic-gradient 从 12 点顺时针铺出 `progress` 的那段弧；
 *   · 用 radial mask 把中间挖空，只留 2px 的一圈 —— 这样做的好处是不用算 SVG 的
 *     stroke-dasharray，`progress` 是 0~1 的连续量，直接当 conic-gradient 的角度百分比用。
 *   · 环的颜色取 `--accent`（青，全站「交互与结构强调」色），与悬浮高亮环同色系。
 * 环画在按钮的 padding 内侧一点点（inset-[1px]），免得和按钮自身的 hover 底色打架。
 *
 * 【为什么进度环不用 flex 居中包一层】它必须**完整盖住按钮的圆**（36~38px），
 * 而按钮内部是 flex 居中的一个图标。把环做成 absolute 铺满、再让图标正常居中，
 * 两者互不干扰；塞进 flex 会让图标被环挤小。
 */

import { useEffect, useRef, useState } from 'react';
import { Music, Pause, Volume1, Volume2, VolumeX } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useMusic, VOLUME_STEP } from '@/lib/music-context';
import {
  TOPBAR_CONTROL,
  TOPBAR_ICON_SIZE,
  TOPBAR_POPOVER_WIDTH,
} from '@/lib/topbar';

interface MusicControlsProps {
  /**
   * 滑块怎么呈现。默认 'popover'（顶栏用的那一档）。
   * 见文件头「为什么分两种 variant」。
   */
  variant?: 'popover' | 'inline';
}

export default function MusicControls({ variant = 'popover' }: MusicControlsProps) {
  const { d, pick } = useI18n();
  const { enabled, playing, muted, failed, volume, progress, toggle, toggleMute, setVolume, persistVolume } =
    useMusic();
  const [open, setOpen] = useState(false);
  /**
   * 是不是「能悬停的精细指针」设备（桌面鼠标）。
   * false = 触屏：音量按钮改成纯静音切换，不弹浮层。
   * 初值取 false 的理由见文件头（先按触屏渲染，挂载后纠正，避免 hydration 不一致）。
   */
  const [canHover, setCanHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 与 Marquee.tsx 同一套判断：hover 能力 + 精细指针，两个都满足才算桌面鼠标
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  /*
    加载失败时给站长留一条可查的线索。只在 failed 翻真时打一次（依赖数组就是它），
    不会每次渲染都刷屏。用 warn 不用 error —— 这是「配置没到位」，不是程序出错。
  */
  useEffect(() => {
    if (failed) {
      console.warn(
        `[music] 音源加载失败：${site.music.src} —— 检查文件是否放在 public 下、路径是否写对、格式浏览器是否支持。`,
      );
    }
  }, [failed]);

  /*
    点组件之外收起浮层。和 AuthMenu 的下拉同一套做法（document 上的 pointerdown），
    而不是铺一层透明遮罩 —— 顶栏有 backdrop-blur，铺固定定位的遮罩会被它当成包含块，
    只有顶栏那么高，点页面别处根本关不掉（AuthMenu 踩过这个坑，注释留在那边）。
    inline 档没有浮层，open 恒为 false，这个 effect 里会直接 return，不挂监听。
  */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 没配音源，或配了但加载失败：整块不渲染（见文件头说明）
  if (!enabled || failed) return null;

  /** 音量图标随档位变化：静音 / 低 / 高。三档比两档更能反映滑块的实际位置 */
  const volumeIcon = muted ? (
    <VolumeX size={TOPBAR_ICON_SIZE} aria-hidden="true" />
  ) : volume <= 0.5 ? (
    <Volume1 size={TOPBAR_ICON_SIZE} aria-hidden="true" />
  ) : (
    <Volume2 size={TOPBAR_ICON_SIZE} aria-hidden="true" />
  );

  /**
   * 滑块本体。两种 variant 共用。
   * 【为什么 type="range" 而不是自绘】原生 range 自带键盘操作（方向键调档）、
   * 无障碍语义和触屏拖拽，自绘要全部补一遍，得不偿失。
   *
   * 【拖动为什么不写盘（2026-10-06）】
   * `onChange` 在拖动时每帧都触发，而落盘用的是同步 I/O（localStorage）——
   * 这里传 `persist=false` 让声音实时跟手、拖动过程零 I/O；
   * 松手时 `onPointerUp` / `onKeyUp` / `onChange` 的收尾各补一次 `persistVolume()`。
   * 键盘用户按方向键调档也会触发 onChange，所以 onChange 里也补一次
   * （键盘没有 pointerup，不补的话键盘调的音量永远不会被记住）。
   */
  const slider = (
    <input
      type="range"
      min={0}
      max={100}
      /* 1% 一档：桌面端用鼠标拖能精细到 1%，键盘按一下也是 1%，是「跟手」与「不过冲」的平衡点 */
      step={1}
      value={Math.round(volume * 100)}
      onChange={(e) => setVolume(Number(e.target.value) / 100, false)}
      onPointerUp={persistVolume}
      onKeyUp={persistVolume}
      /* 鼠标松手、键盘调完、触屏抬手统一收尾（onChange 兼容老浏览器与无障碍工具的取值路径） */
      onBlur={persistVolume}
      aria-label={d.music.volumeSlider}
      /* 静音时滑块仍可调（调完要不要取消静音留给人自己决定），只是视觉上压暗 */
      className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/15 accent-accent ${
        muted ? 'opacity-60' : ''
      }`}
    />
  );

  /*
    播放进度环的渐变。conic-gradient 的角度按百分比给：`${p}%` 就是「从 12 点顺时针
    转过 p% 个圆周」。0 度那一侧（还没播到的部分）留成透明 —— 所以整句话是
    「转了 p% 是青色，剩下的全透明」。

    【为什么额外补一个 0.5% 的最小可见弧】progress 刚起步时会是很小的一个数，
    但在 conic-gradient 里 `0.3%` 与 `0%` 视觉上都是「没有弧」——看起来像没在放。
    补到 0.5% 就能看到一个小起点，之后随进度自然伸长。这是纯视觉补偿，
    不改数据（progress 该是多少还是多少）。
  */
  const ringPercent = playing ? Math.max(progress, 0.005) * 100 : 0;

  const playButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? d.music.pause : d.music.play}
      title={`${pick(site.music.title)} · ${playing ? d.music.pause : d.music.play}`}
      /*
        播放中不再挂 TOPBAR_CONTROL_ACTIVE（那圈静态高亮）—— 高亮环的位置
        现在让给进度环。两圈都画会变成「环里套环」，看不出哪圈是进度。
        `relative` 是给进度环做定位上下文的：它自己就是 absolute，
        而 TOPBAR_CONTROL 里没有 relative，不加会被顶到最近的非静态祖先（顶栏那一层）去。
      */
      className={`relative ${TOPBAR_CONTROL}`}
    >
      {/*
        进度环：只在播放时渲染。absolute 铺满按钮、pointer-events-none 不挡点击；
        inset-[1px] 是给按钮自己的边框/悬停底色留 1px 缝，免得两圈贴死。

        【怎么做到「只留 2px 的一圈」——用 radial mask 挖空中间】
        先用 conic-gradient 铺出「转了 progress% 的青色饼 + 其余透明」，
        再用 `mask` 的 radial-gradient 把圆心的部分遮掉，只剩最外一圈。
        径向渐变的写法：从中心到 4px 处全黑（= 完全遮住），到边缘变透明（= 露出）。
        —— 为什么不用「再盖一个小圆」的土办法：按钮的底色是
        `bg-foreground/[0.06]`（一层半透明叠加），不是纯 --background，
        盖一块 --background 会在按钮里显出一个颜色对不上的圆盘。
        用 mask 是「真的挖空」，环里露出来的就是按钮自己的底色，天然一致，
        且深浅主题都自动成立（不需要为哪一档另配颜色）。
      */}
      {playing && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[1px] rounded-full"
          style={{
            background: `conic-gradient(hsl(var(--accent)) ${ringPercent}%, hsl(var(--accent) / 0) 0)`,
            maskImage: 'radial-gradient(closest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
            WebkitMaskImage:
              'radial-gradient(closest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
          }}
        />
      )}

      {/*
        图标本体。播放时挂 --animate-music-float（上下轻微浮动），暂停时静止。
        【为什么要包一层 span 而不是把动画类直接加在 svg 上】
        动画是 transform，直接加在 svg 上会让它自己承担 transform，将来若给 svg
        再加任何定位/缩放的类会互相覆盖；包一层容器，容器专管动画，图标专管大小。
      */}
      <span className={playing ? 'animate-music-float' : undefined}>
        {playing ? <Pause size={TOPBAR_ICON_SIZE} aria-hidden="true" /> : <Music size={TOPBAR_ICON_SIZE} aria-hidden="true" />}
      </span>
    </button>
  );

  // ── inline 档：滑块常驻平铺，不弹浮层（手机抽屉） ──
  if (variant === 'inline') {
    return (
      <div className="flex flex-1 items-center gap-2">
        {playButton}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? d.music.unmute : d.music.mute}
          title={muted ? d.music.unmute : d.music.mute}
          className={TOPBAR_CONTROL}
        >
          {volumeIcon}
        </button>
        {/* 抽屉里横向空间充裕，滑块直接铺开，不再弹一层 */}
        <div className="flex-1 min-w-0">{slider}</div>
        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
          {Math.round(volume * 100)}%
        </span>
      </div>
    );
  }

  // ── popover 档：顶栏。桌面端点开浮层、触屏点即静音 ──
  return (
    <div ref={rootRef} className="relative shrink-0">
      <div className="flex shrink-0 items-center gap-1.5">
        {playButton}

        <button
          type="button"
          /*
            【两颗按钮各司其职】这一颗是**音量按钮**，行为按设备分两路：
              · 桌面（canHover）：浮层关着 → 点开浮层（去拖滑块）；
                                 浮层开着 → 直接切静音（站长要的「再点一次快速静音」）。
                                 注意是**切静音，不是收起浮层** —— 静音后浮层留着，
                                 人往往还要接着拖滑块把音量调小再开。
              · 触屏：直接切静音（不弹浮层）—— 手机上拖滑块别扭，
                「一键静音」才是高频动作；要拖动调音量走抽屉里的 inline 滑块。
            【触发在 click 而不是 pointerdown】用 click 才符合按钮的通用预期
            （按下后移出去再松手 = 取消）。而且 pointerdown 会和外面那层
            「点外部关闭」的监听打架：这颗按钮在 rootRef 内部，虽然不会被误关，
            但 click 语义更干净。
          */
          onClick={() => (canHover ? (open ? toggleMute() : setOpen(true)) : toggleMute())}
          aria-label={
            canHover ? (open ? (muted ? d.music.unmute : d.music.mute) : d.music.volumeSlider) : muted ? d.music.unmute : d.music.mute
          }
          /* 桌面才有可展开的浮层，触屏这颗只是个开关，不该报 expanded */
          aria-expanded={canHover ? open : undefined}
          aria-haspopup={canHover ? 'dialog' : undefined}
          title={
            canHover ? (open ? (muted ? d.music.unmute : d.music.mute) : d.music.volumeSlider) : muted ? d.music.unmute : d.music.mute
          }
          className={TOPBAR_CONTROL}
        >
          {volumeIcon}
        </button>
      </div>

      {canHover && open && (
        <div
          role="dialog"
          aria-label={d.music.volumeSlider}
          /*
            浮层位置：相对这颗按钮所在的 relative 容器。
            - 右侧对齐按钮右边、向下偏移 8px，与 AuthMenu 下拉的 `calc(100%+6px)` 同一手法；
            - 宽度走共享常量。
            ⚠️ 不做 Portal：本组件渲染在顶栏内，而顶栏有 backdrop-blur ——
            那会让固定定位的浮层被当成相对顶栏定位。用绝对定位相对按钮反而正确，
            AuthMenu 的下拉就是这么做的，保持一致。
          */
          style={{ width: TOPBAR_POPOVER_WIDTH }}
          className="absolute top-[calc(100%+8px)] right-0 z-[61] rounded-xl border border-border bg-card p-3 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? d.music.unmute : d.music.mute}
              title={muted ? d.music.unmute : d.music.mute}
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
            >
              {volumeIcon}
            </button>
            <div className="min-w-0 flex-1">{slider}</div>
            <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/*
            增大 / 减小两枚按钮。
            【为什么有了滑块还给这俩】滑块用键盘要先用 Tab 聚焦到它、再按方向键；
            这两枚按钮是「Tab 一次 + 回车」就能用的一步操作，对键盘用户更快。
            对站长提的「支持增大、减小」，这两枚是**字面**回应。
          */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-muted-foreground">{pick(site.music.title)}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setVolume(volume - VOLUME_STEP)}
                aria-label={d.music.volumeDown}
                title={d.music.volumeDown}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
              >
                <span aria-hidden="true" className="text-sm font-bold">
                  −
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVolume(volume + VOLUME_STEP)}
                aria-label={d.music.volumeUp}
                title={d.music.volumeUp}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
              >
                <span aria-hidden="true" className="text-sm font-bold">
                  ＋
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
