import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface QuickStat {
  icon: React.ReactNode
  iconBg: string
  label: React.ReactNode
  value: React.ReactNode
}

interface QuickStatsGridProps {
  items: QuickStat[]
}

export default function QuickStatsGrid({ items }: QuickStatsGridProps) {
  return (
    <motion.div
      className="mx-4 sm:mx-6 mt-6 glass-card rounded-2xl p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                s.iconBg,
              )}
            >
              {s.icon}
            </div>
            <div>
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wide">
                {s.label}
              </p>
              <p className="text-sm font-bold text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
