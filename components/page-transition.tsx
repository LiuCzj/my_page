'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

/**
 * 页面内容的统一外壳（换页淡入 + 顶栏高度补偿）。
 *
 * 【为什么顶栏高度的补偿加在这一层，而不是每个页面各写一遍】
 * 顶栏是 `position: fixed`（见 components/Navbar.tsx 的说明：为了修手机端「粘不住」），
 * 脱离文档流之后它不再占位，必须由内容自己补回那 57px。
 * 而所有页面内容都渲染在这个 <main> 里 —— 补一次，全站生效。
 *
 * 【为什么补在这里不会把各页面的间距搞乱】
 * 各页面自己写的 `pt-2` / `pt-10` / `pt-14` 本来就是「顶栏已经占位之后又加的呼吸位」，
 * 语义上跟顶栏占不占位无关。把顶栏那一段挪到 main 上，等于原样平移，视觉零变化。
 *
 * 【--header-h-total 是含 1px 下边框的高度】用它是为了跟顶栏的真实占用高度严格一致
 * （顶栏下沿那条 border 也要占 1px）。这个变量在 globals.css 里由 --header-h 算出来，
 * 顶栏改高度时这里自动跟，不会再出现「改了顶栏、内容顶上一条缝」。
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <motion.main
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="pt-[var(--header-h-total)]"
    >
      {children}
    </motion.main>
  )
}
