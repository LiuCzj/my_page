'use client';

/**
 * 站点的数字分身机器人（内联 SVG，零图片零 WebGL）。
 *
 * 【为什么是线描而不是实心块】
 * 机身一旦填成整块 accent，在深色底上它就只是"比背景更蓝的一块" ——
 * 既不成焦点，也看不出结构。所以反过来画：
 *   轮廓用 stroke-current（继承文字色，深浅色自动成立），内部不填；
 *   全图只有两处上颜色 —— 眼睛是 accent，底座那一圈是 accent 的低透明环。
 * 于是它读起来像一台**亮着灯的仪器**，而不是一块蓝色贴纸。
 *
 * 【动画】待机浮 3px + 眼睛偶尔眨 + 底座环缓慢呼吸，三样都由 useReducedMotion 关掉；
 * 关掉后是完整的静止图形，不是空白。
 */

import { motion, useReducedMotion } from 'framer-motion';

export default function RobotMark({
  className,
  blink = false,
}: {
  className?: string;
  /** 是否眨眼。首屏那只给 true */
  blink?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 120 128"
      className={`text-foreground ${className}`}
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ── 底座：一圈 accent 冷光环，是全图第二处颜色 ── */}
      <motion.ellipse
        cx="60"
        cy="116"
        rx="26"
        ry="6"
        className="stroke-accent"
        strokeWidth="1.5"
        animate={reduceMotion ? undefined : { opacity: [0.35, 0.75, 0.35] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <ellipse cx="60" cy="116" rx="12" ry="2.8" className="fill-accent" opacity="0.5" />

      {/* 从底座射向身体的两束投影线，很淡，只负责把"悬浮"讲清楚 */}
      <path d="M44 113 L50 96 M76 113 L70 96" className="stroke-current" strokeWidth="1" opacity="0.18" />

      <motion.g
        animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* ── 天线 ── */}
        <line x1="60" y1="18" x2="60" y2="9" className="stroke-current" strokeWidth="2.5" />
        <circle cx="60" cy="7" r="3.5" className="stroke-current" strokeWidth="2.5" />

        {/* ── 肩 ── */}
        <path
          d="M34 100 Q34 84 60 84 Q86 84 86 100"
          className="stroke-current"
          strokeWidth="2.5"
          opacity="0.75"
        />
        <line x1="44" y1="92" x2="76" y2="92" className="stroke-current" strokeWidth="1.5" opacity="0.3" />

        {/* ── 颈 ── */}
        <line x1="54" y1="76" x2="54" y2="82" className="stroke-current" strokeWidth="2" opacity="0.6" />
        <line x1="66" y1="76" x2="66" y2="82" className="stroke-current" strokeWidth="2" opacity="0.6" />

        {/* ── 头与耳 ── */}
        <rect x="26" y="20" width="68" height="56" rx="20" className="stroke-current" strokeWidth="2.5" />
        <rect x="17" y="38" width="7" height="20" rx="3.5" className="stroke-current" strokeWidth="2.5" />
        <rect x="96" y="38" width="7" height="20" rx="3.5" className="stroke-current" strokeWidth="2.5" />

        {/* ── 面罩 ── */}
        <rect
          x="35"
          y="31"
          width="50"
          height="34"
          rx="13"
          className="stroke-current"
          strokeWidth="1.5"
          opacity="0.35"
        />

        {/* 眼睛：全图唯一的实心 accent。偶尔眨一下，transform-box 让缩放绕各自中心 */}
        <motion.g
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={blink && !reduceMotion ? { scaleY: [1, 1, 0.15, 1, 1] } : undefined}
          transition={{ duration: 5, times: [0, 0.86, 0.9, 0.94, 1], repeat: Infinity, ease: 'easeInOut' }}
        >
          <circle cx="49" cy="45" r="5" className="fill-accent" />
          <circle cx="71" cy="45" r="5" className="fill-accent" />
        </motion.g>

        {/* 嘴：一道短弧，不抢眼睛 */}
        <path d="M52 56 Q60 61 68 56" className="stroke-current" strokeWidth="2.5" opacity="0.7" />
      </motion.g>
    </svg>
  );
}
