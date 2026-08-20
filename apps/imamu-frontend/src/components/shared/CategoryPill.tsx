import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryPillProps {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
  /**
   * When true, the pill uses the gold-accent variant — reserved for the
   * "All" / featured filter that anchors the marketplace. Other category
   * pills stay on the navy variant so the gold stands out.
   */
  featured?: boolean
}

export default function CategoryPill({ label, icon: Icon, active, onClick, featured = false }: CategoryPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold border transition duration-200 whitespace-nowrap shrink-0',
        featured
          ? active
            ? 'bg-imamu-gold text-white border-imamu-gold-deep shadow-sm shadow-imamu-gold/30'
            : 'bg-imamu-gold-50 text-imamu-gold border-imamu-gold-100 hover:bg-imamu-gold-100/60'
          : active
            ? 'bg-imamu-navy text-white border-imamu-navy shadow-sm shadow-imamu-navy/25'
            : 'bg-white text-imamu-navy border-imamu-navy-100 hover:bg-imamu-navy-50',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
