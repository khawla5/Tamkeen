import { MapPin, Clock, Users } from 'lucide-react'
import type { Opportunity } from '@/types'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import MatchBadge from './MatchBadge'
import SalaryText from './SalaryText'
import CompanyLogo from './CompanyLogo'
import { cn } from '@/lib/utils'

interface OpportunityCardProps {
  opportunity: Opportunity
  // index is kept for API compatibility with callers but is no longer used —
  // the per-index whileInView stagger caused cards far down the list to pop
  // in with multi-second delays as the user scrolled, looking like a re-render.
  index?: number
  onClick?: () => void
}

// Type badge styling per category — semantic tints so the eye can sort
// opportunities by kind at a glance. Job=navy, Coop=blue tint, Training=
// navy with gold edge, Certification=soft gold.
const TYPE_BADGE_CLS: Record<string, string> = {
  job: 'bg-imamu-navy text-white border-imamu-navy-deep',
  coop: 'bg-imamu-sky/60 text-imamu-navy-deep border-imamu-navy-100',
  training: 'bg-imamu-navy-50 text-imamu-navy border-imamu-gold-100',
  certification: 'bg-imamu-gold-50 text-imamu-gold border-imamu-gold-100',
}

export default function OpportunityCard({ opportunity: opp, onClick }: OpportunityCardProps) {
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()

  const postedLabel = isArabic
    ? `منذ ${opp.postedDays} ${opp.postedDays === 1 ? 'يوم' : 'أيام'}`
    : `Posted ${opp.postedDays} ${opp.postedDays === 1 ? 'day' : 'days'} ago`

  // Recommended treatment for strong matches — a gold top seam + slightly
  // stronger shadow elevates these above regular listings without adding
  // a second card variant for callers to manage.
  const isRecommended = opp.matchScore >= 70

  const typeBadgeCls = TYPE_BADGE_CLS[opp.category] ?? TYPE_BADGE_CLS.job

  return (
    <div
      data-opp-id={opp.id}
      className={cn(
        'group relative bg-white rounded-[20px] border overflow-hidden flex flex-col cursor-pointer h-full transition duration-300',
        'hover:-translate-y-0.5',
        isRecommended
          ? 'border-imamu-navy-100 shadow-[0_4px_20px_-8px_rgba(4,93,132,0.18)] hover:border-imamu-gold hover:shadow-[0_12px_32px_-8px_rgba(153,130,63,0.30)]'
          : 'border-imamu-navy-50 shadow-[0_2px_12px_-6px_rgba(4,93,132,0.12)] hover:border-imamu-navy hover:shadow-[0_10px_28px_-8px_rgba(4,93,132,0.25)]',
      )}
      onClick={onClick}
    >
      {/* Recommended gold seam — runs across the very top of the card so
          high-match opportunities visibly outrank the rest of the list. */}
      {isRecommended && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-imamu-gold via-imamu-warm-gold to-imamu-gold"
          aria-hidden="true"
        />
      )}

      <div className="p-6 flex flex-col flex-1">
        {/* Type badge — semantic tint per category */}
        <span className={cn(
          'absolute top-4 end-4 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
          typeBadgeCls,
        )}>
          {l(opp, 'type')}
        </span>

        {/* Retiree badge — sits below type badge */}
        {opp.forRetirees && (
          <span className="absolute top-4 end-4 mt-7 bg-imamu-gold-50 text-imamu-gold border border-imamu-gold-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {t('opportunities.retireeTag')}
          </span>
        )}

        {/* Top row — bordered logo container + title/company stack */}
        <div className="flex items-start gap-3.5 mb-4 pe-28">
          <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-12 h-12 rounded-xl text-base" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-bold text-imamu-dark text-base leading-snug line-clamp-2">
              {l(opp, 'title')}
            </h3>
            <p className="text-sm text-imamu-blue mt-0.5 truncate font-medium">
              {l(opp, 'company')}
            </p>
          </div>
        </div>

        {/* Match score */}
        <div className="mb-4">
          <MatchBadge score={opp.matchScore} />
        </div>

        {/* Description */}
        <p className="text-sm text-imamu-dark/65 line-clamp-2 leading-relaxed mb-4">
          {l(opp, 'description')}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
          <span className="inline-flex items-center gap-1 text-xs text-imamu-blue font-medium">
            <MapPin className="w-3.5 h-3.5" />
            {l(opp, 'location')}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-imamu-blue font-medium">
            <Clock className="w-3.5 h-3.5" />
            {l(opp, 'duration')}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-imamu-blue font-medium">
            <Users className="w-3.5 h-3.5" />
            {opp.applicants} {t('common.applicants')}
          </span>
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {opp.skills.map((skill) => (
            <span
              key={skill}
              className="bg-imamu-navy-50 border border-imamu-navy-100 rounded-full px-3 py-1 text-[11px] font-semibold text-imamu-navy transition-colors duration-300"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Footer — tinted band visually separates compensation/CTA from body */}
      <div className="mt-auto px-6 py-4 bg-imamu-navy-50/40 border-t border-imamu-navy-50 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {opp.category === 'training' && typeof opp.price === 'number' ? (
            opp.price > 0 ? (
              <span className="font-display text-lg font-extrabold text-imamu-dark">
                {opp.price.toLocaleString('en-US')} {isArabic ? 'ر.س' : 'SAR'}
              </span>
            ) : (
              <span className="font-display text-lg font-extrabold text-imamu-gold">
                {isArabic ? 'مجاني' : 'Free'}
              </span>
            )
          ) : (
            <SalaryText
              value={l(opp, 'salary')}
              className="font-display text-lg font-extrabold text-imamu-dark"
              iconClassName="w-4 h-4"
            />
          )}
          <p className="text-[11px] text-imamu-blue mt-0.5">{postedLabel}</p>
        </div>
        <button
          className="bg-imamu-navy text-white rounded-xl px-5 py-2 text-sm font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 active:translate-y-0 transition duration-200 shrink-0"
          aria-label={`${t('common.viewDetails')} - ${l(opp, 'title')} - ${l(opp, 'company')}`}
          onClick={(e) => { e.stopPropagation(); onClick?.() }}
        >
          {t('common.viewDetails')}
        </button>
      </div>
    </div>
  )
}
