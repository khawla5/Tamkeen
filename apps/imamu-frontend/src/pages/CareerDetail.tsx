import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Banknote, Building2, CheckCircle2, Compass,
  Loader2, MapPin, Award, Target, TrendingUp, Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import {
  CAREER_PATHS, RIASEC_LABEL_AR, RIASEC_LABEL_EN, findCareer,
} from '@/lib/riasec'
import { fetchActiveOpportunities } from '@/lib/opportunities'
import {
  fetchRecommendedCareerSlug, setRecommendedCareer,
} from '@/lib/student-path'
import { applyMatchScores, fetchMatchContext, type MatchContext } from '@/lib/match-score'
import type { Opportunity } from '@/types'
import { cn } from '@/lib/utils'
import CareerIcon from '@/components/shared/CareerIcon'

const sectionCard = 'relative overflow-hidden bg-white rounded-[20px] border border-imamu-navy-50 shadow-lg shadow-imamu-navy/5'
const sectionTitle = 'font-display font-bold text-imamu-dark text-lg mb-5 flex items-center gap-2'
const navyIconTile = 'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70'
const goldIconTile = 'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100'
const primaryAction = 'inline-flex items-center gap-2 bg-imamu-navy text-white font-bold hover:bg-imamu-navy-deep hover:shadow-lg hover:shadow-imamu-gold/25 transition'

