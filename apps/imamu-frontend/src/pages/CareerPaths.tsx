import { guideName } from '@/components/shared/GuideName'
﻿import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Target, Info, X, ArrowRight, Brain, Award, Loader2, TrendingUp, CheckCircle2, Zap, Bot } from 'lucide-react'
import {
  CAREER_PATHS, RIASEC_CODES, RIASEC_LABEL_AR, RIASEC_LABEL_EN, findCareer, type RiasecCode,
} from '@/lib/riasec'
import { enhanceWithAi, type CareerAnalysis } from '@/lib/career-analysis'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import { cn } from '@/lib/utils'
import CareerIcon from '@/components/shared/CareerIcon'

const CODE_COLORS: Record<RiasecCode, { bg: string; text: string; chip: string }> = {
  R: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
  I: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
  A: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
  S: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
  E: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
  C: { bg: 'bg-imamu-sky', text: 'text-imamu-navy', chip: 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100' },
}

const cardSurface = 'relative overflow-hidden bg-white rounded-[20px] border border-imamu-navy-50 shadow-xl shadow-imamu-navy/10'
const primaryButton = 'inline-flex items-center gap-1.5 bg-imamu-navy text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-imamu-navy-deep hover:shadow-lg hover:shadow-imamu-gold/25 transition shrink-0'
const standardIconTile = 'bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70'
const recommendedIconTile = 'bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100'

export default function CareerPaths() {
  const { t, isArabic, lang } = useLanguage()
  const { user, role, loading, savedAnalysis, savedAnswers, setSavedAnalysis } = useAuth()
  const [filter, setFilter] = useState<RiasecCode | 'all'>('all')
  const [showInfo, setShowInfo] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Read directly from the auth-context cache — no per-mount fetch. The
  // analysis was loaded once on app boot inside loadProfile, so navigating
  // to /careers paints the result panel instantly with zero loading state.
  const analysis = savedAnalysis
  // Only show a loader during the very first session-hydration window
  // (before AuthContext finishes its initial loadProfile pass).
  const analysisLoading = loading && role === 'student'

  async function handleAiDeepDive() {
    if (!user || !savedAnswers) return
    setAiRunning(true)
    setAiError(null)
    try {
      const enhanced = await enhanceWithAi({
        userId: user.id,
        answers: savedAnswers,
        name: user.name?.split(' ')[0],
        language: lang as 'en' | 'ar',
      })
      // Push the enhanced result up to context so any other consumer (e.g. the
      // student dashboard) sees the new commentary immediately too.
      setSavedAnalysis(enhanced)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not enhance result')
    } finally {
      setAiRunning(false)
    }
  }

  const recommendedSlug = analysis?.top_match ?? null
  const topPath = recommendedSlug ? findCareer(recommendedSlug) : null
  const secondaryPath = analysis?.secondary_match ? findCareer(analysis.secondary_match) : null

  const filtered = useMemo(() => {
    if (filter === 'all') return CAREER_PATHS
    return CAREER_PATHS.filter((p) => p.code === filter)
  }, [filter])

  return (
    <>
      <section className="relative bg-imamu-dark py-12 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-imamu-sky) 32%, transparent) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/30" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Compass className="w-7 h-7 text-imamu-warm-gold" aria-hidden="true" />
            <h1 className="font-display font-bold text-white text-[clamp(24px,3.5vw,32px)] tracking-tight">
              {isArabic ? 'استكشف المسارات المهنية' : 'Explore Career Paths'}
            </h1>
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-expanded={showInfo}
              aria-label={isArabic ? 'ما هو تقييم RIASEC؟' : 'What is the RIASEC assessment?'}
              className={cn(
                'inline-flex items-center justify-center w-7 h-7 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-imamu-blue/50',
                showInfo ? 'bg-white/10 text-white/80' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]',
              )}
            >
              <Info className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-imamu-navy-100 text-[15px] max-w-xl mx-auto">
            {isArabic
              ? '18 مسارًا متوافقًا مع رؤية 2030، مصنّفة حسب نموذج RIASEC العالمي.'
              : '18 paths aligned with Vision 2030, organised by the RIASEC framework.'}
          </p>

          <AnimatePresence>
            {showInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-6 mx-auto max-w-2xl bg-white/[0.06] border border-imamu-sky/20 rounded-xl p-5 text-start">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-bold text-white text-[15px]">
                      {isArabic ? 'ما هو تقييم هولاند (RIASEC)؟' : 'What is the Holland (RIASEC) assessment?'}
                    </h3>
                    <button
                      onClick={() => setShowInfo(false)}
                      aria-label={isArabic ? 'إغلاق' : 'Close'}
                      className="text-white/40 hover:text-white/80 transition shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-[13px] text-white/70 leading-relaxed mb-3">
                    {isArabic
                      ? 'وضعه عالم النفس جون هولاند ويُصنّف الميول المهنية إلى ست فئات: الواقعي، الاستقصائي، الفني، الاجتماعي، المُبادر، والتقليدي. يطابق التقييم اهتماماتك وأسلوب عملك مع المسارات التي يزدهر فيها أصحاب الميول المشابهة.'
                      : "Built by psychologist John Holland, it groups people into six core orientations — Realistic, Investigative, Artistic, Social, Enterprising, and Conventional. The assessment matches your interests and working style to careers where people with similar profiles thrive."}
                  </p>
                  <p className="text-[12px] text-white/45">
                    {isArabic
                      ? 'يُعدّ من أكثر نماذج التوجيه المهني استخداماً عالمياً منذ الستينيات، ويُستخدم في بيئات الجامعات والتوظيف على نطاق واسع.'
                      : "It's been a cornerstone of career guidance worldwide since the 1960s and is widely used in universities and hiring."}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="relative bg-imamu-ice min-h-screen">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
          {/* Results panel — only for students. Either the saved analysis or a CTA. */}
          {role === 'student' && (
            <div data-tour="tour-assessment-result" className="mb-7">
              {analysisLoading ? (
                <div className={cn('flex items-center justify-center py-10', cardSurface)}>
                  <Loader2 className="w-5 h-5 text-imamu-navy animate-spin" aria-hidden="true" />
                </div>
              ) : analysis && topPath ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  className={cn(cardSurface, 'p-5 sm:p-6')}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Top match icon tile */}
                    <div className={cn(
                      'w-14 h-14 rounded-lg flex items-center justify-center shrink-0',
                      standardIconTile,
                    )}>
                      <CareerIcon slug={topPath.id} className="w-7 h-7 text-imamu-navy" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {/* Top-match celebration chip in gold — heritage accent
                            for the result the student should remember. */}
                        <span className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
                          {isArabic ? 'أفضل تطابق لك' : 'Your top match'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold text-[10px] font-bold">
                          <Award className="w-2.5 h-2.5" aria-hidden="true" />
                          {analysis.match_score}%
                        </span>
                      </div>
                      <h2 className="font-display font-bold text-imamu-dark text-xl sm:text-2xl leading-tight">
                        {isArabic ? topPath.titleAr : topPath.title}
                      </h2>
                      <p className="text-sm text-imamu-dark/65 leading-relaxed mt-1.5">
                        {analysis.why}
                      </p>
                      {/* Holland code chips */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className="text-[11px] font-semibold text-imamu-dark/50 uppercase tracking-wider">
                          {isArabic ? 'رمز هولاند' : 'Holland code'}
                        </span>
                        {analysis.holland_code.split('').slice(0, 3).map((c, i) => {
                          const code = c as RiasecCode
                          const colors = CODE_COLORS[code]
                          if (!colors) return null
                          return (
                            <span
                              key={i}
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold',
                                i === 0
                                  ? 'bg-imamu-gold-50 text-imamu-gold border-imamu-gold-100'
                                  : `${colors.bg} ${colors.text} border-imamu-blue/45`,
                              )}
                            >
                              {code}
                              <span className="opacity-70 normal-case">{isArabic ? RIASEC_LABEL_AR[code] : RIASEC_LABEL_EN[code]}</span>
                            </span>
                          )
                        })}
                      </div>
                      {secondaryPath && (
                        <p className="text-xs text-imamu-dark/60 mt-3">
                          {isArabic ? 'تطابق ثانوي:' : 'Secondary match:'}{' '}
                          <Link to={`/career/${secondaryPath.id}`} className="text-imamu-navy hover:text-imamu-navy-deep font-semibold">
                            {isArabic ? secondaryPath.titleAr : secondaryPath.title}
                          </Link>
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/career/${topPath.id}`}
                      className={primaryButton}
                    >
                      {isArabic ? 'تفاصيل المسار' : 'View path details'}
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>

                  {/* AI deep-dive — expands the result panel with strengths /
                      growth areas / first steps. Hidden until the user opts in. */}
                  {analysis.source === 'ai' ? (
                    <AnalysisInsights analysis={analysis} isArabic={isArabic} />
                  ) : (
                    <div className="mt-5 pt-5 border-t border-imamu-navy-100/60">
                      {aiError && (
                        <div role="alert" aria-live="assertive" className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
                          <X className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{aiError}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={handleAiDeepDive}
                          disabled={aiRunning || !savedAnswers}
                          className="inline-flex items-center gap-2 bg-imamu-gold text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-imamu-gold-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {aiRunning ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              {isArabic ? `${guideName('ar')} يحلّل…` : `${guideName('en')} is analysing…`}
                            </>
                          ) : (
                            <>
                              <Bot className="w-4 h-4" aria-hidden="true" />
                              {t('guide.askGuide')}
                            </>
                          )}
                        </button>
                        <p className="text-xs text-imamu-dark/55">
                          {isArabic
                            ? 'نقاط قوة ومجالات تطوير وخطوات تنفيذية مفصّلة'
                            : 'Detailed strengths, growth areas, and first steps'}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  className="bg-imamu-dark rounded-xl p-5 sm:p-6 text-white shadow-sm"
                >
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <Brain className="w-6 h-6 text-imamu-blue" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-blue/85 mb-1">
                        {isArabic ? 'لم تأخذ التقييم بعد' : 'Assessment not taken'}
                      </p>
                      <h2 className="font-display font-bold text-lg sm:text-xl leading-tight mb-1.5">
                        {isArabic ? 'اكتشف مسارك المهني الأنسب' : 'Find your best-fit career path'}
                      </h2>
                      <p className="text-sm text-white/65 leading-relaxed max-w-lg">
                        {isArabic
                          ? '24 سؤالاً سريعاً + تحليل بالذكاء الاصطناعي يطابق ميولك مع 18 مساراً مهنياً متوافقاً مع رؤية 2030.'
                          : '24 quick questions + an AI analysis that matches your interests to 18 Vision 2030–aligned career paths.'}
                      </p>
                    </div>
                    <Link
                      to="/assessment"
                      className="inline-flex items-center gap-2 bg-white text-imamu-navy text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-imamu-sky hover:text-imamu-dark transition-colors shrink-0"
                    >
                      <Compass className="w-4 h-4" aria-hidden="true" />
                      {isArabic ? 'ابدأ التقييم' : 'Start the assessment'}
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* RIASEC filter chips */}
          <div className="flex flex-wrap items-center gap-2 mb-7">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition duration-200 border',
                filter === 'all'
                  ? 'bg-imamu-gold text-white border-imamu-gold shadow-sm shadow-imamu-gold/20'
                  : 'bg-imamu-gold-50 border-imamu-gold-100 text-imamu-gold hover:bg-imamu-gold-100/70',
              )}
            >
              {isArabic ? 'الكل' : 'All'}
              <span className="font-display normal-case">{CAREER_PATHS.length}</span>
            </button>
            {RIASEC_CODES.map((code) => {
              const colors = CODE_COLORS[code]
              const active = filter === code
              const count = CAREER_PATHS.filter((p) => p.code === code).length
              return (
                <button
                  key={code}
                  onClick={() => setFilter(code)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition duration-200 border',
                    active
                      ? 'bg-imamu-navy text-white border-imamu-navy shadow-sm'
                      : `${colors.chip} hover:border-imamu-navy/35 hover:bg-imamu-navy-50/80`,
                  )}
                >
                  <span className="font-display text-base">{code}</span>
                  <span>{isArabic ? RIASEC_LABEL_AR[code] : RIASEC_LABEL_EN[code]}</span>
                  <span className="opacity-60">·{count}</span>
                </button>
              )
            })}
          </div>

          {/* Cards */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map((path) => {
              const colors = CODE_COLORS[path.code]
              const isMine = recommendedSlug === path.id
              return (
                <div key={path.id}>
                  <Link
                    to={`/career/${path.id}`}
                    className={cn(
                      'block bg-white rounded-[18px] p-5 border transition-colors duration-200 relative h-full',
                      isMine
                        ? 'border-2 border-imamu-navy shadow-sm ring-4 ring-imamu-navy-50/80'
                        : 'border-imamu-navy-50 hover:border-imamu-navy-100',
                    )}
                  >
                    {isMine && (
                      // Floating "Your path" pill — the navy border + ring on
                      // the parent card already signal "this is yours", so
                      // we don't add a corner wedge here (it used to live
                      // at top-end and visually collided with the inline
                      // RIASEC code letter inside the text column in RTL).
                      <span className="absolute -top-2.5 end-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-imamu-gold-100 bg-imamu-gold-50 text-[10px] font-bold text-imamu-gold shadow-sm">
                        <Target className="w-2.5 h-2.5" />
                        {isArabic ? 'مساري' : 'Your path'}
                      </span>
                    )}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={cn(
                        'w-11 h-11 rounded-lg flex items-center justify-center shrink-0',
                        isMine ? recommendedIconTile : standardIconTile,
                      )}>
                        <CareerIcon slug={path.id} className={cn('w-[22px] h-[22px]', isMine ? 'text-imamu-gold' : 'text-imamu-navy')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-extrabold mb-1',
                          colors.bg, colors.text,
                        )}>
                          {path.code}
                        </span>
                        <h3 className="font-display font-bold text-imamu-dark text-base leading-tight mb-1">
                          {isArabic ? path.titleAr : path.title}
                        </h3>
                      </div>
                    </div>
                    <p className="text-xs text-imamu-dark/65 leading-relaxed mb-3">
                      {isArabic ? path.taglineAr : path.tagline}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-imamu-dark/55">
                      <span className="font-semibold text-imamu-gold">{isArabic ? path.salaryAr : path.salary}</span>
                      <span className="text-imamu-navy-deep font-semibold">
                        {path.skills.length} {isArabic ? 'مهارات' : 'skills'}
                      </span>
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>

        </div>
      </section>
    </>
  )
}

// AI deep-dive panel — three columns: strengths / growth / first steps.
// Reads cleanly from the analysis object regardless of source ('local' or 'ai'),
// but in practice only renders when source === 'ai' because the bare local
// result keeps the panel compact.
function AnalysisInsights({ analysis, isArabic }: { analysis: CareerAnalysis; isArabic: boolean }) {
  const cols: { Icon: typeof Award; tone: { bg: string; text: string }; title: string; items: string[]; numbered?: boolean }[] = [
    {
      Icon: Award,
      tone: { bg: 'bg-imamu-gold-50', text: 'text-imamu-gold' },
      title: isArabic ? 'نقاط قوتك' : 'Your strengths',
      items: analysis.strengths,
    },
    {
      Icon: TrendingUp,
      tone: { bg: 'bg-imamu-navy-50', text: 'text-imamu-navy' },
      title: isArabic ? 'مجالات للتطوير' : 'Where to grow',
      items: analysis.growth_areas,
    },
    {
      Icon: Zap,
      tone: { bg: 'bg-imamu-navy-50', text: 'text-imamu-navy' },
      title: isArabic ? 'خطواتك الأولى' : 'First steps',
      items: analysis.first_steps,
      numbered: true,
    },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-5 pt-5 border-t border-imamu-navy-100/60"
    >
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-4 h-4 text-imamu-gold" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
          {isArabic ? `تحليل ${guideName('ar')}` : `${guideName('en')} insights`}
        </p>
        <span className="text-[10px] text-imamu-dark/50 ms-1">
          {isArabic ? `مدعوم من ${guideName('ar')}` : `powered by ${guideName('en')}`}
        </span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {cols.map(({ Icon, tone, title, items, numbered }) => (
          <div key={title} className="bg-imamu-ice rounded-[16px] border border-imamu-navy-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tone.bg, tone.text)}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <h4 className="font-semibold text-imamu-navy text-sm">{title}</h4>
            </div>
            <ul className="space-y-2.5">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-imamu-dark/75 leading-relaxed">
                  {numbered ? (
                    <span className={cn('shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5', tone.bg, tone.text)}>
                      {i + 1}
                    </span>
                  ) : (
                    <CheckCircle2 className={cn('w-4 h-4 shrink-0 mt-0.5', tone.text)} aria-hidden="true" />
                  )}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
