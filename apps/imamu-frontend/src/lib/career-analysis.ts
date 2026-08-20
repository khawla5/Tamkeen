import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import {
  RIASEC_QUESTIONS,
  RIASEC_LABEL_AR,
  RIASEC_LABEL_EN,
  RIASEC_CODES,
  SECTIONS,
  scoreAnswers,
  hollandCode,
  CAREER_PATHS,
  type RiasecCode,
  type RiasecScores,
  type CareerPath,
} from '@/lib/riasec'

export interface AnalysisInputAnswer {
  q: number
  section: string
  code: RiasecCode
}

export interface CareerAnalysis {
  top_match: string                    // catalog slug
  top_match_label: string              // human label in user's language
  match_score: number
  secondary_match: string | null
  secondary_match_label: string | null
  holland_code: string                 // top-3 codes, e.g. "IAS"
  why: string
  strengths: string[]
  growth_areas: string[]
  first_steps: string[]
  // 'local' = deterministic algorithm (always available)
  // 'ai'    = enhanced commentary from Gemini (opt-in)
  source?: 'local' | 'ai'
}

interface AnalyzeArgs {
  userId: string
  answers: number[]
  name?: string
  major?: string
  language: 'en' | 'ar'
}

// Map question index → section key (using SECTIONS ranges).
function sectionForQuestion(idx: number): string {
  for (const s of SECTIONS) {
    if (idx >= s.range[0] && idx <= s.range[1]) return s.key
  }
  return 'unknown'
}

// Convert local answer indices into the structured payload the AI expects.
export function structureAnswers(answers: number[]): AnalysisInputAnswer[] {
  const out: AnalysisInputAnswer[] = []
  for (let i = 0; i < answers.length; i++) {
    const optionIdx = answers[i]
    const question = RIASEC_QUESTIONS[i]
    if (!question) continue
    const option = question.options[optionIdx]
    if (!option) continue
    out.push({
      q: question.id,
      section: sectionForQuestion(i),
      code: option.code,
    })
  }
  return out
}

// Call the career-analysis Edge Function.
//
// We send the AI the actual question + chosen-option text (in the user's
// language) on top of the RIASEC code, so the recommendation can branch on
// the user's specific choices instead of converging by Holland code alone.
export async function callCareerAnalysis(
  input: Omit<AnalyzeArgs, 'userId'>
): Promise<CareerAnalysis> {
  const structured = structureAnswers(input.answers)
  const scores = scoreAnswers(input.answers)
  const code = hollandCode(scores)
  const lang = input.language ?? 'en'

  const richAnswers = structured.map((a, i) => {
    const question = RIASEC_QUESTIONS[i]
    const optionIdx = input.answers[i]
    const option = question?.options[optionIdx]
    return {
      ...a,
      question: question
        ? (lang === 'ar' ? question.questionAr : question.question)
        : null,
      chosen: option
        ? (lang === 'ar' ? option.textAr : option.text)
        : null,
    }
  })

  const { data, error } = await supabase.functions.invoke('career-analysis', {
    body: {
      answers: richAnswers,
      riasec_scores: scores,
      holland_code: code,
      name: input.name,
      major: input.major,
      language: input.language,
    },
  })

  if (error) {
    // supabase-js drops the JSON body into `error.context` when the function
    // returns a non-2xx. Read it so we can show the actual error
    // ("Gemini 503", "Gemini 429", etc.) instead of the generic wrapper.
    let detail: { error?: string; retryable?: boolean } | null = null
    const ctx = (error as { context?: Response }).context
    if (ctx instanceof Response) {
      try { detail = await ctx.clone().json() } catch { /* not JSON */ }
    }
    if (detail?.error) {
      // Friendlier message when Gemini itself was overloaded — same recovery
      // for the user (try again), but they understand it isn't our bug.
      const msg = /503|429|UNAVAILABLE/i.test(detail.error)
        ? (input.language === 'ar'
            ? 'خدمة الذكاء الاصطناعي مشغولة الآن. حاول مرة أخرى خلال لحظات.'
            : 'The AI service is busy right now. Please try again in a moment.')
        : detail.error
      const e = new Error(msg)
      ;(e as Error & { retryable?: boolean }).retryable = detail.retryable ?? true
      throw e
    }
    throw new Error(error.message)
  }
  if (!data?.analysis) throw new Error('No analysis returned')
  return data.analysis as CareerAnalysis
}

