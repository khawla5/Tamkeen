import { guideName } from '@/components/shared/GuideName'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Compass,
  Flag,
  Lock,
  Map,
  Target,
  Trophy,
} from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import { cn } from '@/lib/utils'
import {
  trainingPathMilestones,
  type TrainingMilestone,
  type TrainingMilestoneStatus,
  type TrainingMilestoneType,
} from '@/data/tamkeen-data'

const TYPE_LABEL: Record<TrainingMilestoneType, { en: string; ar: string }> = {
  course: { en: 'Course', ar: 'دورة' },
  cert: { en: 'Certification', ar: 'شهادة' },
  activity: { en: 'Activity', ar: 'نشاط' },
  workshop: { en: 'Workshop', ar: 'ورشة' },
  coop: { en: 'Co-op Training', ar: 'تدريب تعاوني' },
}

const TYPE_DETAILS: Record<TrainingMilestoneType, { en: string[]; ar: string[] }> = {
  course: {
    en: ['Complete the learning units', 'Submit the practical assignments', 'Pass the final assessment'],
    ar: ['إكمال الوحدات التعليمية', 'تسليم التطبيقات العملية', 'اجتياز التقييم النهائي'],
  },
  cert: {
    en: ['Prepare for the exam', 'Book the official test window', 'Earn the credential'],
    ar: ['الاستعداد للاختبار', 'حجز موعد الاختبار الرسمي', 'الحصول على الاعتماد'],
  },
  activity: {
    en: ['Register and prepare', 'Participate with your team', 'Submit the final output'],
    ar: ['التسجيل والاستعداد', 'المشاركة مع الفريق', 'تسليم المخرجات النهائية'],
  },
  workshop: {
    en: ['Attend the focused session', 'Complete hands-on exercises', 'Receive completion proof'],
    ar: ['حضور الجلسة المركزة', 'إنجاز التمارين العملية', 'استلام إثبات الإتمام'],
  },
  coop: {
    en: ['Apply to co-op opportunities', 'Complete interviews', 'Finish the workplace placement'],
    ar: ['التقديم على فرص التدريب', 'إكمال المقابلات', 'إنهاء التدريب في بيئة العمل'],
  },
}

const TYPE_DESC: Record<TrainingMilestoneType, { en: string; ar: string }> = {
  course: {
    en: 'Build the academic and technical foundation needed for this career track.',
    ar: 'تبني الأساس العلمي والمهاري المطلوب لهذا المسار المهني.',
  },
  cert: {
    en: 'Convert your learning into a credential that strengthens your skills record.',
    ar: 'تحوّل تعلمك إلى اعتماد يعزز سجلك المهاري.',
  },
  activity: {
    en: 'Apply your learning in a real collaborative experience with visible outcomes.',
    ar: 'تطبق ما تعلمته في تجربة واقعية ذات مخرجات واضحة.',
  },
  workshop: {
    en: 'Sharpen a focused skill through a short, practical academic experience.',
    ar: 'تصقل مهارة محددة من خلال تجربة عملية قصيرة ومركزة.',
  },
  coop: {
    en: 'Move from academic readiness to professional workplace readiness.',
    ar: 'تنتقل من الجاهزية الأكاديمية إلى الجاهزية المهنية في بيئة العمل.',
  },
}

const STATUS_LABEL: Record<TrainingMilestoneStatus, { en: string; ar: string }> = {
  completed: { en: 'Completed', ar: 'مكتمل' },
  in_progress: { en: 'Current station', ar: 'المحطة الحالية' },
  upcoming: { en: 'Upcoming', ar: 'قادم' },
}

const TYPE_ICON: Record<TrainingMilestoneType, typeof BookOpen> = {
  course: BookOpen,
  cert: Award,
  activity: Activity,
  workshop: ClipboardCheck,
  coop: Briefcase,
}

