// Interview prep — runs entirely client-side off the local question bank
// and a deterministic answer grader. No Edge Function, no Gemini in the path.
// Same public types/signatures as before so the page didn't have to change.

import { pickInterviewQuestions } from '@/lib/interview-bank'
import { supabase } from '@/lib/supabase'

// Race a promise against a timeout; resolves null on timeout/error.
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    )
    return (await Promise.race([p, timeout])) as T
  } catch {
    return null
  }
}

export type QuestionCategory = 'technical' | 'behavioral' | 'situational'
export type Difficulty = 'junior' | 'mid' | 'senior'

export interface InterviewQuestion {
  id: number
  category: QuestionCategory
  question: string
  hint: string
  target_skills: string[]
}

export interface AnswerFeedback {
  scores: {
    relevance: number
    structure: number
    depth: number
    confidence: number
  }
  overall: number
  strengths: string[]
  improvements: string[]
  recommended_answer: string
}

interface QuestionsArgs {
  role: string
  difficulty: Difficulty
  language: 'en' | 'ar'
}

// Try the Gemini-backed `interview-prep` edge function (4s timeout); fall back
// silently to the local bank on any error, timeout, or bad shape.
export async function fetchInterviewQuestions(args: QuestionsArgs): Promise<InterviewQuestion[]> {
  const res = await withTimeout(
    supabase.functions.invoke('interview-prep', {
      body: { action: 'questions', role: args.role, difficulty: args.difficulty, language: args.language },
    }),
    4000,
  )
  const qs = (res && !res.error) ? (res.data as { questions?: unknown } | null)?.questions : null
  if (Array.isArray(qs) && qs.length > 0) {
    return qs as InterviewQuestion[]
  }
  return pickInterviewQuestions(args.role, args.language)
}

interface GradeArgs {
  question: string
  answer: string
  language: 'en' | 'ar'
}

function isValidFeedback(f: unknown): f is AnswerFeedback {
  if (!f || typeof f !== 'object') return false
  const o = f as Record<string, unknown>
  return !!o.scores && typeof o.overall === 'number'
    && Array.isArray(o.strengths) && Array.isArray(o.improvements)
    && typeof o.recommended_answer === 'string'
}

// Public entry — tries the Gemini-backed grader (4s timeout), falls back to the
// local heuristic invisibly. No artificial delay.
export async function gradeAnswer(args: GradeArgs): Promise<AnswerFeedback> {
  const res = await withTimeout(
    supabase.functions.invoke('interview-prep', {
      body: { action: 'grade', question: args.question, answer: args.answer, language: args.language },
    }),
    4000,
  )
  const fb = (res && !res.error) ? (res.data as { feedback?: unknown } | null)?.feedback : null
  if (isValidFeedback(fb)) return fb
  return gradeAnswerLocally(args)
}

