import { guideName } from '@/components/shared/GuideName'
﻿import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, TrendingUp, Briefcase, Calendar, Brain, BookOpen, X, Rocket, Target, CheckCircle2, AlertCircle, Mic, MicOff, Video, VideoOff, PhoneOff, ClipboardCheck, UserCircle2, ArrowRight, Wifi, Bot, Award, Activity, Route as RouteIcon, Clock, Compass } from 'lucide-react'
import DashboardCard from '@/components/shared/DashboardCard'
import MatchBadge from '@/components/shared/MatchBadge'
import CompanyLogo from '@/components/shared/CompanyLogo'
import SalaryText from '@/components/shared/SalaryText'
import StatCard from '@/components/shared/StatCard'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import { useAuth } from '@/context/AuthContext'
import { fetchMyApplications, type MyApplication } from '@/lib/applications'
import { fetchStudentDashboard, type StudentDashboardData, type RecommendedCareerPath } from '@/lib/student-dashboard'
import CareerIcon from '@/components/shared/CareerIcon'
import { fetchActiveOpportunities } from '@/lib/opportunities'
import {
  applyMatchScores, fetchMatchContext, type MatchContext,
} from '@/lib/match-score'
import type { Opportunity } from '@/types'
import { autoTrackedAchievements, trainingPathMilestones } from '@/data/tamkeen-data'
import { startDemoTour } from '@/components/DemoTour'

// Calm institutional motion: a single short opacity fade on mount, no stagger,
// no vertical drift, no scroll-triggered reveal. The `delay` arg is accepted for
// call-site compatibility but intentionally ignored.
const fade = (_delay = 0) => ({ initial: { opacity: 0 } as const, animate: { opacity: 1 } as const, transition: { duration: 0.18 } })

// ── Application status meta (5-step canonical flow) ──
type AppStatus = 'submitted' | 'reviewed' | 'shortlisted' | 'accepted' | 'rejected' | 'cv_update_required'

interface StatusMeta {
  key: 'received' | 'under_review' | 'cv_update' | 'interview' | 'closed'
  labelEn: string
  labelAr: string
  pill: string
  dot: string
  iconColor: string
}

const STATUS_META: Record<AppStatus, StatusMeta> = {
  submitted: {
    key: 'received',
    labelEn: 'Received', labelAr: 'تم استلام الطلب',
    pill: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
    dot: 'bg-imamu-navy/50', iconColor: 'text-imamu-navy',
  },
  reviewed: {
    key: 'under_review',
    labelEn: 'Under Review', labelAr: 'قيد المراجعة',
    pill: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
    dot: 'bg-imamu-blue', iconColor: 'text-imamu-navy',
  },
  cv_update_required: {
    key: 'cv_update',
    labelEn: 'CV Update Required', labelAr: 'مطلوب تحديث السيرة',
    pill: 'bg-imamu-gold-50 text-imamu-gold-deep border-imamu-gold-100',
    dot: 'bg-imamu-gold', iconColor: 'text-imamu-gold-deep',
  },
  shortlisted: {
    key: 'interview',
    labelEn: 'Interview Invitation', labelAr: 'دعوة لمقابلة',
    pill: 'bg-imamu-sky/45 text-imamu-navy border-imamu-navy-100',
    dot: 'bg-imamu-navy', iconColor: 'text-imamu-navy',
  },
  accepted: {
    key: 'interview',
    labelEn: 'Accepted', labelAr: 'مقبول',
    pill: 'bg-green-50 text-green-700 border-green-100',
    dot: 'bg-green-500', iconColor: 'text-green-600',
  },
  rejected: {
    key: 'closed',
    labelEn: 'Closed', labelAr: 'مغلق',
    pill: 'bg-slate-100 text-imamu-dark/55 border-slate-200',
    dot: 'bg-slate-400', iconColor: 'text-imamu-dark/45',
  },
}

function MiniCircle({ percent }: { percent: number }) {
  const r = 18, c = 2 * Math.PI * r, offset = c - (percent / 100) * c
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3" className="stroke-imamu-navy-50" />
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-imamu-navy" style={{ strokeDasharray: c, strokeDashoffset: offset, transition: 'stroke-dashoffset 0.8s ease-out' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-imamu-navy">{percent}%</span>
    </div>
  )
}

interface MockInterview {
  company: string
  date: string
  time: string
  type: string
}

interface MockCourse {
  name: string
  provider: string
  progress: number
}

interface TrackedApp {
  id: string | number
  company: string
  role: string
  status: AppStatus
  date: string
}

