'use client';

/**
 * 背景音乐（2026-10-05 新增）。
 *
 * 【为什么要有这一层 Context，而不是把 <audio> 塞进播放器组件】
 * 顶栏的播放控件和手机抽屉里的播放控件是**两个组件、同一份播放状态**。
 * 如果各自渲染一个 <audio>，两处会各播各的 —— 打开抽屉就会听到两条音轨叠在一起。
 * 所以 <audio> 元素只由这一层渲染**一个**，两处控件都通过 useMusic() 读同一份状态。
 * （同一条思路见 lib/twin-chat-context.tsx：聊天面板和顶栏按钮共用一份开合状态。）
 *
 * 【默认状态：暂停 + 静音 —— 两个都要】
 * 「暂停」保证打开页面不会自己出声；「静音」是第二道保险，而且它是浏览器的硬要求：
 * 现代浏览器会拦截「有声音的自动播放」，所以想自动播也只能静音播。
 * 两个都设上之后，这个播放器在任何浏览器上的初始状态都是确定的。
 *
 * ⚠️ **这带来一个交互上的必然结果，改之前先想清楚**：默认静音，所以访客第一次点「播放」
 * 是**听不到声音的**，必须再点一下「取消静音」。这是「默认静音」这个要求本身的代价，
 * 不是 bug。如果哪天想改成「点播放就出声」，把那行初始 `useState(true)` 改成 `false` 即可 ——
 * 但那就不再是「打开时默认静音」了。
 *
 * 【静音偏好不持久化、音量持久化 —— 两者刻意不对称（2026-10-06）】
 * 这一条要想清楚再改：
 *   · **`muted` 不写 localStorage**：写进去之后访客这次取消了静音，下次打开就是有声的，
 *     直接违背「默认静音」。所以每次加载都回到「静音」。
 *   · **`volume` 写 localStorage**：音量是「下次取消静音时的取值」，它本身不会让页面出声
 *     （不出声由 `muted=true` 保证），所以记住它既不违背「默认静音」，
 *     又能让用户不用每次重新拖滑块。
 * 换句话说：**默认静音由 `muted` 守，音量记忆由 `volume` 给**。
 * 这条折中是站长 2026-10-06 明确定的（选项：记住音量、但仍默认静音）。
 *
 * 【音源从哪来】`config/site.ts` 的 `music.src`（public/ 下的相对路径）。
 * 留空字符串则整个播放器不渲染 —— 站长还没放音乐文件时，页面上不会出现一个坏掉的按钮。
 * 文件放好了但路径写错时，`onError` 会把 `failed` 置真，控件变成「不可用」态并在悬停提示里说明。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { site } from '@/config/site';

/**
 * 音量记忆用的 localStorage 键名。
 * 与 i18n 的键名一样带站点前缀，避免和同域下其它东西撞车。
 */
const VOLUME_STORAGE_KEY = 'jingchuang-music-volume';

/**
 * 音量的上下限与默认值。
 *
 * 【为什么下限不是 0】0 和「静音」是两件事，但用户看到的都是「没声音」——
 * 允许拖到 0 会让「我已经取消静音了怎么还是没声」变成一个需要排查的状态。
 * 下限压到 0.05（≈ 5%）既能得到「几乎听不见」，又不会和静音混淆；
 * 真要彻底安静，那枚静音按钮就是为这件事准备的。
 */
const VOLUME_MIN = 0.05;
const VOLUME_MAX = 1;
/** 首次访问时的默认音量。0.6 是「能听清又不吵」的常见默认档 */
const VOLUME_DEFAULT = 0.6;
/** 每次调音量的步长（10%）。导出给 UI 用，保证「加减按钮」和「滑块」对步长的理解一致 */
export const VOLUME_STEP = 0.1;

/** 把任意数值夹到合法音量区间。读 localStorage 与加减步长都走它，保证只在这一处定义边界 */
function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return VOLUME_DEFAULT;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, v));
}

