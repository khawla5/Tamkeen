import { supabase } from '@/lib/supabase'
import type { CvSnapshot } from '@/lib/cv'
import type { Json } from '@/types/database'

export interface CvRating {
  overall: number
  categories: {
    completeness: number
    impact: number
    clarity: number
    keywords: number
    relevance: number
  }
  strengths: string[]
  improvements: string[]
  recruiter_insight: string
}

export interface SavedCvRating {
  rating: CvRating
  ratedAt: Date
}

interface RateArgs {
  userId: string
  cv: CvSnapshot
  recommendedPathSlug?: string | null
  language: 'en' | 'ar'
}

// Deterministic local CV rater — no Edge Function, no Gemini, always succeeds.
// Used for the demo so the "AI rating" feature doesn't depend on an external
// model. Matches the same shape the AI version would have produced.
function rateCvLocally(args: RateArgs): CvRating {
  const { cv, language } = args
  const ar = language === 'ar'

  // ── Completeness (0–100) — does the CV have the basic blocks filled? ────
  const personalChecks = [
    !!cv.personal.nameEn?.trim(),
    !!cv.personal.email?.trim(),
    !!cv.personal.phone?.trim(),
    !!cv.personal.city?.trim(),
    !!cv.personal.linkedin?.trim(),
    !!cv.personal.summary?.trim(),
  ]
  const personalScore = (personalChecks.filter(Boolean).length / personalChecks.length) * 100
  const eduScore = cv.education.some((e) => e.school && e.degree) ? 100 : 0
  const expScore = cv.experience.some((e) => e.title && e.company) ? 100 : (cv.experience.some((e) => e.title) ? 50 : 0)
  const skillScore = Math.min(100, cv.skills.length * 14) // 7+ skills → 100
  const completeness = Math.round((personalScore * 0.30) + (eduScore * 0.25) + (expScore * 0.25) + (skillScore * 0.20))

  // ── Impact (0–100) — strong action verbs + numbers in experience text ───
  const ACTION_VERBS = /\b(led|built|launched|designed|automated|reduced|increased|grew|shipped|optimi[sz]ed|delivered|managed|architected|developed|improved|drove|owned|created|implemented|scaled)\b/i
  const NUMBERS = /\d+(?:\.\d+)?%?|\$\d+|\d+x\b/i
  let impact = 0
  let expWithText = 0
  for (const e of cv.experience) {
    if (!e.description) continue
    expWithText++
    if (ACTION_VERBS.test(e.description)) impact += 30
    if (NUMBERS.test(e.description)) impact += 20
  }
  if (expWithText === 0) impact = 0
  else impact = Math.min(100, Math.round(impact / expWithText))

  // ── Clarity (0–100) — summary length + experience description length ────
  const summaryLen = cv.personal.summary?.trim().length ?? 0
  const summaryClarity = summaryLen === 0 ? 0 : summaryLen < 80 ? 50 : summaryLen < 400 ? 100 : 70
  const avgDescLen = expWithText > 0
    ? cv.experience.reduce((sum, e) => sum + (e.description?.length ?? 0), 0) / expWithText
    : 0
  const descClarity = avgDescLen === 0 ? 0 : avgDescLen < 60 ? 40 : avgDescLen < 400 ? 100 : 75
  const clarity = Math.round((summaryClarity * 0.4) + (descClarity * 0.6))

  // ── Keywords (0–100) — number + variety of skill tokens ─────────────────
  const skillTokens = new Set(cv.skills.map((s) => s.name.toLowerCase()))
  const keywords = Math.round(Math.min(100, skillTokens.size * 12))

  // ── Relevance (0–100) — overlap between user skills and recommended path ─
  let relevance = Math.min(80, skillTokens.size * 8) // baseline
  if (args.recommendedPathSlug) {
    // We don't ship riasec catalog in this lib, but we do have skill names.
    // Heuristic: more skills = more likely to overlap with any path.
    relevance = Math.min(100, relevance + 20)
  }

  const overall = Math.round(
    (completeness * 0.25) + (impact * 0.25) + (clarity * 0.20) + (keywords * 0.15) + (relevance * 0.15),
  )

  // ── Strengths / improvements text (templated, picks 3 of each) ──────────
  const possibleStrengths: { en: string; ar: string; cond: boolean }[] = [
    { en: 'Contact and identity sections are complete — recruiters can reach you.', ar: 'بياناتك الأساسية مكتملة وسهل التواصل معك.', cond: personalScore >= 80 },
    { en: 'Action verbs in your experience signal ownership.',                       ar: 'الأفعال القيادية في خبراتك تعكس المسؤولية والمبادرة.', cond: impact >= 50 && ACTION_VERBS.test(cv.experience.map((e) => e.description ?? '').join(' ')) },
    { en: 'Numbers in your experience descriptions make impact concrete.',           ar: 'الأرقام في وصف خبراتك تجعل الأثر ملموساً.',         cond: NUMBERS.test(cv.experience.map((e) => e.description ?? '').join(' ')) },
    { en: 'Summary is well-sized for a quick scan.',                                  ar: 'ملخصك المهني بطول مناسب للقراءة السريعة.',           cond: summaryClarity >= 90 },
    { en: 'Skill list is broad — gives recruiters multiple hooks.',                   ar: 'قائمة مهاراتك واسعة وتمنح المسؤولين عدة نقاط جذب.',  cond: skillTokens.size >= 6 },
    { en: 'LinkedIn is included — good for cross-referencing.',                       ar: 'إدراجك لرابط لينكدإن يسهّل التحقق من ملفك.',         cond: !!cv.personal.linkedin?.trim() },
  ]
  const possibleImprovements: { en: string; ar: string; cond: boolean }[] = [
    { en: 'Add a 2-3 sentence professional summary at the top.',                       ar: 'أضف ملخصاً مهنياً من 2-3 جمل في الأعلى.',           cond: summaryLen < 80 },
    { en: 'Quantify at least one achievement per role (numbers, %, $, time).',         ar: 'أضف أرقاماً ملموسة (نسب، مبالغ، فترات) في كل دور.', cond: !NUMBERS.test(cv.experience.map((e) => e.description ?? '').join(' ')) },
    { en: 'Open each bullet with a strong action verb (Led, Built, Launched…).',       ar: 'ابدأ كل سطر بفعل قيادي (قُدت، بنيت، أطلقت…).',     cond: !ACTION_VERBS.test(cv.experience.map((e) => e.description ?? '').join(' ')) },
    { en: 'Add at least 6–8 skills relevant to your target role.',                     ar: 'أضف 6-8 مهارات على الأقل مرتبطة بمسارك المستهدف.',  cond: skillTokens.size < 6 },
    { en: 'Add a LinkedIn URL so recruiters can verify your profile.',                 ar: 'أضف رابط لينكدإن ليتمكن المسؤولون من التحقق منك.',  cond: !cv.personal.linkedin?.trim() },
    { en: 'Expand experience descriptions — aim for 2–3 strong bullets per role.',     ar: 'وسّع وصف خبراتك — استهدف 2-3 نقاط قوية لكل دور.',   cond: avgDescLen < 80 && cv.experience.length > 0 },
    { en: 'Fill in a phone number — recruiters often follow up by call.',              ar: 'أدخل رقم هاتفك — كثير من المسؤولين يفضّلون المكالمة.', cond: !cv.personal.phone?.trim() },
  ]

  const strengths = possibleStrengths.filter((s) => s.cond).slice(0, 3).map((s) => ar ? s.ar : s.en)
  const improvements = possibleImprovements.filter((s) => s.cond).slice(0, 3).map((s) => ar ? s.ar : s.en)

  // Fallback if the CV is so empty/full that no items match.
  if (strengths.length === 0) strengths.push(ar ? 'بداية قابلة للبناء عليها — أكمل القسم التالي لتحسين تقييمك.' : 'A workable starting point — fill in the next section to lift your score.')
  if (improvements.length === 0) improvements.push(ar ? 'سيرتك في حالة جيدة — حدّث المحتوى دورياً ليبقى ملائماً.' : 'Your CV is in good shape — refresh the content periodically to keep it relevant.')

  // ── Recruiter-style closing line ────────────────────────────────────────
  const insightTone =
    overall >= 85 ? (ar ? 'ملف قوي وجاهز للتقديم — ركّز على دقة محتوى المقابلة بدلاً من السيرة.' : 'A strong, ready-to-send profile — focus on interview prep more than further CV edits.')
    : overall >= 70 ? (ar ? 'سيرة جيدة. تعديلان أو ثلاثة على المحتوى ترفع التقييم لمستوى متفوّق.' : 'Solid CV. Two or three content edits will lift it into top-tier.')
    : overall >= 55 ? (ar ? 'البناء جيد. أكمل أقسام الخبرة والمهارات للحصول على تقييم تنافسي.' : 'Good bones. Round out the experience and skills sections to land a competitive score.')
    : (ar ? 'في مرحلة مبكرة. أضف الملخص والخبرات والمهارات بأمثلة ملموسة.' : 'Early stage. Add a summary, experience, and concrete skill examples.')

  return {
    overall: Math.max(0, Math.min(100, overall)),
    categories: {
      completeness: Math.round(completeness),
      impact: Math.round(impact),
      clarity: Math.round(clarity),
      keywords: Math.round(keywords),
      relevance: Math.round(relevance),
    },
    strengths,
    improvements,
    recruiter_insight: insightTone,
  }
}

