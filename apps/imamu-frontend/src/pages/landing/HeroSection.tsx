import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { StatCounter } from './shared'

// Tamkeen-specific stats — these mirror the showcase numbers used on the
// University Dashboard so the landing pitch and the admin view tell the same
// story. Any future change should update both surfaces in lockstep.
const TAMKEEN_HERO_STATS = {
  studentsAssessed: 1247,
  careerPaths: 18,
  coopPlacements: 312,
  employmentRate: 78,
}

export function HeroSection() {
  const { t, isArabic } = useLanguage()

  return (
    <section id="hero" className="relative overflow-hidden min-h-screen flex flex-col bg-imamu-ice">
      {/* Static background illustration (scrolls with the hero). Mirrored in
          Arabic so the students sit opposite the right-aligned RTL text. */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/brand/landing_page_hbackground.png')",
          transform: isArabic ? 'scaleX(-1)' : undefined,
        }}
        aria-hidden="true"
      />
      {/* Legibility wash — sits on the text side and fades off. Flips for RTL. */}
      <div
        className={`pointer-events-none absolute inset-0 ${isArabic ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white/85 via-white/40 to-transparent`}
        aria-hidden="true"
      />

      <div className="relative flex-1 flex items-start">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-10 lg:pt-14 pb-16">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-8 items-center">

            {/* Left — Content */}
            <div className="max-w-50%">
              <div className="mb-8">
                {/* Eyebrow — gold for IMSIU heritage. */}
                <span className="text-imamu-gold-deep text-xs font-bold uppercase tracking-[0.2em]">{t('landing.heroBadge')}</span>
              </div>

              <h1
                className={`font-extrabold text-imamu-dark leading-[1.1] mb-8 ${isArabic ? 'tracking-normal' : 'font-display tracking-[-0.03em]'}`}
                style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontFamily: isArabic ? 'var(--font-arabic)' : undefined }}
              >
                {/* Title color split: opening line in navy, closing line in gold. */}
                {t('landing.heroTitle1')}<br />
                <span className="text-imamu-gold-deep">
                  {t('landing.heroTitle2')}
                </span>
              </h1>

              <div className="max-w-xl mb-10">
                <p className={`text-imamu-dark/70 text-[17px] leading-relaxed mb-6 ${isArabic ? 'font-arabic' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>{t('landing.heroSubtitle')}</p>
                <div className="flex flex-wrap gap-3">
                  {t('landing.heroFeatureTags').split('—').map((tag, i) => (
                    <span
                      key={i}
                      className="inline-block bg-imamu-navy-50 text-imamu-navy border border-imamu-navy-100 rounded-full px-4 py-1.5 text-sm font-medium cursor-default transition-colors duration-200 hover:bg-imamu-navy-100 hover:border-imamu-navy/40"
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-14">
                {/* Primary CTA → assessment (the actual entry to the journey) */}
                <Link
                  to="/assessment"
                  className="group inline-flex items-center gap-2.5 bg-imamu-navy text-white font-semibold px-8 py-4 rounded-2xl text-base
                    shadow-sm hover:bg-imamu-navy-deep transition-colors duration-200"
                >
                  {t('landing.heroCta')}<ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </Link>
                {/* Secondary CTA → opportunities — gold outline so it sits next
                    to the navy primary as a navy + gold pair. */}
                <Link
                  to="/opportunities"
                  className="inline-flex items-center gap-2.5 border border-imamu-gold/50 text-imamu-gold-deep font-semibold px-8 py-4 rounded-2xl text-base
                    hover:bg-imamu-gold-50 hover:border-imamu-gold/70 transition-colors duration-200"
                >
                  {t('landing.heroCtaSecondary')}<ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </Link>
              </div>

              {/* Tamkeen showcase stats — `featured` (employmentRate) gets the
                  gold treatment defined in StatCounter; the rest are navy. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-6">
                {[
                  { value: TAMKEEN_HERO_STATS.employmentRate, label: t('landing.statPlacements'), featured: true, suffix: '%' },
                  { value: TAMKEEN_HERO_STATS.studentsAssessed, label: t('landing.statStudents') },
                  { value: TAMKEEN_HERO_STATS.coopPlacements, label: t('landing.statCompanies') },
                  { value: TAMKEEN_HERO_STATS.careerPaths, label: t('landing.statRetirees') },
                ].map((stat) => (
                  <StatCounter key={stat.label} value={stat.value} label={stat.label} featured={stat.featured} suffix={stat.suffix} />
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Section divider — thin solid gold hairline echoes the heritage accent. */}
      <div className="relative h-px w-full bg-imamu-gold/30" />
    </section>
  )
}
