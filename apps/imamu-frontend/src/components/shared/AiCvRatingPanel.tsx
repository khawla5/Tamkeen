import { guideName } from '@/components/shared/GuideName'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Loader2, AlertCircle, RotateCcw, Award, TrendingUp, Bot, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CvRating } from '@/lib/cv-rating'
import { scoreBg, scoreStroke, scoreText } from '@/lib/score-style'

interface Props {
  rating: CvRating | null
  ratedAt: Date | null
  analyzing: boolean
  error: string | null
  onAnalyze: () => void
  fallbackChecklistScore: number
  isArabic: boolean
}

const CATEGORY_LABELS: Record<keyof CvRating['categories'], { en: string; ar: string }> = {
  completeness: { en: 'Completeness', ar: 'الاكتمال' },
  impact: { en: 'Impact', ar: 'الأثر' },
  clarity: { en: 'Clarity', ar: 'الوضوح' },
  keywords: { en: 'Keywords', ar: 'الكلمات المفتاحية' },
  relevance: { en: 'Relevance', ar: 'الملاءمة' },
}

function relativeTime(d: Date, isArabic: boolean): string {
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60000)
  const h = Math.floor(min / 60)
  const day = Math.floor(h / 24)
  if (min < 1) return isArabic ? 'الآن' : 'just now'
  if (min < 60) return isArabic ? `قبل ${min} دقيقة` : `${min}m ago`
  if (h < 24) return isArabic ? `قبل ${h} ساعة` : `${h}h ago`
  return isArabic ? `قبل ${day} يوم` : `${day}d ago`
}

function ScoreCircle({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-imamu-navy-50" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn('transition-colors', muted ? 'stroke-imamu-navy-100' : scoreStroke(value))}
          style={{
            strokeDasharray: 2 * Math.PI * 42,
            strokeDashoffset: (2 * Math.PI * 42) - (value / 100) * (2 * Math.PI * 42),
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xl font-extrabold', muted ? 'text-imamu-navy' : scoreText(value))}>
          {value}<span className="text-[11px]">%</span>
        </span>
      </div>
    </div>
  )
}

export default function AiCvRatingPanel({
  rating, ratedAt, analyzing, error, onAnalyze, fallbackChecklistScore, isArabic,
}: Props) {
  if (!rating && !analyzing) {
    return (
      <div className="rounded-2xl border border-imamu-gold-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h4 className="font-display text-[15px] font-bold text-imamu-dark">
              {isArabic ? `تحليل السجل المهاري بواسطة ${guideName('ar')}` : `${guideName('en')} skills record review`}
            </h4>
            <p className="text-[11px] text-imamu-dark/50">
              {isArabic ? 'توصيات تمكين لتحسين السيرة قبل التصدير' : 'Tamkeen recommendations before export'}
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <ScoreCircle value={fallbackChecklistScore} muted />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
              {isArabic ? 'اكتمال أولي' : 'Baseline completion'}
            </p>
            <p className="text-sm leading-6 text-imamu-dark/70">
              {isArabic
                ? 'حلّل السيرة للحصول على تقييم أعمق ونقاط تحسين مرتبطة بمسارك.'
                : 'Analyze the CV for deeper scoring and path-aware improvement points.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-imamu-navy py-2.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-imamu-navy-deep"
        >
          <Compass className="h-4 w-4 text-imamu-warm-gold" aria-hidden="true" />
          {isArabic ? 'حلّل السيرة' : 'Analyze CV'}
        </button>

        {error && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-500">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>
    )
  }

  if (analyzing && !rating) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-imamu-navy bg-imamu-dark p-6 text-center text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-imamu-gold/40">
          <Loader2 className="h-6 w-6 animate-spin text-imamu-warm-gold" aria-hidden="true" />
        </div>
        <p className="mb-1 font-display text-base font-bold">
          {isArabic ? 'جارٍ تحليل السيرة...' : 'Analyzing your CV...'}
        </p>
        <p className="text-xs leading-relaxed text-imamu-navy-100">
          {isArabic ? `يقوم ${guideName('ar')} بمراجعة المحتوى والمهارات والملاءمة.` : `${guideName('en')} is reviewing content, skills, and relevance.`}
        </p>
      </div>
    )
  }

  if (!rating) return null

  return (
    <div className="rounded-2xl border border-imamu-gold-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep">
          <Compass className="h-4 w-4" aria-hidden="true" />
        </span>
        <h4 className="flex-1 font-display text-[15px] font-bold text-imamu-dark">
          {isArabic ? 'تقييم السيرة الذكي' : 'Smart CV rating'}
        </h4>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          title={isArabic ? 'إعادة التحليل' : 'Re-analyze'}
          className="inline-flex items-center gap-1 text-xs font-bold text-imamu-navy transition hover:text-imamu-navy-deep disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        </button>
      </div>

      <div className="mb-5 flex items-start gap-4">
        <ScoreCircle value={rating.overall} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-imamu-gold-deep">
            {isArabic ? 'نظرة صاحب الفرصة' : 'Recruiter view'}
          </p>
          <p className="text-xs leading-relaxed text-imamu-dark/80">{rating.recruiter_insight}</p>
        </div>
      </div>

      <div className="mb-5 space-y-2.5">
        {(Object.keys(CATEGORY_LABELS) as Array<keyof CvRating['categories']>).map((key) => {
          const value = rating.categories[key] ?? 0
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-imamu-dark/80">
                  {isArabic ? CATEGORY_LABELS[key].ar : CATEGORY_LABELS[key].en}
                </span>
                <span className={cn('font-bold', scoreText(value))}>{value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-imamu-navy-50">
                <div
                  className={cn('h-full rounded-full', scoreBg(value))}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {rating.strengths.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            <Award className="h-3 w-3" aria-hidden="true" />
            {isArabic ? 'نقاط القوة' : 'Strengths'}
          </p>
          <ul className="space-y-1.5">
            {rating.strengths.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-imamu-dark/75">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rating.improvements.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-imamu-gold-deep">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            {isArabic ? 'فرص التحسين' : 'Improvements'}
          </p>
          <ul className="space-y-1.5">
            {rating.improvements.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-imamu-dark/75">
                <span className="shrink-0 font-bold text-imamu-gold-deep">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-imamu-navy-50 pt-3 text-[10px] text-imamu-dark/50">
        {ratedAt && <span>{isArabic ? 'حُلّل ' : 'Analyzed '}{relativeTime(ratedAt, isArabic)}</span>}
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="inline-flex items-center gap-1 font-bold text-imamu-navy transition hover:text-imamu-navy-deep disabled:opacity-50"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {isArabic ? 'جارٍ...' : 'Analyzing...'}
            </>
          ) : (
            <>
              <RotateCcw className="h-3 w-3" />
              {isArabic ? 'إعادة التحليل' : 'Re-analyze'}
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-start gap-2 text-xs text-red-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
