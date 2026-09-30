'use client';

/**
 * 站点的数字分身机器人（内联 SVG，纯颜色令牌，零图片零 WebGL）。
 *
 * 【造型】全身投影像：底座三圈发光椭圆 + 向上的光锥 + 躯干横向栅格纹 +
 * 胸口一枚核心 + 头。再加一条自上而下循环掠过的扫描线 —— 这是「它是投影出来的」
 * 这件事的视觉说法，也是它和首屏那张真人头像的区别。
 *
 * 【颜色】机身 fill-accent、面屏与栅格刻线 fill/stroke-background、五官 fill-accent。
 * 深色下机身是亮蓝、刻线是深蓝黑；浅色正好相反。两种主题都成立，不需要 dark: 变体。
 *
 * 【动画】待机上下浮 3px + 扫描线循环 + 偶尔眨眼，三样全部由 useReducedMotion 关掉；
 * 关掉之后是完整的静止图形，不是空白。
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
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true">
      {/* ── 投影底座：外光环 → 内环 → 实心焦点，一圈比一圈亮 ── */}
      <ellipse cx="60" cy="128" rx="34" ry="7.5" className="fill-accent" opacity="0.16" />
      <ellipse cx="60" cy="127" rx="22" ry="5" className="fill-accent" opacity="0.38" />
      <ellipse cx="60" cy="126.5" rx="9" ry="2.4" className="fill-accent" opacity="0.85" />

      {/* ── 光锥：从底座向上散开。它不参与浮动，所以放在 motion.g 外面 ── */}
      <path d="M38 126 L48 74 L72 74 L82 126 Z" className="fill-accent" opacity="0.10" />

      <g>
        <motion.g
          animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* ── 躯干与栅格刻线 ── */}
          <rect x="38" y="72" width="44" height="40" rx="14" className="fill-accent" opacity="0.92" />
          {[80, 86, 92, 98, 104].map((y) => (
            <line
              key={y}
              x1="41"
              y1={y}
              x2="79"
              y2={y}
              className="stroke-background"
              strokeWidth="1.6"
              opacity="0.35"
            />
          ))}
          <circle cx="60" cy="88" r="4.2" className="fill-background" opacity="0.9" />
          <circle cx="60" cy="88" r="2.2" className="fill-accent" />

          {/* ── 手臂 ── */}
          <rect x="28" y="76" width="8" height="26" rx="4" className="fill-accent" opacity="0.7" />
          <rect x="84" y="76" width="8" height="26" rx="4" className="fill-accent" opacity="0.7" />

          {/* ── 颈与头 ── */}
          <rect x="52" y="62" width="16" height="12" rx="5" className="fill-accent" opacity="0.75" />
          <line x1="60" y1="20" x2="60" y2="11" className="stroke-accent" strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="9" r="3.6" className="fill-accent" />
          <rect x="16" y="34" width="8" height="18" rx="4" className="fill-accent" />
          <rect x="96" y="34" width="8" height="18" rx="4" className="fill-accent" />
          <rect x="24" y="20" width="72" height="46" rx="18" className="fill-accent" />
          <rect x="34" y="30" width="52" height="28" rx="11" className="fill-background" />

          {/* 眼睛：偶尔眨一下。transform-box 让缩放绕各自中心，否则会以整个 SVG 原点为轴 */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={blink && !reduceMotion ? { scaleY: [1, 1, 0.15, 1, 1] } : undefined}
            transition={{ duration: 5, times: [0, 0.86, 0.9, 0.94, 1], repeat: Infinity, ease: 'easeInOut' }}
          >
            <rect x="44" y="38" width="10" height="10" rx="3.4" className="fill-accent" />
            <rect x="66" y="38" width="10" height="10" rx="3.4" className="fill-accent" />
          </motion.g>
          <path d="M50 51 Q60 57 70 51" className="stroke-accent" strokeWidth="3" strokeLinecap="round" fill="none" />
        </motion.g>

        {/* ── 扫描线：自上而下掠过全身 ── */}
        {!reduceMotion && (
          <motion.line
            x1="26"
            x2="94"
            className="stroke-accent"
            strokeWidth="1.4"
            strokeLinecap="round"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: [18, 118], opacity: [0, 0.7, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.7, 1] }}
          />
        )}
      </g>
    </svg>
  );
}