const NODE_GAP = 240
const MAP_PADDING_X = 120
const MAP_HEIGHT = 570
const STATION_TOP_Y = 188
const STATION_BOTTOM_Y = 345

export default function TrainingPath() {
  const { isArabic } = useLanguage()
  const { savedAnalysis } = useAuth()

  const hasAssessment = !!savedAnalysis?.top_match
  const recommendedSlug = savedAnalysis?.top_match ?? 'software-engineer'
  const milestones = useMemo(
    () => trainingPathMilestones[recommendedSlug] ?? trainingPathMilestones.default,
    [recommendedSlug],
  )

  const completed = milestones.filter((m) => m.status === 'completed').length
  const total = milestones.length
  const currentIdx = milestones.findIndex((m) => m.status === 'in_progress')
  const currentMilestone = milestones[currentIdx] ?? milestones.find((m) => m.status !== 'completed') ?? milestones[0]
  const journeyComplete = total > 0 && completed === total
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const activeStage = currentMilestone
    ? STATUS_LABEL[currentMilestone.status][isArabic ? 'ar' : 'en']
    : (isArabic ? 'مكتمل' : 'Complete')
  const careerTitle = savedAnalysis?.top_match_label ?? (isArabic ? 'هندسة البرمجيات' : 'Software Engineering')

  const [mounted, setMounted] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(currentMilestone?.id ?? milestones[0]?.id ?? null)
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(currentMilestone?.id ?? null)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef({ active: false, startX: 0, scrollL: 0, moved: false })

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 80)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    setSelectedId(currentMilestone?.id ?? milestones[0]?.id ?? null)
    setExpandedMobileId(currentMilestone?.id ?? null)
  }, [currentMilestone?.id, milestones])

  useEffect(() => {
    if (!hasAssessment || !mounted) return
    const el = scrollRef.current?.querySelector('[data-current="true"]') as HTMLElement | null
    if (!el) return
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [hasAssessment, mounted])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !scrollRef.current) return
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollL: scrollRef.current.scrollLeft,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.active || !scrollRef.current) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) > 4) {
      d.moved = true
      setDragging(true)
    }
    if (d.moved) scrollRef.current.scrollLeft = d.scrollL - dx
  }

  const onPointerEnd = () => {
    dragRef.current.active = false
    if (dragRef.current.moved) {
      dragRef.current.moved = false
      setDragging(false)
    }
  }

  const selectedMilestone = milestones.find((m) => m.id === selectedId) ?? currentMilestone
  const mapWidth = MAP_PADDING_X * 2 + Math.max(total - 1, 0) * NODE_GAP + 260

  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark" dir={isArabic ? 'rtl' : 'ltr'}>
      <TrainingHero
        isArabic={isArabic}
        careerTitle={careerTitle}
        progressPct={progressPct}
        currentTitle={currentMilestone ? getTitle(currentMilestone, isArabic) : undefined}
        mounted={mounted}
      />

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        {!hasAssessment ? (
          <EmptyState isArabic={isArabic} />
        ) : (
          <div className="space-y-6">
            <JourneySummary
              isArabic={isArabic}
              completed={completed}
              total={total}
              progressPct={progressPct}
              currentMilestone={currentMilestone}
              careerTitle={careerTitle}
              activeStage={activeStage}
            />

            {currentMilestone && (
              <CurrentStationPanel
                milestone={currentMilestone}
                isArabic={isArabic}
                journeyComplete={journeyComplete}
              />
            )}

            <JourneyMap
              isArabic={isArabic}
              milestones={milestones}
              selectedId={selectedMilestone?.id ?? null}
              onSelect={setSelectedId}
              scrollRef={scrollRef}
              dragging={dragging}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerEnd={onPointerEnd}
              mapWidth={mapWidth}
              mounted={mounted}
              journeyComplete={journeyComplete}
              careerTitle={careerTitle}
            />

            {selectedMilestone && (
              <SelectedStationDetails milestone={selectedMilestone} isArabic={isArabic} />
            )}

            <MobileJourney
              milestones={milestones}
              isArabic={isArabic}
              expandedId={expandedMobileId}
              onToggle={(id) => setExpandedMobileId((curr) => curr === id ? null : id)}
              careerTitle={careerTitle}
              journeyComplete={journeyComplete}
            />
          </div>
        )}
      </main>
    </div>
  )
}

