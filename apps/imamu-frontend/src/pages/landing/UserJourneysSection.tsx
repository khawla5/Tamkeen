import { Link } from 'react-router-dom'
import {
  Target,
  Briefcase,
  GraduationCap,
  ArrowRight,
  UserPlus,
  Compass,
  ScrollText,
  TrendingUp,
  Mic,
  Send,
  ClipboardCheck,
  BadgeCheck,
  Search,
  Building2,
} from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { SectionHeader } from './shared'

interface JourneyStep {
  icon: React.ReactNode
  label: string
}

interface JourneyCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  steps: JourneyStep[]
  ctaLabel: string
  ctaTo: string
}

function JourneyCard({ icon, title, subtitle, steps, ctaLabel, ctaTo }: JourneyCardProps) {
  return (
    <div className="relative h-full">
      <Link
        to={ctaTo}
        className="group flex flex-col relative rounded-3xl p-8 lg:p-10 h-full transition-colors duration-200
          bg-white border border-neutral-200 shadow-sm hover:border-teal/40"
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-200
            bg-teal-dark/[0.06] group-hover:bg-teal">
            <span className="text-teal-dark/60 group-hover:text-white transition-colors duration-200">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-teal-dark text-xl lg:text-2xl">{title}</h3>
            <p className="text-muted text-sm mt-1">{subtitle}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px my-6 bg-gray-100" />

        {/* Timeline steps */}
        <ol className="relative ms-[18px] mb-8 flex-1">
          {/* Vertical connecting line */}
          <div className="absolute start-0 top-2 bottom-2 w-px bg-gray-200" />

          {steps.map((step, i) => (
            <li
              key={i}
              className="relative flex items-start gap-4 ps-7 pb-5 last:pb-0 group/step"
            >
              {/* Timeline dot */}
              <div className="absolute start-0 top-1 -translate-x-1/2 w-[9px] h-[9px] rounded-full border-2 transition-colors duration-200
                border-gray-300 bg-white group-hover/step:border-teal" />

              {/* Step icon */}
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200
                bg-gray-50 text-teal-dark/40 group-hover/step:bg-teal/[0.08] group-hover/step:text-teal">
                {step.icon}
              </div>

              {/* Step text */}
              <span className="text-sm leading-relaxed pt-1 transition-colors duration-200
                text-teal-dark/60 group-hover/step:text-teal-dark/80">
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        {/* CTA button */}
        <div className="mt-auto inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-xl text-sm transition-colors duration-200
          bg-teal-dark/[0.06] text-teal-dark group-hover:bg-teal group-hover:text-white">
          {ctaLabel}
          <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
        </div>
      </Link>
    </div>
  )
}

export function UserJourneysSection() {
  const { t } = useLanguage()

  const studentSteps: JourneyStep[] = [
    { icon: <UserPlus className="w-4 h-4" />,      label: t('landing.step1') },
    { icon: <Compass className="w-4 h-4" />,        label: t('landing.step2') },
    { icon: <ScrollText className="w-4 h-4" />,     label: t('landing.step3') },
    { icon: <TrendingUp className="w-4 h-4" />,     label: t('landing.step4') },
    { icon: <Mic className="w-4 h-4" />,             label: t('landing.step5') },
    { icon: <Send className="w-4 h-4" />,            label: t('landing.step6') },
    { icon: <ClipboardCheck className="w-4 h-4" />, label: t('landing.step7') },
  ]

  const employeeSteps: JourneyStep[] = [
    { icon: <UserPlus className="w-4 h-4" />,      label: t('landing.estep1') },
    { icon: <Compass className="w-4 h-4" />,       label: t('landing.estep2') },
    { icon: <TrendingUp className="w-4 h-4" />,    label: t('landing.estep3') },
    { icon: <ScrollText className="w-4 h-4" />,    label: t('landing.estep4') },
    { icon: <Search className="w-4 h-4" />,        label: t('landing.estep5') },
    { icon: <ClipboardCheck className="w-4 h-4" />, label: t('landing.estep6') },
  ]

  const retireeSteps: JourneyStep[] = [
    { icon: <BadgeCheck className="w-4 h-4" />,     label: t('landing.rstep1') },
    { icon: <Briefcase className="w-4 h-4" />,      label: t('landing.rstep2') },
    { icon: <Target className="w-4 h-4" />,         label: t('landing.rstep3') },
    { icon: <Search className="w-4 h-4" />,         label: t('landing.rstep4') },
    { icon: <Send className="w-4 h-4" />,           label: t('landing.rstep5') },
    { icon: <ClipboardCheck className="w-4 h-4" />, label: t('landing.rstep6') },
  ]

  // Solid white canvas — a clean, calm step between the dark-navy sections.
  return (
    <section id="how-it-works" className="relative bg-white py-20 lg:py-28 overflow-hidden scroll-mt-16">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader tag={t('landing.journeysTag')} title={t('landing.journeysTitle')} subtitle={t('landing.journeysSubtitle')} />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10 items-stretch">
          <JourneyCard
            icon={<GraduationCap className="w-7 h-7" />}
            title={t('landing.studentJourney')}
            subtitle={t('landing.studentJourneyDesc')}
            steps={studentSteps}
            ctaLabel={t('landing.studentCta')}
            ctaTo="/signup?role=student"
          />
          <JourneyCard
            icon={<Building2 className="w-7 h-7" />}
            title={t('landing.employeeJourney')}
            subtitle={t('landing.employeeJourneyDesc')}
            steps={employeeSteps}
            ctaLabel={t('landing.employeeCta')}
            ctaTo="/signup?role=employee"
          />
          <JourneyCard
            icon={<Briefcase className="w-7 h-7" />}
            title={t('landing.retireeJourney')}
            subtitle={t('landing.retireeJourneyDesc')}
            steps={retireeSteps}
            ctaLabel={t('landing.expertCta')}
            ctaTo="/signup?role=retiree"
          />
        </div>
      </div>
    </section>
  )
}