// Heuristic grader — analyses the answer text against a few orthogonal signals.
// Same shape as the AI version, so the UI didn't need to change.
function gradeAnswerLocally(args: GradeArgs): AnswerFeedback {
  const ar = args.language === 'ar'
  const text = args.answer.trim()
  const lower = text.toLowerCase()
  const words = text.split(/\s+/).filter(Boolean)
  const wordCount = words.length

  // ── Length-driven baseline (caps so verbose ≠ great) ─────────────────────
  const lengthScore = wordCount < 10 ? 25
    : wordCount < 30 ? 50
    : wordCount < 60 ? 75
    : wordCount < 200 ? 92
    : 85

  // ── Structure (STAR keywords, transitions, paragraphing) ────────────────
  const STAR = /\b(situation|context|task|action|approach|result|outcome|impact|because|so I|so we|then|finally|first|second|third|الموقف|المهمة|الإجراء|النتيجة|التحدي|قمت|نتج|أولاً|ثانياً|ثم|أخيراً)\b/i
  const transitions = (text.match(/\b(first|then|finally|because|so|as a result|أولاً|ثم|لأن|إذاً|بالتالي)\b/gi) ?? []).length
  const hasParagraphs = /\n\s*\n|\.\s+[A-Zء-ي]/.test(text)
  const structureScore = Math.min(95,
    (STAR.test(text) ? 60 : 35) + transitions * 5 + (hasParagraphs ? 10 : 0),
  )

  // ── Depth: numbers, technical terms, named tools/companies ──────────────
  const NUMBERS = /\d+(?:\.\d+)?%?|\$\d+|\d+x\b/i.test(text)
  const TECH = /\b(API|database|microservice|React|Python|SQL|AWS|Docker|Kubernetes|architecture|scalable|deploy|test|framework|model|algorithm|patient|client|stakeholder|user|metric|kpi|cost|revenue|روبركس|نموذج|قاعدة بيانات|عميل|مريض)\b/i.test(text)
  const NAMED = /\b(Aramco|STC|SABIC|NEOM|SDAIA|KAUST|ZAKA|Misk|أرامكو|سدايا|زكا|مسك|نيوم)\b/i.test(text)
  const depthScore = Math.min(95,
    (lengthScore * 0.4) + (NUMBERS ? 25 : 0) + (TECH ? 20 : 0) + (NAMED ? 10 : 0),
  )

  // ── Confidence: first-person voice, action verbs, no hedging ────────────
  const ACTION = /\b(led|built|launched|designed|implemented|owned|drove|created|delivered|managed|coordinated|negotiated|architected|قُدت|بنيت|أطلقت|صممت|نفّذت|أدرت)\b/i
  const FIRST_PERSON = /\b(I |I'm |I've |my |we |our |أنا|قمت|عملت|طوّرت|نحن)\b/i
  const HEDGING = /\b(I think|maybe|kind of|sort of|probably|أعتقد|ربما|نوعاً ما)\b/gi
  const hedges = (text.match(HEDGING) ?? []).length
  const confidenceScore = Math.max(40, Math.min(95,
    (ACTION.test(text) ? 60 : 45) + (FIRST_PERSON.test(text) ? 15 : 0) + (NUMBERS ? 10 : 0) - hedges * 8,
  ))

  // ── Relevance: lexical overlap with the question + length floor ─────────
  const qWords = args.question.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  const sharedWords = new Set(qWords.filter((w) => lower.includes(w))).size
  const relevanceScore = Math.max(45, Math.min(95,
    50 + sharedWords * 8 + (wordCount > 30 ? 10 : 0) + (wordCount > 80 ? 10 : 0),
  ))

  const overall = Math.round(
    (relevanceScore + structureScore + depthScore + confidenceScore) / 4,
  )

  // ── Strengths / improvements (templated, picked from what scored well) ──
  const possibleStrengths: { en: string; ar: string; cond: boolean }[] = [
    { en: 'Clear structure — your answer is easy to follow.',                       ar: 'بنية واضحة — إجابتك سهلة المتابعة.',                            cond: structureScore >= 75 },
    { en: 'Strong action language signals ownership.',                              ar: 'لغة فعل قوية تعكس امتلاك المسؤولية.',                            cond: ACTION.test(text) },
    { en: 'Specifics make your answer credible.',                                   ar: 'التفاصيل الملموسة تجعل إجابتك مقنعة.',                           cond: NUMBERS || NAMED },
    { en: 'Good length — enough detail without rambling.',                          ar: 'الطول مناسب — تفاصيل كافية دون إطالة.',                          cond: wordCount >= 60 && wordCount < 200 },
    { en: 'You used the STAR pattern, which interviewers expect.',                  ar: 'استخدمت نمط STAR الذي يتوقعه المسؤولون.',                         cond: STAR.test(text) && structureScore >= 75 },
    { en: 'Confident first-person framing — your contribution is clear.',           ar: 'صياغة واثقة بضمير المتكلم — مساهمتك واضحة.',                     cond: FIRST_PERSON.test(text) && hedges === 0 },
  ]
  const possibleImprovements: { en: string; ar: string; cond: boolean }[] = [
    { en: 'Add at least one quantified result (numbers, %, time saved).',           ar: 'أضف نتيجة كميّة على الأقل (أرقام، نسب، وقت موفّر).',             cond: !NUMBERS },
    { en: 'Use the STAR structure: Situation, Task, Action, Result.',               ar: 'استخدم بنية STAR: الموقف، المهمة، الإجراء، النتيجة.',            cond: !STAR.test(text) },
    { en: 'Open with a strong action verb (Led, Built, Launched, Designed).',       ar: 'افتح بفعل قوي (قُدت، بنيت، أطلقت، صممت).',                       cond: !ACTION.test(text) },
    { en: 'Drop hedging language — say "I did" not "I think I did".',                ar: 'تجنّب التحفّظ — قل "فعلت" بدل "أعتقد أنني فعلت".',                cond: hedges > 0 },
    { en: 'Expand a bit — aim for ~60–150 words to give the interviewer enough to grade.', ar: 'وسّع قليلاً — استهدف 60–150 كلمة ليكون لدى المسؤول ما يقيّمه.', cond: wordCount < 30 },
    { en: 'Tighten it up — past 200 words you start losing the interviewer\'s focus.', ar: 'اختصر قليلاً — بعد 200 كلمة يضعف تركيز المسؤول.',                cond: wordCount > 250 },
    { en: 'Anchor your answer in a real example — name a project, tool, or stakeholder.', ar: 'استند إلى مثال واقعي — اذكر مشروعاً أو أداة أو طرفاً معنياً.', cond: !TECH && !NAMED },
  ]

  const strengths = possibleStrengths.filter((s) => s.cond).slice(0, 3).map((s) => ar ? s.ar : s.en)
  const improvements = possibleImprovements.filter((s) => s.cond).slice(0, 3).map((s) => ar ? s.ar : s.en)

  // Fallbacks if all heuristics line up the same way (good or bad).
  if (strengths.length === 0) strengths.push(ar ? 'بداية قابلة للبناء عليها — استخدم الملاحظات أدناه لرفع المستوى.' : 'A workable starting point — use the notes below to lift it.')
  if (improvements.length === 0) improvements.push(ar ? 'إجابة قوية. تابع نفس النهج في باقي الأسئلة.' : 'Strong answer. Carry the same approach into the rest of the interview.')

  // ── Recommended-answer skeleton, generic per category ──────────────────
  const lowerQ = args.question.toLowerCase()
  const isBehavioral = /\b(tell me|describe|walk me through|time|disagreed|proudest|conflict|حدّثني|صف|قدت|نزاع|تعاملت)\b/i.test(lowerQ)
  const isSituational = /\b(imagine|how would you|what would you|if you|تخيّل|ماذا تفعل|لو كنت)\b/i.test(lowerQ)
  const recommendedAnswer = isBehavioral
    ? (ar
        ? 'إجابة قوية تستخدم STAR: ابدأ بالموقف باختصار، حدّد المهمة، فصّل الإجراءات التي اتخذتها أنت تحديداً، ثم اختم بالنتيجة بأرقام أو شواهد ملموسة. لا تتحدث عن الفريق طوال الإجابة — مساهمتك يجب أن تظهر بوضوح.'
        : 'A strong answer uses STAR: briefly set the Situation, name the Task, walk through the specific Actions you took, and close with a quantified Result. Don\'t hide behind "we" — your contribution should be unmistakable.')
    : isSituational
      ? (ar
          ? 'ابدأ بإعادة صياغة الموقف بكلماتك، اذكر الافتراضات التي ستتخذها، اعرض إطار اتخاذ القرار (مثلاً: المخاطر، الأطراف المعنية، الموعد النهائي)، ثم اقترح خطوة أولى ملموسة. أظهر أنك تقرأ السياق قبل أن تقرر.'
          : 'Start by re-stating the scenario in your words, name the assumptions you\'d make, lay out a decision frame (risks, stakeholders, deadline), then propose a concrete first step. Show that you read the context before you decide.')
      : (ar
          ? 'اشرح المنهج خطوة بخطوة بدلاً من اختصار الإجابة. ابدأ بالأساسيات (التعاريف والمفاضلات)، ثم خياراً عملياً مع تبريره، وانهِ بكيف تعرف أنك نجحت (المعايير، المقاييس).'
          : 'Walk the interviewer through your reasoning step by step. Start with fundamentals (definitions, trade-offs), make a concrete choice and justify it, and close with how you\'d know you succeeded (criteria, metrics).')

  return {
    scores: {
      relevance: Math.round(relevanceScore),
      structure: Math.round(structureScore),
      depth: Math.round(depthScore),
      confidence: Math.round(confidenceScore),
    },
    overall: Math.max(0, Math.min(100, overall)),
    strengths,
    improvements,
    recommended_answer: recommendedAnswer,
  }
}