// Validate the edge-function rating shape before trusting it.
function isValidRating(r: unknown): r is CvRating {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  if (typeof o.overall !== 'number') return false
  if (!o.categories || typeof o.categories !== 'object') return false
  if (!Array.isArray(o.strengths) || !Array.isArray(o.improvements)) return false
  if (typeof o.recruiter_insight !== 'string') return false
  return true
}

// Try the Gemini-backed `cv-analysis` edge function with a 4s timeout; on any
// error, timeout, or shape mismatch, fall back silently to the local rater so
// nothing can hang or error on screen.
async function rateCvViaEdge(args: RateArgs): Promise<CvRating | null> {
  try {
    const invoke = supabase.functions.invoke('cv-analysis', {
      body: {
        cv: args.cv,
        recommendedPathSlug: args.recommendedPathSlug ?? null,
        language: args.language,
      },
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('cv-analysis timeout')), 4000),
    )
    const { data, error } = (await Promise.race([invoke, timeout])) as Awaited<typeof invoke>
    if (error) return null
    const rating = (data as { rating?: unknown } | null)?.rating
    return isValidRating(rating) ? rating : null
  } catch {
    return null
  }
}

// Public entry point — same shape as before. Tries the real AI rating first and
// falls back to the local heuristic invisibly. No artificial delay.
export async function rateCvAndSave(args: RateArgs): Promise<CvRating> {
  const rating = (await rateCvViaEdge(args)) ?? rateCvLocally(args)
  const ratedAtIso = new Date().toISOString()

  // Persist alongside the CV row — best effort.
  const { error: saveError } = await supabase
    .from('cv_data')
    .update({
      ai_rating: rating as unknown as Json,
      ai_rating_at: ratedAtIso,
    })
    .eq('user_id', args.userId)

  if (saveError) {
    console.warn('[cv-rating] could not persist:', saveError.message)
  }

  return rating
}

// Load a previously saved rating (returns null if none).
export async function fetchSavedCvRating(userId: string): Promise<SavedCvRating | null> {
  const { data, error } = await supabase
    .from('cv_data')
    .select('ai_rating, ai_rating_at')
    .eq('user_id', userId)
    .maybeSingle<{ ai_rating: CvRating | null; ai_rating_at: string | null }>()

  if (error || !data?.ai_rating || !data.ai_rating_at) return null
  return {
    rating: data.ai_rating,
    ratedAt: new Date(data.ai_rating_at),
  }
}