function TrainingHero({
  isArabic,
  careerTitle,
  progressPct,
  currentTitle,
  mounted,
}: {
  isArabic: boolean
  careerTitle: string
  progressPct: number
  currentTitle?: string
  mounted: boolean
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-imamu-gold/60" aria-hidden="true" />

      <motion.div
        className="relative mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11"
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
              <Map className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-imamu-warm-gold">
                {isArabic ? 'مسارك التدريبي المهني' : 'Professional Training Path'}
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                {isArabic ? 'خريطة الرحلة التعليمية' : 'Learning Journey Map'}
              </h1>
              <p className="mt-2 text-sm font-semibold text-imamu-navy-100">{careerTitle}</p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-imamu-navy-100 sm:text-[15px]">
                {isArabic
                  ? `خريطة موجهة من ${guideName('ar')} تقودك محطة بعد محطة من التعلم الأكاديمي إلى الجاهزية المهنية وسوق العمل.`
                  : `A ${guideName('en')}-guided roadmap that moves you station by station from academic learning to career readiness.`}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-imamu-navy-deep px-5 py-4 text-white shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-navy-100">
              {isArabic ? 'نسبة الإنجاز' : 'Progress'}
            </p>
            <div className="mt-2 flex items-end gap-3">
              <p className="font-display text-4xl font-extrabold text-imamu-warm-gold">{progressPct}%</p>
              {currentTitle && (
                <p className="mb-1 max-w-[220px] text-xs leading-5 text-imamu-navy-100">
                  {isArabic ? 'المحطة الحالية:' : 'Current station:'} {currentTitle}
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

function EmptyState({ isArabic }: { isArabic: boolean }) {
  return (
    <div className="rounded-[24px] border border-imamu-navy-50 bg-white p-8 text-center shadow-[0_18px_46px_rgba(4,93,132,0.09)]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-imamu-gold-50 text-imamu-gold-deep ring-1 ring-imamu-gold-100">
        <Bot className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="font-display text-xl font-bold text-imamu-dark">
        {isArabic ? 'رحلتك التدريبية بانتظارك' : 'Your training journey is waiting'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-imamu-dark/65">
        {isArabic
          ? `أكمل تقييمك المهني وسيبني ${guideName('ar')} خريطة محطاتك التدريبية بناءً على ميولك وأهدافك.`
          : `Complete your career assessment and ${guideName('en')} will build your training stations based on your interests and goals.`}
      </p>
      <Link
        to="/assessment"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-imamu-navy px-5 py-3 text-sm font-bold text-white transition hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/20"
      >
        {isArabic ? 'ابدأ التقييم' : 'Take the assessment'}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      </Link>
    </div>
  )
}

function JourneySummary({
  isArabic,
  completed,
  total,
  progressPct,
  currentMilestone,
  careerTitle,
  activeStage,
}: {
  isArabic: boolean
  completed: number
  total: number
  progressPct: number
  currentMilestone?: TrainingMilestone
  careerTitle: string
  activeStage: string
}) {
  const cards = [
    {
      label: isArabic ? 'نسبة الإنجاز' : 'Completion',
      value: `${progressPct}%`,
      helper: isArabic ? `أكملت ${completed} من ${total} محطات` : `${completed} of ${total} stations complete`,
      icon: Target,
      tone: 'gold' as const,
    },
    {
      label: isArabic ? 'المحطات المكتملة' : 'Completed stations',
      value: `${completed}/${total}`,
      helper: isArabic ? 'تم توثيقها في سجلك' : 'Tracked in your record',
      icon: CheckCircle2,
      tone: 'green' as const,
    },
    {
      label: isArabic ? 'المحطة الحالية' : 'Current station',
      value: currentMilestone ? getTitle(currentMilestone, isArabic) : activeStage,
      helper: currentMilestone ? TYPE_LABEL[currentMilestone.type][isArabic ? 'ar' : 'en'] : activeStage,
      icon: Compass,
      tone: 'gold' as const,
    },
    {
      label: isArabic ? 'الوجهة النهائية' : 'Final destination',
      value: isArabic ? 'جاهز لسوق العمل' : 'Job-market ready',
      helper: careerTitle,
      icon: Flag,
      tone: 'navy' as const,
    },
  ]

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <motion.div
          key={card.label}
          className="rounded-[20px] border border-imamu-navy-50 bg-white p-5 shadow-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1',
              card.tone === 'gold' && 'bg-imamu-gold-50 text-imamu-gold-deep ring-imamu-gold-100',
              card.tone === 'green' && 'bg-green-50 text-green-600 ring-green-100',
              card.tone === 'navy' && 'bg-imamu-navy-50 text-imamu-navy ring-imamu-navy-100',
            )}>
              <card.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            {card.tone === 'gold' && <span className="mt-1 h-2 w-2 rounded-full bg-imamu-gold" aria-hidden="true" />}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-imamu-dark/50">{card.label}</p>
          <p className="mt-1 line-clamp-2 font-display text-xl font-extrabold text-imamu-dark">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-imamu-dark/55">{card.helper}</p>
        </motion.div>
      ))}
    </section>
  )
}

