'use client';

/**
 * 跟随鼠标的「表情光标」。
 *
 * 【它是怎么被触发的】任何带 data-cursor-emoji="✈️" 的元素被鼠标扫过时，
 * 系统箭头在该元素范围内被隐藏（见 globals.css 里那条被 html 类门控的规则），
 * 由这个组件画一枚表情代替。地球块用 ✈️，工具块用 🔧，连接块用 🔗。
 *
 * 【三条不折衷的边界】
 * 1. 只在真鼠标设备上启用：`matchMedia('(pointer: fine)')` 为假时整个组件不挂，
 *    也不给 <html> 加那个类 —— 触屏没有指针可跟，把系统光标藏起来就是纯粹的坏体验。
 * 2. JS 没跑起来时也不能出现「看不见鼠标」的情况：隐藏系统光标的 CSS 规则被
 *    html.cursor-emoji-active 这个由本组件负责加上的类门控着，组件不挂就没人加它。
 * 3. 系统要求「减少动态效果」时仍然显示表情（这是功能，不是装饰），
 *    但去掉速度平滑与转向插值，飞机不随移动方向转。
 *
 * 【为什么位置直接跟手、只有旋转做插值】
 * 让表情跟随一段平滑曲线会产生拖影感（图的位置和真实指针不一致，点击时找不到边界）。
 * 所以这里 x/y 每帧直接等于鼠标坐标，只有角度和缩放走平滑。
 */

import { useEffect, useRef, useState } from 'react';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const emojiRef = useRef<string | null>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const root = document.documentElement;
    root.classList.add('cursor-emoji-active');

    let x = 0;
    let y = 0;
    let lastX = 0;
    let lastY = 0;
    let vx = 0;
    let vy = 0;
    let angle = 0;
    let heldAngle = 0;
    let raf = 0;
    let seen = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        lastX = x;
        lastY = y;
        seen = true;
      }
      const host = (e.target as Element | null)?.closest?.('[data-cursor-emoji]');
      const next = host?.getAttribute('data-cursor-emoji') ?? null;
      if (next !== emojiRef.current) {
        emojiRef.current = next;
        setEmoji(next);
        if (next) {
          angle = 0;
          heldAngle = 0;
        }
      }
    };

    const onLeave = () => {
      if (emojiRef.current !== null) {
        emojiRef.current = null;
        setEmoji(null);
      }
    };

    const tick = () => {
      const el = dotRef.current;
      if (el && seen) {
        vx = vx * 0.75 + (x - lastX) * 0.25;
        vy = vy * 0.75 + (y - lastY) * 0.25;
        lastX = x;
        lastY = y;

        let transform = `translate3d(${x}px, ${y}px, 0)`;
        if (!reduce) {
          // 飞机 emoji 默认朝向右上，所以 atan2 的结果要补 45°
          if (emojiRef.current === '✈️') {
            if (Math.hypot(vx, vy) > 0.6) heldAngle = Math.atan2(vy, vx) + Math.PI / 4;
            angle += (heldAngle - angle) * 0.2;
          } else {
            angle = 0;
          }
          transform += ` rotate(${angle}rad) scale(${emojiRef.current ? 1 : 0})`;
        } else if (!emojiRef.current) {
          transform += ' scale(0)';
        }
        el.style.transform = transform;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      root.classList.remove('cursor-emoji-active');
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[999] select-none will-change-transform"
      style={{ transform: 'translate3d(-100px, -100px, 0)' }}
    >
      <span className="block -translate-x-1/2 -translate-y-1/2 text-[22px] leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
        {emoji ?? ''}
      </span>
    </div>
  );
}