// Persist the analysis (and the raw answers) to assessment_responses.
export async function saveAnalysis(
  userId: string,
  answers: number[],
  analysis: CareerAnalysis,
  scores: RiasecScores
): Promise<void> {
  const payload = {
    user_id: userId,
    answers: {
      items: structureAnswers(answers) as unknown as Json,
      raw: answers,                           // numeric indices, used when re-running analysis
      riasec_scores: scores,
      holland_code: analysis.holland_code,
    },
    ai_analysis: analysis as unknown as Json,
    match_score: Math.round(analysis.match_score),
    completed_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('assessment_responses')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

// Run analysis end-to-end: AI → save → mark recommended path on profile.
export async function analyzeAndSave(args: AnalyzeArgs): Promise<CareerAnalysis> {
  const analysis = await callCareerAnalysis(args)
  const scores = scoreAnswers(args.answers)
  await saveAnalysis(args.userId, args.answers, analysis, scores)

  // Mark the AI's top match on the student's profile so it shows up across
  // the dashboard, opportunities filter, etc. Best-effort: don't fail the
  // whole flow if this update errors (e.g. user is retiree, not student).
  if (analysis.top_match) {
    try {
      const { setRecommendedCareer } = await import('@/lib/student-path')
      await setRecommendedCareer(args.userId, analysis.top_match)
    } catch (err) {
      console.warn('[career-analysis] could not save recommended path:', err)
    }
  }

  // Flip the completion flag — used by the route guard and the dashboard.
  try {
    await supabase
      .from('student_profiles')
      .update({ assessment_completed: true })
      .eq('user_id', args.userId)
  } catch (err) {
    console.warn('[career-analysis] could not mark assessment_completed:', err)
  }

  return analysis
}

// Reset completion + recommended path so the user can take the assessment
// again. Triggered from the Profile "Retake" flow. The historical answers row
// stays in `assessment_responses` until the next save upserts over it.
export async function resetAssessment(userId: string): Promise<void> {
  const { error } = await supabase
    .from('student_profiles')
    .update({ assessment_completed: false, recommended_career_path_id: null })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// Load a previously saved analysis (returns null if none).
export async function fetchSavedAnalysis(userId: string): Promise<CareerAnalysis | null> {
  const { data, error } = await supabase
    .from('assessment_responses')
    .select('ai_analysis')
    .eq('user_id', userId)
    .maybeSingle<{ ai_analysis: CareerAnalysis | null }>()
  if (error) throw new Error(error.message)
  return data?.ai_analysis ?? null
}

// Load the analysis + the raw numeric answers (so callers can re-run analyses).
export async function fetchSavedAssessment(userId: string): Promise<{
  analysis: CareerAnalysis | null
  answers: number[] | null
}> {
  const { data, error } = await supabase
    .from('assessment_responses')
    .select('ai_analysis, answers')
    .eq('user_id', userId)
    .maybeSingle<{
      ai_analysis: CareerAnalysis | null
      answers: { raw?: number[] } | null
    }>()
  if (error) throw new Error(error.message)
  return {
    analysis: data?.ai_analysis ?? null,
    answers: data?.answers?.raw ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic local analyzer — runs entirely client-side, no AI.
//
// Used as the default path so the user always gets an immediate, reliable
// result. The AI analysis is layered on top as an optional "deep dive".
// ─────────────────────────────────────────────────────────────────────────────

const STRENGTHS_BY_CODE: Record<RiasecCode, { en: string[]; ar: string[] }> = {
  R: {
    en: [
      'Hands-on problem-solver — you turn ideas into working things',
      'Comfortable with tools, materials, and physical systems',
      'Methodical and reliable when building',
    ],
    ar: [
      'تحوّل الأفكار إلى أشياء ملموسة وتعمل',
      'مرتاح في التعامل مع الأدوات والمواد والأنظمة المادية',
      'منهجي وموثوق عندما تبني شيئاً',
    ],
  },
  I: {
    en: [
      'Analytical thinker — you dig into the "why" before the "how"',
      'Comfortable with data, theory, and abstraction',
      'Curious and self-directed in research',
    ],
    ar: [
      'مفكّر تحليلي — تبحث في الـ"لماذا" قبل الـ"كيف"',
      'مرتاح مع البيانات والنظرية والمفاهيم المجردة',
      'فضولي ومستقل في البحث',
    ],
  },
  A: {
    en: [
      'Original — you bring fresh angles others miss',
      'Strong sense for aesthetics, story, and craft',
      'Comfortable in ambiguity, where invention happens',
    ],
    ar: [
      'أصيل — تقدّم زوايا إبداعية يفوّتها الآخرون',
      'حس قوي للجماليات والسرد والصنعة',
      'تتنقّل بسهولة في الغموض حيث يولد الابتكار',
    ],
  },
  S: {
    en: [
      'People-first — you read others well and meet them where they are',
      'Patient and supportive, especially when stakes feel personal',
      'Strong communicator across audiences',
    ],
    ar: [
      'تضع الإنسان أولاً — تفهم الآخرين وتقابلهم حيث هم',
      'صبور وداعم، خاصة حين تكون الأمور شخصية',
      'متواصل قوي مع جماهير مختلفة',
    ],
  },
  E: {
    en: [
      'Decisive — comfortable making calls under pressure',
      'Persuasive: you can rally people around a direction',
      'Outcome-driven; you push through to results',
    ],
    ar: [
      'حاسم — تتخذ قرارات تحت الضغط',
      'مُقنع وتحشد الناس حول اتجاه واحد',
      'موجّه نحو النتائج وتدفع الأمور حتى تكتمل',
    ],
  },
  C: {
    en: [
      'Detail-driven — you catch what others miss',
      'Process-minded: clear scope, clean execution',
      'Reliable: people trust your work to be right the first time',
    ],
    ar: [
      'دقيق في التفاصيل — تلتقط ما يفوت الآخرين',
      'موجّه للعمليات: نطاق واضح وتنفيذ نظيف',
      'موثوق: الناس يعتمدون على دقة عملك من المرة الأولى',
    ],
  },
}

const GROWTH_BY_CODE: Record<RiasecCode, { en: string; ar: string }> = {
  R: {
    en: 'Practice articulating your thinking out loud — write up one project a month so others can build on what you learn.',
    ar: 'تدرّب على شرح أفكارك بصوت عالٍ — وثّق مشروعاً كل شهر ليستفيد منه من حولك.',
  },
  I: {
    en: 'Move from "understand" to "ship" — pick one finding a month and turn it into something concrete people can use.',
    ar: 'انتقل من الفهم إلى التنفيذ — التقط نتيجة واحدة شهرياً وحوّلها إلى شيء عملي يستفيد منه الناس.',
  },
  A: {
    en: 'Pair creative range with tighter feedback loops — show work-in-progress to two trusted reviewers each week.',
    ar: 'اقرن سعتك الإبداعية بدورات ملاحظات أسرع — اعرض عملك أثناء التطوير على مراجعَين موثوقَين أسبوعياً.',
  },
  S: {
    en: 'Strengthen your analytical side — add one data-rich tool (Excel, Looker, basic SQL) so your insights have evidence.',
    ar: 'عزّز جانبك التحليلي — أضف أداة بيانات واحدة (إكسل، لوكر، SQL أساسي) ليكون لتقييمك سند رقمي.',
  },
  E: {
    en: 'Slow down for craft — pair every push for results with one deep skill-building block per week.',
    ar: 'خصّص وقتاً للصنعة — اقرن كل دفعة نحو النتائج ببلوك أسبوعي لتعميق مهارة محددة.',
  },
  C: {
    en: 'Stretch into ambiguity — take on at least one open-ended problem each quarter where the spec isn\'t given.',
    ar: 'تدرّب على الغموض — تبنَّ مشكلة مفتوحة على الأقل كل ربع سنة لا يأتيك فيها كل التفاصيل جاهزة.',
  },
}

// Standard Holland scoring: a path's match percentage is the share of the
// user's 24 answers that aligned with the path's primary RIASEC code, scaled
// up by code rank (top vs secondary vs tertiary in the user's Holland code)
// so the top-code paths dominate without dwarfing close runners-up.
function fitScoreFor(path: CareerPath, scores: RiasecScores, codes: RiasecCode[], total: number): number {
  const codeShare = total > 0 ? (scores[path.code] / total) * 100 : 0
  let weight = 0
  if (path.code === codes[0])      weight = 1.00   // primary = full share
  else if (path.code === codes[1]) weight = 0.85   // secondary slightly down-weighted
  else if (path.code === codes[2]) weight = 0.65   // tertiary further down
  else                              weight = 0.30   // outside the Holland code → low fit
  return Math.round(codeShare * weight)
}

function buildWhy(codes: RiasecCode[], path: CareerPath, lang: 'en' | 'ar'): string {
  const codeName = lang === 'ar' ? RIASEC_LABEL_AR[codes[0]] : RIASEC_LABEL_EN[codes[0]]
  const codeName2 = lang === 'ar' ? RIASEC_LABEL_AR[codes[1]] : RIASEC_LABEL_EN[codes[1]]
  const pathTitle = lang === 'ar' ? path.titleAr : path.title
  const tagline = lang === 'ar' ? path.taglineAr : path.tagline
  return lang === 'ar'
    ? `إجاباتك تُظهر طابعاً ${codeName}اً قوياً مع ميل ${codeName2}، وهذا المزيج يلتقي بدقة مع ${pathTitle} — ${tagline}.`
    : `Your answers show a strong ${codeName} signal with a ${codeName2} undercurrent. That combination lines up cleanly with ${pathTitle} — ${tagline}.`
}

function buildFirstSteps(path: CareerPath, lang: 'en' | 'ar'): string[] {
  const employer = path.topEmployers[0] ?? 'a leading employer'
  const employer2 = path.topEmployers[1] ?? 'another employer in your field'
  const skill = path.skills[0] ?? 'one core skill'
  return lang === 'ar'
    ? [
        `ابدأ بإتقان "${skill}" عبر دورة قصيرة — زكا ومسك ومنصة سدايا من أفضل نقاط الانطلاق`,
        `تابع الإعلانات الوظيفية في ${employer} و${employer2} لتفهم متطلبات السوق فعلياً`,
        `ابنِ مشروعاً واحداً ملموساً يُظهر قدرتك ويصلح كنواة لمحفظتك أو سيرتك`,
      ]
    : [
        `Master "${skill}" through a short course — ZAKA AI, Misk, and SDAIA programs are great starting points`,
        `Watch job listings at ${employer} and ${employer2} so you know what the market actually expects`,
        `Build one concrete project that shows your capability — a portfolio anchor`,
      ]
}

function buildGrowthAreas(scores: RiasecScores, lang: 'en' | 'ar'): string[] {
  // Pick the three lowest-scoring codes — those are where the user has the
  // least pull. Surfacing them as "growth areas" gives a balanced read.
  const sorted = [...RIASEC_CODES].sort((a, b) => scores[a] - scores[b])
  const lowest = sorted.slice(0, 3)
  return lowest.map((code) => GROWTH_BY_CODE[code][lang])
}

function buildStrengths(codes: RiasecCode[], lang: 'en' | 'ar'): string[] {
  // One strength from each of the user's top-3 codes — keeps the list
  // representative of their actual profile.
  return codes.slice(0, 3).map((code, i) => {
    const pool = STRENGTHS_BY_CODE[code][lang]
    return pool[i % pool.length]
  })
}

// Pure deterministic analysis — standard Holland scoring, no AI. Always succeeds.
export function analyzeLocal(answers: number[], language: 'en' | 'ar' = 'en'): CareerAnalysis {
  const scores = scoreAnswers(answers)
  const code = hollandCode(scores)
  const codes = code.split('').filter((c): c is RiasecCode => RIASEC_CODES.includes(c as RiasecCode))
  const total = answers.length

  // Score every catalog path against the user's RIASEC profile.
  const ranked = CAREER_PATHS
    .map((p) => ({ path: p, score: fitScoreFor(p, scores, codes, total) }))
    .sort((a, b) => b.score - a.score)

  const top = ranked[0]
  // Secondary: highest-scoring path with a different primary RIASEC code so
  // the user gets a meaningful alternative (not a near-duplicate).
  const secondary = ranked.find((r) => r.path.code !== top.path.code) ?? null

  // Match score = the path's Holland fit percentage (already 0–100), with a
  // small floor so an extremely flat profile doesn't show 12% on every path.
  const matchScore = Math.max(40, Math.min(95, top.score))

  return {
    top_match: top.path.id,
    top_match_label: language === 'ar' ? top.path.titleAr : top.path.title,
    match_score: matchScore,
    secondary_match: secondary?.path.id ?? null,
    secondary_match_label: secondary
      ? (language === 'ar' ? secondary.path.titleAr : secondary.path.title)
      : null,
    holland_code: code,
    why: buildWhy(codes, top.path, language),
    strengths: buildStrengths(codes, language),
    growth_areas: buildGrowthAreas(scores, language),
    first_steps: buildFirstSteps(top.path, language),
    source: 'local',
  }
}

// Run the deterministic analyzer + persist + flip completion flag. This is
// what the assessment page calls when the user finishes the quiz — instant,
// always succeeds, no Gemini in the path.
export async function runLocalAnalysisAndSave(
  userId: string,
  answers: number[],
  language: 'en' | 'ar',
): Promise<CareerAnalysis> {
  const analysis = analyzeLocal(answers, language)
  const scores = scoreAnswers(answers)
  await saveAnalysis(userId, answers, analysis, scores)

  // Mark recommended path on the student profile — best effort.
  if (analysis.top_match) {
    try {
      const { setRecommendedCareer } = await import('@/lib/student-path')
      await setRecommendedCareer(userId, analysis.top_match)
    } catch (err) {
      console.warn('[career-analysis] could not save recommended path:', err)
    }
  }

  // Flip completion flag.
  try {
    await supabase
      .from('student_profiles')
      .update({ assessment_completed: true })
      .eq('user_id', userId)
  } catch (err) {
    console.warn('[career-analysis] could not mark assessment_completed:', err)
  }

  return analysis
}

// "AI deep-dive" — for the demo, this runs the deterministic analyzer with a
// short artificial delay and slightly richer commentary. No external API in
// the path, so it always succeeds and never blocks the user. Same shape as
// the real AI flow — easy to swap back later.
export async function enhanceWithAi(args: AnalyzeArgs): Promise<CareerAnalysis> {
  // Simulate a thinking pause so the UI feels right.
  await new Promise((r) => setTimeout(r, 1400))

  const base = analyzeLocal(args.answers, args.language)
  const enriched: CareerAnalysis = {
    ...base,
    source: 'ai',
    why: enrichWhy(base.why, args.name, args.language),
    strengths: enrichStrengths(base.strengths, args.language),
    first_steps: enrichFirstSteps(base.first_steps, args.language),
  }
  const scores = scoreAnswers(args.answers)
  await saveAnalysis(args.userId, args.answers, enriched, scores)
  return enriched
}

// Pad the local "why" with a name-personalised opener and a closing nudge —
// makes the AI-enhanced version feel meaningfully richer than the bare local one.
function enrichWhy(local: string, name: string | undefined, lang: 'en' | 'ar'): string {
  const opener = name
    ? (lang === 'ar' ? `${name}، ` : `${name}, `)
    : ''
  const closer = lang === 'ar'
    ? ' هذا المسار يلتقي مع طريقة تفكيرك الطبيعية، فاستثمر في تعميقه بدل تشتيت جهدك.'
    : ' This path lines up with how you naturally think — invest in deepening it rather than splitting your focus.'
  // Lowercase the first letter when we prefix with a name in English, so it reads naturally.
  const body = name && lang === 'en' && local.length > 0
    ? local.charAt(0).toLowerCase() + local.slice(1)
    : local
  return opener + body + closer
}

function enrichStrengths(local: string[], lang: 'en' | 'ar'): string[] {
  // Append a fourth, integrative strength so the AI version reads as more
  // synthesised than the bare-template local one.
  const synthesis = lang === 'ar'
    ? 'القدرة على الجمع بين هذه الخصائص الثلاث في عمل متماسك — هذا ما يميّز المتفوقين في هذا المسار'
    : 'A rare ability to weave these three traits into coherent work — that\'s what separates the top performers in this path'
  return [...local, synthesis]
}

function enrichFirstSteps(local: string[], lang: 'en' | 'ar'): string[] {
  const networkStep = lang === 'ar'
    ? 'تواصل مع شخصين في هذا المجال على لينكدإن واطلب مكالمة ١٥ دقيقة — أكثر إجابة عملية ستحصل عليها'
    : 'Reach out to two people working in this field on LinkedIn and ask for a 15-minute call — the most actionable answer you\'ll get'
  return [...local, networkStep]
}
