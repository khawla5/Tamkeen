import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MatchBadge({ score }: { score: number }) {
  // Three-tier threshold styling so the eye reads compatibility at a glance:
  //   ≥70 → premium gold (this is the recruiter's headline result)
  //   40–69 → navy (a solid match — primary brand colour)
  //   <40 → muted neutral (don't compete with the rest of the card)
  const tier = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap border',
        tier === 'high' && 'bg-imamu-gold text-white border-imamu-gold-deep shadow-sm',
        tier === 'medium' && 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
        tier === 'low' && 'bg-slate-100 text-slate-600 border-slate-200',
      )}
    >
      <Target className="w-3.5 h-3.5" />
      {score}%
    </span>
  )
}
