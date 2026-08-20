import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  X, ArrowRight, User, Brain, Briefcase, BookOpen,
  Building2, Plus, Users, BarChart3, Compass,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth, type Role } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'

type CardSpec = {
  icon: LucideIcon
  titleKey: string
  descKey: string
  to: string
}

const ROLE_CARDS: Record<Role, CardSpec[]> = {
  student: [
    { icon: Brain,      titleKey: 'onboarding.cardAssessmentTitle',    descKey: 'onboarding.cardAssessmentDesc',    to: '/assessment' },
    { icon: BookOpen,   titleKey: 'onboarding.cardTrainingPathTitle',  descKey: 'onboarding.cardTrainingPathDesc',  to: '/training-path' },
    { icon: User,       titleKey: 'onboarding.cardSkillsRecordTitle',  descKey: 'onboarding.cardSkillsRecordDesc',  to: '/skills-record' },
  ],
  retiree: [
    { icon: User,       titleKey: 'onboarding.cardProfileTitle',     descKey: 'onboarding.cardProfileDesc',     to: '/profile' },
    { icon: Briefcase,  titleKey: 'onboarding.cardConsultingTitle',  descKey: 'onboarding.cardConsultingDesc',  to: '/opportunities?category=consulting' },
  ],
  employee: [
    { icon: User,     titleKey: 'onboarding.cardProfileTitle',    descKey: 'onboarding.cardProfileDesc',    to: '/profile' },
    { icon: BookOpen, titleKey: 'onboarding.cardTrainingTitle',   descKey: 'onboarding.cardTrainingDesc',   to: '/opportunities?category=training' },
    { icon: Brain,    titleKey: 'onboarding.cardAssessmentTitle', descKey: 'onboarding.cardAssessmentDesc', to: '/assessment' },
  ],
  company: [
    { icon: Building2, titleKey: 'onboarding.cardCompanyProfileTitle',  descKey: 'onboarding.cardCompanyProfileDesc',  to: '/profile' },
    { icon: Plus,      titleKey: 'onboarding.cardFirstPostingTitle',    descKey: 'onboarding.cardFirstPostingDesc',    to: '/post-opportunity' },
    { icon: Users,     titleKey: 'onboarding.cardReviewApplicantsTitle', descKey: 'onboarding.cardReviewApplicantsDesc', to: '/dashboard/company' },
  ],
  university: [
    { icon: Building2,  titleKey: 'onboarding.cardUniversityProfileTitle', descKey: 'onboarding.cardUniversityProfileDesc', to: '/profile' },
    { icon: BarChart3,  titleKey: 'onboarding.cardStudentInsightsTitle',   descKey: 'onboarding.cardStudentInsightsDesc',   to: '/dashboard/university' },
  ],
  provider: [
    { icon: Building2, titleKey: 'onboarding.cardProviderProfileTitle', descKey: 'onboarding.cardProviderProfileDesc', to: '/profile' },
    { icon: Plus,      titleKey: 'onboarding.cardFirstCourseTitle',    descKey: 'onboarding.cardFirstCourseDesc',    to: '/post-opportunity' },
  ],
}

const INTRO_KEY: Record<Role, string> = {
  student:    'onboarding.introStudent',
  retiree:    'onboarding.introRetiree',
  employee:   'onboarding.introEmployee',
  company:    'onboarding.introCompany',
  university: 'onboarding.introUniversity',
  provider:   'onboarding.introProvider',
}

export default function OnboardingModal() {
  const { user, role, markOnboarded } = useAuth()
  const { t, isArabic } = useLanguage()
  const navigate = useNavigate()

  if (!user || !role) return null

  const cards = ROLE_CARDS[role]
  const firstName = (isArabic ? user.nameAr : user.name)?.split(' ')[0] ?? ''
  const heading = firstName
    ? t('onboarding.welcomeFirstName').replace('{name}', firstName)
    : t('onboarding.welcome')

  async function dismiss() {
    await markOnboarded()
  }

  async function go(to: string) {
    await markOnboarded()
    navigate(to)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-heading"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-3rem)] overflow-y-auto"
      >
        {/* Header */}
        <div className="relative px-7 pt-7 pb-5 bg-gradient-to-br from-teal/8 via-white to-white border-b border-gray-100">
          <button
            onClick={dismiss}
            className="absolute top-4 end-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-teal-dark hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            aria-label={t('onboarding.closeAria')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-imamu-navy-50 text-imamu-navy flex items-center justify-center shrink-0" aria-hidden="true">
              <User className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal/70">
                {t('onboarding.tagline')}
              </p>
            </div>
          </div>

          <h2
            id="onboarding-heading"
            className="font-display text-[22px] sm:text-2xl font-bold text-teal-dark leading-tight"
          >
            {heading}
          </h2>
          <p className="text-sm text-muted leading-relaxed mt-2">
            {t(INTRO_KEY[role])}
          </p>

          {role === 'student' && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-imamu-sky/30 border border-imamu-navy-100 px-3.5 py-2.5">
              <Compass className="w-4 h-4 text-imamu-navy shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[13px] text-teal-dark/75 leading-relaxed">
                {t('onboarding.guideIntro')}
              </p>
            </div>
          )}
        </div>

        {/* Action cards — gold accent ring + gold hover border so each next-step
            card reads as an achievement card, not just a link. */}
        <div className="px-7 py-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep mb-3 flex items-center gap-2">
            <span className="w-6 h-px bg-imamu-gold" aria-hidden="true" />
            {t('onboarding.whereToNext')}
          </p>
          <ul className="flex flex-col gap-2.5">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <li key={c.to}>
                  <button
                    onClick={() => go(c.to)}
                    className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-gray-200/80 bg-white text-start hover:border-imamu-gold/50 hover:bg-imamu-gold/[0.04] hover:-translate-y-px hover:shadow-md hover:shadow-imamu-gold/15 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-imamu-gold/40"
                  >
                    <div className="w-10 h-10 rounded-xl bg-imamu-gold/10 text-imamu-gold-deep flex items-center justify-center shrink-0 ring-1 ring-imamu-gold/20 group-hover:bg-imamu-gold group-hover:text-white group-hover:ring-imamu-gold/40 transition-colors">
                      <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-teal-dark">{t(c.titleKey)}</p>
                      <p className="text-xs text-muted mt-0.5 leading-snug">{t(c.descKey)}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-imamu-gold-deep rtl:rotate-180 transition-colors" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-7 pb-6 pt-1 flex justify-center">
          <button
            onClick={dismiss}
            className="text-xs font-semibold text-muted hover:text-teal-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded px-2 py-1"
          >
            {t('onboarding.exploreOnMyOwn')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
