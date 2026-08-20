import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/i18n/context'

export function FinalCTASection() {
  const { t } = useLanguage()
  // Solid deep-heritage band that flows seamlessly into the footer (#1a1409),
  // closing the landing on a calm, flat statement — no gradient, no glow.
  return (
    <section id="cta" className="relative overflow-hidden py-24 lg:py-32 scroll-mt-16 bg-[#1a1409]">
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Content */}
        <div className="text-center">
          {/* Badge — navy-rim chip on the dark band. */}
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide mb-8 bg-imamu-navy/[0.20] text-imamu-gold-50 border border-imamu-gold-50/30">
            {t('landing.challengeTag')}
          </span>

          {/* Headline */}
          <h2 className="font-display font-extrabold text-white text-[clamp(30px,5vw,48px)] leading-[1.1] tracking-tight mb-6">
            {t('landing.ctaTitle')}
          </h2>

          {/* Subtitle */}
          <p className="text-white/45 text-lg leading-relaxed max-w-xl mx-auto mb-10">
            {t('landing.ctaSubtitle')}
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 mb-10">
          {/* White pill with gold-deep text — a calm brass nameplate on the dark band. */}
          <Link
            to="/login"
            className="group inline-flex items-center justify-center gap-3 bg-white text-imamu-gold-deep font-extrabold px-9 py-4 rounded-full text-base
              shadow-sm hover:bg-imamu-gold-50 transition-colors duration-200"
          >
            {t('common.getStarted')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
          </Link>
        </div>


        {/* Dashboard preview card (static mockup) */}
        <div className="mt-16 relative mx-auto max-w-2xl">
          <div className="relative rounded-2xl border border-white/[0.08] bg-white/5 overflow-hidden shadow-sm">
            {/* Fake window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white/[0.06] rounded-md px-8 py-1 text-[10px] text-white/30 font-mono">tamkeen.imamu.edu.sa/dashboard</div>
              </div>
            </div>

            {/* Dashboard mockup content */}
            <div className="p-6 space-y-4">
              {/* Top stats row — Skills Record Score is the headline
                  achievement metric, so it gets the gold treatment. */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Skills Record', value: '87%', color: 'text-imamu-warm-gold' },
                  { label: 'Applications', value: '12', color: 'text-teal-light' },
                  { label: 'Match Rate', value: '94%', color: 'text-teal-light' },
                ].map((stat, i) => (
                  <div key={i} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 text-center">
                    <p className={`font-display font-bold text-lg ${stat.color}`}>{stat.value}</p>
                    <p className="text-white/30 text-[10px] mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Profile completion bar — solid gold fill. */}
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/40 text-xs">Profile Completion</span>
                  <span className="text-imamu-warm-gold text-xs font-bold">78%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full w-[78%] bg-imamu-gold rounded-full" />
                </div>
              </div>

              {/* Skeleton rows */}
              <div className="space-y-2">
                {[65, 80, 50].map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 rounded-full bg-white/[0.06]" style={{ width: `${w}%` }} />
                      <div className="h-1.5 rounded-full bg-white/[0.03]" style={{ width: `${w - 20}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
