'use client';

/** 跟随鼠标的「表情光标」。 */

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

    /**
     * 把「指针此刻压在哪个宿主上」写进 state。
     * @param host 指针下的元素；传 null 表示不在任何宿主上（表情收起）
     */
    const syncEmoji = (host: Element | null) => {
      const next = host?.closest?.('[data-cursor-emoji]')?.getAttribute('data-cursor-emoji') ?? null;
      // 宿主没变就不 setState —— mousemove 一秒几十次，每次都渲染会白烧一帧
      if (next === emojiRef.current) return;
      emojiRef.current = next;
      setEmoji(next);
      if (next) {
        angle = 0;
        heldAngle = 0;
      }
    };

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        lastX = x;
        lastY = y;
        seen = true;
      }
      syncEmoji(e.target as Element | null);
    };

    /**
     * 滚动 / 改窗口大小时指针本身没动，浏览器**不会补发 mousemove**，
     * 于是磁贴从指针底下移走、表情还挂在原地。这里按当前坐标重新问一次「压在哪个元素上」。
     *
     * elementFromPoint 会跳过 pointer-events:none 的层（表情本身、拖尾画布都在其中），
     * 语义和 mousemove 的 e.target 一致，不会问到自己头上。
     * ⚠️ 滚动监听用 capture：编辑器、代码块这类**内部滚动容器**的滚动事件不冒泡到 window。
     */
    const resync = () => {
      if (!seen) return;
      syncEmoji(document.elementFromPoint(x, y));
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
    window.addEventListener('scroll', resync, { capture: true, passive: true });
    window.addEventListener('resize', resync, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      // 移除时 capture 必须和添加时一致，否则摘不掉
      window.removeEventListener('scroll', resync, { capture: true });
      window.removeEventListener('resize', resync);
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