/**
 * 从 <audio> 元素算出 0~1 的播放进度。
 *
 * 【为什么要单独一个函数而不是写在内联监听里】同一个算法被 timeupdate 和
 * loadedmetadata 两处用到，抽出来避免两处漂移。
 *
 * 【三个边界，全都返回 0 而不是 NaN / Infinity】
 *   · duration 是 NaN / 0 / Infinity：元数据还没到（NaN）、或流式音频永远给不出总长
 *     （Infinity）。这两种情况下 currentTime/duration 会算出 NaN 或 0，
 *     用来画进度环会得到一条乱掉的弧线 —— 直接归零，环形进度不显示。
 *   · currentTime 超过 duration：某些浏览器在 loop 回绕的瞬间会出现（毫秒级）。
 *     夹到 1 以内，避免环画出界。
 */
function computeProgress(a: HTMLAudioElement): number {
  const { currentTime, duration } = a;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(currentTime) || currentTime <= 0) return 0;
  return Math.min(1, currentTime / duration);
}

interface MusicState {
  /** 配了音源才渲染控件。没配的话整块不出现 */
  enabled: boolean;
  playing: boolean;
  muted: boolean;
  /** 音源路径写了、但加载失败（文件没放进来 / 格式浏览器不认） */
  failed: boolean;
  /** 当前音量，0.05 ~ 1 之间。与静音是两个维度：静音时这个值不变，取消静音后仍是它 */
  volume: number;
  /**
   * 播放进度，0 ~ 1（0 = 刚开头，1 = 放完）。
   * 时长未知（元数据还没加载完 / 拿不到 duration）时是 0。
   * 由 `<audio>` 的 timeupdate 更新，**每秒约 4 次** —— 够画装饰性的进度环，
   * 不值得为它上 requestAnimationFrame 常驻占用主线程（见 Provider 里的说明）。
   */
  progress: number;
  /** 播放 / 暂停 */
  toggle: () => void;
  /** 静音 / 取消静音 */
  toggleMute: () => void;
  /** 直接设定音量（滑块用），会自动夹到合法区间。persist=false 时只改声音不写盘（拖动中用） */
  setVolume: (v: number, persist?: boolean) => void;
  /** 把当前音量立刻落盘（拖动结束时用） */
  persistVolume: () => void;
  /** 在当前音量上加减一步（增大 / 减小按钮用） */
  adjustVolume: (delta: number) => void;
}

