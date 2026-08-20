import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Briefcase, Users, UserCheck, Check, X, Mail, PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react'
import { fetchMyPostings, deleteOpportunity } from '@/lib/opportunities'
import type { Opportunity } from '@/types'
import DashboardCard from '@/components/shared/DashboardCard'
import StatCard from '@/components/shared/StatCard'
import NextStepCard from '@/components/shared/NextStepCard'
import UserAvatar from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import { useAuth } from '@/context/AuthContext'
import { fetchApplicantsForMyCompany, updateApplicationStatus } from '@/lib/applications'
import { supabase } from '@/lib/supabase'
import type { ApplicationStatus } from '@/types/database'

// Calm institutional motion: a single short opacity fade on mount, no stagger.
const fade = (_delay = 0) => ({ initial: { opacity: 0 } as const, animate: { opacity: 1 } as const, transition: { duration: 0.18 } })

interface ApplicantType {
  id: string                    // application id
  applicantUserId: string
  name: string
  nameAr: string
  role: string                  // opportunity title
  avatar: string
  score: number
  status: ApplicationStatus
  skills: string[]
  university: string
  gpa: number
}

const applicantStatusColors: Record<ApplicationStatus, string> = {
  submitted:           'bg-imamu-navy-50 text-imamu-navy border border-imamu-navy-100',
  reviewed:            'bg-imamu-sky/45 text-imamu-navy-deep border border-imamu-navy-100',
  shortlisted:         'bg-imamu-gold-50 text-imamu-gold-deep border border-imamu-gold-100',
  accepted:            'bg-green-50 text-green-700 border border-green-200',
  rejected:            'bg-slate-100 text-slate-600 border border-slate-200',
  cv_update_required:  'bg-imamu-gold-50 text-imamu-gold-deep border border-imamu-gold-100',
}

