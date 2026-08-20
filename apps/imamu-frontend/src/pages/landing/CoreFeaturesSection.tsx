import {
  ClipboardCheck,
  Route as RouteIcon,
  BadgeCheck,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { SectionHeader } from './shared'

function RoadmapStop({ feature, index, isRight }: {
  feature: { icon: LucideIcon; titleKey: string; descKey: string; to: string }
  index: number; isRight: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className={`relative flex items-start gap-0 lg:gap-8 ${isRight ? 'lg:flex-row-reverse' : ''}`}>
      {/* Card side */}
      <div className="flex-1">
        <div
          className={`group block bg-white/5 border border-white/10 rounded-2xl p-7 hover:border-imamu-gold/40 transition-colors duration-200 ${isRight ? 'lg:text-end' : ''}`}
        >
          <div className={`flex items-center gap-4 mb-4 ${isRight ? 'lg:flex-row-reverse' : ''}`}>
            <div className="w-12 h-12 rounded-xl bg-imamu-gold/15 flex items-center justify-center shrink-0 ring-1 ring-imamu-gold/20">
              <feature.icon className="w-5 h-5 text-imamu-warm-gold" />
            </div>
            <h3 className="font-display font-semibold text-white text-lg">{t(`landing.${feature.titleKey}`)}</h3>
          </div>
          <p className="text-white/50 text-sm leading-relaxed">{t(`landing.${feature.descKey}`)}</p>
        </div>
      </div>

      {/* Center spine — gold numbered milestones for the student journey,
          tied together by a thin solid gold line. */}
      <div className="hidden lg:flex flex-col items-center w-12 shrink-0 relative">
        <div className="w-10 h-10 rounded-full bg-imamu-gold/20 border-2 border-imamu-gold/50 flex items-center justify-center z-10">
          <span className="text-imamu-warm-gold font-display font-bold text-xs">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="w-px flex-1 bg-imamu-gold/20 min-h-[40px]" />
      </div>

      {/* Empty spacer for the other side */}
      <div className="hidden lg:block flex-1" />
    </div>
  )
}

export function CoreFeaturesSection() {
  const { t } = useLanguage()
  // Tamkeen 4-step journey: Assess → Train → Record → Apply.
  // Maps directly to /assessment → /training-path → /skills-record → /opportunities.
  const features = [
    { icon: ClipboardCheck, titleKey: 'feature1Title', descKey: 'feature1Desc', to: '/assessment' },
    { icon: RouteIcon,      titleKey: 'feature2Title', descKey: 'feature2Desc', to: '/training-path' },
    { icon: BadgeCheck,     titleKey: 'feature3Title', descKey: 'feature3Desc', to: '/skills-record' },
    { icon: Briefcase,      titleKey: 'feature4Title', descKey: 'feature4Desc', to: '/opportunities' },
  ]

  // Solid navy section — a calm dark step in the IMSIU palette, no gradient.
  return (
    <section id="features" className="relative bg-imamu-dark py-20 lg:py-28 overflow-hidden scroll-mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader tag={t('landing.featuresTag')} title={t('landing.featuresTitle')} subtitle={t('landing.featuresSubtitle')} dark />

        {/* Zigzag roadmap */}
        <div className="relative space-y-6 lg:space-y-0">
          {features.map((f, i) => (
            <RoadmapStop key={f.titleKey} feature={f} index={i} isRight={i % 2 !== 0} />
          ))}
        </div>
      </div>
    </section>
  )
}
