'use client';

/** 背景音乐控件：播放/暂停 + 静音 + 音量。 */

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
  /** 滑块怎么呈现。默认 'popover'（顶栏用的那一档）。 */
  variant?: 'popover' | 'inline';
}

export default function MusicControls({ variant = 'popover' }: MusicControlsProps) {
  const { d, pick } = useI18n();
  const { enabled, playing, muted, failed, volume, progress, toggle, toggleMute, setVolume, persistVolume } =
    useMusic();
  const [open, setOpen] = useState(false);
  /** 是不是「能悬停的精细指针」设备（桌面鼠标）。 */
  const [canHover, setCanHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 与 Marquee.tsx 同一套判断：hover 能力 + 精细指针，两个都满足才算桌面鼠标
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  /* 加载失败时在控制台留一条可查的线索，只在 failed 翻真时打一次 */
  useEffect(() => {
    if (failed) {
      console.warn(
        `[music] 音源加载失败：${site.music.src} —— 检查文件是否放在 public 下、路径是否写对、格式浏览器是否支持。`,
      );
    }
  }, [failed]);

  /* 点组件之外收起浮层。 */
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

  /** 滑块本体。两种 variant 共用。 */
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

  /* 播放进度环的渐变。conic-gradient 的角度按百分比给：`${p}%` 就是「从 12 点顺时针 */
  const ringPercent = playing ? Math.max(progress, 0.005) * 100 : 0;

  const playButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? d.music.pause : d.music.play}
      title={`${pick(site.music.title)} · ${playing ? d.music.pause : d.music.play}`}
      /* 播放中不再挂 TOPBAR_CONTROL_ACTIVE（那圈静态高亮）—— 高亮环的位置 */
      className={`relative ${TOPBAR_CONTROL}`}
    >
      {/* 进度环：只在播放时渲染。absolute 铺满按钮、pointer-events-none 不挡点击； */}
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

      {/* 图标本体。播放时挂 --animate-music-float（上下轻微浮动），暂停时静止。 */}
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
          /* · 桌面（canHover）：浮层关着 → 点开浮层（去拖滑块）； */
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
          /* 浮层位置：相对这颗按钮所在的 relative 容器。 */
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

          {/* 增大 / 减小两枚按钮。 */}
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
