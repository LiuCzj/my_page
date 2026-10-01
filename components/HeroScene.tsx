'use client';

/**
 * 页面最上面那一屏：西装男坐电脑前的场景图，带鼠标视差。
 *
 * 鼠标移动时整张图做轻微的 3D 倾斜和位移，做出「镜头跟着鼠标」的空间感。
 * 固定 src、不随主题切换 → SSR 和客户端渲染同一个 <img>，不会 hydration mismatch。
 * 触屏静止显示（只有真指针才启用视差），reduceMotion 也关掉。
 */

import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

export default function HeroScene() {
  const reduceMotion = useReducedMotion();

  // 鼠标归一化坐标（-0.5 到 0.5）
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // 弹簧平滑，松手后缓慢回中
  const smoothX = useSpring(mouseX, { stiffness: 120, damping: 18, mass: 0.4 });
  const smoothY = useSpring(mouseY, { stiffness: 120, damping: 18, mass: 0.4 });

  // 映射成旋转和位移值
  const rotateY = useTransform(smoothX, [-0.5, 0.5], ['-6deg', '6deg']);
  const rotateX = useTransform(smoothY, [-0.5, 0.5], ['4deg', '-4deg']);
  const translateX = useTransform(smoothX, [-0.5, 0.5], [-10, 10]);
  const translateY = useTransform(smoothY, [-0.5, 0.5], [-6, 6]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (reduceMotion) return;
    mouseX.set(e.clientX / window.innerWidth - 0.5);
    mouseY.set(e.clientY / window.innerHeight - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      className="relative w-full h-[35vh] sm:h-[45vh] overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-hidden="true"
    >
      <div className="w-full h-full" style={{ perspective: '1000px' }}>
        <motion.img
          src="/images/hero-scene.jpg"
          alt=""
          draggable={false}
          className="w-full h-full object-cover pointer-events-none rounded-b-2xl"
          style={
            reduceMotion
              ? undefined
              : {
                  rotateY,
                  rotateX,
                  x: translateX,
                  y: translateY,
                  transformStyle: 'preserve-3d' as const,
                }
          }
        />
      </div>
    </section>
  );
}
