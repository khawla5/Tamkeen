import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock,
  Eye,
  FileWarning,
  Flag,
  Inbox,
  Layers3,
  ListChecks,
  MapPin,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import { fetchMyApplications, type MyApplication } from '@/lib/applications'
import { relativeTime } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import type { ApplicationStatus, OpportunityType } from '@/types/database'

type Language = 'en' | 'ar'
type FilterKey = 'all' | 'inProgress' | 'decisions' | 'accepted' | 'rejected'
type Accent = 'navy' | 'gold' | 'green' | 'red'

const IN_PROGRESS: ApplicationStatus[] = ['submitted', 'reviewed', 'shortlisted', 'cv_update_required']
const DECISIONS: ApplicationStatus[] = ['accepted', 'rejected']

const TRACKER_STEPS: Record<Language, string[]> = {
  en: ['Submitted', 'In review', 'Final decision'],
  ar: ['تم التقديم', 'قيد المراجعة', 'القرار النهائي'],
}

const PAGE_COPY: Record<Language, {
  title: string
  label: string
  subtitle: string
  summary: string
  total: string
  inProgress: string
  decisions: string
  accepted: string
  rejected: string
  filterAll: string
  filterInProgress: string
  filterDecisions: string
  filterAccepted: string
  filterRejected: string
  appliedOn: string
  updatedOn: string
  location: string
  duration: string
  statusLabel: string
  nextStepLabel: string
  trackerLabel: string
  viewOpportunity: string
  followApplication: string
  loadError: string
  loadErrorRetry: string
  emptyTitle: string
  emptyHint: string
  emptyCta: string
  noResultsTitle: string
  noResultsHint: string
  noLocation: string
  opportunity: string
  finalDecision: string
  officialTracker: string
}> = {
  en: {
    title: 'My Applications',
    label: 'Application tracking',
    subtitle: 'Track submitted opportunities, final decisions, and the next action for each application.',
    summary: 'A calm official view of your opportunity pipeline and decisions.',
    total: 'Total applications',
    inProgress: 'In review',
    decisions: 'Decisions',
    accepted: 'Accepted',
    rejected: 'Not selected',
    filterAll: 'All',
    filterInProgress: 'In review',
    filterDecisions: 'Decisions',
    filterAccepted: 'Accepted',
    filterRejected: 'Not selected',
    appliedOn: 'Submitted',
    updatedOn: 'Updated',
    location: 'Location',
    duration: 'Duration',
    statusLabel: 'Current status',
    nextStepLabel: 'Next step',
    trackerLabel: 'Application progress',
    viewOpportunity: 'View opportunity',
    followApplication: 'Follow up',
    loadError: "Couldn't load your applications",
    loadErrorRetry: 'Try again',
    emptyTitle: 'No applications yet',
    emptyHint: 'When you apply to an opportunity, it will appear here with its status, next step, and decision updates.',
    emptyCta: 'Browse opportunities',
    noResultsTitle: 'No applications in this view',
    noResultsHint: 'Try another status filter or check back when your applications are updated.',
    noLocation: 'Location not specified',
    opportunity: 'Opportunity',
    finalDecision: 'Final decision',
    officialTracker: 'Official tracking record',
  },
  ar: {
    title: 'طلباتي',
    label: 'متابعة الطلبات',
    subtitle: 'تابع الفرص التي تقدمت إليها، والقرارات النهائية، والخطوة التالية لكل طلب.',
    summary: 'عرض رسمي وهادئ لمسار طلباتك ونتائجها داخل تمكين.',
    total: 'إجمالي الطلبات',
    inProgress: 'قيد المعالجة',
    decisions: 'القرارات',
    accepted: 'المقبولة',
    rejected: 'غير المختارة',
    filterAll: 'الكل',
    filterInProgress: 'قيد المعالجة',
    filterDecisions: 'قرارات',
    filterAccepted: 'مقبول',
    filterRejected: 'غير مختار',
    appliedOn: 'تاريخ التقديم',
    updatedOn: 'آخر تحديث',
    location: 'الموقع',
    duration: 'المدة',
    statusLabel: 'الحالة الحالية',
    nextStepLabel: 'الخطوة التالية',
    trackerLabel: 'تقدم الطلب',
    viewOpportunity: 'عرض الفرصة',
    followApplication: 'متابعة الطلب',
    loadError: 'تعذّر تحميل طلباتك',
    loadErrorRetry: 'إعادة المحاولة',
    emptyTitle: 'لا توجد طلبات بعد',
    emptyHint: 'عند التقديم على فرصة ستظهر هنا مع حالتها، والخطوة التالية، وتحديثات القرار.',
    emptyCta: 'استكشف الفرص',
    noResultsTitle: 'لا توجد طلبات في هذا العرض',
    noResultsHint: 'جرّب تصنيفاً آخر أو عد لاحقاً عند تحديث حالة طلباتك.',
    noLocation: 'لم يحدد الموقع',
    opportunity: 'فرصة',
    finalDecision: 'قرار نهائي',
    officialTracker: 'سجل متابعة رسمي',
  },
}

