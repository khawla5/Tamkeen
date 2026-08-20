import { guideName } from '@/components/shared/GuideName'
﻿import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  ChevronRight,
  Code2,
  Compass,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  RotateCcw,
  Send,
  TrendingUp,
  Users,
  Clock,
  ListChecks,
} from "lucide-react";
import { useLanguage } from "@/i18n/context";
import { useAuth } from "@/context/AuthContext";
import { CAREER_PATHS, findCareer, type CareerPath } from "@/lib/riasec";
import CareerIcon from "@/components/shared/CareerIcon";
import {
  fetchInterviewQuestions,
  gradeAnswer,
  type AnswerFeedback,
  type Difficulty,
  type InterviewQuestion,
  type QuestionCategory,
} from "@/lib/interview-prep";
import { cn } from "@/lib/utils";
import { scoreBg, scoreStroke, scoreText } from "@/lib/score-style";

type Phase = "setup" | "interview" | "summary";

interface AnsweredQuestion {
  question: InterviewQuestion;
  answer: string;
  feedback: AnswerFeedback | null;
}

const CATEGORY_META: Record<
  QuestionCategory,
  { en: string; ar: string; icon: typeof Code2; color: string; bg: string }
> = {
  technical: {
    en: "Technical",
    ar: "تقني",
    icon: Code2,
    color: "text-imamu-navy",
    bg: "bg-imamu-navy-50 border-imamu-navy-100",
  },
  behavioral: {
    en: "Behavioral",
  ar: "سلوكي",
    icon: Users,
    color: "text-imamu-navy",
    bg: "bg-imamu-sky/35 border-imamu-blue/40",
  },
  situational: {
    en: "Situational",
    ar: "موقفي",
    icon: MessageSquare,
    color: "text-imamu-gold-deep",
    bg: "bg-imamu-gold-50 border-imamu-gold-100",
  },
};

const surfaceCard =
  "relative overflow-hidden bg-white rounded-[20px] border border-imamu-navy-50 shadow-lg shadow-imamu-navy/5";
const iconTile =
  "inline-flex items-center justify-center rounded-lg bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70";
const goldIconTile =
  "inline-flex items-center justify-center rounded-lg bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100";
const primaryButton =
  "inline-flex items-center justify-center gap-2 bg-imamu-navy text-white font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-gold/25 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

