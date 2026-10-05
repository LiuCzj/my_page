'use client';

/**
 * 顶栏的背景音乐控件：一枚播放/暂停 + 一枚静音/取消静音。
 *
 * 【为什么是两枚而不是一枚】「默认静音」意味着访客点「播放」之后**是听不到声音的**，
 * 还得再点一下取消静音。把这两件事拆成两枚按钮，状态一眼看得见（音量图标是划掉的）；
 * 合成一枚「循环切换三种状态」的按钮会让访客猜自己现在在哪一档。
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
 */

import { useEffect } from 'react';
import { Music, Pause, Volume2, VolumeX } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useMusic } from '@/lib/music-context';
import { TOPBAR_CONTROL, TOPBAR_CONTROL_ACTIVE, TOPBAR_ICON_SIZE } from '@/lib/topbar';

export default function MusicControls() {
  const { d, pick } = useI18n();
  const { enabled, playing, muted, failed, toggle, toggleMute } = useMusic();

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

  // 没配音源，或配了但加载失败：整块不渲染（见文件头说明）
  if (!enabled || failed) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? d.music.pause : d.music.play}
        title={`${pick(site.music.title)} · ${playing ? d.music.pause : d.music.play}`}
        className={`${TOPBAR_CONTROL} ${playing ? TOPBAR_CONTROL_ACTIVE : ''}`}
      >
        {playing ? (
          <Pause size={TOPBAR_ICON_SIZE} aria-hidden="true" />
        ) : (
          <Music size={TOPBAR_ICON_SIZE} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? d.music.unmute : d.music.mute}
        title={muted ? d.music.unmute : d.music.mute}
        className={TOPBAR_CONTROL}
      >
        {muted ? (
          <VolumeX size={TOPBAR_ICON_SIZE} aria-hidden="true" />
        ) : (
          <Volume2 size={TOPBAR_ICON_SIZE} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