function CurrentStationPanel({
  milestone,
  isArabic,
  journeyComplete,
}: {
  milestone: TrainingMilestone
  isArabic: boolean
  journeyComplete: boolean
}) {
  const TypeIcon = TYPE_ICON[milestone.type]
  const details = TYPE_DETAILS[milestone.type][isArabic ? 'ar' : 'en']

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-imamu-gold-100 bg-white p-5 shadow-[0_18px_46px_rgba(153,130,63,0.10)] sm:p-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-imamu-gold-50 text-imamu-gold-deep ring-1 ring-imamu-gold-100">
            <TypeIcon className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
              {journeyComplete ? (isArabic ? 'المسار مكتمل' : 'Journey complete') : (isArabic ? 'المحطة الحالية' : 'Current station')}
            </p>
            <h2 className="mt-2 font-display text-xl font-extrabold text-imamu-dark">
              {getTitle(milestone, isArabic)}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-imamu-dark/68">
              {TYPE_DESC[milestone.type][isArabic ? 'ar' : 'en']}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-imamu-navy-50 bg-imamu-navy-50 px-3 py-1 font-bold text-imamu-navy">
                {TYPE_LABEL[milestone.type][isArabic ? 'ar' : 'en']}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-imamu-navy-50 bg-white px-3 py-1 font-bold text-imamu-dark/60">
                <Clock className="h-3.5 w-3.5 text-imamu-navy" aria-hidden="true" />
                {milestone.duration}
              </span>
              <span className="rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-3 py-1 font-bold text-imamu-gold-deep">
                {isArabic ? 'الناتج المتوقع: رفع الجاهزية' : 'Outcome: stronger readiness'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:w-[260px]">
          {details.slice(0, 2).map((item, index) => (
            <div key={item} className="flex items-start gap-2 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/55 px-3 py-2 text-xs font-semibold text-imamu-dark/70">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-imamu-navy text-[10px] font-bold text-white">{index + 1}</span>
              <span>{item}</span>
            </div>
          ))}
          <a
            href="#journey-map"
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-imamu-navy px-4 py-3 text-sm font-bold text-white transition hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/20"
          >
            {isArabic ? 'متابعة المحطة' : 'Continue station'}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}

function JourneyMap({
  isArabic,
  milestones,
  selectedId,
  onSelect,
  scrollRef,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  mapWidth,
  mounted,
  journeyComplete,
  careerTitle,
}: {
  isArabic: boolean
  milestones: TrainingMilestone[]
  selectedId: string | null
  onSelect: (id: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  dragging: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerEnd: () => void
  mapWidth: number
  mounted: boolean
  journeyComplete: boolean
  careerTitle: string
}) {
  const positions = milestones.map((m, index) => ({
    id: m.id,
    x: MAP_PADDING_X + index * NODE_GAP,
    y: index % 2 === 0 ? STATION_TOP_Y : STATION_BOTTOM_Y,
  }))
  const destination = {
    x: MAP_PADDING_X + Math.max(milestones.length - 1, 0) * NODE_GAP + 210,
    y: 262,
  }

  return (
    <section id="journey-map" className="hidden md:block rounded-[24px] border border-imamu-navy-50 bg-white p-5 shadow-[0_18px_50px_rgba(4,93,132,0.09)]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imamu-gold-deep">
            {isArabic ? 'خريطة المحطات' : 'Station Map'}
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-imamu-dark">
            {isArabic ? 'تنقّل بين محطات المسار التدريبي' : 'Navigate the training path stations'}
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-imamu-navy-50 bg-imamu-navy-50/70 px-3 py-2 text-xs font-bold text-imamu-navy">
          {isArabic ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          {isArabic ? 'اسحب لاستكشاف المسار' : 'Drag to explore the route'}
          {isArabic ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'training-map-scroll select-none overflow-x-auto overflow-y-hidden rounded-[20px] border border-imamu-navy-50 bg-white',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ direction: 'ltr' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className="relative" style={{ width: mapWidth, height: MAP_HEIGHT }}>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.34]"
            style={{
              backgroundImage:
                'linear-gradient(var(--color-imamu-navy-50) 1px, transparent 1px), linear-gradient(90deg, var(--color-imamu-navy-50) 1px, transparent 1px)',
              backgroundSize: '42px 42px',
            }}
            aria-hidden="true"
          />
          <svg className="absolute inset-0" width={mapWidth} height={MAP_HEIGHT} aria-hidden="true">
            {positions.slice(0, -1).map((point, index) => {
              const next = positions[index + 1]
              const current = milestones[index]
              const nextMilestone = milestones[index + 1]
              const completedSegment = current.status === 'completed' && nextMilestone.status === 'completed'
              const activeSegment = current.status === 'completed' && nextMilestone.status === 'in_progress'
              return (
                <path
                  key={`${point.id}-${next.id}`}
                  d={routePath(point.x, point.y, next.x, next.y)}
                  fill="none"
                  stroke={completedSegment ? 'var(--color-imamu-navy)' : activeSegment ? 'var(--color-imamu-gold)' : 'var(--color-imamu-navy-100)'}
                  strokeWidth={activeSegment ? 4 : 3}
                  strokeLinecap="round"
                  strokeDasharray={completedSegment || activeSegment ? undefined : '9 10'}
                />
              )
            })}
            {positions.length > 0 && (
              <path
                d={routePath(positions[positions.length - 1].x, positions[positions.length - 1].y, destination.x, destination.y)}
                fill="none"
                stroke={journeyComplete ? 'var(--color-imamu-gold)' : 'var(--color-imamu-navy-100)'}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={journeyComplete ? undefined : '9 10'}
              />
            )}
          </svg>

          {milestones.map((milestone, index) => (
            <StationCard
              key={milestone.id}
              milestone={milestone}
              index={index}
              position={positions[index]}
              selected={selectedId === milestone.id}
              onSelect={() => onSelect(milestone.id)}
              isArabic={isArabic}
              mounted={mounted}
            />
          ))}

          <DestinationNode
            position={destination}
            journeyComplete={journeyComplete}
            careerTitle={careerTitle}
            isArabic={isArabic}
            mounted={mounted}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <LegendDot tone="completed" label={isArabic ? 'مكتمل' : 'Completed'} />
        <LegendDot tone="current" label={isArabic ? 'المحطة الحالية' : 'Current station'} />
        <LegendDot tone="upcoming" label={isArabic ? 'قادم' : 'Upcoming'} />
        <span className="text-[11px] font-semibold text-imamu-dark/45">
          {isArabic ? 'اختر أي محطة لعرض تفاصيلها أسفل الخريطة' : 'Select a station to review its details below the map'}
        </span>
      </div>

      <style>{`
        .training-map-scroll::-webkit-scrollbar { height: 6px; }
        .training-map-scroll::-webkit-scrollbar-track { background: var(--color-imamu-navy-50); border-radius: 999px; }
        .training-map-scroll::-webkit-scrollbar-thumb { background: var(--color-imamu-navy-100); border-radius: 999px; }
        .training-map-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-imamu-navy); }
      `}</style>
    </section>
  )
}

function StationCard({
  milestone,
  index,
  position,
  selected,
  onSelect,
  isArabic,
  mounted,
}: {
  milestone: TrainingMilestone
  index: number
  position: { x: number; y: number }
  selected: boolean
  onSelect: () => void
  isArabic: boolean
  mounted: boolean
}) {
  const isCompleted = milestone.status === 'completed'
  const isActive = milestone.status === 'in_progress'
  const isUpcoming = milestone.status === 'upcoming'
  const TypeIcon = TYPE_ICON[milestone.type]

  return (
    <motion.button
      type="button"
      data-current={isActive ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'absolute w-[190px] rounded-2xl border bg-white p-3 text-start shadow-[0_14px_34px_rgba(4,93,132,0.10)] transition hover:-translate-y-1',
        isCompleted && 'border-imamu-navy-50',
        isActive && 'border-imamu-gold-100 shadow-[0_18px_44px_rgba(153,130,63,0.16)] ring-4 ring-imamu-gold-50',
        isUpcoming && 'border-imamu-navy-100 opacity-90',
        selected && !isActive && 'ring-4 ring-imamu-navy-50',
      )}
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        direction: isArabic ? 'rtl' : 'ltr',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: mounted ? 1 : 0 }}
      transition={{ duration: 0.18 }}
    >
      {isActive && <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-imamu-gold" aria-hidden="true" />}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
            isCompleted && 'border-green-100 bg-green-50 text-green-600',
            isActive && 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
            isUpcoming && 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy/55',
          )}
        >
          {isCompleted ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : isUpcoming ? <Lock className="h-4 w-4" aria-hidden="true" /> : <TypeIcon className="h-5 w-5" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[10px] font-extrabold uppercase tracking-wider', isActive ? 'text-imamu-gold-deep' : isCompleted ? 'text-green-700' : 'text-imamu-navy/55')}>
            {isArabic ? `محطة ${index + 1}` : `Station ${index + 1}`}
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-imamu-dark">
            {getTitle(milestone, isArabic)}
          </h3>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={cn(
          'rounded-full border px-2 py-1 text-[10px] font-bold',
          isCompleted && 'border-green-100 bg-green-50 text-green-700',
          isActive && 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
          isUpcoming && 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy/60',
        )}>
          {STATUS_LABEL[milestone.status][isArabic ? 'ar' : 'en']}
        </span>
        <span className="rounded-full border border-imamu-navy-50 bg-white px-2 py-1 text-[10px] font-bold text-imamu-navy">
          {TYPE_LABEL[milestone.type][isArabic ? 'ar' : 'en']}
        </span>
      </div>
    </motion.button>
  )
}

