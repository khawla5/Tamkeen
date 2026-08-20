import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Compass, ChevronRight, RotateCcw, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { useAuth } from '@/context/AuthContext'
import PageHero from '@/components/shared/PageHero'
import { runLocalAnalysisAndSave, type CareerAnalysis } from '@/lib/career-analysis'
import { supabase } from '@/lib/supabase'
import {
  RIASEC_QUESTIONS,
  SECTIONS,
  SECTION_LABELS,
} from '@/lib/riasec'

const LETTERS = ['A', 'B', 'C', 'D']

const STORAGE_KEY = 'tamkeen-assessment'

function getSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { answers: number[]; completed: boolean }
  } catch { /* ignore */ }
  return null
}

function getCurrentSection(questionIndex: number) {
  for (const s of SECTIONS) {
    if (questionIndex >= s.range[0] && questionIndex <= s.range[1]) return s
  }
  return SECTIONS[0]
}

function QuizMode({ currentQuestion, selectedOption, onSelect }: { currentQuestion: number; selectedOption: number | null; onSelect: (i: number) => void }) {
  const { t, isArabic } = useLanguage()
  const q = RIASEC_QUESTIONS[currentQuestion]
  const total = RIASEC_QUESTIONS.length
  const progress = ((currentQuestion + 1) / total) * 100
  const section = getCurrentSection(currentQuestion)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Section indicator */}
      <div className="flex gap-1 mb-6">
        {SECTIONS.map((s) => {
          const isCurrentSection = s.key === section.key
          const isPastSection = SECTIONS.indexOf(s) < SECTIONS.indexOf(section)
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={cn(
                'h-1 rounded-full w-full transition duration-500',
                isPastSection ? 'bg-teal' : isCurrentSection ? 'bg-teal/60' : 'bg-gray-200'
              )} />
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wide hidden sm:block transition-colors',
                isCurrentSection ? 'text-teal-dark' : isPastSection ? 'text-teal-deep' : 'text-muted'
              )}>
                {isArabic ? SECTION_LABELS[s.key].ar : SECTION_LABELS[s.key].en}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mb-5">
        <span className="text-sm font-semibold text-muted whitespace-nowrap">
          {t('assessment.questionOf').replace('{current}', String(currentQuestion + 1)).replace('{total}', String(total))}
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-teal rounded-full transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm font-bold text-teal">{Math.round(progress)}%</span>
      </div>

      <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200/60 shadow-sm">
        <AnimatePresence mode="wait">
          <motion.div key={currentQuestion} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <h2 className="font-display text-[clamp(18px,3vw,22px)] text-teal-dark text-center mb-8 leading-snug">
              {isArabic ? q.questionAr : q.question}
            </h2>
            <div className="space-y-3">
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => onSelect(i)} disabled={selectedOption !== null} className={cn('group flex items-center gap-4 w-full p-5 text-start rounded-2xl border-2 transition duration-200', selectedOption === i ? 'border-teal bg-teal-50/50 scale-[0.99]' : 'border-gray-100 bg-gray-50/50 hover:border-teal hover:bg-teal-50/30 hover:translate-x-1 rtl:hover:-translate-x-1 rtl:hover:translate-x-0', selectedOption !== null && selectedOption !== i && 'opacity-50')}>
                  <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-teal-dark text-teal-light text-sm font-extrabold shrink-0">{LETTERS[i]}</span>
                  <span className="text-[15px] text-teal-dark/80 font-medium flex-1">{isArabic ? opt.textAr : opt.text}</span>
                  {selectedOption === i ? (
                    <CheckCircle className="w-5 h-5 text-teal shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-300 ms-auto group-hover:text-teal group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180 transition duration-200 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}


export default function CareerAssessment() {
  const { t, lang } = useLanguage()
  const { user, role, setAssessmentCompleted, setSavedAnalysis } = useAuth()
  const navigate = useNavigate()
  const savedState = getSavedState()

  const [currentQuestion, setCurrentQuestion] = useState(savedState?.completed ? 0 : (savedState?.answers.length ?? 0))
  const [answers, setAnswers] = useState<number[]>(savedState?.answers ?? [])
  const [showResults, setShowResults] = useState(savedState?.completed ?? false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)

  // AI analysis state
  const [analysis, setAnalysis] = useState<CareerAnalysis | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [gateChecked, setGateChecked] = useState(false)

  // Lock the route once the student has finished — only the Profile "Retake"
  // flow can unlock it (it resets student_profiles.assessment_completed).
  useEffect(() => {
    if (!user || role !== 'student') { setGateChecked(true); return }
    let cancelled = false
    supabase
      .from('student_profiles')
      .select('assessment_completed')
      .eq('user_id', user.id)
      .maybeSingle<{ assessment_completed: boolean }>()
      .then(({ data }) => {
        if (cancelled) return
        if (data?.assessment_completed) {
          navigate('/careers', { replace: true })
          return
        }
        setGateChecked(true)
      })
    return () => { cancelled = true }
  }, [user, role, navigate])

  // Once the AI finishes successfully, leave the quiz behind and surface the
  // result panel on /careers — that's the unified discovery hub.
  useEffect(() => {
    if (analysis && !aiLoading && !aiError) {
      navigate('/careers', { replace: true })
    }
  }, [analysis, aiLoading, aiError, navigate])

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      answers,
      completed: showResults,
    }))
  }, [answers, showResults])

  // Save the deterministic local analysis. Always succeeds, no AI in the
  // critical path. The AI "deep dive" is opt-in from the /careers results panel.
  const runAnalysis = useCallback(async (answersToUse: number[]) => {
    if (!user) {
      setAiError('You must be signed in')
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await runLocalAnalysisAndSave(user.id, answersToUse, lang)
      setAnalysis(result)
      setAssessmentCompleted(true)
      // Push to the shared cache so /careers paints the new result instantly
      // when we navigate over.
      setSavedAnalysis(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setAiLoading(false)
    }
  }, [user, lang, setAssessmentCompleted, setSavedAnalysis])

  // Recovery: if the page reloads after the last answer was submitted but
  // before the save finished, restore answers from localStorage and re-run.
  useEffect(() => {
    if (!gateChecked || !user) return
    if (showResults && !analysis && !aiLoading && !aiError && answers.length === RIASEC_QUESTIONS.length) {
      void runAnalysis(answers)
    }
  }, [gateChecked, user, showResults, analysis, aiLoading, aiError, answers, runAnalysis])


  const handleSelect = useCallback((optionIndex: number) => {
    if (selectedOption !== null) return
    setSelectedOption(optionIndex)
    setTimeout(() => {
      const newAnswers = [...answers, optionIndex]
      setAnswers(newAnswers)
      setSelectedOption(null)
      if (currentQuestion < RIASEC_QUESTIONS.length - 1) {
        setCurrentQuestion(q => q + 1)
      } else {
        setShowResults(true)
        // Kick off AI analysis as soon as the last answer is in.
        void runAnalysis(newAnswers)
      }
    }, 500)
  }, [selectedOption, currentQuestion, answers, runAnalysis])

  function resetAssessment() {
    setCurrentQuestion(0)
    setAnswers([])
    setShowResults(false)
    setSelectedOption(null)
    setAnalysis(null)
    setAiError(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  // Block the page until we've confirmed the student hasn't already finished —
  // prevents a flash of the quiz before the redirect to /careers fires.
  if (!gateChecked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-teal-mist">
        <Loader2 className="w-6 h-6 text-teal animate-spin" aria-hidden="true" />
      </div>
    )
  }

  return (
    <>
      <PageHero
        icon={showResults ? Compass : Brain}
        title={showResults ? t('assessment.resultsTitle') : t('assessment.title')}
        subtitle={showResults ? t('assessment.resultsSubtitle') : t('assessment.subtitle')}
        className="py-12"
      />
      <section className="relative bg-imamu-ice min-h-[60vh]">
        <AnimatePresence mode="wait">
          {showResults ? (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <ProcessingScreen
                aiLoading={aiLoading}
                aiError={aiError}
                onRetryAi={() => runAnalysis(answers)}
                onStartOver={resetAssessment}
              />
            </motion.div>
          ) : (
            <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><QuizMode currentQuestion={currentQuestion} selectedOption={selectedOption} onSelect={handleSelect} /></motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  )
}

function ProcessingScreen({
  aiError, onRetryAi, onStartOver,
}: {
  aiLoading: boolean
  aiError: string | null
  onRetryAi: () => void
  onStartOver: () => void
}) {
  const { isArabic } = useLanguage()
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
      {aiError ? (
        <>
          <div className="w-14 h-14 rounded-2xl bg-red-50 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-teal-dark mb-2">
            {isArabic ? 'تعذّر إكمال التحليل' : "Couldn't finish your analysis"}
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-5">{aiError}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onRetryAi}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal text-white rounded-xl font-bold hover:bg-teal-deep transition"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {isArabic ? 'إعادة المحاولة' : 'Try again'}
            </button>
            <button
              onClick={onStartOver}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-teal-dark rounded-xl font-semibold hover:bg-gray-50 transition"
            >
              {isArabic ? 'إعادة من البداية' : 'Start over'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-teal/10 mx-auto mb-4 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-teal animate-spin" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-teal-dark mb-2">
            {isArabic ? 'جارٍ تحليل إجاباتك' : 'Analysing your answers'}
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            {isArabic ? 'لحظة واحدة...' : 'One moment…'}
          </p>
        </>
      )}
    </div>
  )
}
