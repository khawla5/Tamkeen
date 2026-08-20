import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

interface DashboardWelcomeBannerProps {
  storageKey: string
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  gradient?: string
}

export default function DashboardWelcomeBanner({
  storageKey,
  icon,
  title,
  description,
  gradient = 'from-imamu-dark to-imamu-navy',
}: DashboardWelcomeBannerProps) {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(storageKey)
    } catch {
      return true
    }
  })

  if (!visible) return null

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* noop */
    }
  }

  return (
    <motion.div
      className={`mx-4 sm:mx-6 mt-6 relative overflow-hidden rounded-2xl bg-gradient-to-r ${gradient} p-5 sm:p-6`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <button
        onClick={dismiss}
        className="absolute top-3 end-3 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors z-10"
        aria-label="Dismiss welcome message"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 ring-1 ring-white/15">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <p className="text-sm text-white/60 mt-0.5">{description}</p>
        </div>
      </div>
    </motion.div>
  )
}
