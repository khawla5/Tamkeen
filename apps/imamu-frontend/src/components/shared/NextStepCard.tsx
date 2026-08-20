import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NextStepCardProps {
  icon: React.ReactNode
  label: React.ReactNode
  heading: React.ReactNode
  bullets: React.ReactNode[]
  ctaHref: string
  ctaLabel: React.ReactNode
  ctaIcon?: React.ReactNode
  variant?: 'dark' | 'light'
}

export default function NextStepCard({
  icon,
  label,
  heading,
  bullets,
  ctaHref,
  ctaLabel,
  ctaIcon,
  variant = 'dark',
}: NextStepCardProps) {
  const isLight = variant === 'light'

  return (
    <motion.div
      className="mx-4 sm:mx-6 mt-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl',
          isLight
            ? 'border border-imamu-gold-100 bg-white shadow-sm'
            : 'bg-imamu-navy border border-white/10 shadow-sm',
        )}
      >
        {isLight && (
          <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
        )}

        <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0',
              isLight
                ? 'bg-imamu-gold-50 text-imamu-gold-deep ring-1 ring-imamu-gold-100'
                : 'bg-white/15 ring-1 ring-white/20',
            )}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'text-[11px] uppercase tracking-wider font-bold',
                isLight ? 'text-imamu-gold-deep' : 'text-white/60',
              )}
            >
              {label}
            </p>
            <h2 className={cn('font-display text-lg sm:text-xl font-bold mt-2', isLight ? 'text-imamu-dark' : 'text-white')}>
              {heading}
            </h2>
            <ul className="mt-3 space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className={cn('flex items-start gap-2 text-sm', isLight ? 'text-imamu-dark/70' : 'text-white/75')}>
                  <span className={cn('mt-[7px] w-1.5 h-1.5 rounded-full shrink-0', isLight ? 'bg-imamu-gold' : 'bg-white/40')} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            to={ctaHref}
            className={cn(
              'inline-flex items-center gap-2 text-white font-bold px-5 py-3 rounded-xl text-sm hover:-translate-y-0.5 active:translate-y-0 transition duration-200 shrink-0 self-stretch sm:self-auto justify-center',
              isLight
                ? 'bg-imamu-navy shadow-lg shadow-imamu-navy/20 hover:bg-imamu-navy-deep hover:shadow-xl hover:shadow-imamu-navy/25'
                : 'bg-[#99823F] shadow-lg shadow-black/20 hover:bg-[#806B30] hover:shadow-xl hover:shadow-black/25',
            )}
          >
            {ctaIcon}
            {ctaLabel}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
