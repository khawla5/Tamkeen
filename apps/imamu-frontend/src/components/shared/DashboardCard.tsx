import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardCardProps {
  id?: string
  title: string
  icon: React.ReactNode
  action?: { label: string; href?: string; onClick?: () => void }
  children: React.ReactNode
  variant?: 'dark' | 'light'
}

export default function DashboardCard({ id, title, icon, action, children, variant = 'dark' }: DashboardCardProps) {
  const isLight = variant === 'light'
  const actionClass = cn(
    'flex items-center gap-0.5 text-sm font-semibold transition duration-200',
    isLight
      ? 'rounded-lg px-2 py-1 text-imamu-navy hover:gap-1.5 hover:bg-imamu-navy-50/70 hover:text-imamu-navy-deep'
      : 'text-teal-light hover:gap-1.5 hover:text-white',
  )

  return (
    <div
      id={id}
      className={cn(
        'rounded-2xl p-6 scroll-mt-20 transition duration-300 relative overflow-hidden',
        isLight
          ? 'border border-imamu-navy-50 bg-white shadow-[0_16px_42px_rgba(4,93,132,0.08)] hover:border-imamu-navy-100'
          : 'glass-card',
      )}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              isLight
                ? 'border border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy'
                : 'bg-white/[0.06] border border-white/10',
            )}
          >
            {icon}
          </div>
          <h3 className={cn('text-[15px] font-semibold', isLight ? 'text-imamu-dark' : 'text-white')}>{title}</h3>
        </div>
        {action && action.onClick ? (
          <button
            onClick={action.onClick}
            className={actionClass}
          >
            {action.label}
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        ) : action?.href ? (
          <Link
            to={action.href}
            className={actionClass}
          >
            {action.label}
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  )
}
