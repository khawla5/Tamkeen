import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, MapPin, Clock, Users, Calendar, CheckCircle2,
  Building2, Banknote, GraduationCap, Send, AlertCircle, Loader2, Briefcase,
} from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import { useAuth } from '@/context/AuthContext'
import { fetchOpportunityFull, type OpportunityFull } from '@/lib/opportunities'
import { applyToOpportunity, checkAlreadyApplied } from '@/lib/applications'
import type { ApplicationStatus } from '@/types/database'
import MatchBadge from '@/components/shared/MatchBadge'
import SalaryText from '@/components/shared/SalaryText'
import CompanyLogo from '@/components/shared/CompanyLogo'
import { cn } from '@/lib/utils'

const APPLY_ROLES = new Set(['student', 'retiree', 'employee'])

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()
  const { user, role } = useAuth()

  const [data, setData] = useState<OpportunityFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Application state — same shape as the old modal so the apply flow is
  // unchanged.
  const [applied, setApplied] = useState(false)
  const [appliedStatus, setAppliedStatus] = useState<ApplicationStatus | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const canApply = role !== null && APPLY_ROLES.has(role)

  // Load the opportunity + owning company/provider in one shot.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchOpportunityFull(id)
      .then((res) => {
        if (cancelled) return
        if (!res) {
          setLoadError(isArabic ? 'تعذّر العثور على هذه الفرصة' : 'Opportunity not found')
        } else {
          setData(res)
        }
      })
      .catch((err) => { if (!cancelled) setLoadError(err?.message ?? 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, isArabic])

  // Has the user already applied? Mirrors the old modal logic.
  useEffect(() => {
    if (!user || !data?.opportunity) return
    let cancelled = false
    setApplied(false)
    setAppliedStatus(null)
    setApplyError(null)
    checkAlreadyApplied(user.id, String(data.opportunity.id))
      .then((res) => {
        if (cancelled) return
        if (res.applied) {
          setApplied(true)
          setAppliedStatus(res.status)
        }
      })
      .catch(() => { /* non-blocking */ })
    return () => { cancelled = true }
  }, [user, data])

  async function handleApply() {
    if (!user || !data?.opportunity) return
    setApplying(true)
    setApplyError(null)
    try {
      await applyToOpportunity(user.id, String(data.opportunity.id))
      setApplied(true)
      setAppliedStatus('submitted')
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-teal-mist">
        <Loader2 className="w-8 h-8 text-teal animate-spin" aria-hidden="true" />
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center bg-teal-mist text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
          <AlertCircle className="w-8 h-8 text-red-400" aria-hidden="true" />
        </div>
        <h2 className="font-display text-teal-dark text-xl font-bold mb-2">
          {loadError ?? (isArabic ? 'تعذّر التحميل' : 'Could not load')}
        </h2>
        <button
          onClick={() => navigate('/opportunities')}
          className="mt-4 inline-flex items-center gap-2 bg-teal text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-teal-deep transition"
        >
          {isArabic ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {isArabic ? 'الرجوع للفرص' : 'Back to opportunities'}
        </button>
      </div>
    )
  }

  const opp = data.opportunity
  const owner = data.company ?? data.provider
  const isProvider = !!data.provider

  return (
    <>
      {/* Hero */}
      <section className="relative bg-teal-dark py-10 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <Link
            to="/opportunities"
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold mb-5 transition"
          >
            {isArabic ? <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" /> : <ArrowLeft className="w-4 h-4" aria-hidden="true" />}
            {isArabic ? 'الرجوع للفرص' : 'Back to opportunities'}
          </Link>

          <div className="flex items-start gap-4 flex-wrap">
            <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-16 h-16 rounded-xl text-2xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="bg-white/10 text-white/80 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider">
                  {l(opp, 'type')}
                </span>
                {opp.forRetirees && (
                  <span className="bg-terra/20 text-terra-light px-2.5 py-0.5 rounded-md text-[11px] font-bold">
                    {t('opportunities.retireeTag')}
                  </span>
                )}
                <MatchBadge score={opp.matchScore} />
              </div>
              <h1 className="font-display font-bold text-white text-[clamp(22px,3.2vw,30px)] leading-tight tracking-tight">
                {l(opp, 'title')}
              </h1>
              <p className="text-white/55 text-base mt-1 inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4" aria-hidden="true" />
                {l(opp, 'company')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="relative bg-imamu-ice min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            {/* Main column */}
            <div className="space-y-5">
              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: MapPin, label: t('common.location'), value: l(opp, 'location') },
                  { icon: Clock, label: t('common.duration'), value: l(opp, 'duration') },
                  { icon: Banknote, label: t('common.salary'), value: l(opp, 'salary'), isSalary: true },
                  { icon: Calendar, label: isArabic ? 'آخر موعد' : 'Deadline', value: opp.deadline },
                ].map((m) => (
                  <div key={m.label} className="bg-white border border-gray-200/60 rounded-2xl p-3.5 text-center shadow-sm">
                    <m.icon className="w-4 h-4 text-teal mx-auto mb-1" aria-hidden="true" />
                    <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">{m.label}</p>
                    {m.isSalary ? (
                      <SalaryText value={m.value} className="text-sm font-bold text-teal-dark mt-0.5 justify-center" iconClassName="w-3.5 h-3.5" />
                    ) : (
                      <p className="text-sm font-bold text-teal-dark mt-0.5">{m.value || '—'}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="bg-white border border-gray-200/60 rounded-2xl p-6 shadow-sm">
                <h2 className="font-display text-base font-bold text-teal-dark mb-3">
                  {isArabic ? 'وصف الفرصة' : 'About this opportunity'}
                </h2>
                <p className="text-sm text-teal-dark/75 leading-relaxed whitespace-pre-line">
                  {l(opp, 'description') || (isArabic ? 'لا يوجد وصف.' : 'No description provided.')}
                </p>
              </div>

              {/* Skills */}
              {opp.skills.length > 0 && (
                <div className="bg-white border border-gray-200/60 rounded-2xl p-6 shadow-sm">
                  <h2 className="font-display text-base font-bold text-teal-dark mb-3 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-teal" aria-hidden="true" />
                    {isArabic ? 'المهارات المطلوبة' : 'Required skills'}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {opp.skills.map((skill) => (
                      <span
                        key={skill}
                        className="bg-teal-mist rounded-full px-3.5 py-1.5 text-xs font-semibold text-teal-dark/75"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="bg-white border border-gray-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-5 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  {opp.applicants} {t('common.applicants')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  {opp.postedDays}{t('common.days')} {t('common.postedAgo')}
                </span>
              </div>
            </div>

            {/* Sticky right column — company card + apply CTA */}
            <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              {/* Company card */}
              {owner && (
                <div className="bg-white border border-gray-200/60 rounded-2xl p-5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal/70 mb-3">
                    {isProvider
                      ? (isArabic ? 'مزوّد التدريب' : 'Training provider')
                      : (isArabic ? 'عن الشركة' : 'About the company')}
                  </p>
                  <div className="flex items-center gap-3 mb-4">
                    {owner.logo_url && owner.logo_url.startsWith('/') ? (
                      <img
                        src={owner.logo_url}
                        alt={owner.name}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-xl object-contain border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-teal" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-teal-dark text-sm truncate">
                        {isArabic ? (owner.name_ar ?? owner.name) : owner.name}
                      </p>
                      {data.company?.industry && (
                        <p className="text-[11px] text-muted truncate">{data.company.industry}</p>
                      )}
                      {data.provider?.rating != null && (
                        <p className="text-[11px] text-muted">
                          {isArabic ? 'التقييم' : 'Rating'} · {data.provider.rating.toFixed(1)} / 5
                        </p>
                      )}
                    </div>
                  </div>

                  {data.company && (
                    <ul className="space-y-2 text-[12.5px] text-teal-dark/80">
                      {data.company.size && (
                        <li className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-teal/70 shrink-0" aria-hidden="true" />
                          <span>{data.company.size}</span>
                        </li>
                      )}
                      {data.company.location && (
                        <li className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-teal/70 shrink-0" aria-hidden="true" />
                          <span>{data.company.location}</span>
                        </li>
                      )}
                      {data.company.industry && (
                        <li className="flex items-center gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-teal/70 shrink-0" aria-hidden="true" />
                          <span>{data.company.industry}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* Apply panel */}
              <div data-tour="tour-apply" className="bg-white border border-gray-200/60 rounded-2xl p-5 shadow-sm">
                {applyError && (
                  <div role="alert" aria-live="assertive" className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{applyError}</span>
                  </div>
                )}

                <p className="text-[10px] font-bold uppercase tracking-wider text-teal/70 mb-2">
                  {isArabic ? 'الراتب' : 'Salary'}
                </p>
                <SalaryText value={l(opp, 'salary')} className="font-display text-lg font-bold text-teal-dark mb-4" iconClassName="w-4 h-4" />

                <AnimatePresence mode="wait">
                  {applied ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2.5 rounded-xl border border-green-200/60 justify-center"
                    >
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                      <span className="text-sm font-bold">
                        {appliedStatus && appliedStatus !== 'submitted'
                          ? (isArabic ? `الحالة: ${t(`common.${appliedStatus}`)}` : `Status: ${t(`common.${appliedStatus}`)}`)
                          : (isArabic ? 'تم تقديم الطلب' : 'Application submitted')}
                      </span>
                    </motion.div>
                  ) : !canApply ? (
                    <p className="text-sm text-muted text-center py-2">
                      {isArabic ? 'سجّل دخولك بدور طالب أو متقاعد للتقديم' : 'Sign in as a student or retiree to apply'}
                    </p>
                  ) : (
                    <motion.button
                      key="apply"
                      onClick={handleApply}
                      disabled={applying}
                      className={cn(
                        'w-full inline-flex items-center justify-center gap-2 bg-teal text-white rounded-xl px-5 py-3 text-sm font-bold transition duration-200',
                        applying
                          ? 'opacity-70 cursor-wait'
                          : 'hover:bg-teal-deep',
                      )}
                    >
                      {applying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          {isArabic ? 'جاري التقديم...' : 'Submitting…'}
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" aria-hidden="true" />
                          {t('common.applyNow')}
                        </>
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
