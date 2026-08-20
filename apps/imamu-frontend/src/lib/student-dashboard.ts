import { supabase } from '@/lib/supabase'

// Single-shot loader for everything the student dashboard needs that lives
// outside the existing helpers (applications, opportunities, match scoring).
// Returns nullable fields rather than throwing — the dashboard renders empty
// states for any missing piece.

export interface DashboardSkill {
  name: string
  level: number  // 0..100
}

export interface RecommendedCareerPath {
  id: string
  slug: string | null
  title: string
  titleAr: string | null
  icon: string | null
  description: string | null
  descriptionAr: string | null
  requiredSkills: string[]
  matchPercent: number  // pulled from assessment_responses.match_score, 0..100
}

export interface StudentDashboardData {
  cvScore: number
  profileCompletion: number
  assessmentCompleted: boolean
  recommended: RecommendedCareerPath | null
  skills: DashboardSkill[]
}

interface ProfileShape {
  cv_score: number | null
  profile_completion: number | null
  assessment_completed: boolean | null
  recommended_career_path_id: string | null
}

interface AssessmentShape {
  match_score: number | null
}

interface CareerPathShape {
  id: string
  slug: string | null
  title: string
  title_ar: string | null
  icon: string | null
  description: string | null
  description_ar: string | null
  required_skills: string[] | null
}

interface SkillShape {
  name: string
  level: number | null
}

export async function fetchStudentDashboard(userId: string): Promise<StudentDashboardData> {
  // 1. Profile + most recent assessment + skills, in parallel.
  const [profileRes, assessmentRes, skillsRes] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('cv_score, profile_completion, assessment_completed, recommended_career_path_id')
      .eq('user_id', userId)
      .maybeSingle<ProfileShape>(),
    supabase
      .from('assessment_responses')
      .select('match_score')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle<AssessmentShape>(),
    supabase
      .from('student_skills')
      .select('name, level')
      .eq('student_id', userId)
      .order('created_at', { ascending: true }),
  ])

  const profile = profileRes.data
  const matchScore = assessmentRes.data?.match_score ?? null

  // 2. If a path was recommended, fetch its details.
  let recommended: RecommendedCareerPath | null = null
  if (profile?.recommended_career_path_id) {
    const { data: path } = await supabase
      .from('career_paths')
      .select('id, slug, title, title_ar, icon, description, description_ar, required_skills')
      .eq('id', profile.recommended_career_path_id)
      .maybeSingle<CareerPathShape>()
    if (path) {
      recommended = {
        id: path.id,
        slug: path.slug,
        title: path.title,
        titleAr: path.title_ar,
        icon: path.icon,
        description: path.description,
        descriptionAr: path.description_ar,
        requiredSkills: path.required_skills ?? [],
        matchPercent: matchScore != null ? Math.round(matchScore) : 0,
      }
    }
  }

  const skillRows = (skillsRes.data ?? []) as SkillShape[]

  return {
    cvScore: profile?.cv_score ?? 0,
    profileCompletion: profile?.profile_completion ?? 0,
    assessmentCompleted: profile?.assessment_completed ?? false,
    recommended,
    skills: skillRows.map((s) => ({ name: s.name, level: s.level ?? 0 })),
  }
}
