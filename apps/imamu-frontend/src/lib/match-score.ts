import { supabase } from '@/lib/supabase'
import { findCareer } from '@/lib/riasec'
import { fetchRecommendedCareerSlug } from '@/lib/student-path'
import type { Opportunity } from '@/types'
import type { Role } from '@/context/AuthContext'

export interface MatchContext {
  userSkills: string[]              // lowercased, deduped
  recommendedPathSlug: string | null
}

const EMPTY_CTX: MatchContext = { userSkills: [], recommendedPathSlug: null }

// Pull everything we need to score opportunities for the current user.
// Safe to call for any role — empty for roles that don't have signal.
export async function fetchMatchContext(
  userId: string,
  role: Role | null,
): Promise<MatchContext> {
  if (!userId) return EMPTY_CTX

  const collected: string[] = []
  let recommendedPathSlug: string | null = null

  if (role === 'student') {
    const [{ data: skills }, slug] = await Promise.all([
      supabase
        .from('student_skills')
        .select('name')
        .eq('student_id', userId),
      fetchRecommendedCareerSlug(userId),
    ])
    if (skills) {
      for (const s of skills as Array<{ name: string }>) {
        if (s?.name) collected.push(s.name)
      }
    }
    recommendedPathSlug = slug
  } else if (role === 'retiree') {
    const { data } = await supabase
      .from('retiree_profiles')
      .select('expertise, expertise_ar')
      .eq('user_id', userId)
      .maybeSingle<{ expertise: string[] | null; expertise_ar: string[] | null }>()
    for (const s of data?.expertise ?? []) collected.push(s)
    for (const s of data?.expertise_ar ?? []) collected.push(s)
  } else if (role === 'employee') {
    const { data } = await supabase
      .from('employee_profiles')
      .select('upskilling_goals')
      .eq('user_id', userId)
      .maybeSingle<{ upskilling_goals: string[] | null }>()
    for (const s of data?.upskilling_goals ?? []) collected.push(s)
  }

  // Lowercase + dedupe
  const seen = new Set<string>()
  const userSkills: string[] = []
  for (const raw of collected) {
    const k = raw.trim().toLowerCase()
    if (k && !seen.has(k)) {
      seen.add(k)
      userSkills.push(k)
    }
  }

  return { userSkills, recommendedPathSlug }
}

// Soft string match — case-insensitive, substring either way.
// "React" matches "React.js" and vice versa.
function softMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}

// Compute a 0–100 match score for an opportunity, given the user's context.
//
// Composition:
//   - 20 baseline (the listing exists, you can apply)
//   - up to 50 from skill overlap (% of opp.skills the user knows)
//   - up to 20 if the opp aligns with the student's recommended career path
//   - up to 10 from recency (newer = higher, decays over ~30 days)
//
// New users with empty profiles see ~30–50% to encourage them to fill out.
// Engaged users with relevant skills + assessment land 75–95%.
export function computeMatchScore(opp: Opportunity, ctx: MatchContext): number {
  const oppSkillsLower = (opp.skills ?? []).map((s) => s.toLowerCase())
  const userSkills = ctx.userSkills
  const oppSkillCount = oppSkillsLower.length

  // 1. Skill overlap (max 50)
  let skillScore = 0
  if (oppSkillCount > 0 && userSkills.length > 0) {
    const matched = oppSkillsLower.filter((o) =>
      userSkills.some((u) => softMatch(o, u))
    ).length
    skillScore = (matched / oppSkillCount) * 50
  }

  // 2. Career-path alignment (max 20)
  let pathScore = 0
  if (ctx.recommendedPathSlug && oppSkillCount > 0) {
    const path = findCareer(ctx.recommendedPathSlug)
    if (path) {
      const pathSkillsLower = path.skills.map((s) => s.toLowerCase())
      const overlapCount = oppSkillsLower.filter((o) =>
        pathSkillsLower.some((ps) => softMatch(o, ps))
      ).length
      // Up to 20 if the opportunity heavily uses skills from the user's path
      pathScore = Math.min(20, (overlapCount / oppSkillCount) * 20)
    }
  }

  // 3. Recency (max 10) — full points for <7 days, decays linearly to 0 over ~30 days
  const recencyScore =
    opp.postedDays <= 7 ? 10 : Math.max(0, 10 - ((opp.postedDays - 7) / 23) * 10)

  // 4. Baseline
  const base = 20

  const total = base + skillScore + pathScore + recencyScore
  return Math.min(100, Math.max(0, Math.round(total)))
}

// Apply scores to a list of opportunities in-place (returns a new array).
export function applyMatchScores(
  opportunities: Opportunity[],
  ctx: MatchContext,
): Opportunity[] {
  return opportunities.map((o) => ({ ...o, matchScore: computeMatchScore(o, ctx) }))
}

// Returns true if we have meaningful signal for this user (avoids showing
// a misleadingly precise score when the user has nothing in their profile).
export function hasMatchSignal(ctx: MatchContext): boolean {
  return ctx.userSkills.length > 0 || ctx.recommendedPathSlug !== null
}