function ApplicationDetailModal({ app, onClose, isArabic }: { app: TrackedApp; onClose: () => void; isArabic: boolean }) {
  const meta = STATUS_META[app.status]
  // Build a timeline based on current status — earlier events are all implicitly done.
  const orderedKeys: StatusMeta['key'][] = ['received', 'under_review', 'cv_update', 'interview', 'closed']
  const currentIdx = orderedKeys.indexOf(meta.key)
  const timeline = [
    { key: 'received' as const, en: 'Application received', ar: 'تم استلام الطلب' },
    { key: 'under_review' as const, en: 'Under review by recruiter', ar: 'قيد المراجعة من قبل المسؤول' },
    { key: 'cv_update' as const, en: 'CV update requested', ar: 'طُلب تحديث السيرة الذاتية' },
    { key: 'interview' as const, en: 'Invited to interview', ar: 'دعوة لإجراء مقابلة' },
    { key: 'closed' as const, en: 'Application closed', ar: 'تم إغلاق الطلب' },
  ].filter(item => {
    // Skip cv_update step unless that's the actual status for this app
    if (item.key === 'cv_update' && meta.key !== 'cv_update') return false
    return true
  })

  const dt = new Date(app.date)
  const dateStr = dt.toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-[#0F1D20] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-white/[0.06]">
          <button
            onClick={onClose}
            className="absolute top-4 end-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-bold">
            {isArabic ? 'تفاصيل الطلب' : 'Application Details'}
          </p>
          <h3 className="font-display text-xl font-bold text-white mt-1 pe-8">{app.role}</h3>
          <p className="text-sm text-white/55 mt-1">{app.company} · {dateStr}</p>

          <div className={cn('inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full border', meta.pill)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isArabic ? meta.labelAr : meta.labelEn}
            </span>
          </div>
        </div>

        {/* Timeline */}
        <div className="px-6 py-5">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-4">
            {isArabic ? 'سجل الحالة' : 'Status Timeline'}
          </p>
          <ol className="relative ms-[7px]">
            <div className="absolute start-0 top-2 bottom-2 w-px bg-white/[0.08]" />
            {timeline.map((item) => {
              const itemIdx = orderedKeys.indexOf(item.key)
              const done = itemIdx <= currentIdx
              const isCurrent = itemIdx === currentIdx
              return (
                <li key={item.key} className="relative ps-6 pb-4 last:pb-0">
                  <div className={cn(
                    'absolute start-0 top-0.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center',
                    done ? 'bg-imamu-navy border-imamu-navy' : 'bg-[#0F1D20] border-white/15',
                    isCurrent && 'ring-2 ring-imamu-navy/30',
                  )}>
                    {done && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <p className={cn('text-sm font-semibold leading-tight', done ? 'text-white/90' : 'text-white/40')}>
                    {isArabic ? item.ar : item.en}
                  </p>
                  {isCurrent && (
                    <p className="text-[11px] text-imamu-navy/80 mt-1 font-medium">
                      {isArabic ? 'الحالة الحالية' : 'Current status'}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white/90 hover:bg-white/[0.04] transition"
          >
            {isArabic ? 'إغلاق' : 'Close'}
          </button>
          {meta.key === 'cv_update' && (
            <Link
              to="/skills-record"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition"
            >
              {isArabic ? 'حدّث السيرة' : 'Update CV'}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          )}
          {meta.key === 'interview' && (
            <Link
              to="/interview-prep"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-imamu-navy text-white hover:bg-imamu-navy-deep transition"
            >
              {isArabic ? 'استعد للمقابلة' : 'Prepare Interview'}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function CourseDetailModal({ course, onClose, isArabic }: { course: MockCourse; onClose: () => void; isArabic: boolean }) {
  const syllabus = isArabic
    ? ['مقدمة وأساسيات', 'مفاهيم متقدمة', 'تمارين عملية', 'مشروع نهائي', 'الاختبار والشهادة']
    : ['Introduction & Fundamentals', 'Advanced Concepts', 'Hands-on Exercises', 'Final Project', 'Assessment & Certification']
  const completed = course.progress === 100
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-[#0F1D20] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-imamu-navy/15 via-imamu-navy-deep/10 to-transparent border-b border-white/[0.06]">
          <button
            onClick={onClose}
            className="absolute top-4 end-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-imamu-navy/15 border border-imamu-navy/25 flex items-center justify-center shrink-0">
              <BookOpen className="w-7 h-7 text-imamu-blue" />
            </div>
            <div className="flex-1 min-w-0 pe-8">
              <p className="text-[11px] uppercase tracking-wider text-imamu-blue/80 font-bold">
                {isArabic ? 'دورة' : 'Course'}
              </p>
              <h3 className="font-display text-xl font-bold text-white mt-0.5">{course.name}</h3>
              <p className="text-sm text-white/55 mt-1">{course.provider}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white/60">
                {isArabic ? 'تقدمك' : 'Your Progress'}
              </span>
              <span className="text-xs font-bold text-imamu-navy">{course.progress}%</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', completed ? 'bg-green-500' : 'bg-imamu-navy')}
                initial={{ width: 0 }}
                animate={{ width: `${course.progress}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-3">
            {isArabic ? 'محتوى الدورة' : 'Syllabus'}
          </p>
          <ul className="space-y-2">
            {syllabus.map((item, i) => {
              const itemDone = (i / syllabus.length) * 100 < course.progress
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold',
                    itemDone ? 'bg-green-500/20 text-green-400' : 'bg-white/[0.06] text-white/40',
                  )}>
                    {itemDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn('text-sm font-medium', itemDone ? 'text-white/80' : 'text-white/50')}>{item}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white/90 hover:bg-white/[0.04] transition"
          >
            {isArabic ? 'إغلاق' : 'Close'}
          </button>
          <button
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-imamu-navy text-white hover:bg-imamu-navy-deep hover:shadow-lg hover:shadow-imamu-navy/20 transition"
          >
            {completed ? (isArabic ? 'عرض الشهادة' : 'View Certificate') : (isArabic ? 'متابعة التعلم' : 'Continue Learning')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function InterviewRoomModal({ interview, onClose, isArabic }: { interview: MockInterview; onClose: () => void; isArabic: boolean }) {
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const initials = interview.company.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-3xl bg-[#0F1D20] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top status bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
              {isArabic ? 'مباشر' : 'Live'}
            </span>
            <span className="text-xs text-white/40">·</span>
            <span className="text-xs text-white/60">{interview.company} · {interview.type}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-green-400">
            <Wifi className="w-3.5 h-3.5" />
            <span className="font-semibold">{isArabic ? 'جودة الاتصال: ممتازة' : 'Connection: Excellent'}</span>
          </div>
        </div>

        {/* Video tiles */}
        <div className="relative aspect-video bg-gradient-to-br from-[#0a1518] via-[#0F1D20] to-[#0a1518]">
          {/* Main interviewer tile */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-imamu-navy to-imamu-navy-deep flex items-center justify-center shadow-2xl">
              <span className="font-display text-4xl font-extrabold text-white">{initials}</span>
            </div>
          </div>
          <div className="absolute bottom-4 start-4 px-3 py-1.5 rounded-lg bg-black/60 text-xs text-white font-semibold">
            {isArabic ? 'مسؤول التوظيف' : 'Recruiter'} · {interview.company}
          </div>

          {/* Self preview */}
          <div className="absolute bottom-4 end-4 w-36 h-24 rounded-xl bg-gradient-to-br from-imamu-dark to-[#0a1518] border-2 border-white/15 overflow-hidden flex items-center justify-center">
            {camOn ? (
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <UserCircle2 className="w-7 h-7 text-white/60" />
              </div>
            ) : (
              <VideoOff className="w-7 h-7 text-white/30" />
            )}
            <div className="absolute bottom-1 start-1 text-[10px] text-white/70 font-bold bg-black/50 px-1.5 py-0.5 rounded">
              {isArabic ? 'أنت' : 'You'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 py-5 bg-white/[0.02] border-t border-white/[0.06]">
          <button
            onClick={() => setMicOn(v => !v)}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition',
              micOn ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
            )}
            aria-label="Toggle microphone"
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setCamOn(v => !v)}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition',
              camOn ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
            )}
            aria-label="Toggle camera"
          >
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="px-5 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2 transition"
          >
            <PhoneOff className="w-5 h-5" />
            {isArabic ? 'إنهاء المكالمة' : 'End Call'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

interface JourneyStepDef {
  key: string
  icon: typeof Brain
  label: string
  done: boolean
  href: string
  nextActionTitle: string
  nextActionBullets: string[]
  ctaLabel: string
}

interface RecommendedActionDef {
  title: string
  description: string
  cta: string
  href: string
  icon: React.ReactNode
  impact?: string
  priority?: boolean
  complete?: boolean
}

function RecommendedActionCard({ action, index }: { action: RecommendedActionDef; index: number }) {
  return (
    <motion.div {...fade(0.08 + index * 0.04)}>
      <Link
        to={action.href}
        className="group relative block h-full overflow-hidden rounded-2xl border border-imamu-navy-50 bg-white p-5 shadow-[0_14px_34px_rgba(4,93,132,0.07)] transition duration-200 hover:-translate-y-0.5 hover:border-imamu-navy-100 hover:shadow-[0_18px_42px_rgba(4,93,132,0.11)]"
      >
        {action.priority && (
          <span className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
        )}
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1',
              action.priority
                ? 'bg-imamu-gold-50 text-imamu-gold-deep ring-imamu-gold-100'
                : 'bg-imamu-navy-50 text-imamu-navy ring-imamu-navy-100',
            )}
          >
            {action.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[15px] font-bold text-imamu-dark">{action.title}</h3>
              {action.complete && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-imamu-dark/65">{action.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-imamu-navy px-3.5 py-2 text-xs font-bold text-white transition group-hover:bg-imamu-navy-deep">
                {action.cta}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </span>
              {action.impact && (
                <span className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] font-bold',
                  action.priority
                    ? 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep'
                    : 'border-imamu-navy-50 bg-imamu-navy-50/70 text-imamu-navy',
                )}>
                  {action.impact}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function MissionCard({
  step,
  isArabic,
  progressPercent,
  completedCount,
  totalSteps,
}: {
  step: JourneyStepDef
  isArabic: boolean
  progressPercent: number
  completedCount: number
  totalSteps: number
}) {
  return (
    <motion.section
      className="mx-auto mt-6 max-w-[1600px] px-4 sm:px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="relative overflow-hidden rounded-[24px] border border-imamu-gold-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
        <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-imamu-gold-50 text-imamu-gold-deep ring-1 ring-imamu-gold-100">
              <step.icon className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
                {isArabic ? 'خطوتك التالية' : 'Your Next Step'}
              </p>
              <h2 className="mt-2 font-display text-xl font-extrabold text-imamu-dark sm:text-2xl">
                {step.nextActionTitle}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-imamu-dark/68">
                {isArabic
                  ? `هذه هي المهمة الأكثر تأثيراً الآن في رحلتك المهنية. إكمالها يساعد ${guideName('ar')} على تحسين التوصيات وربطك بفرص أدق.`
                  : `This is the most useful mission in your journey right now. Completing it helps ${guideName('en')} improve recommendations and connect you to stronger opportunities.`}
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {step.nextActionBullets.map((bullet, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 px-3 py-2 text-sm text-imamu-dark/72">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-imamu-gold" aria-hidden="true" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/40 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-dark/50">
              {isArabic ? 'تقدمك العام' : 'Overall progress'}
            </p>
            <div className="mt-2 flex items-end gap-3">
              <p className="font-display text-4xl font-extrabold text-imamu-dark">{progressPercent}%</p>
              <p className="pb-1 text-xs font-semibold leading-5 text-imamu-dark/58">
                {isArabic ? `أكملت ${completedCount} من ${totalSteps} خطوات` : `${completedCount} of ${totalSteps} steps completed`}
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white ring-1 ring-imamu-navy-50">
              <div
                className="h-full rounded-full bg-imamu-navy"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <Link
              to={step.href}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-imamu-navy px-4 py-3 text-sm font-bold text-white transition hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/20"
            >
              {step.ctaLabel}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

export default function StudentDashboard() {
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeInterview, setActiveInterview] = useState<MockInterview | null>(null)
  const [activeCourse, setActiveCourse] = useState<MockCourse | null>(null)
  const [activeApp, setActiveApp] = useState<TrackedApp | null>(null)
  const [myApplications, setMyApplications] = useState<MyApplication[]>([])
  const [dashData, setDashData] = useState<StudentDashboardData | null>(null)
  const [studentOpps, setStudentOpps] = useState<Opportunity[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    fetchMyApplications(user.id)
      .then((rows) => { if (!cancelled) setMyApplications(rows) })
      .catch(() => { /* surface later if needed */ })

    fetchStudentDashboard(user.id)
      .then((d) => { if (!cancelled) setDashData(d) })
      .catch(() => { /* surface later if needed */ })

    // Top recommended opportunities, with match scoring when available.
    Promise.all([fetchActiveOpportunities(), fetchMatchContext(user.id, 'student')])
      .then(([opps, ctx]: [Opportunity[], MatchContext]) => {
        if (cancelled) return
        const scored = applyMatchScores(opps, ctx)
        const top = [...scored]
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 3)
        setStudentOpps(top)
      })
      .catch(() => { /* fail silently — card will show empty state */ })

    return () => { cancelled = true }
  }, [user])

  // Adapt MyApplication[] → the TrackedApp shape used by the existing UI.
  const trackedApps: TrackedApp[] = myApplications.map((a) => ({
    id: a.id,
    company: isArabic ? (a.companyAr ?? a.company) : a.company,
    role: isArabic ? (a.roleAr ?? a.role) : a.role,
    status: a.status as AppStatus,
    date: a.appliedAt,
  }))

  const topMatch: RecommendedCareerPath | null = dashData?.recommended ?? null

  // ── Journey state shared between the Next Step card and the stepper ──
  const assessmentDone = dashData?.assessmentCompleted ?? false
  const cvScore = dashData?.cvScore ?? 0
  const profileCompletion = dashData?.profileCompletion ?? 0
  const skills = dashData?.skills ?? []
  const hasApplications = trackedApps.length > 0
  const hasCourses = false // courses were merged into opportunities; surfaced separately
  const hasInterviews = false // interview-creation flow not yet built

  const rawJourneySteps: JourneyStepDef[] = [
    {
      key: 'profile', icon: UserCircle2, label: isArabic ? 'الملف' : 'Profile',
      done: true, href: '/skills-record',
      nextActionTitle: isArabic ? 'أكمل ملفك الشخصي' : 'Complete your profile',
      nextActionBullets: [
        isArabic ? 'أضف صورتك الشخصية' : 'Add a profile picture',
        isArabic ? 'حدّث معلوماتك الأساسية' : 'Update your basic info',
      ],
      ctaLabel: isArabic ? 'تعديل الملف' : 'Edit Profile',
    },
    {
      key: 'assessment', icon: Brain, label: isArabic ? 'التقييم' : 'Assessment',
      done: assessmentDone, href: '/assessment',
      nextActionTitle: isArabic ? 'ابدأ التقييم المهني' : 'Take the Career Assessment',
      nextActionBullets: [
        isArabic ? 'أجب على 15 سؤالاً سريعاً' : 'Answer 15 quick questions',
        isArabic ? 'اكتشف أفضل المسارات المناسبة لك' : 'Discover your top career matches',
        isArabic ? 'يستغرق 5 دقائق فقط' : 'Takes only 5 minutes',
      ],
      ctaLabel: isArabic ? 'ابدأ التقييم' : 'Start Assessment',
    },
    {
      key: 'cv', icon: FileText, label: isArabic ? 'السيرة' : 'CV',
      done: cvScore > 0, href: '/skills-record',
      nextActionTitle: isArabic ? 'ابنِ سيرتك الذاتية' : 'Build your CV',
      nextActionBullets: [
        isArabic ? 'أضف تعليمك وخبراتك' : 'Add your education & experience',
        isArabic ? 'اختر قالباً احترافياً' : 'Pick a professional template',
        isArabic ? 'استهدف 80%+ من النتيجة' : 'Aim for 80%+ score',
      ],
      ctaLabel: isArabic ? 'ابنِ السيرة' : 'Build CV',
    },
    {
      key: 'skills', icon: BookOpen, label: isArabic ? 'المهارات' : 'Skills',
      done: hasCourses, href: '/opportunities?category=training',
      nextActionTitle: isArabic ? 'طوّر مهاراتك' : 'Develop your skills',
      nextActionBullets: [
        isArabic ? 'تصفح الدورات والبرامج التدريبية' : 'Browse courses & training programs',
        isArabic ? 'اشترك في أول دورة لك' : 'Enroll in your first course',
      ],
      ctaLabel: isArabic ? 'استكشف الدورات' : 'Explore Courses',
    },
    {
      key: 'interview', icon: Mic, label: isArabic ? 'المقابلة' : 'Interview',
      done: hasInterviews, href: '/interview-prep',
      nextActionTitle: isArabic ? 'تدرّب على المقابلات' : 'Practice mock interviews',
      nextActionBullets: [
        isArabic ? 'تدرب على أسئلة شائعة' : 'Practice common questions',
        isArabic ? 'احصل على ملاحظات فورية' : 'Get instant feedback',
        isArabic ? 'ابنِ ثقتك أمام الكاميرا' : 'Build on-camera confidence',
      ],
      ctaLabel: isArabic ? 'ابدأ التدريب' : 'Start Practice',
    },
    {
      key: 'apply', icon: Briefcase, label: isArabic ? 'التقديم' : 'Apply',
      done: hasApplications, href: '/opportunities',
      nextActionTitle: isArabic ? 'قدّم على فرص مناسبة' : 'Apply to matching opportunities',
      nextActionBullets: [
        topMatch
          ? (isArabic ? `أفضل تطابق لك: ${l(topMatch, 'title')}` : `Your top match: ${l(topMatch, 'title')}`)
          : (isArabic ? 'استعرض الفرص المُوصى بها' : 'Browse personalised opportunities'),
        isArabic ? 'جد 3 فرص تناسبك' : 'Find 3 opportunities that fit',
        isArabic ? 'قدّم أول طلب لك اليوم' : 'Submit your first application today',
      ],
      ctaLabel: isArabic ? 'استكشف الفرص' : 'Explore Opportunities',
    },
    {
      key: 'track', icon: ClipboardCheck, label: isArabic ? 'المتابعة' : 'Track',
      done: hasApplications, href: '/applications',
      nextActionTitle: isArabic ? 'تابع طلباتك' : 'Track your applications',
      nextActionBullets: [
        isArabic ? 'راقب حالة كل طلب' : 'Monitor each application status',
        isArabic ? 'كن جاهزاً للردود' : 'Stay ready for responses',
      ],
      ctaLabel: isArabic ? 'عرض الطلبات' : 'View Applications',
    },
  ]
  // Cascade done so the stepper reads as linear progress.
  let prevDone = true
  const journeySteps = rawJourneySteps.map((s) => {
    const done = prevDone && s.done
    prevDone = done
    return { ...s, done }
  })
  const completedCount = journeySteps.filter(s => s.done).length
  const progressPercent = Math.round((completedCount / journeySteps.length) * 100)
  const nextStep = journeySteps.find(s => !s.done) ?? null
  const profileNeedsAction = profileCompletion < 100
  const cvNeedsAction = cvScore < 80
  const recommendedActions: RecommendedActionDef[] = [
    {
      title: isArabic ? 'أكمل ملفك' : 'Complete your profile',
      description: isArabic ? 'حدّث بياناتك ومهاراتك حتى تظهر توصيات أدق.' : 'Keep your details and skills current for sharper recommendations.',
      cta: isArabic ? 'تحديث الملف' : 'Update profile',
      href: '/profile',
      icon: <UserCircle2 className="h-5 w-5" aria-hidden="true" />,
      impact: isArabic ? 'يحسن المطابقة' : 'Improves matching',
      priority: profileNeedsAction,
      complete: !profileNeedsAction,
    },
    {
      title: isArabic ? 'ابن سيرتك' : 'Build your CV',
      description: isArabic ? 'ارفع جودة السيرة ووجّهها للفرص الجامعية والمهنية.' : 'Improve your CV score and tailor it for university career opportunities.',
      cta: isArabic ? 'فتح السيرة' : 'Open CV',
      href: '/skills-record',
      icon: <FileText className="h-5 w-5" aria-hidden="true" />,
      impact: isArabic ? 'يرفع الجاهزية' : 'Raises readiness',
      priority: cvNeedsAction,
      complete: !cvNeedsAction,
    },
    {
      title: isArabic ? 'أضف مهاراتك وشهاداتك' : 'Add skills and certificates',
      description: isArabic ? 'وثّق مهاراتك وشهاداتك ليظهر سجلك المهاري بقوة.' : 'Document skills and certificates so your skills record carries more weight.',
      cta: isArabic ? 'تحديث المهارات' : 'Update skills',
      href: '/skills-record',
      icon: <Award className="h-5 w-5" aria-hidden="true" />,
      impact: isArabic ? 'يدعم السجل المهاري' : 'Supports your record',
      priority: skills.length === 0,
      complete: skills.length > 0,
    },
    {
      title: isArabic ? 'ابدأ المقابلة' : 'Start interview practice',
      description: isArabic ? 'تدرّب على أسئلة المقابلات واكتسب ثقة قبل التقديم.' : 'Practice common interview questions before you apply.',
      cta: isArabic ? 'ابدأ التدريب' : 'Start practice',
      href: '/interview-prep',
      icon: <Mic className="h-5 w-5" aria-hidden="true" />,
      impact: isArabic ? 'يدعم التوظيف' : 'Supports hiring',
      priority: !hasInterviews,
    },
    {
      title: isArabic ? 'استعرض الفرص' : 'Browse opportunities',
      description: isArabic ? 'انتقل إلى الفرص المتوافقة مع مسارك ومهاراتك.' : 'Review opportunities that align with your path and skills.',
      cta: isArabic ? 'استعراض الفرص' : 'Browse now',
      href: '/opportunities',
      icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
      impact: isArabic ? 'يربطك بالفرص' : 'Connects to roles',
      priority: !hasApplications,
      complete: hasApplications,
    },
  ]

  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark">
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1600px] px-4 py-7 sm:px-6 sm:py-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
                <Rocket className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-imamu-warm-gold">
                  {isArabic ? 'منصة تمكين المهنية' : 'Tamkeen Career Platform'}
                </p>
                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {isArabic ? 'رحلتي المهنية' : 'My Career Journey'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-imamu-navy-100 sm:text-[15px]">
                  {topMatch
                    ? (isArabic
                        ? `أفضل تطابق لك هو ${l(topMatch, 'title')} بنسبة ${topMatch.matchPercent}%. ركّز الآن على الخطوة التالية لرفع جاهزيتك.`
                        : `Your top match is ${l(topMatch, 'title')} at ${topMatch.matchPercent}%. Focus on the next step to strengthen your readiness.`)
                    : (isArabic
                        ? 'ابدأ بتقييم المسار المهني، ثم ابنِ ملفك وسيرتك للوصول إلى الفرص المناسبة.'
                        : 'Start with the career assessment, then build your profile and CV to reach the right opportunities.')}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
              <div className="min-w-[220px] rounded-2xl border border-imamu-navy-50 bg-white px-4 py-3 text-imamu-dark shadow-lg shadow-black/10">
                <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-navy-100">
                  {isArabic ? 'تقدم الرحلة' : 'Journey Progress'}
                </p>
                <div className="mt-1 flex items-end gap-2">
                  <p className="font-display text-3xl font-extrabold leading-none text-imamu-gold-deep">{progressPercent}%</p>
                  <p className="pb-0.5 text-xs font-semibold text-imamu-dark/60">
                    {isArabic ? `${completedCount} من ${journeySteps.length} خطوات` : `${completedCount} of ${journeySteps.length} steps`}
                  </p>
                </div>
                {nextStep && (
                  <p className="mt-2 line-clamp-1 text-xs font-semibold text-imamu-navy">
                    {isArabic ? 'التالي: ' : 'Next: '}{nextStep.label}
                  </p>
                )}
              </div>
              <button
                onClick={() => startDemoTour({ lang: isArabic ? 'ar' : 'en', navigate })}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-imamu-navy-100 bg-white px-4 py-3 text-sm font-bold text-imamu-navy shadow-lg shadow-black/10 transition hover:border-imamu-gold-100 hover:bg-imamu-gold-50 hover:text-imamu-gold-deep"
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                {isArabic ? 'ابدأ جولة تعريفية' : 'Start demo tour'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {nextStep ? (
        <MissionCard
          step={nextStep}
          isArabic={isArabic}
          progressPercent={progressPercent}
          completedCount={completedCount}
          totalSteps={journeySteps.length}
        />
      ) : (
        <motion.div
          className="mx-auto mt-6 max-w-[1600px] px-4 sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-imamu-navy-50 bg-white p-5 shadow-sm sm:p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-green-500" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-600 ring-1 ring-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-imamu-dark">
                  {isArabic ? 'أحسنت، رحلتك محدّثة' : "You're all caught up"}
                </h2>
                <p className="text-sm text-imamu-dark/65 mt-1">
                  {isArabic
                    ? 'حافظ على ملفك محدثاً وتابع الفرص الجديدة كل يوم.'
                    : 'Keep your profile fresh and check back daily for new opportunities.'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        // Match the rest of the page (`mx-auto max-w-[1600px] px-4 sm:px-6`) so
        // the journey card aligns with the hero, mission, stats, and
        // suggested-actions sections at every viewport width.
        className="mx-auto mt-6 max-w-[1600px] px-4 sm:px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
      <div data-tour="sd-journey" className="relative overflow-hidden rounded-[24px] border border-imamu-navy-50 bg-white p-5 shadow-sm sm:p-6">
        <div className="relative flex items-start justify-between gap-4 px-1 mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-imamu-gold-deep font-bold">
              {isArabic ? 'رحلتك المهنية' : 'Your Journey'}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-imamu-dark">
              {isArabic
                ? `أكملت ${completedCount} من ${journeySteps.length} خطوات`
                : `${completedCount} of ${journeySteps.length} steps completed`}
            </h2>
            {nextStep && (
              <p className="mt-1 text-sm font-medium text-imamu-dark/58">
                {isArabic ? 'المحطة التالية في رحلتك: ' : 'Next station in your journey: '}
                <span className="font-bold text-imamu-gold-deep">{nextStep.label}</span>
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50 px-4 py-2 text-end">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
              {isArabic ? 'الجاهزية' : 'Readiness'}
            </p>
            <p className="font-display text-2xl font-extrabold leading-none text-imamu-gold-deep">
              {progressPercent}%
            </p>
          </div>
        </div>

        <div className="relative h-1.5 bg-imamu-navy-50 rounded-full overflow-hidden mb-6 mx-1">
          <motion.div
            className="h-full bg-imamu-navy rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          />
        </div>

        <div className="relative overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
          <div className="flex min-w-[720px] items-start">
            {journeySteps.map((step, i) => {
              const isCurrent = nextStep?.key === step.key
              return (
                <div key={step.key} className="flex flex-1 items-start">
                  <Link
                    to={step.href}
                    className="group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl px-1 py-2 transition duration-200 hover:bg-imamu-navy-50/55"
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        step.done && 'border-imamu-navy bg-imamu-navy text-white',
                        isCurrent && !step.done && 'border-imamu-gold bg-white text-imamu-gold-deep ring-4 ring-imamu-gold-50',
                        !step.done && !isCurrent && 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy/45',
                      )}
                    >
                      {step.done
                        ? <CheckCircle2 className="w-5 h-5" />
                        : <step.icon className="w-[18px] h-[18px]" />
                      }
                    </div>
                    <span
                      className={cn(
                        'w-full truncate text-center text-[11px] font-bold',
                        step.done && 'text-imamu-navy',
                        isCurrent && !step.done && 'text-imamu-gold-deep',
                        !step.done && !isCurrent && 'text-imamu-dark/45',
                      )}
                    >
                      {step.label}
                    </span>
                    {isCurrent && !step.done && (
                      <span className="rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
                        {isArabic ? 'الحالي' : 'Current'}
                      </span>
                    )}
                  </Link>
                  {i < journeySteps.length - 1 && (
                    <div className="flex h-10 w-8 shrink-0 items-center">
                      <span
                        className={cn(
                          'h-px w-full rounded-full',
                          journeySteps[i + 1].done ? 'bg-imamu-navy' : 'bg-imamu-navy-100',
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </motion.div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-8 mb-8" data-tour="dashboard-stats">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            variant="light"
            attention={cvNeedsAction}
            icon={<FileText className={cn('w-5 h-5', cvNeedsAction ? 'text-imamu-gold-deep' : 'text-imamu-navy')} />}
            iconBg={cvNeedsAction ? 'bg-imamu-gold-50 ring-1 ring-imamu-gold-100' : 'bg-imamu-navy-50 ring-1 ring-imamu-navy-100'}
            value={`${cvScore}%`}
            label={t('dashboard.cvScore')}
            helper={isArabic ? 'أضف مهاراتك وشهاداتك لرفع الجاهزية' : 'Add skills and certificates to raise readiness'}
            progress={cvScore}
            progressColor={cvNeedsAction ? 'bg-imamu-gold' : 'bg-imamu-navy'}
            index={0}
          />
          <StatCard
            variant="light"
            attention={profileNeedsAction}
            icon={<TrendingUp className={cn('w-5 h-5', profileNeedsAction ? 'text-imamu-gold-deep' : 'text-green-600')} />}
            iconBg={profileNeedsAction ? 'bg-imamu-gold-50 ring-1 ring-imamu-gold-100' : 'bg-green-50 ring-1 ring-green-100'}
            value={`${profileCompletion}%`}
            label={t('dashboard.profileComplete')}
            helper={isArabic ? 'أكمل بياناتك لتحسين المطابقة' : 'Complete your profile to improve matching'}
            progress={profileCompletion}
            progressColor={profileNeedsAction ? 'bg-imamu-gold' : 'bg-green-500'}
            index={1}
          />
          <StatCard
            variant="light"
            icon={<Briefcase className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(trackedApps.length)}
            label={t('dashboard.applications')}
            helper={trackedApps.length > 0 ? (isArabic ? 'تابع حالة طلباتك أولاً بأول' : 'Track application status as it changes') : (isArabic ? 'ابدأ بتقديم أول طلب مناسب' : 'Start by applying to one suitable role')}
            index={2}
          />
          <StatCard
            variant="light"
            icon={<Bot className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(autoTrackedAchievements.total)}
            label={t('dashboard.autoTracked')}
            helper={isArabic ? `إنجازات موثقة تلقائياً بواسطة ${guideName('ar')}` : `Achievements auto-tracked by ${guideName('en')}`}
            index={3}
          />
        </div>
      </div>

      <section className="mx-auto max-w-[1600px] px-4 sm:px-6 mb-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imamu-gold-deep">
              {isArabic ? 'إجراءات مقترحة' : 'Recommended Actions'}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-imamu-dark">
              {isArabic ? 'ركّز على ما يرفع جاهزيتك' : 'Focus on what improves readiness'}
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {recommendedActions.map((action, index) => (
            <RecommendedActionCard key={action.href} action={action} index={index} />
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pb-12">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-6">
            <motion.div {...fade(0)}>
              <DashboardCard variant="light" id="career-assessment" title={isArabic ? 'توصية المسار المهني' : 'Career Path Recommendation'} icon={<Brain className="w-[18px] h-[18px] text-imamu-navy" />} action={topMatch ? { label: isArabic ? 'عرض النتائج' : 'View Results', href: '/assessment' } : undefined}>
                {topMatch ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-imamu-gold-100 bg-imamu-gold-50/50 p-4">
                      {/* "Best match" header sits above the row so it
                          doesn't collide with the MiniCircle, which lives
                          at the inline-end of the flex row. */}
                      <span className="inline-flex text-[10px] font-extrabold uppercase tracking-wider text-imamu-gold-deep mb-3">
                        {isArabic ? 'أفضل تطابق' : 'Best match'}
                      </span>
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-white text-imamu-navy ring-1 ring-imamu-navy-100 flex items-center justify-center shrink-0">
                          <CareerIcon slug={topMatch.slug} className="w-[22px] h-[22px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-imamu-dark">{l(topMatch, 'title')}</p>
                          <p className="text-xs text-imamu-dark/60 mt-0.5 truncate">{l(topMatch, 'description')}</p>
                        </div>
                        <MiniCircle percent={topMatch.matchPercent} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        to="/assessment"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-imamu-navy px-3 py-2.5 text-xs font-bold text-white transition hover:bg-imamu-navy-deep"
                      >
                        {isArabic ? 'عرض النتائج' : 'View results'}
                        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                      <Link
                        to="/careers"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-imamu-navy-100 bg-white px-3 py-2.5 text-xs font-bold text-imamu-navy transition hover:bg-imamu-navy-50"
                      >
                        {isArabic ? 'كل المسارات' : 'All paths'}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Brain className="w-9 h-9 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60 mb-3">
                      {isArabic ? 'خذ التقييم لاكتشاف مسارك المناسب' : 'Take the assessment to find your best-fit path'}
                    </p>
                    <Link
                      to="/assessment"
                      className="inline-flex items-center gap-1.5 bg-imamu-navy text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-imamu-navy-deep transition"
                    >
                      {isArabic ? 'ابدأ التقييم' : 'Start Assessment'}
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </DashboardCard>
            </motion.div>

            {/* Training Path Progress — first 4 milestones for the student's
                recommended path. Mirrors /training-path but compact. */}
            <motion.div {...fade(0.05)}>
              <DashboardCard
                variant="light"
                id="training-path"
                title={t('dashboard.trainingPathProgress')}
                icon={<RouteIcon className="w-[18px] h-[18px] text-imamu-navy" />}
                action={{ label: t('dashboard.viewFullPath'), href: '/training-path' }}
              >
                {(() => {
                  const slug = topMatch?.slug ?? 'software-engineer'
                  const milestones = (trainingPathMilestones[slug] ?? trainingPathMilestones.default).slice(0, 4)
                  const done = milestones.filter((m) => m.status === 'completed').length
                  const pct = Math.round((done / milestones.length) * 100)
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-imamu-dark/55">
                        <span>{isArabic ? `${done} من ${milestones.length} مكتملة` : `${done} of ${milestones.length} completed`}</span>
                        <span className="font-bold text-imamu-navy">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-imamu-navy-50 rounded-full overflow-hidden">
                        <div className="h-full bg-imamu-navy rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      {milestones.map((m) => {
                        const completed = m.status === 'completed'
                        const inProgress = m.status === 'in_progress'
                        return (
                          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-3">
                            <div className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                              completed ? 'bg-green-50 text-green-600 ring-1 ring-green-100'
                                : inProgress ? 'bg-imamu-gold-50 text-imamu-gold-deep ring-1 ring-imamu-gold-100'
                                : 'bg-white text-imamu-navy/45 ring-1 ring-imamu-navy-100',
                            )}>
                              {completed ? <CheckCircle2 className="w-4 h-4" /> : inProgress ? <Clock className="w-4 h-4" /> : '·'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-imamu-dark truncate">
                                {isArabic ? m.titleAr : m.title}
                              </p>
                              <p className="text-[11px] text-imamu-dark/50">{m.duration}</p>
                            </div>
                            <span className={cn(
                              'rounded-full text-[10px] font-bold px-2 py-1 shrink-0',
                              completed ? 'bg-green-50 text-green-700'
                                : inProgress ? 'bg-imamu-gold-50 text-imamu-gold-deep'
                                : 'bg-white text-imamu-dark/45 border border-imamu-navy-50',
                            )}>
                              {completed ? t('common.completed') : inProgress ? t('common.inProgress') : t('common.upcoming')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </DashboardCard>
            </motion.div>

            {/* Auto-tracked achievements — the total count is the gold star. */}
            <motion.div {...fade(0.08)}>
              <DashboardCard
                variant="light"
                id="auto-tracked"
                title={t('dashboard.autoTracked')}
                icon={<Bot className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-display text-3xl font-extrabold text-[#99823F]">{autoTrackedAchievements.total}</span>
                  <span className="text-xs text-imamu-dark/55">{t('dashboard.autoTrackedDesc')}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-3">
                    <BookOpen className="w-4 h-4 text-imamu-navy mb-1.5" />
                    <p className="font-display text-xl font-bold text-imamu-dark">{autoTrackedAchievements.courses}</p>
                    <p className="text-[11px] text-imamu-dark/55">{t('dashboard.courses')}</p>
                  </div>
                  <div className="rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-3">
                    <Award className="w-4 h-4 text-imamu-navy mb-1.5" />
                    <p className="font-display text-xl font-bold text-imamu-dark">{autoTrackedAchievements.certifications}</p>
                    <p className="text-[11px] text-imamu-dark/55">{t('dashboard.certifications')}</p>
                  </div>
                  <div className="rounded-xl border border-imamu-gold-100 bg-imamu-gold-50/60 p-3">
                    <Activity className="w-4 h-4 text-imamu-gold-deep mb-1.5" />
                    <p className="font-display text-xl font-bold text-imamu-dark">{autoTrackedAchievements.activities}</p>
                    <p className="text-[11px] text-imamu-dark/55">{t('dashboard.activities')}</p>
                  </div>
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.1)}>
              <DashboardCard variant="light" id="opportunities" title={isArabic ? 'فرص مطابقة لمسارك' : 'Matching Opportunities'} icon={<Briefcase className="w-[18px] h-[18px] text-imamu-navy" />} action={{ label: isArabic ? 'عرض المزيد' : 'View More', href: '/opportunities' }}>
                {studentOpps.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="w-8 h-8 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60">
                      {isArabic ? 'لا توجد توصيات الآن' : 'No recommendations yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {studentOpps.map((opp) => (
                    <Link key={opp.id} to={`/opportunities/${opp.id}`} className="block rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4 transition duration-200 hover:border-imamu-navy-100 hover:bg-imamu-navy-50/70">
                      <div className="flex items-start gap-3 mb-3">
                        <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-9 h-9 rounded-lg text-xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-imamu-dark">{l(opp, 'title')}</p>
                          <p className="text-xs text-imamu-dark/60 mt-0.5">{l(opp, 'company')} · {l(opp, 'location')}</p>
                        </div>
                        <MatchBadge score={opp.matchScore} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[l(opp, 'type'), l(opp, 'duration')].map((tag) => (
                          <span key={tag} className="rounded-full border border-imamu-navy-50 bg-white px-3 py-1 text-[11px] text-imamu-dark/60 font-medium">{tag}</span>
                        ))}
                        <SalaryText value={l(opp, 'salary')} className="rounded-full border border-imamu-navy-50 bg-white px-3 py-1 text-[11px] text-imamu-dark/60 font-medium" iconClassName="w-3 h-3" />
                      </div>
                    </Link>
                  ))}
                  <Link
                    to="/opportunities"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-imamu-navy px-4 py-2.5 text-xs font-bold text-white transition hover:bg-imamu-navy-deep"
                  >
                    {isArabic ? 'عرض المزيد من الفرص' : 'View more opportunities'}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>
                )}
              </DashboardCard>
            </motion.div>

            {/* Skill Gap Analysis */}
            {topMatch && topMatch.requiredSkills.length > 0 && (
              <motion.div {...fade(0.3)}>
                <DashboardCard variant="light" id="skill-gap" title={isArabic ? 'المهارات التي تحتاج لتطويرها' : 'Skills to Develop'} icon={<Target className="w-[18px] h-[18px] text-imamu-navy" />}>
                  {(() => {
                    const studentSkillNames = skills.map(s => s.name.toLowerCase())
                    const required = topMatch.requiredSkills
                    const have = required.filter(s => studentSkillNames.includes(s.toLowerCase()))
                    const missing = required.filter(s => !studentSkillNames.includes(s.toLowerCase()))
                    const percent = required.length > 0 ? Math.round((have.length / required.length) * 100) : 0
                    return (
                      <div>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-11 h-11 rounded-xl bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100 flex items-center justify-center shrink-0">
                            <CareerIcon slug={topMatch.slug} className="w-[22px] h-[22px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-imamu-dark">{l(topMatch, 'title')}</p>
                            <p className="text-xs text-imamu-dark/60 mt-0.5">
                              {isArabic ? `لديك ${have.length} من ${required.length} مهارات مطلوبة` : `You have ${have.length} of ${required.length} required skills`}
                            </p>
                          </div>
                          <MiniCircle percent={percent} />
                        </div>
                        <div className="space-y-2">
                          {have.map(skill => (
                            <div key={skill} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50">
                              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                              <span className="text-sm text-green-700 font-medium">{skill}</span>
                            </div>
                          ))}
                          {missing.map(skill => (
                            <div key={skill} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-imamu-gold-100 bg-imamu-gold-50/65">
                              <AlertCircle className="w-4 h-4 text-imamu-gold-deep shrink-0" />
                              <span className="text-sm text-imamu-dark/65 font-medium">{skill}</span>
                              <span className="ms-auto text-[10px] text-imamu-gold-deep font-bold uppercase">
                                {isArabic ? 'مطلوب' : 'Needed'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </DashboardCard>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            <motion.div {...fade(0.05)}>
              <DashboardCard
                variant="light"
                id="applications"
                title={t('dashboard.applicationTracker')}
                icon={<Briefcase className="w-[18px] h-[18px] text-imamu-navy" />}
                action={{ label: isArabic ? 'عرض طلباتي' : 'View Applications', href: '/applications' }}
              >
                <div className="space-y-3">
                  {trackedApps.length === 0 ? (
                    <div className="rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-5 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-imamu-navy-100 bg-white text-imamu-navy">
                        <Briefcase className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-imamu-dark">
                        {isArabic ? 'لم تتقدم لأي فرصة بعد' : 'No applications yet'}
                      </p>
                      <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-imamu-dark/58">
                        {isArabic
                          ? 'ابدأ من الفرص المطابقة لمسارك حتى تظهر طلباتك هنا.'
                          : 'Start from matched opportunities and your applications will appear here.'}
                      </p>
                      <Link
                        to="/opportunities"
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-imamu-navy px-4 py-2.5 text-xs font-bold text-white transition hover:bg-imamu-navy-deep"
                      >
                        {isArabic ? 'استعرض الفرص' : 'Browse opportunities'}
                        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    </div>
                  ) : trackedApps.map((app) => {
                    const meta = STATUS_META[app.status]
                    const appDate = new Date(app.date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })
                    return (
                      <div key={app.id} className="rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4 transition duration-200 hover:border-imamu-navy-100 hover:bg-imamu-navy-50/70">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-imamu-dark truncate">{app.role}</p>
                            <p className="text-xs text-imamu-dark/60 mt-0.5">
                              {app.company} · {appDate}
                            </p>
                          </div>
                          <div className={cn('inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full border', meta.pill)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                              {isArabic ? meta.labelAr : meta.labelEn}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end mt-3 pt-3 border-t border-imamu-navy-50">
                          <button
                            onClick={() => setActiveApp(app)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-imamu-navy/80 hover:text-imamu-blue hover:gap-2 transition"
                          >
                            {isArabic ? 'عرض التفاصيل' : 'View Details'}
                            <ArrowRight className="w-3 h-3 rtl:rotate-180" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {trackedApps.length > 0 && (
                    <Link
                      to="/applications"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-imamu-navy-100 bg-white px-4 py-2.5 text-xs font-bold text-imamu-navy transition hover:bg-imamu-navy-50"
                    >
                      {isArabic ? 'عرض جميع الطلبات' : 'View all applications'}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.15)}>
              <DashboardCard
                variant="light"
                id="interviews"
                title={t('dashboard.upcomingInterviews')}
                icon={<Calendar className="w-[18px] h-[18px] text-imamu-navy" />}
                action={{ label: isArabic ? 'تدرّب الآن' : 'Practice Now', href: '/interview-prep' }}
              >
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm text-imamu-dark/60 mb-3">
                    {isArabic ? 'لا توجد مقابلات مجدولة' : 'No interviews scheduled'}
                  </p>
                  <Link
                    to="/interview-prep"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-imamu-navy hover:text-imamu-blue transition"
                  >
                    {isArabic ? 'تدرّب الآن' : 'Practice now'}
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.25)}>
              <DashboardCard variant="light" id="courses" title={t('dashboard.activeCourses')} icon={<BookOpen className="w-[18px] h-[18px] text-imamu-navy" />}>
                <div className="text-center py-6">
                  <BookOpen className="w-8 h-8 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm text-imamu-dark/60 mb-3">
                    {isArabic ? 'لم تنضم إلى أي تدريب بعد' : 'No active training yet'}
                  </p>
                  <Link
                    to="/opportunities?category=training"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-imamu-navy hover:text-imamu-blue transition"
                  >
                    {isArabic ? 'تصفّح التدريب' : 'Browse training'}
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>
              </DashboardCard>
            </motion.div>

            {/* Skill development — sits at the bottom of the right column so
                the left column doesn't run far past it visually. */}
            <motion.div {...fade(0.3)}>
              <DashboardCard variant="light" id="skills" title={t('dashboard.skillDevelopment')} icon={<TrendingUp className="w-[18px] h-[18px] text-imamu-navy" />}>
                {skills.length === 0 ? (
                  <div className="text-center py-6">
                    <TrendingUp className="w-8 h-8 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60 mb-3">
                      {isArabic ? 'لم تضف مهارات بعد' : 'No skills tracked yet'}
                    </p>
                    <Link
                      to="/profile"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-imamu-navy hover:text-imamu-blue transition"
                    >
                      {isArabic ? 'أضف مهاراتك' : 'Add your skills'}
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {skills.map((s) => (
                      <div key={s.name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-imamu-dark/70 font-medium">{s.name}</span>
                          <span className="text-xs text-imamu-navy font-bold">{s.level}%</span>
                        </div>
                        <div className="h-1.5 bg-imamu-navy-50 rounded-full overflow-hidden">
                          <div className="h-full bg-imamu-navy rounded-full" style={{ width: `${s.level}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Mock interview room modal */}
      <AnimatePresence>
        {activeInterview && (
          <InterviewRoomModal
            interview={activeInterview}
            isArabic={isArabic}
            onClose={() => setActiveInterview(null)}
          />
        )}
      </AnimatePresence>

      {/* Course detail modal */}
      <AnimatePresence>
        {activeCourse && (
          <CourseDetailModal
            course={activeCourse}
            isArabic={isArabic}
            onClose={() => setActiveCourse(null)}
          />
        )}
      </AnimatePresence>

      {/* Application detail modal */}
      <AnimatePresence>
        {activeApp && (
          <ApplicationDetailModal
            app={activeApp}
            isArabic={isArabic}
            onClose={() => setActiveApp(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
