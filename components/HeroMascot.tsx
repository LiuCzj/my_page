'use client';

/**
 * 首屏的数字分身「角色」。
 *
 * 【形象是 AI 生成的位图，不是手绘 SVG】
 * 2026-10-03 曾短暂改成手绘 SVG（components/MascotFigure.tsx），
 * 目的是让眼睛/嘴/右臂能独立驱动、做出「眨眼 / 说话 / 挥手」。
 * 但用户否定了那个画风 —— 手绘矢量的天花板就是「干净的卡通」，
 * 到不了 AI 生成图那种质感。所以形象退回位图。
 *
 * 【代价要说清楚】位图是一整块像素，做不到部件级动画，
 * 所以「眨眼 / 说话 / 挥手」三个动作随之一并去掉（globals.css 里的
 * blink / talk / wave 三条 keyframes 也一并清理了）。
 * 保留的是**整幅图级别**的动作：呼吸（缩放 + 晃动 + 起伏）与脚下投影。
 * 想再要人物内部的动作，只有 AI 生成视频 + 逐帧抠背景一条路，
 * 那条路有毛边和性能开销，没有做。
 *
 * 【为什么用 <img> 而不是 next/image】
 * 全站 images.unoptimized 已开（next.config.ts），走 next/image 不会得到任何优化，
 * 反而多一层包装。src 是常量、不随主题换，服务端与客户端渲染同一个 <img>，
 * 不会出现「服务端给占位、客户端多一张图」的 hydration 不匹配。
 *
 * 交互（点按开关聊天、tooltip、手机常驻提示）都在 Hero 里，本组件只负责形象与动作。
 */

export default function HeroMascot({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`relative ${className ?? ''}`}>
      {/* 呼吸 + 晃动 + 起伏。动画挂在 img 的父层，img 自己不做变换 */}
      <div className="relative h-full w-full animate-mascot-breathe motion-reduce:animate-none">
        <img
          src="/images/mascot-q.png"
          alt=""
          draggable={false}
          className="h-full w-full select-none object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]"
        />
      </div>

      {/*
        脚下投影：钉在地面上，只按同一条周期反向缩放变淡。
        scaleX 只缩横向 —— 影子变扁比整圈缩小更像「光源在正上方」。
        平移写在 keyframes 里而不是配 -translate-x-1/2 类：
        两者都写 transform，挂同一个元素上会互相覆盖。
        【bottom / w 的取值】位图是 512×512 正方形，Q 版人物是站姿，
        脚落在画面底部往上一点，所以影子给在 bottom 7%、宽度占 34%。
      */}
      <span className="pointer-events-none absolute bottom-[7%] left-1/2 h-[4%] w-[34%] animate-mascot-shadow rounded-[50%] bg-black/30 blur-[7px] motion-reduce:animate-none dark:bg-black/55" />
    </div>
  );
}