function DestinationNode({
  position,
  journeyComplete,
  careerTitle,
  isArabic,
  mounted,
}: {
  position: { x: number; y: number }
  journeyComplete: boolean
  careerTitle: string
  isArabic: boolean
  mounted: boolean
}) {
  return (
    <motion.div
      className="absolute w-[210px] rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50/50 p-4 text-center shadow-sm"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)', direction: isArabic ? 'rtl' : 'ltr' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: mounted ? 1 : 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-imamu-gold-deep ring-1 ring-imamu-gold-100">
        {journeyComplete ? <Trophy className="h-6 w-6" aria-hidden="true" /> : <Flag className="h-6 w-6" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
        {isArabic ? 'الوجهة النهائية' : 'Final destination'}
      </p>
      <h3 className="mt-1 font-display text-base font-extrabold text-imamu-dark">
        {isArabic ? 'جاهز لسوق العمل' : 'Job-market ready'}
      </h3>
      <p className="mt-1 text-xs leading-5 text-imamu-dark/58">{careerTitle}</p>
    </motion.div>
  )
}

function SelectedStationDetails({ milestone, isArabic }: { milestone: TrainingMilestone; isArabic: boolean }) {
  const details = TYPE_DETAILS[milestone.type][isArabic ? 'ar' : 'en']
  const TypeIcon = TYPE_ICON[milestone.type]
  const isActive = milestone.status === 'in_progress'

  return (
    <motion.section
      className={cn(
        'hidden rounded-[22px] border bg-white p-5 shadow-[0_16px_42px_rgba(4,93,132,0.08)] md:block',
        isActive ? 'border-imamu-gold-100' : 'border-imamu-navy-50',
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      key={milestone.id}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex items-start gap-4">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1', isActive ? 'bg-imamu-gold-50 text-imamu-gold-deep ring-imamu-gold-100' : 'bg-imamu-navy-50 text-imamu-navy ring-imamu-navy-100')}>
            <TypeIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
              {STATUS_LABEL[milestone.status][isArabic ? 'ar' : 'en']}
            </p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-imamu-dark">{getTitle(milestone, isArabic)}</h2>
            <p className="mt-2 text-sm leading-7 text-imamu-dark/68">{TYPE_DESC[milestone.type][isArabic ? 'ar' : 'en']}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-imamu-navy-50 bg-imamu-navy-50 px-3 py-1 font-bold text-imamu-navy">
                {TYPE_LABEL[milestone.type][isArabic ? 'ar' : 'en']}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-imamu-navy-50 bg-white px-3 py-1 font-bold text-imamu-dark/60">
                <Clock className="h-3.5 w-3.5 text-imamu-navy" aria-hidden="true" />
                {milestone.duration}
              </span>
              {milestone.autoTracked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 font-bold text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {isArabic ? `موثق تلقائياً بواسطة ${guideName('ar')}` : `Auto-tracked by ${guideName('en')}`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-imamu-dark/55">
            {isArabic ? 'مخرجات المحطة' : 'Station outcomes'}
          </p>
          <div className="space-y-2">
            {details.map((item, index) => (
              <div key={item} className="flex items-start gap-2 text-sm text-imamu-dark/72">
                <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', milestone.status === 'completed' ? 'bg-green-600 text-white' : 'bg-imamu-navy text-white')}>
                  {milestone.status === 'completed' ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : index + 1}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function MobileJourney({
  milestones,
  isArabic,
  expandedId,
  onToggle,
  careerTitle,
  journeyComplete,
}: {
  milestones: TrainingMilestone[]
  isArabic: boolean
  expandedId: string | null
  onToggle: (id: string) => void
  careerTitle: string
  journeyComplete: boolean
}) {
  return (
    <section className="space-y-3 md:hidden">
      <div className="rounded-[20px] border border-imamu-navy-50 bg-white p-4 shadow-[0_14px_34px_rgba(4,93,132,0.08)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imamu-gold-deep">
          {isArabic ? 'تنقل بين المحطات' : 'Move through stations'}
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold text-imamu-dark">
          {isArabic ? 'خريطة الرحلة على الجوال' : 'Mobile journey map'}
        </h2>
      </div>

      {milestones.map((milestone, index) => {
        const expanded = expandedId === milestone.id
        const isCompleted = milestone.status === 'completed'
        const isActive = milestone.status === 'in_progress'
        const TypeIcon = TYPE_ICON[milestone.type]
        const details = TYPE_DETAILS[milestone.type][isArabic ? 'ar' : 'en']
        return (
          <div
            key={milestone.id}
            className={cn(
              'overflow-hidden rounded-[20px] border bg-white shadow-[0_14px_34px_rgba(4,93,132,0.07)]',
              isActive ? 'border-imamu-gold-100' : 'border-imamu-navy-50',
            )}
          >
            {isActive && <div className="h-1 bg-imamu-gold" aria-hidden="true" />}
            <button
              type="button"
              onClick={() => onToggle(milestone.id)}
              className="flex w-full items-center gap-3 p-4 text-start"
              aria-expanded={expanded}
            >
              <span
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
                  isCompleted && 'border-green-100 bg-green-50 text-green-600',
                  isActive && 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
                  !isCompleted && !isActive && 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy/55',
                )}
              >
                {isCompleted ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : isActive ? <TypeIcon className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('text-[10px] font-extrabold uppercase tracking-wider', isActive ? 'text-imamu-gold-deep' : isCompleted ? 'text-green-700' : 'text-imamu-navy/55')}>
                  {isArabic ? `محطة ${index + 1}` : `Station ${index + 1}`}
                </span>
                <span className="mt-1 block font-display text-[15px] font-bold leading-tight text-imamu-dark">
                  {getTitle(milestone, isArabic)}
                </span>
                <span className="mt-1 block text-xs font-semibold text-imamu-dark/55">
                  {TYPE_LABEL[milestone.type][isArabic ? 'ar' : 'en']} · {milestone.duration}
                </span>
              </span>
              <ChevronRight className={cn('h-4 w-4 shrink-0 text-imamu-navy transition-transform', expanded && 'rotate-90', isArabic && !expanded && 'rotate-180')} aria-hidden="true" />
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 border-t border-imamu-navy-50 px-4 pb-4 pt-3">
                    <p className="text-sm leading-7 text-imamu-dark/68">
                      {TYPE_DESC[milestone.type][isArabic ? 'ar' : 'en']}
                    </p>
                    <div className="rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-3">
                      <div className="space-y-2">
                        {details.map((item, detailIndex) => (
                          <div key={item} className="flex items-start gap-2 text-sm text-imamu-dark/70">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-imamu-navy text-[10px] font-bold text-white">
                              {detailIndex + 1}
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {isActive && (
                      <button type="button" className="w-full rounded-xl bg-imamu-navy px-4 py-3 text-sm font-bold text-white">
                        {isArabic ? 'متابعة المحطة' : 'Continue station'}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}

      <div className="rounded-[20px] border border-imamu-gold-100 bg-imamu-gold-50/50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-imamu-gold-deep ring-1 ring-imamu-gold-100">
            {journeyComplete ? <Trophy className="h-6 w-6" /> : <Flag className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
              {isArabic ? 'الوجهة النهائية' : 'Final destination'}
            </p>
            <h3 className="mt-1 font-display text-lg font-extrabold text-imamu-dark">
              {isArabic ? 'جاهز لسوق العمل' : 'Job-market ready'}
            </h3>
            <p className="mt-1 text-sm leading-6 text-imamu-dark/62">{careerTitle}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function LegendDot({ tone, label }: { tone: 'completed' | 'current' | 'upcoming'; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          tone === 'completed' && 'bg-green-600',
          tone === 'current' && 'bg-imamu-gold',
          tone === 'upcoming' && 'bg-imamu-navy-100',
        )}
        aria-hidden="true"
      />
      <span className="text-[11px] font-semibold text-imamu-dark/58">{label}</span>
    </span>
  )
}

function getTitle(milestone: TrainingMilestone, isArabic: boolean) {
  return isArabic ? (milestone.titleAr ?? milestone.title) : milestone.title
}

function routePath(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}