function ApplicantDetailModal({ applicant, onClose, onStatusChange }: { applicant: ApplicantType; onClose: () => void; onStatusChange: (id: string, status: ApplicationStatus) => void }) {
  const { t, isArabic } = useLanguage()
  const [actionTaken, setActionTaken] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function handleShortlist() {
    setWorking(true)
    try {
      await updateApplicationStatus(applicant.id, 'shortlisted')
      onStatusChange(applicant.id, 'shortlisted')
      setActionTaken('shortlist')
    } catch {
      // ignore for now
    } finally {
      setWorking(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[8vh] px-4 pb-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(4,93,132,0.25)] w-full max-w-md overflow-hidden relative border border-imamu-navy-50"
        initial={{ scale: 0.96, opacity: 0, y: -12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-imamu-gold" />
        <button onClick={onClose} className="absolute top-4 end-4 p-2 rounded-xl text-imamu-dark/45 hover:text-imamu-dark hover:bg-imamu-navy-50 transition z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <div className="mb-3 flex justify-center">
            <UserAvatar avatar={applicant.avatar} alt={isArabic ? applicant.nameAr : applicant.name} size="lg" className="w-16 h-16 text-xl" />
          </div>
          <h2 className="font-display font-bold text-imamu-dark text-xl">{isArabic ? applicant.nameAr : applicant.name}</h2>
          <p className="text-sm text-imamu-blue mt-1">{applicant.role}</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className={cn('rounded-full text-[11px] font-bold px-3 py-1', applicantStatusColors[applicant.status])}>
              {t(`common.${applicant.status}`)}
            </span>
            <span className="text-sm font-bold text-imamu-gold">{applicant.score}% {t('common.matchScore')}</span>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pb-4 grid grid-cols-2 gap-3">
          <div className="bg-imamu-navy-50/60 border border-imamu-navy-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-imamu-blue font-semibold uppercase tracking-wide">{isArabic ? 'الجامعة' : 'University'}</p>
            <p className="text-sm font-bold text-imamu-dark mt-0.5">{applicant.university}</p>
          </div>
          <div className="bg-imamu-navy-50/60 border border-imamu-navy-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-imamu-blue font-semibold uppercase tracking-wide">GPA</p>
            <p className="text-sm font-bold text-imamu-dark mt-0.5">{applicant.gpa} / 4.0</p>
          </div>
        </div>

        {/* Skills */}
        <div className="px-6 pb-4">
          <p className="text-xs font-bold text-imamu-dark mb-2">{t('common.skills')}</p>
          <div className="flex flex-wrap gap-2">
            {applicant.skills.map(s => (
              <span key={s} className="bg-imamu-navy-50 border border-imamu-navy-100 rounded-full px-3 py-1.5 text-xs font-semibold text-imamu-navy">{s}</span>
            ))}
          </div>
        </div>

        {/* Match score bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-imamu-blue">{t('common.matchScore')}</span>
            <span className="text-sm font-bold text-imamu-gold">{applicant.score}%</span>
          </div>
          <div className="h-2 bg-imamu-navy-50 rounded-full overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', applicant.score >= 90 ? 'bg-green-600' : applicant.score >= 80 ? 'bg-imamu-navy' : 'bg-imamu-gold')}
              initial={{ width: 0 }}
              animate={{ width: `${applicant.score}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-imamu-navy-50 px-6 py-4 bg-imamu-navy-50/30">
          <AnimatePresence mode="wait">
            {actionTaken ? (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 py-2 text-green-700 bg-green-50 border border-green-200 rounded-xl"
              >
                <Check className="w-5 h-5" />
                <span className="text-sm font-bold">
                  {actionTaken === 'shortlist'
                    ? (isArabic ? 'تمت إضافته للقائمة المختصرة' : 'Added to Shortlist')
                    : (isArabic ? 'تم إرسال الرسالة' : 'Message Sent')}
                </span>
              </motion.div>
            ) : (
              <motion.div key="actions" className="flex gap-3">
                <button
                  onClick={handleShortlist}
                  disabled={working || applicant.status === 'shortlisted'}
                  className="flex-1 flex items-center justify-center gap-2 bg-imamu-navy text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  <UserCheck className="w-4 h-4" />
                  {working
                    ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                    : applicant.status === 'shortlisted'
                      ? (isArabic ? 'تم الترشيح' : 'Shortlisted')
                      : (isArabic ? 'ترشيح' : 'Shortlist')}
                </button>
                <button
                  onClick={() => setActionTaken('message')}
                  className="flex-1 flex items-center justify-center gap-2 border border-imamu-navy-100 bg-white text-imamu-navy rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-imamu-navy-50 hover:border-imamu-navy transition"
                >
                  <Mail className="w-4 h-4" />
                  {isArabic ? 'مراسلة' : 'Message'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function CompanyDashboard() {
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()
  const { user } = useAuth()
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantType | null>(null)
  const [applicants, setApplicants] = useState<ApplicantType[]>([])
  const [newApplicantIds, setNewApplicantIds] = useState<Set<string>>(new Set())
  const [livePulse, setLivePulse] = useState(false)
  const [listings, setListings] = useState<Opportunity[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Load this company's opportunities
  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchMyPostings(user.id)
      .then((rows) => { if (!cancelled) setListings(rows) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [user])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteOpportunity(id)
      setListings((prev) => prev.filter((o) => o.id !== id))
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  // Adapter shared between initial load + realtime refresh
  function toApplicantType(r: Awaited<ReturnType<typeof fetchApplicantsForMyCompany>>[number]): ApplicantType {
    return {
      id: r.id,
      applicantUserId: r.applicantUserId,
      name: r.name,
      nameAr: r.nameAr ?? r.name,
      role: r.opportunityTitle,
      avatar: '',
      score: 80,             // placeholder until match scoring lands
      status: r.status,
      skills: [],            // populated once we join student_skills
      university: '—',
      gpa: 0,
    }
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false

    // Initial load
    fetchApplicantsForMyCompany()
      .then((rows) => { if (!cancelled) setApplicants(rows.map(toApplicantType)) })
      .catch(() => { /* surface later if needed */ })

    // Realtime: re-fetch the (RLS-filtered) list whenever an application is
    // inserted or updated. Cheap because the list is short and the join is
    // already optimised. We keep the new ids in a "fresh" set so we can pulse them.
    const channel = supabase
      .channel(`company-applications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'applications' },
        (payload) => {
          const newId = (payload.new as { id?: string })?.id
          if (newId) {
            setNewApplicantIds((prev) => {
              const next = new Set(prev)
              next.add(newId)
              return next
            })
            setLivePulse(true)
            setTimeout(() => setLivePulse(false), 2400)
          }
          fetchApplicantsForMyCompany()
            .then((rows) => { if (!cancelled) setApplicants(rows.map(toApplicantType)) })
            .catch(() => { /* ignore */ })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'applications' },
        () => {
          fetchApplicantsForMyCompany()
            .then((rows) => { if (!cancelled) setApplicants(rows.map(toApplicantType)) })
            .catch(() => { /* ignore */ })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [user])

  // Drop a row from the "fresh" set once the user has seen it (clicked / scrolled past).
  function clearFreshFor(id: string) {
    setNewApplicantIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const newApplicants = applicants.filter(a => a.status === 'submitted').length
  const pendingReview = applicants.filter(a => a.status === 'submitted' || a.status === 'reviewed').length
  const hiredCount = applicants.filter(a => a.status === 'accepted').length
  const activeListings = listings.filter((o) => o.deadline ? new Date(o.deadline) >= new Date() : true).length

  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark">
      {/* Welcome banner removed — the topbar already greets the user and the
          NextStepCard immediately below acts as the welcome-plus-action prompt. */}
      <NextStepCard
        variant="light"
        icon={<UserCheck className="w-7 h-7" />}
        label={isArabic ? 'خطوتك التالية' : 'Your Next Step'}
        heading={
          pendingReview > 0
            ? (isArabic ? `راجع ${pendingReview} طلبات بانتظارك` : `Review ${pendingReview} pending applicants`)
            : (isArabic ? 'انشر فرصة جديدة لجذب المواهب' : 'Post a new opportunity to attract talent')
        }
        bullets={[
          isArabic
            ? `${newApplicants} طلبات جديدة لم تُراجع بعد`
            : `${newApplicants} new applicants not yet reviewed`,
          isArabic
            ? `${activeListings} قوائم نشطة حالياً`
            : `${activeListings} active job listings`,
          isArabic
            ? `${applicants.length} متقدمين في مسار التوظيف`
            : `${applicants.length} applicants in your pipeline`,
        ]}
        ctaHref="/post-opportunity"
        ctaLabel={isArabic ? 'نشر فرصة' : 'Post Opportunity'}
        ctaIcon={<PlusCircle className="w-4 h-4" />}
      />

      {/* Stat tiles — light variant matching the rest of the IMSIU theme. */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard variant="light"
            icon={<Briefcase className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(activeListings)}
            label={t('dashboard.activeListings')}
            helper={isArabic ? 'الفرص المتاحة للمتقدمين الآن' : 'Live postings open to applicants'}
            index={0} />
          <StatCard variant="light"
            icon={<Users className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(applicants.length)}
            label={t('dashboard.totalApplicants')}
            helper={isArabic ? 'إجمالي من تقدّم لفرصك' : 'Total applicants across postings'}
            index={1} />
          <StatCard variant="light"
            icon={<UserCheck className="w-5 h-5 text-green-700" />}
            iconBg="bg-green-50 ring-1 ring-green-200"
            value={String(hiredCount)}
            label={t('dashboard.hired')}
            helper={isArabic ? 'تم قبولهم وانضمامهم' : 'Accepted candidates'}
            index={2} />
          <StatCard variant="light"
            attention
            icon={<UserCheck className="w-5 h-5 text-imamu-gold-deep" />}
            iconBg="bg-imamu-gold-50 ring-1 ring-imamu-gold-100"
            value={String(applicants.filter(a => a.status === 'shortlisted' || a.status === 'accepted').length)}
            label={t('dashboard.shortlisted') || 'Shortlisted'}
            helper={isArabic ? 'مرشّحون قيد التوظيف' : 'Candidates in your hiring pipeline'}
            index={3} />
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <motion.div {...fade(0)}>
            <DashboardCard variant="light" id="listings" title={t('dashboard.activeListings')} icon={<Briefcase className="w-[18px] h-[18px] text-imamu-navy" />} action={{ label: t('dashboard.postOpportunity'), href: '/post-opportunity' }}>
              <div className="space-y-2.5">
                {listings.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="w-9 h-9 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60 mb-3">
                      {isArabic ? 'لم تنشر فرصة بعد' : 'No opportunities posted yet'}
                    </p>
                    <Link
                      to="/post-opportunity"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-imamu-navy hover:text-imamu-navy-deep transition"
                    >
                      {isArabic ? 'انشر فرصتك الأولى' : 'Post your first opportunity'}
                      <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : listings.map((li) => (
                  <div key={li.id} className="flex items-center justify-between p-4 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 hover:bg-imamu-navy-50/75 hover:border-imamu-navy-100 transition duration-200 group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-imamu-dark">{l(li, 'title')}</span>
                        <span className="bg-imamu-navy text-white rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{l(li, 'type')}</span>
                      </div>
                      <p className="text-xs text-imamu-blue mt-1">{l(li, 'location')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ms-4">
                      <div className="flex flex-col items-end">
                        <p className="text-sm font-bold text-imamu-dark">{li.applicants} <span className="text-xs text-imamu-blue font-normal">{t('common.applicants')}</span></p>
                      </div>
                      {confirmDeleteId === li.id ? (
                        <div className="flex items-center gap-1.5 ms-2">
                          <button
                            onClick={() => handleDelete(String(li.id))}
                            disabled={deletingId === li.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            {deletingId === li.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            {isArabic ? 'حذف' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-lg text-imamu-dark/55 hover:text-imamu-dark hover:bg-imamu-navy-50 text-[11px] font-bold transition-colors"
                          >
                            {isArabic ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ms-2">
                          <Link
                            to={`/post-opportunity/${li.id}`}
                            title={isArabic ? 'تعديل' : 'Edit'}
                            className="p-1.5 rounded-lg text-imamu-dark/45 hover:text-imamu-navy hover:bg-imamu-navy-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => setConfirmDeleteId(String(li.id))}
                            title={isArabic ? 'حذف' : 'Delete'}
                            className="p-1.5 rounded-lg text-imamu-dark/45 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </motion.div>

          <motion.div {...fade(0.1)}>
            <DashboardCard
              variant="light"
              id="applicants"
              title={t('dashboard.recentApplicants')}
              icon={<Users className="w-[18px] h-[18px] text-imamu-navy" />}
              action={livePulse ? {
                label: isArabic ? '● مباشر' : '● LIVE',
                href: '#',
              } : undefined}
            >
              <div className="space-y-2.5">
                {applicants.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-9 h-9 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60">
                      {isArabic ? 'لا يوجد متقدمون بعد' : 'No applicants yet'}
                    </p>
                  </div>
                ) : applicants.map((a) => {
                  const isFresh = newApplicantIds.has(a.id)
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'flex items-center gap-3 p-4 rounded-xl border transition duration-300 cursor-pointer relative',
                        isFresh
                          ? 'border-imamu-gold-100 bg-imamu-gold-50/60 hover:bg-imamu-gold-50'
                          : 'border-imamu-navy-50 bg-imamu-navy-50/45 hover:bg-imamu-navy-50/75 hover:border-imamu-navy-100',
                      )}
                      onClick={() => { setSelectedApplicant(a); clearFreshFor(a.id) }}
                    >
                      {isFresh && (
                        <span className="absolute -top-1.5 -end-1.5 flex h-4 w-4">
                          <span className="relative inline-flex h-4 w-4 rounded-full bg-imamu-gold items-center justify-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          </span>
                        </span>
                      )}
                      <UserAvatar avatar={a.avatar} alt={isArabic ? a.nameAr : a.name} size="sm" className="w-9 h-9 text-xs shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-imamu-dark flex items-center gap-2">
                          {isArabic ? a.nameAr : a.name}
                          {isFresh && (
                            <span className="text-[9px] uppercase tracking-wider font-bold text-imamu-gold-deep bg-white border border-imamu-gold-100 px-1.5 py-0.5 rounded">
                              {isArabic ? 'جديد' : 'New'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-imamu-blue mt-0.5">{a.role}</p>
                      </div>
                      <span className={cn('rounded-full text-[10px] font-bold px-3 py-1 shrink-0', applicantStatusColors[a.status])}>{t(`common.${a.status}`)}</span>
                    </div>
                  )
                })}
              </div>
            </DashboardCard>
          </motion.div>
        </div>
      </div>

      {/* Applicant detail modal */}
      <AnimatePresence>
        {selectedApplicant && (
          <ApplicantDetailModal
            applicant={selectedApplicant}
            onClose={() => setSelectedApplicant(null)}
            onStatusChange={(id, status) => {
              setApplicants((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
              setSelectedApplicant((prev) => (prev && prev.id === id ? { ...prev, status } : prev))
            }}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
