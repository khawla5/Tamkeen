import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, SlidersHorizontal, LayoutGrid, Target, Briefcase, BookOpen,
  GraduationCap, Award, Compass, Users, SearchX, AlertCircle,
} from 'lucide-react'
import type { Opportunity } from '@/types'
import { useLanguage } from '@/i18n/context'
import { useAuth } from '@/context/AuthContext'
import { fetchActiveOpportunities } from '@/lib/opportunities'
import {
  applyMatchScores, fetchMatchContext, hasMatchSignal,
  type MatchContext,
} from '@/lib/match-score'
import OpportunityCard from '@/components/shared/OpportunityCard'
import CategoryPill from '@/components/shared/CategoryPill'
import JourneyBanner from '@/components/shared/JourneyBanner'

// Tamkeen scope: only 4 visible categories (jobs, co-op, training,
// certifications). 'career-path' and 'consulting' are excluded — they remain
// in the database but aren't shown as filter pills. Compass + Users imports
// kept for future use when those filters are re-enabled.
void Compass; void Users;
const categoryKeys = [
  { key: 'all', labelKey: 'opportunities.all', icon: LayoutGrid },
  { key: 'job', labelKey: 'opportunities.jobs', icon: Briefcase },
  { key: 'coop', labelKey: 'opportunities.coop', icon: GraduationCap },
  { key: 'training', labelKey: 'opportunities.training', icon: BookOpen },
  { key: 'certification', labelKey: 'opportunities.certifications', icon: Award },
] as const

