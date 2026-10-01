'use client';

/**
 * 首屏的数字分身「角色」（西装男）。
 *
 * src 是常量、不随主题换 → 服务端与客户端渲染同一个 <img>，不会出现
 * 「服务端给占位、客户端多一张图」的 hydration 不匹配。
 *
 * 【动画】只有超轻的待机浮动（上下 6px），由 useReducedMotion 关掉；
 * 关掉后是完整的静止角色，不是空白。
 * 交互（点按开关聊天、tooltip、手机常驻提示）都在 Hero 里，本组件只负责展示形象。
 */

import { motion, useReducedMotion } from 'framer-motion';

export default function HeroMascot({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      aria-hidden="true"
      className={className}
      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img
        src="/images/mascot-3d.png"
        alt=""
        draggable={false}
        className="h-full w-full select-none object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)]"
      />
    </motion.div>
  );
}