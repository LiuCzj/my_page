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
 * 【不持久化任何状态】静音偏好**故意不写 localStorage**：
 * 写进去之后访客这次取消了静音，下次打开就是有声的，直接违背「默认静音」。
 * 所以每次加载都回到「暂停 + 静音」。
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

interface MusicState {
  /** 配了音源才渲染控件。没配的话整块不出现 */
  enabled: boolean;
  playing: boolean;
  muted: boolean;
  /** 音源路径写了、但加载失败（文件没放进来 / 格式浏览器不认） */
  failed: boolean;
  /** 播放 / 暂停 */
  toggle: () => void;
  /** 静音 / 取消静音 */
  toggleMute: () => void;
}

const MusicCtx = createContext<MusicState | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const src = site.music.src;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  /** ⚠️ 初始 true = 默认静音。改成 false 就不再满足「打开时默认静音」，见文件头说明 */
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

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
    a.addEventListener('error', onError);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    if (a.error) setFailed(true);
    return () => {
      a.removeEventListener('error', onError);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
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

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const value = useMemo<MusicState>(
    () => ({ enabled: !!src, playing, muted, failed, toggle, toggleMute }),
    [src, playing, muted, failed, toggle, toggleMute],
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
 * @returns 播放 / 静音状态与两个切换函数
 * @throws 在 MusicProvider 之外调用会抛错 —— 和项目里其他 context 一致，
 *   免得「忘了挂 Provider」表现成「按钮点了没反应」这种难查的症状
 */
export function useMusic(): MusicState {
  const ctx = useContext(MusicCtx);
  if (!ctx) throw new Error('useMusic 必须在 MusicProvider 内部使用');
  return ctx;
}