export default function Opportunities() {
  const { t, isArabic } = useLanguage()
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Retiree default of 'consulting' removed — that role is hidden in Tamkeen.
  const defaultCategory = searchParams.get('category') ?? 'all'
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(defaultCategory)

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matchCtx, setMatchCtx] = useState<MatchContext | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchActiveOpportunities()
      .then((rows) => { if (!cancelled) setOpportunities(rows) })
      .catch((err) => { if (!cancelled) setLoadError(err?.message ?? 'Failed to load opportunities') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Hydrate the user's matching signal once we know who they are.
  useEffect(() => {
    if (!user) { setMatchCtx(null); return }
    let cancelled = false
    fetchMatchContext(user.id, role)
      .then((ctx) => { if (!cancelled) setMatchCtx(ctx) })
      .catch(() => { /* ignore — we'll just show baseline scores */ })
    return () => { cancelled = true }
  }, [user, role])

  // Apply scores when both opps + context are available.
  const scoredOpportunities = matchCtx
    ? applyMatchScores(opportunities, matchCtx)
    : opportunities

  const showsPersonalizedScores = matchCtx ? hasMatchSignal(matchCtx) : false

  useEffect(() => {
    const params: Record<string, string> = {}
    if (search) params.q = search
    if (category && category !== 'all') params.category = category
    setSearchParams(params, { replace: true })
  }, [search, category, setSearchParams])

  // Tamkeen-active category set — used to drop legacy 'career-path' /
  // 'consulting' entries even when the "All" filter is on, so the visible
  // marketplace stays scoped to the four supported types.
  const ACTIVE_CATEGORIES = new Set(['job', 'coop', 'training', 'certification'])

  const filtered = scoredOpportunities
    .filter((opp) => ACTIVE_CATEGORIES.has(opp.category))
    .filter((opp) => {
      const matchesCategory = category === 'all' || opp.category === category
      const q = search.toLowerCase()
      const matchesSearch = q === '' || opp.title.toLowerCase().includes(q) || opp.company.toLowerCase().includes(q) || opp.skills.some((s) => s.toLowerCase().includes(q)) || (opp.titleAr?.includes(search) ?? false) || (opp.companyAr?.includes(search) ?? false)
      return matchesCategory && matchesSearch
    })
    // When we have signal, surface higher-scored opportunities first.
    .sort((a, b) => (showsPersonalizedScores ? b.matchScore - a.matchScore : 0))

  function clearFilters() { setSearch(''); setCategory('all') }

  return (
    <>
      {/* Hero section — solid IMSIU navy band (the page's one dark header) */}
      <section className="relative bg-imamu-dark py-16 text-center overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />
        {/* Bottom-edge gold seam — thin heritage accent. */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/30" aria-hidden="true" />

        <div className="relative mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display font-bold text-white text-[clamp(28px,4vw,36px)] mb-3 tracking-tight">
            {t('opportunities.title')}
          </h1>
          <p className="text-imamu-navy-100 text-base mb-8 max-w-lg mx-auto">
            {t('opportunities.subtitle')}
          </p>

          {/* Search bar — solid navy surface with a gold-accented search icon. */}
          <div
            className="max-w-2xl mx-auto flex items-center gap-3 bg-white/[0.10] border border-white/[0.18] rounded-2xl px-4 py-4 hover:border-imamu-gold/30 focus-within:border-imamu-gold/50 focus-within:shadow-[0_0_0_3px_rgba(153,130,63,0.20)] transition-colors duration-200"
          >
            <span className="w-9 h-9 rounded-xl bg-imamu-gold/15 ring-1 ring-imamu-gold/30 flex items-center justify-center shrink-0">
              <Search className="w-4 h-4 text-imamu-warm-gold" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('opportunities.searchPlaceholder')}
              aria-label={t('opportunities.title')}
              className="flex-1 bg-transparent text-[15px] text-white placeholder:text-imamu-navy-100/70 focus:outline-none"
            />
            <button
              className="p-2 rounded-lg text-imamu-navy-100 hover:text-imamu-warm-gold hover:bg-white/[0.08] transition duration-200"
              tabIndex={-1}
              aria-label="Advanced filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Category pills + ranking metadata */}
      <section className="bg-white border-b border-imamu-navy-50">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {categoryKeys.map((c) => (
              <CategoryPill
                key={c.key}
                label={t(c.labelKey)}
                icon={c.icon}
                active={category === c.key}
                onClick={() => setCategory(c.key)}
                featured={c.key === 'all'}
              />
            ))}
          </div>
          {/* Ranking metadata wrapper holds both the "sorted by fit" gold chip
              (when we have personalised signal) and the muted navy result count. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4">
          {showsPersonalizedScores && !loading && (
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-extrabold text-imamu-gold">
                <Target className="w-3 h-3" />
                {isArabic ? 'مرتبة حسب ملاءمتها لك' : 'Sorted by your fit'}
              </span>
          )}
          {!loading && (
            <span className="text-sm text-imamu-blue font-medium">
            {loading ? ' ' : `${filtered.length} ${filtered.length === 1 ? t('opportunities.opportunityFound') : t('opportunities.opportunitiesFound')}`}
            </span>
          )}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="relative bg-white pb-20">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" className="flex items-center justify-center py-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-imamu-navy-100 border-t-imamu-navy" />
              </motion.div>
            ) : loadError ? (
              <motion.div key="error" className="flex flex-col items-center justify-center text-center py-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-5">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="font-display text-imamu-dark text-xl font-bold mb-2">{loadError}</h3>
              </motion.div>
            ) : filtered.length > 0 ? (
              <motion.div data-tour="tour-opportunities-grid" key="results" className="grid md:grid-cols-2 gap-5 pt-2 items-stretch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {filtered.map((opp) => (<OpportunityCard key={opp.id} opportunity={opp} onClick={() => navigate(`/opportunities/${opp.id}`)} />))}
              </motion.div>
            ) : (
              <motion.div key="empty" className="flex flex-col items-center justify-center text-center py-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="w-16 h-16 rounded-2xl bg-imamu-navy-50 border border-imamu-navy-100 flex items-center justify-center mb-5">
                  <SearchX className="w-8 h-8 text-imamu-navy" />
                </div>
                <h3 className="font-display text-imamu-dark text-xl font-bold mb-2">{t('opportunities.noResults')}</h3>
                <p className="text-imamu-blue text-sm mb-6 max-w-sm">{t('opportunities.noResultsHint')}</p>
                <button onClick={clearFilters} className="border border-imamu-navy text-imamu-navy font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-imamu-navy hover:text-white transition-colors duration-200">{t('common.clearFilters')}</button>
              </motion.div>
            )}
          </AnimatePresence>
          {role === 'student' && (
            <JourneyBanner text={t('dashboard.journeyApplied')} ctaLabel={t('dashboard.journeyGoDashboard')} to="/dashboard/student" />
          )}
          {role === 'retiree' && (
            <JourneyBanner text={t('dashboard.journeyRetireeOpps')} ctaLabel={t('dashboard.journeyGoDashboard')} to="/dashboard/retiree" />
          )}
        </div>
      </section>
    </>
  )
}
