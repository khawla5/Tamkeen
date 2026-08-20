import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, MapPin, Clock, Users, Calendar, CheckCircle2,
  Building2, Banknote, GraduationCap, Send, AlertCircle,
} from 'lucide-react'
import type { Opportunity } from '@/types'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import { useAuth } from '@/context/AuthContext'
import { applyToOpportunity, checkAlreadyApplied } from '@/lib/applications'
import type { ApplicationStatus } from '@/types/database'
import MatchBadge from './MatchBadge'
import SalaryText from './SalaryText'
import { cn } from '@/lib/utils'

interface Props {
  opportunity: Opportunity | null
  onClose: () => void
}

const APPLY_ROLES = new Set(['student', 'retiree', 'employee'])

export default function OpportunityDetailModal({ opportunity: opp, onClose }: Props) {
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()
  const { user, role } = useAuth()
  const [applied, setApplied] = useState(false)
  const [appliedStatus, setAppliedStatus] = useState<ApplicationStatus | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const canApply = role !== null && APPLY_ROLES.has(role)

  // On open, check if the user has already applied to this opportunity.
  useEffect(() => {
    if (!user || !opp) return
    let cancelled = false
    setApplied(false)
    setAppliedStatus(null)
    setApplyError(null)
    checkAlreadyApplied(user.id, String(opp.id))
      .then((res) => {
        if (cancelled) return
        if (res.applied) {
          setApplied(true)
          setAppliedStatus(res.status)
        }
      })
      .catch(() => { /* ignore — not blocking */ })
    return () => { cancelled = true }
  }, [user, opp])

  if (!opp) return null

  async function handleApply() {
    if (!user || !opp) return
    setApplying(true)
    setApplyError(null)
    try {
      await applyToOpportunity(user.id, String(opp.id))
      setApplied(true)
      setAppliedStatus('submitted')
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[5vh] sm:pt-[8vh] px-4 pb-4 overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-lg w-full max-w-2xl overflow-hidden relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top accent */}
          <div className="h-1 bg-teal" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 end-4 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="p-6 pb-0">
            <div className="flex items-start gap-4 pe-10">
              {opp.companyLogo.startsWith('/') ? (
                <img src={opp.companyLogo} alt={opp.company} className="w-14 h-14 rounded-xl shrink-0 object-contain border border-gray-100" />
              ) : (
                <div className="w-14 h-14 rounded-xl shrink-0 bg-teal-mist border border-gray-100 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-teal" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-teal-dark text-xl leading-snug mb-1">
                  {l(opp, 'title')}
                </h2>
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {l(opp, 'company')}
                </p>
              </div>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <MatchBadge score={opp.matchScore} />
              <span className="bg-teal-dark text-teal-light px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide">
                {l(opp, 'type')}
              </span>
              {opp.forRetirees && (
                <span className="bg-terra/10 text-terra-dark px-2.5 py-1 rounded-full text-[11px] font-bold">
                  {t('opportunities.retireeTag')}
                </span>
              )}
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-5">
            {[
              { icon: MapPin, label: t('common.location'), value: l(opp, 'location') },
              { icon: Clock, label: t('common.duration'), value: l(opp, 'duration') },
              { icon: Banknote, label: t('common.salary'), value: l(opp, 'salary'), isSalary: true },
              { icon: Calendar, label: isArabic ? 'آخر موعد' : 'Deadline', value: opp.deadline },
            ].map((m) => (
              <div key={m.label} className="bg-teal-mist rounded-xl p-3 text-center">
                <m.icon className="w-4 h-4 text-teal mx-auto mb-1" />
                <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">{m.label}</p>
                {m.isSalary ? (
                  <SalaryText value={m.value} className="text-sm font-bold text-teal-dark mt-0.5 justify-center" iconClassName="w-3.5 h-3.5" />
                ) : (
                  <p className="text-sm font-bold text-teal-dark mt-0.5">{m.value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="px-6 pb-4">
            <h3 className="text-sm font-bold text-teal-dark mb-2">
              {isArabic ? 'الوصف' : 'Description'}
            </h3>
            <p className="text-sm text-muted/80 leading-relaxed">{l(opp, 'description')}</p>
          </div>

          {/* Skills */}
          <div className="px-6 pb-4">
            <h3 className="text-sm font-bold text-teal-dark mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-teal" />
              {t('common.skills')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {opp.skills.map((skill) => (
                <span
                  key={skill}
                  className="bg-teal-mist rounded-full px-3 py-1.5 text-xs font-semibold text-teal-dark/70"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 pb-4 flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {opp.applicants} {t('common.applicants')}
            </span>
            <span>
              {opp.postedDays}{t('common.days')} {t('common.postedAgo')}
            </span>
          </div>

          {/* Apply error banner */}
          {applyError && (
            <div role="alert" aria-live="assertive" className="mx-6 mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{applyError}</span>
            </div>
          )}

          {/* Action footer */}
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
            <SalaryText value={l(opp, 'salary')} className="font-display text-lg font-bold text-teal-dark" iconClassName="w-4 h-4" />

            <AnimatePresence mode="wait">
              {applied ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 bg-green-50 text-green-700 px-5 py-2.5 rounded-xl border border-green-200/60"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold">
                    {appliedStatus && appliedStatus !== 'submitted'
                      ? (isArabic ? `الحالة: ${t(`common.${appliedStatus}`)}` : `Status: ${t(`common.${appliedStatus}`)}`)
                      : (isArabic ? 'تم تقديم الطلب' : 'Application Submitted')}
                  </span>
                </motion.div>
              ) : !canApply ? (
                <span className="text-sm text-muted px-5 py-2.5">
                  {isArabic ? 'سجّل دخولك بدور طالب أو متقاعد للتقديم' : 'Sign in as a student or retiree to apply'}
                </span>
              ) : (
                <motion.button
                  key="apply"
                  onClick={handleApply}
                  disabled={applying}
                  className={cn(
                    "inline-flex items-center gap-2 bg-teal text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors duration-200",
                    applying
                      ? "opacity-70 cursor-wait"
                      : "hover:bg-teal-deep",
                  )}
                >
                  {applying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {isArabic ? 'جاري التقديم...' : 'Submitting...'}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {t('common.applyNow')}
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
