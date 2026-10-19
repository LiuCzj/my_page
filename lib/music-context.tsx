'use client';

/** 背景音乐。 */

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

/** 音量记忆用的 localStorage 键名。 */
const VOLUME_STORAGE_KEY = 'jingchuang-music-volume';

/** 音量的上下限与默认值。 */
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

/** 从 <audio> 元素算出 0~1 的播放进度。 */
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
  /** 播放进度，0 ~ 1（0 = 刚开头，1 = 放完）。 */
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

/**
 * @param props.src      音源地址（服务端拼好，带签名）。空串 = 没有音源，整块不渲染
 * @param props.src      音源地址（服务端拼好，带签名）。空串 = 没有音源，整块不渲染
 * @param props.children 子树
 */
export function MusicProvider({ src, children }: { src: string; children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  /** 初始 true = 默认静音。改成 false 就不再满足「打开时默认静音」 */
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  /** 音量初始用默认值，**不在这里读 localStorage** ——服务端渲染时没有 window，若在 useState 初始化里读，服务端给 0.6、客户端给存的值，两边首帧不一致 → hydra */
  const [volume, setVolumeState] = useState(VOLUME_DEFAULT);
  /** 播放进度 0~1。 */
  const [progress, setProgress] = useState(0);

  /** 挂载后从 localStorage 恢复上次的音量。 */
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

  /* volume 走受控写入，和 muted 完全同一个理由：React 对 <audio volume> 只是「属性提示」，真正生效的是 DOM 上的 volume 属性，且 React 不会在更新时帮 */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = volume;
  }, [volume]);

  /* muted 走受控写入而不是写 JSX 属性：React 对 <audio muted> 的处理是「只在首次渲染设一次」，之后改 prop 不会再同步到 DOM 上 —— 那样点「取消静音」会没反应。 */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.muted = muted;
  }, [muted]);

  /* ── 音源加载失败的判定 ──────────────── */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onError = () => setFailed(true);
    /* play / pause 也走原生监听，不用 JSX 的 onPlay / onPause ——和上面同一个理由（媒体事件的可靠性实测不如原生监听），而且这两个是**安全网**：除了我们自己的按钮，系 */
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    /* ── 播放进度 ─────────────────────────────── */
    const onTimeUpdate = () => setProgress(computeProgress(a));
    /* loadedmetadata：时长要到元数据加载完才有。preload="metadata" 会让它在 */
    const onLoadedMetadata = () => setProgress(computeProgress(a));
    /* ended：音乐是 loop 的，正常不会走到这里。但若哪天 loop 被关掉，播完必须把进度归零，否则进度环会永远停在 100%。 */
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
      /* play() 返回 Promise，失败时是 reject 而不是抛异常 —— 不接住的话控制台会有一条 */
      a.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  }, [failed]);

  const toggleMute = useCallback(() => {
    /* 取消静音时，如果音量恰好在下限（用户之前把它拖到了最低），直接恢复会有「明明点了取消静音却还是听不见」的观感 —— 那看起来像是坏了。 */
    if (muted && volume <= VOLUME_MIN) setVolumeState(VOLUME_DEFAULT);
    setMuted((m) => !m);
  }, [muted, volume]);

  /** 设定音量。 */
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

  /** 把当前音量立刻落盘。给「拖动结束」用 —— 拖动期间没写盘，松手时补一次。 */
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
        /* preload="metadata"：只拉文件头，够判断「文件在不在、浏览器认不认这个格式」，又不至于每次打开页面都下整首歌。 */
        <audio ref={audioRef} src={src} loop muted preload="metadata" />
      ) : null}
      {children}
    </MusicCtx.Provider>
  );
}

/** 读播放状态与开关。 */
export function useMusic(): MusicState {
  const ctx = useContext(MusicCtx);
  if (!ctx) throw new Error('useMusic 必须在 MusicProvider 内部使用');
  return ctx;
}
