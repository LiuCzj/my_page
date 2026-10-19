'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

/** 页面内容的统一外壳（换页淡入 + 顶栏高度补偿）。 */
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