export default function CareerDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { isArabic } = useLanguage()
  const { user, role } = useAuth()
  const navigate = useNavigate()

  const path = slug ? findCareer(slug) : undefined

  const [recommendedSlug, setRecommendedSlug] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [oppsLoading, setOppsLoading] = useState(true)
  const [savingPath, setSavingPath] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [matchCtx, setMatchCtx] = useState<MatchContext | null>(null)

  // Hydrate match context once we know the user's role.
  useEffect(() => {
    if (!user) { setMatchCtx(null); return }
    let cancelled = false
    fetchMatchContext(user.id, role)
      .then((c) => { if (!cancelled) setMatchCtx(c) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [user, role])

  // Load the student's currently saved path so we can show the "Your path" badge
  useEffect(() => {
    if (!user || role !== 'student') return
    let cancelled = false
    fetchRecommendedCareerSlug(user.id)
      .then((s) => { if (!cancelled) setRecommendedSlug(s) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [user, role])

  // Load opportunities so we can show ones related to this path's skills.
  useEffect(() => {
    let cancelled = false
    setOppsLoading(true)
    fetchActiveOpportunities()
      .then((rows) => { if (!cancelled) setOpportunities(rows) })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setOppsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const relatedOpps = useMemo(() => {
    if (!path) return []
    const pathSkills = path.skills.map((s) => s.toLowerCase())
    const candidates = opportunities
      .map((o) => {
        const overlap = (o.skills ?? []).filter((s) =>
          pathSkills.some((ps) => ps.includes(s.toLowerCase()) || s.toLowerCase().includes(ps))
        ).length
        return { o, overlap }
      })
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 4)
      .map((x) => x.o)

    // Apply personalised match scores when we have a context
    return matchCtx ? applyMatchScores(candidates, matchCtx) : candidates
  }, [opportunities, path, matchCtx])

  if (!path) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Compass className="w-12 h-12 text-imamu-gold mx-auto mb-4" />
        <h1 className="font-display text-2xl text-imamu-dark font-bold mb-2">
          {isArabic ? 'مسار غير موجود' : 'Path not found'}
        </h1>
        <p className="text-sm text-imamu-dark/60 mb-6">
          {isArabic ? 'تأكد من الرابط وحاول مرة أخرى' : 'Double-check the URL and try again.'}
        </p>
        <Link to="/assessment" className={cn(primaryAction, 'px-5 py-2.5 rounded-lg text-sm')}>
          {isArabic ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {isArabic ? 'العودة للتقييم' : 'Back to assessment'}
        </Link>
      </div>
    )
  }

  const isYourPath = recommendedSlug === path.id
  const codeLabel = isArabic ? RIASEC_LABEL_AR[path.code] : RIASEC_LABEL_EN[path.code]

  async function handleSetAsPath() {
    if (!user || !path || isYourPath) return
    setSavingPath(true)
    try {
      await setRecommendedCareer(user.id, path.id)
      setRecommendedSlug(path.id)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2400)
    } catch (err) {
      console.error('[career-detail] set path failed', err)
    } finally {
      setSavingPath(false)
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-imamu-dark text-white">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/30" aria-hidden="true" />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-imamu-sky) 32%, transparent) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-14">
          {/* Back link */}
          <button onClick={() => navigate(-1)} className={cn(primaryAction, 'mb-6 rounded-lg border border-imamu-blue/30 px-3.5 py-2 text-sm')}>
            {isArabic ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            {isArabic ? 'رجوع' : 'Back'}
          </button>

          <div className="flex items-start gap-5 sm:gap-6 mb-6 flex-wrap">
            <div className="w-24 h-24 rounded-[20px] bg-white/10 border border-imamu-gold/35 ring-1 ring-white/10 shadow-sm flex items-center justify-center shrink-0">
              <CareerIcon slug={path.id} className="w-12 h-12 text-imamu-warm-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-imamu-gold/35 bg-white/10 text-[11px] uppercase tracking-wider font-bold text-imamu-gold-100">
                  {path.code} · {codeLabel}
                </span>
                {isYourPath && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-imamu-gold-100 bg-imamu-gold-50 text-[11px] uppercase tracking-wider font-bold text-imamu-gold">
                    <Target className="w-3 h-3" />
                    {isArabic ? 'مساري' : 'Your path'}
                  </span>
                )}
              </div>
              <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-2">
                {isArabic ? path.titleAr : path.title}
              </h1>
              <p className="text-imamu-navy-100 text-base max-w-2xl leading-relaxed">
                {isArabic ? path.taglineAr : path.tagline}
              </p>
            </div>

            {role === 'student' && (
              <button
                onClick={handleSetAsPath}
                disabled={savingPath || isYourPath}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold transition duration-200 shrink-0',
                  isYourPath
                    ? 'bg-imamu-gold-50 text-imamu-gold cursor-default border border-imamu-gold-100'
                    : 'bg-imamu-navy hover:bg-imamu-navy-deep text-white disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {isYourPath ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {isArabic ? 'مساري الحالي' : 'Your current path'}
                  </>
                ) : savingPath ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isArabic ? 'جارٍ الحفظ…' : 'Saving…'}
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    {isArabic ? 'اختر هذا المسار' : 'Set as my path'}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Saved flash */}
          {savedFlash && (
            <div
              className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold text-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isArabic ? 'تم تحديث مسارك بنجاح' : 'Your path is updated'}
            </div>
          )}
        </div>
      </section>

      <section className="relative bg-imamu-ice min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          {/* Stats grid */}
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            <StatCard
              icon={<Banknote className="w-5 h-5" />}
              label={isArabic ? 'الراتب الشهري' : 'Monthly salary'}
              value={isArabic ? path.salaryAr : path.salary}
              accent="gold"
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label={isArabic ? 'مراحل المسار' : 'Career stages'}
              value={`${path.stages.length} ${isArabic ? 'مراحل' : 'stages'}`}
            />
            <StatCard
              icon={<Building2 className="w-5 h-5" />}
              label={isArabic ? 'أبرز جهات التوظيف' : 'Top employers'}
              value={`${path.topEmployers.length}+`}
            />
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
            {/* Career stages */}
            <div className={cn(sectionCard, 'p-6')}>
              <h3 className={sectionTitle}>
                <span className={goldIconTile}>
                  <TrendingUp className="w-4 h-4" />
                </span>
                {isArabic ? 'تدرج المسار المهني' : 'Career progression'}
              </h3>
              <div className="relative space-y-4">
                <div className="absolute start-[17px] top-10 bottom-10 w-px bg-imamu-navy-100" aria-hidden="true" />
                {(isArabic ? path.stagesAr : path.stages).map((stage, i) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 z-10 border',
                      i === path.stages.length - 1
                        ? 'bg-imamu-navy text-white border-imamu-gold/40 ring-4 ring-imamu-gold-50 shadow-lg shadow-imamu-navy/15'
                        : 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className="font-semibold text-imamu-dark">{stage}</p>
                      <p className="text-xs text-imamu-dark/55 mt-0.5">
                        {i === 0 && (isArabic ? '٠–٢ سنوات' : '0–2 years')}
                        {i === 1 && (isArabic ? '٢–٦ سنوات' : '2–6 years')}
                        {i === 2 && (isArabic ? '٦+ سنوات' : '6+ years')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Required skills */}
            <div className={cn(sectionCard, 'p-6')}>
              <h3 className={sectionTitle}>
                <span className={goldIconTile}>
                  <Award className="w-4 h-4" />
                </span>
                {isArabic ? 'المهارات الأساسية' : 'Core skills'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {path.skills.map((skill, i) => (
                  <span
                    key={skill}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold',
                      i < 2
                        ? 'bg-imamu-gold-50 text-imamu-gold border-imamu-gold-100'
                        : 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
                    )}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Top employers */}
          <div className={cn(sectionCard, 'p-6 mt-6')}>
            <h3 className={sectionTitle}>
              <span className={navyIconTile}>
                <Building2 className="w-4 h-4" />
              </span>
              {isArabic ? 'جهات توظيف بارزة في المملكة' : 'Top employers in Saudi Arabia'}
            </h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {path.topEmployers.map((employer, i) => (
                <div key={employer} className="flex items-center gap-3 p-3 rounded-[16px] bg-imamu-navy-50 border border-imamu-navy-100">
                  <div className={cn(
                    'w-9 h-9 rounded-lg font-extrabold flex items-center justify-center text-sm shrink-0',
                    i === 0 ? 'bg-imamu-gold text-white' : 'bg-imamu-navy text-white',
                  )}>
                    {employer[0]}
                  </div>
                  <span className="text-sm font-semibold text-imamu-dark">{employer}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Related opportunities */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-imamu-dark text-lg flex items-center gap-2">
                <span className={navyIconTile}>
                  <Compass className="w-4 h-4" />
                </span>
                {isArabic ? 'فرص ذات صلة' : 'Related opportunities'}
              </h3>
              <Link to="/opportunities" className="inline-flex items-center gap-1.5 text-sm font-semibold text-imamu-navy hover:text-imamu-navy-deep transition-colors">
                {isArabic ? 'عرض الكل' : 'View all'}
                {isArabic ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </Link>
            </div>

            {oppsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-imamu-navy/40" />
              </div>
            ) : relatedOpps.length === 0 ? (
              <div className="bg-white rounded-[18px] p-6 border border-imamu-navy-50 text-center shadow-sm shadow-imamu-navy/5">
                <p className="text-sm text-imamu-dark/60">
                  {isArabic
                    ? 'لا توجد فرص نشطة تطابق هذا المسار حالياً. تحقق لاحقاً.'
                    : 'No active opportunities match this path yet. Check back soon.'}
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {relatedOpps.map((opp) => (
                  <Link
                    key={opp.id}
                    to={`/opportunities`}
                    className="bg-white rounded-[18px] p-5 border border-imamu-navy-50 hover:border-imamu-navy-100 transition-colors duration-200 block"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-imamu-dark text-sm mb-0.5 truncate">
                          {isArabic ? (opp.titleAr ?? opp.title) : opp.title}
                        </h4>
                        <p className="text-xs text-imamu-dark/55 truncate">
                          {isArabic ? (opp.companyAr ?? opp.company) : opp.company}
                        </p>
                      </div>
                      <span className="bg-imamu-gold-50 text-imamu-gold border border-imamu-gold-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
                        {isArabic ? (opp.typeAr ?? opp.type) : opp.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-imamu-dark/55">
                      {opp.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{isArabic ? (opp.locationAr ?? opp.location) : opp.location}
                        </span>
                      )}
                      {opp.applicants > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" />{opp.applicants}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Other paths from the same RIASEC code */}
          <div className="mt-10 mb-4">
            <h3 className="font-display font-bold text-imamu-dark text-lg mb-5">
              {isArabic ? 'مسارات أخرى مشابهة' : 'More paths like this'}
            </h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {CAREER_PATHS.filter((p) => p.code === path.code && p.id !== path.id).map((p) => (
                <Link
                  key={p.id}
                  to={`/career/${p.id}`}
                  className="bg-white rounded-[18px] p-4 border border-imamu-navy-50 hover:border-imamu-navy-100 hover:shadow-md hover:shadow-imamu-navy/10 transition duration-200 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70 flex items-center justify-center shrink-0">
                    <CareerIcon slug={p.id} className="w-[18px] h-[18px] text-imamu-navy" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-imamu-dark text-sm truncate">
                      {isArabic ? p.titleAr : p.title}
                    </p>
                    <p className="text-xs text-imamu-dark/55 truncate">
                      {isArabic ? p.taglineAr : p.tagline}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* CTA back to assessment */}
          <div className="text-center mt-10">
            <Link to="/assessment" className="inline-flex items-center gap-2 rounded-lg border border-imamu-navy-100 bg-white px-4 py-2.5 text-sm font-semibold text-imamu-navy hover:border-imamu-navy hover:text-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/10 transition">
              {isArabic ? 'العودة لنتائج التقييم' : 'Back to your assessment results'}
              {isArabic ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent = 'navy',
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: 'navy' | 'gold'
}) {
  const isGold = accent === 'gold'
  return (
    <div className="relative overflow-hidden bg-white rounded-[20px] p-5 border border-imamu-navy-50 shadow-lg shadow-imamu-navy/5">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          isGold ? 'bg-imamu-gold' : 'bg-imamu-navy-100',
        )}
        aria-hidden="true"
      />
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(isGold ? goldIconTile : navyIconTile, 'h-8 w-8')}>
          {icon}
        </span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-imamu-dark/55">{label}</span>
      </div>
      <p className={cn('font-display font-extrabold text-xl leading-tight', isGold ? 'text-imamu-gold' : 'text-imamu-dark')}>
        {value}
      </p>
    </div>
  )
}