const MusicCtx = createContext<MusicState | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const src = site.music.src;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  /** ⚠️ 初始 true = 默认静音。改成 false 就不再满足「打开时默认静音」，见文件头说明 */
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  /**
   * 音量初始用默认值，**不在这里读 localStorage** ——
   * 服务端渲染时没有 window，若在 useState 初始化里读，服务端给 0.6、客户端给存的值，
   * 两边首帧不一致 → hydration 报错。所以延后到挂载后的 effect 里读（同 lib/i18n.tsx 的做法）。
   */
  const [volume, setVolumeState] = useState(VOLUME_DEFAULT);
  /**
   * 播放进度 0~1。**只在播放时更新** ——
   * 暂停时不必每 250ms 白跑一次 setState（React 会为相同的值 bail out，
   * 但监听器本身还在触发；这里用 playing 做闸门更省）。
   */
  const [progress, setProgress] = useState(0);

  /**
   * 挂载后从 localStorage 恢复上次的音量。
   *
   * 【为什么能只恢复音量、不恢复静音】音量本身不会让页面出声（出声与否由 muted 决定），
   * 所以记住它不违背「默认静音」。详见文件头「静音偏好不持久化、音量持久化」那一段。
   * 【为什么 try/catch】隐私模式 / 禁用存储时 localStorage 会直接抛异常，
   * 这里失败就安静退回默认值 —— 音量记不住是小事，不该让整个 Provider 崩掉。
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      if (saved === null) return;
      const parsed = Number(saved);
      // 存进去的值可能被手动改坏（非数字 / 超范围），clampVolume 会兜住
      if (Number.isFinite(parsed)) setVolumeState(clampVolume(parsed));
    } catch {
      // 读不到就用默认音量，不打扰用户
    }
  }, []);

  /*
    volume 走受控写入，和 muted 完全同一个理由：React 对 <audio volume> 只是「属性提示」，
    真正生效的是 DOM 上的 volume 属性，且 React 不会在更新时帮我们同步它。
    ⚠️ 注意 volume 不是 HTML 属性（它只存在于 DOM 接口上），所以更不存在写 JSX 属性的可能。
  */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = volume;
  }, [volume]);

  /*
    muted 走受控写入而不是写 JSX 属性：React 对 <audio muted> 的处理是「只在首次渲染设一次」，
    之后改 prop 不会再同步到 DOM 上 —— 那样点「取消静音」会没反应。用 ref 写才可靠。
  */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.muted = muted;
  }, [muted]);

  /*
    ── 音源加载失败的判定（2026-10-05 修过一次）────────────────
    【为什么不用 JSX 上的 onError】试过 `<audio onError={...}>`，实测**接不住**：
    文件 404 时 `a.error.code` 已经是 4（Format error），但 failed 始终是 false，
    于是页面上照旧渲染出两枚点了没反应的音乐按钮。
    原因是竞态 —— 元素带着 src 一进 DOM 就开始加载，而 404 是瞬时的，
    error 事件在 React 把监听器挂上去之前就已经派发完了，这一枪打空了。

    【现在两层兜底】
      ① 挂载时**主动读一次现状** `a.error` —— 属性不会因为「没听到事件」而消失，
         这一读就把上面那个竞态堵死了；
      ② 再挂一个原生监听器，接住「挂载之后才失败」的情况（比如文件存在但内容不是音频）。
    两处都走 setFailed(true)，重复触发无害。
  */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onError = () => setFailed(true);
    /*
      play / pause 也走原生监听，不用 JSX 的 onPlay / onPause ——
      和上面同一个理由（媒体事件的可靠性实测不如原生监听），
      而且这两个是**安全网**：除了我们自己的按钮，系统媒体键、锁屏控件
      也能让音频开始/停止，状态必须跟着走，否则按钮图标会和实际播放状态对不上。
    */
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    /*
      ── 播放进度（2026-10-06 加）───────────────────────────────
      为什么用 timeupdate 而不是 requestAnimationFrame：
      timeupdate 每秒约 4 次，画一个「间接显示进度」的装饰环完全够；
      rAF 是每秒 60 次的常驻循环，为一个装饰环让主线程一直醒着不划算
      （项目的性能纪律：能用原生事件/ CSS 做的小动效就别上更重的手段）。
      代价是进度环以约 250ms 的粒度推进 —— 因为它本身就细（2px 环），
      这个粒度肉眼看不出台阶。

      duration 拿不到时（元数据未就绪 / 流式音频无 duration）直接给 0，
      不显示进度环，也不报错 —— 见 computeProgress 的说明。
    */
    const onTimeUpdate = () => setProgress(computeProgress(a));
    /*
      loadedmetadata：时长要到元数据加载完才有。preload="metadata" 会让它在
      很早的时候触发一次；这一次不算「在播放」，但要把 duration 记下来，
      否则用户点播放后第一次 timeupdate 之前，进度环会短暂显示成 0%。
    */
    const onLoadedMetadata = () => setProgress(computeProgress(a));
    /*
      ended：音乐是 loop 的，正常不会走到这里。但若哪天 loop 被关掉，
      播完必须把进度归零，否则进度环会永远停在 100%。
    */
    const onEnded = () => setProgress(0);
    a.addEventListener('error', onError);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTimeUpdate);
    a.addEventListener('loadedmetadata', onLoadedMetadata);
    a.addEventListener('ended', onEnded);
    if (a.error) setFailed(true);
    return () => {
      a.removeEventListener('error', onError);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('timeupdate', onTimeUpdate);
      a.removeEventListener('loadedmetadata', onLoadedMetadata);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || failed) return;
    if (a.paused) {
      /*
        play() 返回 Promise，失败时是 reject 而不是抛异常 —— 不接住的话控制台会有一条
        unhandled rejection。

        ⚠️ **这里刻意不把 reject 当成 `failed`**（踩过一次）：
        `failed` 会让控件整块消失，而 play() 被拒的原因有两种 ——
          ① 文件不存在/格式不认（该消失）；
          ② 浏览器的自动播放策略拦下了这一次调用（不该消失）。
        把两者混在一起，后果是「被拦一次 = 控件永久消失」，访客再也找不回来。
        所以：文件层面的问题交给 <audio> 的 onError 判（preload="metadata" 时它在加载阶段就触发），
        这里只管把状态退回暂停。
      */
      a.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  }, [failed]);

  const toggleMute = useCallback(() => {
    /*
      取消静音时，如果音量恰好在下限（用户之前把它拖到了最低），
      直接恢复会有「明明点了取消静音却还是听不见」的观感 —— 那看起来像是坏了。
      这里顺手把音量提回一个听得见的档位，让「取消静音」这个动作总是有可感知的结果。

      ⚠️ 这个判断写在 setMuted 的 updater **外面**，而不是里面：
      updater 必须在严格模式的双次调用下保持纯净（不产生副作用），
      在里面调 setVolume 属于反模式。这里读的 volume 来自闭包，
      对「用户刚点了静音/取消静音」这个时机来说它是最新值，够用。
    */
    if (muted && volume <= VOLUME_MIN) setVolumeState(VOLUME_DEFAULT);
    setMuted((m) => !m);
  }, [muted, volume]);

  /**
   * 设定音量。
   *
   * 【persist 参数是给「拖动滑块」用的（2026-10-06 加）】
   * 拖动时 `onChange` 每一帧都会调用本函数，而 `localStorage.setItem` 是**同步 I/O** ——
   * 在存储慢的设备上会拖出可见的卡顿，直接影响「跟手」的手感。
   * 所以拖动过程传 `persist: false`（只更新 state，声音实时跟手、不写盘），
   * 松手（pointerup / change 结束）时再传一次 `persist: true` 落盘。
   * 副产品是语义也更对：拖动途中的每个中间值本来就不该被记住。
   *
   * 【默认 true】「点一下」类的调用（步进按钮等）不传这个参数，行为与原来一致。
   */
  const setVolume = useCallback((v: number, persist = true) => {
    const next = clampVolume(v);
    setVolumeState(next);
    if (!persist) return;
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
    } catch {
      // 存不了就算了，本次会话内音量照样生效
    }
  }, []);

  /**
   * 把当前音量立刻落盘。给「拖动结束」用 —— 拖动期间没写盘，松手时补一次。
   * 用 ref 读最新值：松手的回调可能来自上一次 render 的闭包，直接读 state 会拿到旧值。
   */
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const persistVolume = useCallback(() => {
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volumeRef.current));
    } catch {
      // 同上
    }
  }, []);

  /** 在当前音量上加减一步。读的是函数式更新里的最新值，避免闭包拿到过期音量 */
  const adjustVolume = useCallback(
    (delta: number) => {
      setVolumeState((prev) => {
        const next = clampVolume(prev + delta);
        try {
          window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
        } catch {
          // 同上
        }
        return next;
      });
    },
    [],
  );

  const value = useMemo<MusicState>(
    () => ({
      enabled: !!src,
      playing,
      muted,
      failed,
      volume,
      progress,
      toggle,
      toggleMute,
      setVolume,
      persistVolume,
      adjustVolume,
    }),
    [
      src,
      playing,
      muted,
      failed,
      volume,
      progress,
      toggle,
      toggleMute,
      setVolume,
      persistVolume,
      adjustVolume,
    ],
  );

  return (
    <MusicCtx.Provider value={value}>
      {src ? (
        /*
          preload="metadata"：只拉文件头，够判断「文件在不在、浏览器认不认这个格式」，
          又不至于每次打开页面都下整首歌。
          失败判定不在这里的 onError 上（接不住，见上面的说明），而是上面那个 effect。
        */
        <audio ref={audioRef} src={src} loop muted preload="metadata" />
      ) : null}
      {children}
    </MusicCtx.Provider>
  );
}

/**
 * 读播放状态与开关。
 * @returns 播放 / 静音 / 音量状态，以及切换与调节函数
 * @throws 在 MusicProvider 之外调用会抛错 —— 和项目里其他 context 一致，
 *   免得「忘了挂 Provider」表现成「按钮点了没反应」这种难查的症状
 */
export function useMusic(): MusicState {
  const ctx = useContext(MusicCtx);
  if (!ctx) throw new Error('useMusic 必须在 MusicProvider 内部使用');
  return ctx;
}