interface StatusStyle {
  Icon: LucideIcon
  label: Record<Language, string>
  message: Record<Language, string>
  nextStep: Record<Language, string>
  cta: Record<Language, string>
  ctaHref: (app: MyApplication) => string
  badge: string
  panel: string
  marker: string
  accent: string
  accentType: Accent
  decision?: boolean
  success?: boolean
}

const STATUS_STYLES: Record<ApplicationStatus, StatusStyle> = {
  submitted: {
    Icon: Send,
    label: { en: 'Submitted', ar: 'تم التقديم' },
    message: {
      en: 'Your application has been received and is waiting for review.',
      ar: 'تم استلام طلبك وهو بانتظار مراجعة الجهة.',
    },
    nextStep: {
      en: 'Keep your profile and CV ready while the provider reviews your submission.',
      ar: 'حافظ على جاهزية ملفك وسيرتك أثناء مراجعة الجهة للطلب.',
    },
    cta: { en: 'Explore similar opportunities', ar: 'استكشف فرصاً مشابهة' },
    ctaHref: () => '/opportunities',
    badge: 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy',
    panel: 'border-imamu-navy-100 bg-imamu-navy-50/75 text-imamu-dark',
    marker: 'bg-imamu-navy text-white ring-imamu-navy-50',
    accent: 'bg-imamu-navy-100',
    accentType: 'navy',
  },
  reviewed: {
    Icon: Eye,
    label: { en: 'Reviewed', ar: 'تمت المراجعة' },
    message: {
      en: 'The receiving team has opened your application.',
      ar: 'تم فتح طلبك من قبل الجهة المستقبلة.',
    },
    nextStep: {
      en: 'Watch for shortlisting updates and continue applying to relevant matches.',
      ar: 'تابع تحديثات الترشيح واستمر في التقديم على الفرص المناسبة.',
    },
    cta: { en: 'Browse more matches', ar: 'استعرض فرصاً أخرى' },
    ctaHref: () => '/opportunities',
    badge: 'border-imamu-blue/45 bg-imamu-sky/35 text-imamu-navy',
    panel: 'border-imamu-blue/35 bg-imamu-sky/25 text-imamu-dark',
    marker: 'bg-imamu-navy text-white ring-imamu-navy-50',
    accent: 'bg-imamu-blue',
    accentType: 'navy',
  },
  shortlisted: {
    Icon: BadgeCheck,
    label: { en: 'Shortlisted', ar: 'في القائمة المختصرة' },
    message: {
      en: 'You are being considered for the next stage.',
      ar: 'أنت ضمن المرشحين للمرحلة التالية.',
    },
    nextStep: {
      en: 'Prepare for interview or follow-up communication from the organization.',
      ar: 'استعد للمقابلة أو تواصل الجهة في المرحلة القادمة.',
    },
    cta: { en: 'Practice interview', ar: 'ابدأ تدريب المقابلات' },
    ctaHref: () => '/interview-prep',
    badge: 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
    panel: 'border-imamu-gold-100 bg-imamu-gold-50/75 text-imamu-dark',
    marker: 'bg-imamu-gold text-white ring-imamu-gold-50',
    accent: 'bg-imamu-gold',
    accentType: 'gold',
  },
  accepted: {
    Icon: CheckCircle2,
    label: { en: 'Accepted', ar: 'مقبول' },
    message: {
      en: 'A positive final decision has been recorded for this application.',
      ar: 'تم تسجيل قرار نهائي إيجابي لهذا الطلب.',
    },
    nextStep: {
      en: 'Follow the organization’s instructions and keep your contact details updated.',
      ar: 'تابع تعليمات الجهة وحافظ على تحديث بيانات التواصل.',
    },
    cta: { en: 'View next details', ar: 'عرض تفاصيل الخطوات' },
    ctaHref: (app) => `/opportunities/${app.opportunityId}`,
    badge: 'border-green-200 bg-green-50 text-green-700',
    panel: 'border-green-200 bg-green-50/80 text-green-900',
    marker: 'bg-green-600 text-white ring-green-50',
    accent: 'bg-imamu-gold',
    accentType: 'green',
    decision: true,
    success: true,
  },
  rejected: {
    Icon: XCircle,
    label: { en: 'Not selected', ar: 'غير مختار' },
    message: {
      en: 'A final decision has been issued for this opportunity.',
      ar: 'صدر قرار نهائي لهذه الفرصة.',
    },
    nextStep: {
      en: 'Use this as signal to explore similar opportunities and strengthen your profile.',
      ar: 'استفد من التجربة لاستكشاف فرص مشابهة وتقوية ملفك.',
    },
    cta: { en: 'Find similar opportunities', ar: 'استكشاف فرص مشابهة' },
    ctaHref: () => '/opportunities',
    badge: 'border-red-200 bg-red-50 text-red-700',
    panel: 'border-red-200 bg-red-50/70 text-red-900',
    marker: 'bg-imamu-gold text-white ring-imamu-gold-50',
    accent: 'bg-imamu-gold',
    accentType: 'red',
    decision: true,
  },
  cv_update_required: {
    Icon: FileWarning,
    label: { en: 'CV update needed', ar: 'تحديث السيرة مطلوب' },
    message: {
      en: 'The receiving team needs a clearer or more complete CV before continuing.',
      ar: 'تحتاج الجهة إلى سيرة أوضح أو أكثر اكتمالاً قبل المتابعة.',
    },
    nextStep: {
      en: 'Update your skill record and refresh your CV before following up.',
      ar: 'حدّث سجلك المهاري وسيرتك قبل متابعة الطلب.',
    },
    cta: { en: 'Update skill record', ar: 'تحديث السجل المهاري' },
    ctaHref: () => '/skills-record',
    badge: 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
    panel: 'border-imamu-gold-100 bg-imamu-gold-50/75 text-imamu-dark',
    marker: 'bg-imamu-gold text-white ring-imamu-gold-50',
    accent: 'bg-imamu-warm-gold',
    accentType: 'gold',
  },
}

