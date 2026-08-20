import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: React.ReactNode
  iconBg: string
  value: string
  valueSuffix?: string
  label: string
  helper?: string
  progress?: number
  progressColor?: string
  index?: number
  variant?: 'dark' | 'light'
  attention?: boolean
}

export default function StatCard({
  icon,
  iconBg,
  value,
  valueSuffix,
  label,
  helper,
  progress,
  progressColor,
  variant = 'dark',
  attention = false,
}: StatCardProps) {
  const isLight = variant === 'light'

  return (
    <motion.div
      className={cn(
        'rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden',
        isLight
          ? cn(
              'border bg-white shadow-[0_14px_34px_rgba(4,93,132,0.07)]',
              attention ? 'border-imamu-gold-100' : 'border-imamu-navy-50',
            )
          : 'glass-card',
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      {isLight && attention && (
        <span className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
      )}
      {/* Icon sits at the inline-end (right in RTL, left in LTR) so it reads
          as a corner badge instead of stacking above the value. `ms-auto`
          pushes it to the end in flex-col and works in both directions. */}
      <div className={cn('w-11 h-11 flex items-center justify-center rounded-xl ms-auto', iconBg)}>
        {icon}
      </div>
      <p className={cn('font-display text-[28px] font-extrabold leading-none tracking-tight', isLight ? 'text-imamu-dark' : 'text-white')}>
        {value}
        {valueSuffix && (
          <span className={cn('text-base font-semibold', isLight ? 'text-imamu-dark/45' : 'text-white/40')}>{valueSuffix}</span>
        )}
      </p>
      <p className={cn('text-sm font-medium', isLight ? 'text-imamu-dark/60' : 'text-white/50')}>{label}</p>
      {helper && (
        // `flex-1` pushes the optional progress bar to the bottom edge so the
        // 4 cards in the row align cleanly even when some have a progress
        // bar and others don't.
        <p className={cn('min-h-[36px] flex-1 text-xs leading-5', isLight ? 'text-imamu-dark/50' : 'text-white/40')}>
          {helper}
        </p>
      )}
      {progress !== undefined && (
        <div className={cn('h-1.5 rounded-full overflow-hidden', isLight ? 'bg-imamu-navy-50' : 'bg-white/[0.08]')}>
          <div
            className={cn('h-full rounded-full', progressColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}
