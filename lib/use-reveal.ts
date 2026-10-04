'use client';

/**
 * 滚动进入动画的属性包（整站共用，可为卡片单独加强幅度）。
 *
 * 【2026-10-04 修正：为什么原来的参数等于没做】
 * 上一版卡片用 distance:16 / scale:0.975 / duration:0.52，用户反馈「一点都看不出来」。
 * 用 CDP 逐帧采样实测（temp/probe-reveal2.js）后确认不是没触发，是**看不看得见**的问题：
 *   - 曲线 [0.22,1,0.36,1] 是 easeOutQuint，前 20% 的时间就走完 67% 的行程，
 *     16px 的位移里真正能被眼睛抓到的只有最初那 ~100ms；
 *   - 剩下的 400ms 是 5px 以内的尾巴，肉眼分辨不出来。
 * 所以这一版做了三件事：位移加到 28px、缩放起点降到 0.955、时长拉到 0.72s，
 * 并把曲线换成 easeOutCubic（[0.33,1,0.68,1]）—— 同样的时长里，中段仍有明显位移，
 * 而不是「一瞬间到位、然后长时间微调」。
 *
 * 【viewport 的两个参数也是实测定的】
 * amount 0.15：卡片露头 15% 就开始播，而不是等大半个卡片进屏 —— 后者会让人
 *   先看到一张静止的空卡，再看着它动起来，像卡了一下。
 * margin 底部 -8%：把触发线抬到视口下沿上方一点。否则卡片刚从屏幕底边探出半个像素
 *   就开始播，等视线真的落到它身上时动画早结束了 —— 这正是首屏那几块卡片的处境。
 *   （首屏内的卡片无论如何都会在加载时播完，这是 IntersectionObserver 的固有行为，
 *    要改就得放弃 whileInView 自己写观察逻辑，代价大于收益。）
 *
 * 动画只播一次（once）。
 * 系统开了「减少动态效果」时返回空对象：元素照常渲染，只是完全不参与动画。
 * 这条是「静态呈现」而不是「不渲染」，和 DottedGlobe 的处理方式一致。
 *
 * 【2026-10-04 修正：reduced-motion 必须等 hydration 之后再读】
 * 手机上报「Hydration failed because the server rendered text didn't match the client」，
 * 用 CDP 抓 React 的错误栈定位到根因：Framer Motion 的 useReducedMotion() 在服务端
 * 只能返回 null，而浏览器首次渲染就能返回真实值。手机开了「减少动态效果」时，
 * 服务端按「有动画」渲染出 opacity:0 / translateY(...)，客户端却按「无动画」渲染出空属性，
 * 首轮 DOM 直接对不上 —— 这正是截图里那条报错。
 * 所以这里改用 useHydrationSafeReducedMotion()：两端首轮一律按「有动画」渲染，
 * 挂载后再切到静态档。代价是开了减少动态效果的用户会先看到一帧动画起始态，
 * 但换来的是控制台干净、不会整棵树被 React 重新生成。
 */

import { useEffect, useState } from 'react';
import { useReducedMotion, type MotionProps } from 'framer-motion';

/**
 * 把系统减少动态效果偏好推迟到 hydration 完成后再应用。
 *
 * @returns 服务端和客户端首次渲染均为 false；挂载后返回真实系统偏好。
 * @throws 不主动抛异常；依赖浏览器媒体查询与 Framer Motion 的订阅能力。
 *
 * Framer Motion 在 SSR 时只能返回 null，浏览器首次渲染却可能返回 true。
 * 直接用这个值决定 initial 动画、终端输出或节点结构，手机启用「减少动态效果」
 * 时会产生服务端 opacity:0 / 客户端 opacity:1 的 hydration mismatch。
 * 先固定两端的首轮值，再在 effect 中切换，兼顾 SSR 一致性和静态降级。
 */
export function useHydrationSafeReducedMotion(): boolean {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!reduceMotion;
}

interface RevealOptions {
  /** 入场时纵向偏移的像素数；卡片可略大，文字保持轻微移动 */
  distance?: number;
  /** 入场起始缩放；默认 1（不缩放），卡片可从 0.955 轻轻展开 */
  scale?: number;
  /** 入场动画时长（秒） */
  duration?: number;
}

/**
 * 卡片入场的统一参数。
 *
 * 抽成常量而不是在 Dashboard / ProjectsGrid 各写一遍：这两处的卡片必须
 * 动得一模一样，分散写迟早会漂成两种幅度（上一版就是这么漂的）。
 */
export const CARD_REVEAL: RevealOptions = { distance: 28, scale: 0.955, duration: 0.72 };

/**
 * 卡片之间的错峰间隔（秒）。
 *
 * 0.06 太密：0.72s 的动画里相邻两张只差 8% 的行程，看起来就是「一起动」。
 * 0.1 能让人读出先后顺序，又不会让最后一张等太久（五块磁贴最末一块滞后 0.4s）。
 */
export const CARD_STAGGER = 0.1;

/**
 * 创建遵从 reduced-motion 的滚动入场属性生成器。
 * @param options 入场距离、缩放起点与时长；不传时采用轻量默认值（给标题、空态用）
 * @returns 接受 stagger 延迟并返回 Framer Motion 属性的函数
 */
export function useReveal(options: RevealOptions = {}): (delay: number) => MotionProps {
  const reduceMotion = useHydrationSafeReducedMotion();
  const { distance = 8, scale = 1, duration = 0.4 } = options;

  return (delay: number): MotionProps =>
    reduceMotion
      ? /*
         * 静态档。注意这里**不能**直接返回 {}。
         *
         * 第一版返回的就是 {}，实测出严重回归：framer 在挂载时已经按 initial
         * 把 opacity:0 写成内联样式了，而 {} 同时把 whileInView 一起撤掉 ——
         * 观察器随之消失，那些「还没滚进视口」的卡片就永远停在 opacity:0，
         * 内容彻底看不见（生产模式手机实测 5 块磁贴有 4 块是 0）。
         * 而项目硬规矩写的是「静态呈现而不是不渲染」，卡片必须 op=1。
         *
         * 改成显式给一个 duration:0 的 animate 终态：
         *   · initial:false  —— 不写起始样式，直接按目标态渲染，天然没有隐藏态；
         *   · animate       —— 由 framer 主动把 opacity/y/scale 写成终值，
         *                      会覆盖掉挂载时留下的那套初始样式；
         *   · duration:0    —— 瞬时到位，没有可感知的补间，符合「减少动态效果」。
         * 不用 whileInView，也就没有「观察器被撤掉后不再触发」的问题。
         */
        {
          initial: false,
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration: 0 },
        }
      : {
          initial: { opacity: 0, y: distance, scale },
          whileInView: { opacity: 1, y: 0, scale: 1 },
          viewport: { once: true, amount: 0.15, margin: '0px 0px -8% 0px' },
          transition: { duration, delay, ease: [0.33, 1, 0.68, 1] },
        };
}