export default function InterviewPrep() {
  const { isArabic } = useLanguage();
  const { loading, savedAnalysis } = useAuth();

  const [phase, setPhase] = useState<Phase>("setup");

  // The path is locked to the user's assessment top match — same source
  // as /careers, so the two pages can never disagree. While the auth context
  // is still hydrating, pathSlug is null and the UI shows a loading state.
  const pathSlug: string | null = savedAnalysis?.top_match
    ? findCareer(savedAnalysis.top_match)
      ? savedAnalysis.top_match
      : CAREER_PATHS[0].id
    : loading
      ? null
      : CAREER_PATHS[0].id;
  const pathFromAssessment = !!savedAnalysis?.top_match;
  const pathLoading = pathSlug === null;

  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [generating, setGenerating] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Interview state
  const [questions, setQuestions] = useState<AnsweredQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const currentPath = useMemo(
    () => (pathSlug ? findCareer(pathSlug) : null) ?? CAREER_PATHS[0],
    [pathSlug],
  );

  async function handleStart() {
    if (!pathSlug) return;
    setSetupError(null);
    setGenerating(true);
    try {
      const qs = await fetchInterviewQuestions({
        role: pathSlug,
        difficulty,
        language: isArabic ? "ar" : "en",
      });
      setQuestions(
        qs.map((q) => ({ question: q, answer: "", feedback: null })),
      );
      setCurrentIdx(0);
      setAnswer("");
      setPhase("interview");
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : "Failed to generate questions",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleGrade() {
    if (!questions[currentIdx]) return;
    if (answer.trim().length < 10) {
      setGradeError(isArabic ? "إجابتك قصيرة جداً" : "Answer is too short");
      return;
    }
    setGradeError(null);
    setGrading(true);
    try {
      const feedback = await gradeAnswer({
        question: questions[currentIdx].question.question,
        answer,
        language: isArabic ? "ar" : "en",
      });
      setQuestions((prev) =>
        prev.map((q, i) => (i === currentIdx ? { ...q, answer, feedback } : q)),
      );
    } catch (err) {
      setGradeError(
        err instanceof Error ? err.message : "Failed to grade answer",
      );
    } finally {
      setGrading(false);
    }
  }

  function handleNextQuestion() {
    if (currentIdx >= questions.length - 1) {
      setPhase("summary");
      return;
    }
    setCurrentIdx(currentIdx + 1);
    setAnswer("");
    setGradeError(null);
  }

  function handleRestart() {
    setPhase("setup");
    setQuestions([]);
    setCurrentIdx(0);
    setAnswer("");
    setGradeError(null);
    setSetupError(null);
  }

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy py-12 text-center">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-imamu-warm-gold mb-3">
            {isArabic ? 'مدرّب المقابلات الذكي · IMSIU' : 'Smart Interview Coach · IMSIU'}
          </p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
              <Mic className="w-6 h-6" aria-hidden="true" />
            </span>
            <h1 className="font-display font-bold text-white text-[clamp(24px,3.5vw,34px)] tracking-tight">
              {isArabic ? "تدريب المقابلات" : "Interview Preparation"}
            </h1>
          </div>
          <p className="text-imamu-navy-100 text-[15px] leading-7 max-w-2xl mx-auto">
            {isArabic
              ? "جلسة محاكاة مهنية مصممة خصيصاً لمسارك المهني، مع أسئلة واقعية وتقييم ذكي يعزز جاهزيتك للمقابلات الحقيقية."
              : "A career-tailored mock interview with realistic questions and intelligent feedback that builds your readiness for the real thing."}
          </p>
        </div>
      </section>

      {/* AI / Smart-coaching strip — premium gold band that frames the
          AI evaluation as a Tamkeen feature, not a small disclaimer. */}
      <div className="bg-imamu-gold-50/60 border-y border-imamu-gold-100">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <span className={cn(goldIconTile, "h-9 w-9 shrink-0")}>
            <Compass className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-extrabold text-imamu-gold-deep">
              {isArabic ? `تقييم ذكي بدعم من ${guideName('ar')}` : `Smart evaluation by ${guideName('en')}`}
            </p>
            <p className="text-[11.5px] text-imamu-dark/70 leading-snug mt-0.5">
              {isArabic
                ? 'كل إجابة تُحلَّل لحظياً مع نقاط قوة وفرص تحسين مرتبطة بمسارك المهني.'
                : 'Every answer is analysed in real time with personalised strengths and growth notes tied to your career path.'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
            {isArabic ? 'ميزة تمكين' : 'Tamkeen feature'}
          </span>
        </div>
      </div>

      <section className="relative bg-imamu-ice min-h-screen">
        <div
          className={cn(
            "mx-auto px-4 sm:px-6 py-8",
            phase === "setup" ? "max-w-[1600px]" : "max-w-3xl",
          )}
        >
          <AnimatePresence mode="wait">
            {phase === "setup" && (
              <SetupPanel
                key="setup"
                isArabic={isArabic}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                generating={generating}
                error={setupError}
                onStart={handleStart}
                currentPath={currentPath}
                pathFromAssessment={pathFromAssessment}
                pathLoading={pathLoading}
              />
            )}

            {phase === "interview" && questions[currentIdx] && (
              <InterviewPanel
                key={`q-${currentIdx}`}
                isArabic={isArabic}
                index={currentIdx}
                total={questions.length}
                item={questions[currentIdx]}
                answer={answer}
                onAnswerChange={setAnswer}
                grading={grading}
                error={gradeError}
                onGrade={handleGrade}
                onNext={handleNextQuestion}
              />
            )}

            {phase === "summary" && (
              <SummaryPanel
                key="summary"
                isArabic={isArabic}
                items={questions}
                onRestart={handleRestart}
                pathName={isArabic ? currentPath.titleAr : currentPath.title}
              />
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Setup panel
// ────────────────────────────────────────────────────────────────────
function SetupPanel({
  isArabic,
  difficulty,
  onDifficultyChange,
  generating,
  error,
  onStart,
  currentPath,
  pathFromAssessment,
  pathLoading,
}: {
  isArabic: boolean;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  generating: boolean;
  error: string | null;
  onStart: () => void;
  currentPath: CareerPath;
  pathFromAssessment: boolean;
  pathLoading: boolean;
}) {
  const difficulties: {
    key: Difficulty;
    en: string;
    ar: string;
    desc: string;
    descAr: string;
  }[] = [
    {
      key: "junior",
      en: "Junior",
      ar: "مبتدئ",
      desc: "Fundamentals + first concrete projects",
      descAr: "الأساسيات وأول المشاريع",
    },
    {
      key: "mid",
      en: "Mid-level",
      ar: "متوسط",
      desc: "Design + tradeoffs + ownership",
      descAr: "التصميم والمفاضلات والمسؤولية",
    },
    {
      key: "senior",
      en: "Senior",
      ar: "متقدم",
      desc: "Leadership + ambiguity + scale",
      descAr: "القيادة والغموض والنطاق",
    },
  ];

  const expectations: {
    Icon: typeof Clock;
    en: string;
    ar: string;
    desc: string;
    descAr: string;
  }[] = [
    {
      Icon: ListChecks,
      en: "5 questions",
      ar: "5 أسئلة",
      desc: "Tailored to your role and level",
      descAr: "مخصصة لمسارك ومستواك",
    },
    {
      Icon: Brain,
      en: "Tech + behavior + situation",
      ar: "تقني وسلوكي وموقفي",
      desc: "A realistic mix you'll actually face",
      descAr: "مزيج واقعي مما ستواجهه فعلاً",
    },
    {
      Icon: Award,
      en: "AI scoring",
      ar: "تقييم بالذكاء الاصطناعي",
      desc: "Per-answer feedback with strengths + gaps",
      descAr: "ملاحظات لكل إجابة مع نقاط القوة والثغرات",
    },
    {
      Icon: Clock,
      en: "~10 minutes",
      ar: "≈ 10 دقائق",
      desc: "Take it as many times as you like",
      descAr: "كرّرها بقدر ما تشاء",
    },
  ];

  // Tips grouped by phase (before / during / after) so the section reads
  // like coaching guidance instead of a generic three-line strip.
  const tipGroups: {
    Icon: typeof Mic
    label: { en: string; ar: string }
    accent: 'navy' | 'gold'
    items: { en: string; ar: string }[]
  }[] = [
    {
      Icon: ListChecks,
      label: { en: 'Before you start', ar: 'قبل البدء' },
      accent: 'navy',
      items: [
        { en: 'Find a quiet space and silence notifications.',
          ar: 'اختر مكاناً هادئاً وأوقف التنبيهات.' },
        { en: 'Pick the difficulty that reflects your current level.',
          ar: 'اختر الصعوبة التي تعكس مستواك الحالي.' },
      ],
    },
    {
      Icon: MessageSquare,
      label: { en: 'While answering', ar: 'أثناء الإجابة' },
      accent: 'gold',
      items: [
        { en: 'Use STAR for behavioural prompts: Situation, Task, Action, Result.',
          ar: 'استخدم طريقة STAR للأسئلة السلوكية: الموقف، المهمة، الإجراء، النتيجة.' },
        { en: 'Ground answers in specifics — tools, numbers, and outcomes.',
          ar: 'استند إلى تفاصيل ملموسة — الأدوات، الأرقام، والنتائج.' },
      ],
    },
    {
      Icon: Award,
      label: { en: 'After feedback', ar: 'بعد التقييم' },
      accent: 'navy',
      items: [
        { en: 'Re-read the strengths to lock them in for the real interview.',
          ar: 'راجع نقاط القوة لتثبيتها قبل المقابلة الحقيقية.' },
        { en: 'Pick one improvement and rehearse it before retaking.',
          ar: 'اختر تحسيناً واحداً وتدرّب عليه قبل إعادة الجلسة.' },
      ],
    },
  ]

  // Lightweight readiness checklist — a quick "are you ready?" pre-flight.
  const readiness: { en: string; ar: string; gold?: boolean }[] = [
    { en: 'Quiet, distraction-free space',  ar: 'مكان هادئ خالٍ من المشتتات' },
    { en: 'Examples from your experience ready', ar: 'أمثلة من خبراتك حاضرة' },
    { en: 'Difficulty level matches your stage', ar: 'مستوى الصعوبة يناسب مرحلتك', gold: true },
    { en: 'Career path reviewed beforehand',     ar: 'مراجعة المسار المهني قبل البدء' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-5"
    >
      {/* Session overview — four polished cards. AI evaluation gets the
          gold treatment because it's the headline differentiator. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {expectations.map(({ Icon, en, ar, desc, descAr }, i) => {
          const isGold = i === 2
          return (
            <div
              key={en}
              className={cn(
                'relative overflow-hidden bg-white rounded-[20px] border p-4 shadow-[0_8px_24px_-12px_rgba(4,93,132,0.18)]',
                isGold ? 'border-imamu-gold-100' : 'border-imamu-navy-50',
              )}
            >
              {isGold && (
                <span className="absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
              )}
              <div className="flex items-start gap-3">
                <div className={cn(isGold ? goldIconTile : iconTile, 'w-10 h-10 shrink-0')}>
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className={cn('font-display font-bold text-[15px] leading-tight', isGold ? 'text-imamu-gold-deep' : 'text-imamu-dark')}>
                    {isArabic ? ar : en}
                  </p>
                  <p className="mt-1 text-[11.5px] text-imamu-dark/55 leading-snug">
                    {isArabic ? descAr : desc}
                  </p>
                </div>
              </div>
              {isGold && (
                <span className="mt-3 inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
                  {isArabic ? 'مدعوم بالذكاء' : 'AI-powered'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Main setup card — the guided launcher. */}
      <div className={cn(surfaceCard, 'rounded-[24px] p-6')}>
        <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />

        {/* Eyebrow */}
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-imamu-gold-deep mb-4">
          {isArabic ? 'إعداد الجلسة' : 'Session setup'}
        </p>

        {/* 1) Selected career path */}
        <div className="rounded-[18px] border border-imamu-navy-100 bg-imamu-navy-50/60 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-xl bg-white text-imamu-navy ring-1 ring-imamu-navy-100 flex items-center justify-center">
              {pathLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <CareerIcon slug={currentPath.id} className="w-[24px] h-[24px] text-imamu-navy" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-imamu-navy/75">
                  {isArabic ? 'مسارك المهني' : 'Your target role'}
                </span>
                {pathFromAssessment && !pathLoading && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
                    {isArabic ? 'مخصص لك' : 'Personalised'}
                  </span>
                )}
              </div>
              <p className="font-display font-extrabold text-imamu-dark text-lg leading-tight mt-1 truncate">
                {pathLoading
                  ? isArabic ? 'جارٍ التحميل…' : 'Loading…'
                  : isArabic ? currentPath.titleAr : currentPath.title}
              </p>
              <p className="mt-1 text-[12px] text-imamu-dark/65 leading-snug">
                {isArabic
                  ? 'سيتم تخصيص الأسئلة والمعايير بناءً على هذا المسار.'
                  : 'Questions and grading rubric will be tailored to this path.'}
              </p>
            </div>
          </div>
        </div>

        {/* 2) Difficulty selector */}
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <span className={cn(iconTile, 'w-7 h-7')}>
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
            </span>
            <h3 className="font-display text-sm font-extrabold text-imamu-dark">
              {isArabic ? 'مستوى الصعوبة' : 'Choose your level'}
            </h3>
            <span className="text-[11px] text-imamu-dark/35">·</span>
            <span className="text-[11px] text-imamu-dark/55">
              {isArabic
                ? 'يحدد عمق الأسئلة وصرامة التقييم'
                : 'Sets question depth and grading rigour'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {difficulties.map((d) => {
              const selected = difficulty === d.key
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => onDifficultyChange(d.key)}
                  className={cn(
                    'relative overflow-hidden rounded-[16px] border-2 p-4 text-start transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-imamu-navy/35',
                    selected
                      ? 'border-imamu-navy bg-imamu-navy-50 shadow-sm shadow-imamu-navy/15'
                      : 'border-imamu-navy-100 bg-white hover:border-imamu-navy/45 hover:bg-imamu-navy-50/40',
                  )}
                  aria-pressed={selected}
                >
                  {selected && (
                    <>
                      <span
                        className="absolute inset-x-0 top-0 h-[2px] bg-imamu-gold"
                        aria-hidden="true"
                      />
                      <span
                        className="absolute end-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-imamu-navy text-white"
                        aria-hidden="true"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                    </>
                  )}
                  <p
                    className={cn(
                      'font-display font-extrabold leading-tight',
                      selected ? 'text-imamu-navy text-base' : 'text-imamu-dark text-[15px]',
                    )}
                  >
                    {isArabic ? d.ar : d.en}
                  </p>
                  <p className="text-[11.5px] text-imamu-dark/65 leading-snug mt-1.5 pe-6">
                    {isArabic ? d.descAr : d.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* 3) Error + start CTA */}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={onStart}
          disabled={generating || pathLoading}
          className={cn(primaryButton, 'mt-5 w-full rounded-2xl py-4 text-[15px]')}
        >
          {generating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              {isArabic ? 'جارٍ توليد الأسئلة…' : 'Generating questions…'}
            </>
          ) : (
            <>
              {isArabic ? 'ابدأ المقابلة' : 'Start interview'}
              <ArrowRight className="w-5 h-5 rtl:rotate-180" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {/* Tips — grouped by phase (before / during / after). Reads like
          coaching, not a footer of generic bullets. */}
      <div className="grid lg:grid-cols-3 gap-3">
        {tipGroups.map(({ Icon, label, accent, items }) => (
          <div
            key={label.en}
            className={cn(
              surfaceCard,
              'rounded-[18px] p-4',
              accent === 'gold' && 'border-imamu-gold-100',
            )}
          >
            {accent === 'gold' && (
              <span className="absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
            )}
            <div className="flex items-center gap-2 mb-3">
              <span className={cn(accent === 'gold' ? goldIconTile : iconTile, 'w-8 h-8')}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <h4
                className={cn(
                  'font-display text-sm font-extrabold',
                  accent === 'gold' ? 'text-imamu-gold-deep' : 'text-imamu-dark',
                )}
              >
                {isArabic ? label.ar : label.en}
              </h4>
            </div>
            <ul className="space-y-2">
              {items.map((it, j) => (
                <li key={j} className="flex items-start gap-2 text-[12.5px] text-imamu-dark/75 leading-snug">
                  <span
                    className={cn(
                      'mt-1.5 inline-block h-1.5 w-1.5 rounded-full shrink-0',
                      accent === 'gold' ? 'bg-imamu-gold' : 'bg-imamu-navy',
                    )}
                    aria-hidden="true"
                  />
                  <span>{isArabic ? it.ar : it.en}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Readiness checklist — quick pre-flight chips. */}
      <div className={cn(surfaceCard, 'rounded-[18px] p-4')}>
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(iconTile, 'w-7 h-7')}>
            <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <h4 className="text-[12px] font-extrabold text-imamu-dark uppercase tracking-wider">
            {isArabic ? 'جاهزية الجلسة' : 'Session readiness'}
          </h4>
          <span className="ms-auto text-[11px] text-imamu-dark/55">
            {isArabic ? 'تأكد قبل البدء' : 'Confirm before you start'}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {readiness.map((it) => (
            <div
              key={it.en}
              className={cn(
                'flex items-center gap-2 rounded-xl border bg-imamu-navy-50/50 px-3 py-2',
                it.gold ? 'border-imamu-gold-100' : 'border-imamu-navy-50',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full shrink-0',
                  it.gold ? 'bg-imamu-gold text-white' : 'bg-imamu-navy text-white',
                )}
              >
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              </span>
              <p className="text-[12.5px] text-imamu-dark/80 leading-snug">
                {isArabic ? it.ar : it.en}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Interview panel
// ────────────────────────────────────────────────────────────────────
function InterviewPanel({
  isArabic,
  index,
  total,
  item,
  answer,
  onAnswerChange,
  grading,
  error,
  onGrade,
  onNext,
}: {
  isArabic: boolean;
  index: number;
  total: number;
  item: AnsweredQuestion;
  answer: string;
  onAnswerChange: (s: string) => void;
  grading: boolean;
  error: string | null;
  onGrade: () => void;
  onNext: () => void;
}) {
  const cat = CATEGORY_META[item.question.category] ?? CATEGORY_META.technical;
  const Icon = cat.icon;
  const hasFeedback = item.feedback !== null;
  const isLast = index === total - 1;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden border border-imamu-navy-100">
          <div
            className="h-full bg-imamu-navy rounded-full"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-imamu-dark/60">
          {isArabic
            ? `سؤال ${index + 1} من ${total}`
            : `${index + 1} of ${total}`}
        </span>
      </div>

      {/* Question card */}
      <div className={cn(surfaceCard, "p-6 sm:p-8")}>
        <div className="flex items-center gap-2 mb-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] uppercase tracking-wider font-bold",
              cat.bg,
              cat.color,
            )}
          >
            <Icon className="w-3 h-3" />
            {isArabic ? cat.ar : cat.en}
          </span>
          {item.question.target_skills?.slice(0, 2).map((s) => (
            <span
              key={s}
              className="text-[10px] uppercase tracking-wider font-bold text-imamu-navy bg-imamu-navy-50 border border-imamu-navy-100 px-2 py-1 rounded-lg"
            >
              {s}
            </span>
          ))}
        </div>

        <h2 className="font-display text-xl sm:text-2xl font-bold text-imamu-dark mb-3 leading-snug">
          {item.question.question}
        </h2>

        <div className="flex items-start gap-2 bg-imamu-gold-50 rounded-xl border border-imamu-gold-100 p-3 mb-5">
          <Lightbulb className="w-4 h-4 text-imamu-gold shrink-0 mt-0.5" />
          <p className="text-xs text-imamu-dark/75 leading-relaxed">
            {item.question.hint}
          </p>
        </div>

        {/* Answer textarea */}
        <label className="block text-xs font-semibold text-imamu-dark/60 mb-1.5 uppercase tracking-wider">
          {isArabic ? "إجابتك" : "Your answer"}
        </label>
        <textarea
          value={hasFeedback ? item.answer : answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          disabled={hasFeedback || grading}
          placeholder={
            isArabic
              ? "اكتب إجابتك بالتفصيل..."
              : "Type your answer in detail..."
          }
          rows={6}
          className={cn(
            "w-full border rounded-xl p-3 text-sm text-imamu-dark resize-y bg-white placeholder:text-imamu-dark/30 transition",
            error
              ? "border-danger/40 focus:outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
              : "border-imamu-navy-100 focus:outline-none focus:border-imamu-navy focus:ring-4 focus:ring-imamu-navy/10",
            hasFeedback && "opacity-80",
          )}
        />
        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs text-danger">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
        {!hasFeedback && (
          <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-imamu-dark/50">
            <Mic className="w-3 h-3" />
            {isArabic
              ? "نصيحة: تكلّم بصوت عالٍ ثم لخّص هنا"
              : "Tip: rehearse out loud, then write a summary"}
          </p>
        )}

        {/* Submit / next */}
        {!hasFeedback ? (
          <button
            onClick={onGrade}
            disabled={grading}
            className={cn(primaryButton, "mt-4 w-full rounded-xl py-3 text-sm")}
          >
            {grading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isArabic ? "جارٍ التقييم…" : "Grading…"}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {isArabic ? "أرسل إجابتك" : "Submit answer"}
              </>
            )}
          </button>
        ) : (
          <FeedbackBlock feedback={item.feedback!} isArabic={isArabic} />
        )}
      </div>

      {/* Next question */}
      {hasFeedback && (
        <button
          onClick={onNext}
          className={cn(primaryButton, "w-full rounded-xl py-3 text-sm")}
        >
          {isLast
            ? isArabic
              ? "انهِ المقابلة"
              : "Finish interview"
            : isArabic
              ? "السؤال التالي"
              : "Next question"}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Feedback block (inside the interview panel after grading)
// ────────────────────────────────────────────────────────────────────
function FeedbackBlock({
  feedback,
  isArabic,
}: {
  feedback: AnswerFeedback;
  isArabic: boolean;
}) {
  const dims: Array<{
    key: keyof AnswerFeedback["scores"];
    en: string;
    ar: string;
  }> = [
    { key: "relevance", en: "Relevance", ar: "الملاءمة" },
    { key: "structure", en: "Structure", ar: "البنية" },
    { key: "depth", en: "Depth", ar: "العمق" },
    { key: "confidence", en: "Confidence", ar: "الثقة" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="mt-5 pt-5 border-t border-imamu-navy-50 space-y-5"
    >
      {/* Overall + dim scores */}
      <div className="flex items-start gap-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="8"
              className="stroke-imamu-navy-50"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={scoreStroke(feedback.overall)}
              style={{
                strokeDasharray: 2 * Math.PI * 42,
                strokeDashoffset:
                  2 * Math.PI * 42 -
                  (feedback.overall / 100) * (2 * Math.PI * 42),
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={cn(
                "text-xl font-extrabold",
                scoreText(feedback.overall),
              )}
            >
              {feedback.overall}
            </span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-2.5">
          {dims.map((d) => {
            const v = feedback.scores[d.key] ?? 0;
            return (
              <div key={d.key}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-imamu-dark/70 font-semibold">
                    {isArabic ? d.ar : d.en}
                  </span>
                  <span className={cn("font-bold", scoreText(v))}>{v}</span>
                </div>
                <div className="h-1.5 bg-imamu-navy-50 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", scoreBg(v))}
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-imamu-navy mb-2 flex items-center gap-1">
          <Award className="w-3 h-3" />
          {isArabic ? "نقاط القوة" : "Strengths"}
        </p>
        <ul className="space-y-1.5">
          {feedback.strengths.map((s, i) => (
            <li
              key={i}
              className="text-sm text-imamu-dark/75 leading-relaxed flex gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-imamu-navy shrink-0 mt-0.5" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Improvements */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-imamu-gold mb-2 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {isArabic ? "فرص للتحسين" : "Improvements"}
        </p>
        <ul className="space-y-1.5">
          {feedback.improvements.map((s, i) => (
            <li
              key={i}
              className="text-sm text-imamu-dark/75 leading-relaxed flex gap-2"
            >
              <span className="text-imamu-gold font-bold shrink-0">
                {i + 1}.
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Recommended answer */}
      {feedback.recommended_answer && (
        <details className="bg-imamu-gold-50 border border-imamu-gold-100 rounded-xl p-4 group">
          <summary className="cursor-pointer text-xs font-bold text-imamu-gold-deep flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            {isArabic ? "مثال على إجابة قوية" : "See a model answer"}
            <ChevronRight
              className="w-3.5 h-3.5 ms-auto rtl:rotate-180 group-open:rotate-90 rtl:group-open:rotate-90 transition-transform"
              aria-hidden="true"
            />
          </summary>
          <p className="mt-3 text-sm text-imamu-dark/75 leading-relaxed">
            {feedback.recommended_answer}
          </p>
        </details>
      )}
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Summary panel
// ────────────────────────────────────────────────────────────────────
function SummaryPanel({
  isArabic,
  items,
  onRestart,
  pathName,
}: {
  isArabic: boolean;
  items: AnsweredQuestion[];
  onRestart: () => void;
  pathName: string;
}) {
  const graded = items.filter((i) => i.feedback);
  const avg =
    graded.length > 0
      ? Math.round(
          graded.reduce((s, i) => s + (i.feedback?.overall ?? 0), 0) /
            graded.length,
        )
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Hero */}
      <div className="bg-gradient-to-br from-imamu-dark to-imamu-navy rounded-[24px] p-8 text-center text-white relative overflow-hidden">
        <div className="relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-[18px] bg-white/10 border border-imamu-gold/35 mb-3">
            <CheckCircle2 className="w-7 h-7 text-imamu-warm-gold" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">
            {isArabic ? "انتهت المقابلة" : "Interview complete"}
          </h2>
          <p className="text-imamu-navy-100 text-sm mb-6">
            {isArabic
              ? `${graded.length} من ${items.length} أسئلة قُيّمت لمسار ${pathName}`
              : `${graded.length} of ${items.length} questions graded for ${pathName}`}
          </p>

          <div className="inline-flex items-center justify-center bg-white/10 border border-white/10 rounded-[18px] px-6 py-4 gap-4">
            <span className="text-imamu-navy-100 text-xs uppercase tracking-wider font-bold">
              {isArabic ? "متوسط الأداء" : "Average score"}
            </span>
            <span className="font-display text-3xl font-extrabold text-imamu-gold-100">
              {avg}
              <span className="text-base">%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Per-question scores */}
      <div className={cn(surfaceCard, "p-5 space-y-3")}>
        {items.map((item, i) => {
          const cat = CATEGORY_META[item.question.category];
          const score = item.feedback?.overall ?? null;
          return (
            <div
              key={i}
              className="flex items-start gap-3 pb-3 border-b border-imamu-navy-50 last:border-0 last:pb-0"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-lg border text-[11px] font-bold shrink-0",
                  cat.bg,
                  cat.color,
                )}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-imamu-dark line-clamp-2">
                  {item.question.question}
                </p>
                <p className="text-[11px] text-imamu-dark/50 mt-0.5">
                  {isArabic ? cat.ar : cat.en}
                </p>
              </div>
              {score !== null ? (
                <span
                  className={cn(
                    "font-display text-lg font-extrabold shrink-0",
                    scoreText(score),
                  )}
                >
                  {score}%
                </span>
              ) : (
                <span className="text-[10px] text-imamu-dark/50 shrink-0 self-center">
                  {isArabic ? "تخطى" : "Skipped"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRestart}
          className={cn(primaryButton, "flex-1 rounded-xl py-3 text-sm")}
        >
          <RotateCcw className="w-4 h-4" />
          {isArabic ? "مقابلة جديدة" : "New interview"}
        </button>
        <a
          href="/skills-record"
          className="flex-1 inline-flex items-center justify-center gap-2 border border-imamu-navy-100 bg-white text-imamu-navy rounded-xl py-3 text-sm font-bold hover:border-imamu-navy hover:text-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/10 transition"
        >
          {isArabic ? "حدّث سيرتك الذاتية" : "Polish your CV"}
          <ArrowLeft className="w-4 h-4 rtl:hidden" />
          <ArrowRight className="w-4 h-4 hidden rtl:block" />
        </a>
      </div>
    </motion.div>
  );
}