const STATUS_STAGE: Record<ApplicationStatus, number> = {
  submitted: 0,
  reviewed: 1,
  shortlisted: 1,
  cv_update_required: 1,
  accepted: 2,
  rejected: 2,
}

const TYPE_LABELS: Record<OpportunityType, Record<Language, string>> = {
  job: { en: 'Job', ar: 'وظيفة' },
  training: { en: 'Training', ar: 'تدريب' },
  coop: { en: 'Co-op training', ar: 'تدريب تعاوني' },
  certification: { en: 'Certification', ar: 'شهادة' },
  career_path: { en: 'Career path', ar: 'مسار مهني' },
  consulting: { en: 'Consulting', ar: 'استشارات' },
}

const TYPE_STYLES: Record<OpportunityType, string> = {
  job: 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy',
  training: 'border-imamu-blue/40 bg-imamu-sky/35 text-imamu-navy',
  coop: 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
  certification: 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
  career_path: 'border-imamu-navy-100 bg-white text-imamu-navy',
  consulting: 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy',
}

function formatLongDate(iso: string | null | undefined, lang: Language): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function displayValue(primary: string | null | undefined, fallback: string): string {
  const trimmed = primary?.trim()
  return trimmed || fallback
}

export default function MyApplications() {
  const { isArabic, lang } = useLanguage()
  const { user } = useAuth()
  const [items, setItems] = useState<MyApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const language: Language = lang === 'ar' || isArabic ? 'ar' : 'en'
  const copy = PAGE_COPY[language]

  const loadApplications = () => {
    if (!user) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    fetchMyApplications(user.id)
      .then(setItems)
      .catch((err) => setLoadError(err?.message ?? 'Failed to load applications'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadApplications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const counts = useMemo(() => {
    const accepted = items.filter((a) => a.status === 'accepted').length
    const rejected = items.filter((a) => a.status === 'rejected').length
    return {
      total: items.length,
      inProgress: items.filter((a) => IN_PROGRESS.includes(a.status)).length,
      decisions: accepted + rejected,
      accepted,
      rejected,
    }
  }, [items])

  const filtered = useMemo(() => {
    if (filter === 'inProgress') return items.filter((a) => IN_PROGRESS.includes(a.status))
    if (filter === 'decisions') return items.filter((a) => DECISIONS.includes(a.status))
    if (filter === 'accepted') return items.filter((a) => a.status === 'accepted')
    if (filter === 'rejected') return items.filter((a) => a.status === 'rejected')
    return items
  }, [filter, items])

  return (
    <div className="min-h-screen bg-imamu-ice">
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy py-12 sm:py-14">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/60" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end"
          >
            <div className="flex items-start gap-4">
              <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-imamu-gold/35 bg-white/[0.08] text-imamu-warm-gold ring-1 ring-white/10 sm:flex">
                <ClipboardList className="h-7 w-7" aria-hidden="true" />
              </span>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-imamu-gold/30 bg-imamu-gold/10 px-3 py-1 text-[11px] font-bold text-imamu-gold-100">
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.label}
                </span>
                <h1 className="mt-4 font-display text-[clamp(26px,4vw,42px)] font-extrabold leading-tight tracking-tight text-white">
                  {copy.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-imamu-navy-100 sm:text-base">
                  {copy.subtitle}
                </p>
              </div>
            </div>

            {!loading && !loadError && items.length > 0 && (
              <div className="rounded-[22px] border border-white/10 bg-imamu-navy-deep p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold text-imamu-navy-100">{copy.summary}</p>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-imamu-gold/25 bg-imamu-gold/15 text-imamu-gold-100">
                    <ListChecks className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <HeroStat icon={ClipboardList} label={copy.total} value={counts.total} />
                  <HeroStat icon={Clock} label={copy.inProgress} value={counts.inProgress} />
                  <HeroStat icon={Flag} label={copy.decisions} value={counts.decisions} accent="gold" />
                  <HeroStat icon={CheckCircle2} label={copy.accepted} value={counts.accepted} accent="green" />
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {!loading && !loadError && items.length > 0 && (
        <section className="border-b border-imamu-navy-100/70 bg-imamu-navy-50">
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-imamu-dark">{copy.officialTracker}</p>
                <p className="mt-1 text-xs text-imamu-dark/60">{copy.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2 rounded-[18px] border border-imamu-navy-100 bg-white/80 p-1.5 shadow-sm shadow-imamu-navy/5">
                <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={copy.filterAll} count={counts.total} />
                <FilterPill active={filter === 'inProgress'} onClick={() => setFilter('inProgress')} label={copy.filterInProgress} count={counts.inProgress} />
                <FilterPill active={filter === 'decisions'} onClick={() => setFilter('decisions')} label={copy.filterDecisions} count={counts.decisions} accent="gold" />
                <FilterPill active={filter === 'accepted'} onClick={() => setFilter('accepted')} label={copy.filterAccepted} count={counts.accepted} accent="green" />
                <FilterPill active={filter === 'rejected'} onClick={() => setFilter('rejected')} label={copy.filterRejected} count={counts.rejected} accent="red" />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="relative overflow-hidden pb-20">
        <div className="relative mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            {loading ? (
              <LoadingState key="loading" />
            ) : loadError ? (
              <ErrorState key="error" copy={copy} error={loadError} onRetry={loadApplications} />
            ) : items.length === 0 ? (
              <EmptyState key="empty" copy={copy} />
            ) : filtered.length === 0 ? (
              <NoResultsState key="filtered-empty" copy={copy} />
            ) : (
              <motion.ul
                key={filter}
                className="grid gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {filtered.map((application, index) => (
                  <ApplicationCard
                    key={application.id}
                    app={application}
                    copy={copy}
                    index={index}
                    lang={language}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          {!loading && !loadError && items.length > 0 && (
            <ApplicationGuidance lang={language} />
          )}
        </div>
      </section>
    </div>
  )
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent = 'navy',
}: {
  icon: LucideIcon
  label: string
  value: number
  accent?: Accent
}) {
  const tone = {
    navy: 'border-white/10 bg-white/[0.08] text-imamu-blue',
    gold: 'border-imamu-gold/25 bg-imamu-gold/15 text-imamu-gold-100',
    green: 'border-green-300/25 bg-green-400/10 text-green-100',
    red: 'border-red-300/25 bg-red-400/10 text-red-100',
  }[accent]

  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-imamu-navy-100">{label}</span>
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg border', tone)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className={cn('mt-2 font-display text-2xl font-extrabold leading-none', accent === 'gold' ? 'text-imamu-gold-100' : 'text-white')}>
        {value}
      </p>
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  accent = 'navy',
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  accent?: Accent
}) {
  const inactive = {
    navy: 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy hover:bg-white hover:border-imamu-navy/35',
    gold: 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep hover:bg-imamu-gold-100/70',
    green: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100/70',
    red: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70',
  }[accent]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12px] font-bold transition duration-200',
        active ? 'border-imamu-navy bg-imamu-navy text-white shadow-sm shadow-imamu-navy/15' : inactive,
      )}
      aria-pressed={active}
    >
      {label}
      <span
        className={cn(
          'min-w-[22px] rounded-md px-1.5 py-0.5 text-center text-[11px] font-extrabold',
          active ? 'bg-white/15 text-white' : 'bg-white/75',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function ApplicationCard({
  app,
  copy,
  index,
  lang,
}: {
  app: MyApplication
  copy: (typeof PAGE_COPY)[Language]
  index: number
  lang: Language
}) {
  const status = STATUS_STYLES[app.status]
  const StatusIcon = status.Icon
  const role = lang === 'ar' ? (app.roleAr ?? app.role) : app.role
  const company = lang === 'ar' ? (app.companyAr ?? app.company) : app.company
  const location = lang === 'ar' ? (app.locationAr ?? app.location) : app.location
  const duration = lang === 'ar' ? (app.durationAr ?? app.duration) : app.duration
  const typeLabel = app.type ? TYPE_LABELS[app.type][lang] : copy.opportunity
  const typeClass = app.type ? TYPE_STYLES[app.type] : 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy'
  const appliedLong = formatLongDate(app.appliedAt, lang)
  const updatedLong = formatLongDate(app.updatedAt || app.appliedAt, lang)
  const updatedRelative = relativeTime(app.updatedAt || app.appliedAt, lang)
  const isFinal = status.decision

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.035 }}
      className={cn(
        'group relative overflow-hidden rounded-[22px] border bg-white p-4 shadow-lg shadow-imamu-navy/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-imamu-navy/10 sm:p-5',
        isFinal ? 'border-imamu-gold-100 hover:border-imamu-gold/50' : 'border-imamu-navy-50 hover:border-imamu-navy-100',
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', status.accent)} aria-hidden="true" />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
            <div className="flex min-w-0 items-start gap-3">
              <ProviderAvatar company={company} />
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold', typeClass)}>
                    {typeLabel}
                  </span>
                  {isFinal && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-2.5 py-1 text-[11px] font-bold text-imamu-gold-deep">
                      <Flag className="h-3 w-3" aria-hidden="true" />
                      {copy.finalDecision}
                    </span>
                  )}
                </div>
                <h2 className="font-display text-lg font-extrabold leading-snug text-imamu-dark sm:text-xl">
                  {displayValue(role, copy.opportunity)}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-imamu-dark/62">
                  <Building2 className="h-3.5 w-3.5 text-imamu-navy" aria-hidden="true" />
                  {displayValue(company, copy.opportunity)}
                </p>
              </div>
            </div>

            <span className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-extrabold', status.badge)}>
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {status.label[lang]}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetaItem icon={CalendarDays} label={copy.appliedOn} value={appliedLong || relativeTime(app.appliedAt, lang)} />
            <MetaItem icon={RotateCcw} label={copy.updatedOn} value={updatedLong ? `${updatedLong} · ${updatedRelative}` : updatedRelative} />
            <MetaItem icon={MapPin} label={copy.location} value={displayValue(location, copy.noLocation)} />
            <MetaItem icon={Layers3} label={copy.duration} value={displayValue(duration, typeLabel)} />
          </div>

          <div className={cn('mt-4 rounded-[18px] border px-4 py-3', status.panel)}>
            <div className="flex items-start gap-3">
              <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-4', status.marker)}>
                <StatusIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide">
                  {copy.statusLabel} · {status.label[lang]}
                </p>
                <p className="mt-1 text-sm font-semibold leading-6">{status.message[lang]}</p>
                <p className="mt-1 text-xs leading-6 opacity-85">
                  <span className="font-extrabold">{copy.nextStepLabel}: </span>
                  {status.nextStep[lang]}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[18px] border border-imamu-navy-50 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-imamu-dark">{copy.trackerLabel}</p>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep">
              <CircleDot className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <ApplicationProgress status={app.status} lang={lang} />
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Link
              to={`/opportunities/${app.opportunityId}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-imamu-navy px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-imamu-navy/15 transition hover:bg-imamu-navy-deep hover:shadow-lg hover:shadow-imamu-gold/20"
            >
              {copy.viewOpportunity}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              to={status.ctaHref(app)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-imamu-navy-100 bg-white px-4 py-2.5 text-sm font-extrabold text-imamu-navy transition hover:border-imamu-navy/40 hover:bg-imamu-navy-50"
            >
              {status.cta[lang] || copy.followApplication}
            </Link>
          </div>
        </div>
      </div>
    </motion.li>
  )
}

function ProviderAvatar({ company }: { company: string }) {
  const initials = company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-imamu-navy-100 bg-imamu-navy-50 text-sm font-extrabold text-imamu-navy shadow-sm shadow-imamu-navy/5">
      {initials && initials !== '—' ? initials : <Building2 className="h-5 w-5" aria-hidden="true" />}
    </span>
  )
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-[14px] border border-imamu-navy-50 bg-white px-3 py-2.5 shadow-sm shadow-imamu-navy/4">
      <div className="flex items-center gap-2 text-[11px] font-bold text-imamu-navy">
        <Icon className="h-3.5 w-3.5 text-imamu-gold" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-imamu-dark/68" title={value}>
        {value}
      </p>
    </div>
  )
}

function ApplicationProgress({ status, lang }: { status: ApplicationStatus; lang: Language }) {
  const labels = TRACKER_STEPS[lang]
  const current = STATUS_STAGE[status]
  const isAccepted = status === 'accepted'
  const isRejected = status === 'rejected'

  return (
    <div>
      <div className="flex items-center">
        {labels.map((label, index) => {
          const isFinal = index === labels.length - 1
          const completed = isAccepted ? index <= current : index < current
          const active = !completed && index === current
          const markerClass = completed
            ? isFinal && isAccepted
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-imamu-navy bg-imamu-navy text-white'
            : active && isRejected
              ? 'border-imamu-gold bg-imamu-gold text-white ring-4 ring-imamu-gold-50'
              : active
                ? 'border-imamu-gold bg-white text-imamu-gold-deep ring-4 ring-imamu-gold-50'
                : 'border-imamu-navy-100 bg-white text-imamu-navy-100'
          const connectorClass = index < current || isAccepted ? 'bg-imamu-navy' : 'bg-imamu-navy-100'

          return (
            <div key={label} className={cn('flex items-center', index < labels.length - 1 && 'flex-1')}>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-extrabold', markerClass)}>
                {completed ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : active && isFinal ? (
                  isRejected ? <XCircle className="h-4 w-4" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />
                ) : active ? (
                  <Clock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {index < labels.length - 1 && (
                <span className={cn('mx-2 h-0.5 flex-1 rounded-full', connectorClass)} aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {labels.map((label, index) => (
          <span
            key={label}
            className={cn(
              'text-[10px] font-extrabold leading-tight',
              index === current
                ? 'text-imamu-gold-deep'
                : index < current || isAccepted
                  ? 'text-imamu-navy'
                  : 'text-imamu-dark/42',
              index === 1 && 'text-center',
              index === 2 && 'text-end',
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <motion.div
      key="loading"
      className="flex items-center justify-center rounded-[22px] border border-imamu-navy-50 bg-white/80 py-24 shadow-lg shadow-imamu-navy/5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-imamu-navy/25 border-t-imamu-navy" />
    </motion.div>
  )
}

function ErrorState({
  copy,
  error,
  onRetry,
}: {
  copy: (typeof PAGE_COPY)[Language]
  error: string
  onRetry: () => void
}) {
  return (
    <motion.div
      key="error"
      className="flex flex-col items-center justify-center rounded-[22px] border border-red-100 bg-white px-6 py-20 text-center shadow-lg shadow-imamu-navy/5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-red-50 text-red-600 ring-1 ring-red-100">
        <AlertCircle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl font-bold text-imamu-dark">{copy.loadError}</h3>
      <p className="mt-2 max-w-sm text-sm text-imamu-dark/60">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl border border-imamu-navy-100 bg-white px-6 py-2.5 text-sm font-bold text-imamu-navy transition hover:bg-imamu-navy hover:text-white"
      >
        {copy.loadErrorRetry}
      </button>
    </motion.div>
  )
}

function EmptyState({ copy }: { copy: (typeof PAGE_COPY)[Language] }) {
  return (
    <motion.div
      key="empty"
      className="flex flex-col items-center justify-center rounded-[24px] border border-imamu-navy-50 bg-white px-6 py-20 text-center shadow-xl shadow-imamu-navy/6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative mb-5 flex h-18 w-18 items-center justify-center rounded-[22px] border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep">
        <Inbox className="h-9 w-9" aria-hidden="true" />
        <span className="absolute -end-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-imamu-navy text-white ring-4 ring-white">
          <Briefcase className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
      <h3 className="font-display text-xl font-extrabold text-imamu-dark">{copy.emptyTitle}</h3>
      <p className="mt-2 max-w-lg text-sm leading-7 text-imamu-dark/62">{copy.emptyHint}</p>
      <Link
        to="/opportunities"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-imamu-navy px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-imamu-navy-deep hover:shadow-lg hover:shadow-imamu-gold/20"
      >
        {copy.emptyCta}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      </Link>
    </motion.div>
  )
}

function NoResultsState({ copy }: { copy: (typeof PAGE_COPY)[Language] }) {
  return (
    <motion.div
      key="filtered-empty"
      className="flex flex-col items-center justify-center rounded-[22px] border border-imamu-navy-50 bg-white px-6 py-16 text-center shadow-lg shadow-imamu-navy/5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] border border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-bold text-imamu-dark">{copy.noResultsTitle}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-imamu-dark/60">{copy.noResultsHint}</p>
    </motion.div>
  )
}

function ApplicationGuidance({ lang }: { lang: Language }) {
  const isArabic = lang === 'ar'
  const title = isArabic ? 'إرشادات متابعة الطلبات' : 'Application follow-up guidance'
  const description = isArabic
    ? 'حافظ على جاهزية ملفك أثناء انتظار القرارات، واستمر في بناء مسار فرص متوازن.'
    : 'Keep your profile ready while decisions are pending, and continue building a healthy opportunity pipeline.'
  const cards = isArabic
    ? [
        { title: 'حدّث سيرتك', desc: 'راجع السجل المهاري والروابط المهنية قبل تواصل الجهة.', icon: FileWarning, accent: 'gold' as Accent },
        { title: 'استعد للمقابلة', desc: 'إذا ظهرت حالة الترشيح، ابدأ تدريب المقابلات مبكراً.', icon: ClipboardList, accent: 'navy' as Accent },
        { title: 'وازن طلباتك', desc: 'لا تنتظر قراراً واحداً فقط، واستكشف فرصاً مرتبطة بمسارك.', icon: Briefcase, accent: 'green' as Accent },
      ]
    : [
        { title: 'Refresh your CV', desc: 'Review your skill record and professional links before follow-up.', icon: FileWarning, accent: 'gold' as Accent },
        { title: 'Prepare for interviews', desc: 'If you are shortlisted, begin interview practice early.', icon: ClipboardList, accent: 'navy' as Accent },
        { title: 'Balance your pipeline', desc: 'Do not wait on one decision; keep exploring matched roles.', icon: Briefcase, accent: 'green' as Accent },
      ]

  return (
    <div className="mt-6 rounded-[22px] border border-imamu-navy-50 bg-white p-5 shadow-lg shadow-imamu-navy/5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-extrabold text-imamu-dark">{title}</h3>
          <p className="mt-1 text-sm text-imamu-dark/58">{description}</p>
        </div>
        <span className="hidden h-10 w-10 items-center justify-center rounded-xl border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep sm:flex">
          <BadgeCheck className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(({ title: cardTitle, desc, icon: Icon, accent }) => (
          <div key={cardTitle} className="rounded-[18px] border border-imamu-navy-50 bg-white p-4">
            <span
              className={cn(
                'mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border',
                accent === 'gold'
                  ? 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep'
                  : accent === 'green'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-imamu-navy-100 bg-white text-imamu-navy',
              )}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-extrabold text-imamu-dark">{cardTitle}</p>
            <p className="mt-1 text-xs leading-6 text-imamu-dark/60">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
