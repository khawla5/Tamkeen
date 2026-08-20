import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

// Update the shared `users` row (name + name_ar). Called by every role editor.
export async function updateUserNames(
  userId: string,
  patch: {
    name?: string | null
    nameAr?: string | null
    phone?: string | null
    city?: string | null
    region?: string | null
  }
): Promise<void> {
  const updates: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  }
  if ('name' in patch) updates.name = patch.name ?? null
  if ('nameAr' in patch) updates.name_ar = patch.nameAr ?? null
  if ('phone' in patch) updates.phone = patch.phone ?? null
  if ('city' in patch) updates.city = patch.city ?? null
  if ('region' in patch) updates.region = patch.region ?? null

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

// ───────────────────────────────────────────────────────────
// Retiree
// ───────────────────────────────────────────────────────────
export interface RetireeProfileData {
  name: string | null
  nameAr: string | null
  industry: string | null
  industryAr: string | null
  yearsExperience: number | null
  expertise: string[]
  expertiseAr: string[]
  availability: string | null
  preferredWork: string[]
  profileCompletion: number
  engagements: Array<{ company: string; role: string; duration: string; rating: number }>
}

export async function fetchRetireeProfile(userId: string): Promise<RetireeProfileData | null> {
  const [userRes, profileRes, engagementsRes] = await Promise.all([
    supabase.from('users').select('name, name_ar').eq('id', userId).maybeSingle<{ name: string | null; name_ar: string | null }>(),
    supabase.from('retiree_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('retiree_engagements').select('*').eq('retiree_id', userId).order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data as Record<string, unknown> | null
  if (!profile) return null

  const engagementsRaw = (engagementsRes.data ?? []) as Array<Record<string, unknown>>

  return {
    name: userRes.data?.name ?? null,
    nameAr: userRes.data?.name_ar ?? null,
    industry: (profile.industry as string | null) ?? null,
    industryAr: (profile.industry_ar as string | null) ?? null,
    yearsExperience: (profile.years_experience as number | null) ?? null,
    expertise: (profile.expertise as string[] | null) ?? [],
    expertiseAr: (profile.expertise_ar as string[] | null) ?? [],
    availability: (profile.availability as string | null) ?? null,
    preferredWork: (profile.preferred_work as string[] | null) ?? [],
    profileCompletion: (profile.profile_completion as number | null) ?? 0,
    engagements: engagementsRaw.map((e) => ({
      company: (e.company as string | null) ?? '—',
      role: (e.role as string | null) ?? '—',
      duration: (e.duration as string | null) ?? '',
      rating: typeof e.rating === 'number' ? e.rating : Number(e.rating ?? 0),
    })),
  }
}

// ───────────────────────────────────────────────────────────
// Employee
// ───────────────────────────────────────────────────────────
export interface EmployeeProfileData {
  name: string | null
  nameAr: string | null
  jobTitle: string | null
  jobTitleAr: string | null
  companyName: string | null
  yearsInRole: number | null
  upskillingGoals: string[]
}

export async function fetchEmployeeProfile(userId: string): Promise<EmployeeProfileData | null> {
  const [userRes, profileRes] = await Promise.all([
    supabase.from('users').select('name, name_ar').eq('id', userId).maybeSingle<{ name: string | null; name_ar: string | null }>(),
    supabase.from('employee_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const profile = profileRes.data as Record<string, unknown> | null
  if (!profile) return null

  return {
    name: userRes.data?.name ?? null,
    nameAr: userRes.data?.name_ar ?? null,
    jobTitle: (profile.job_title as string | null) ?? null,
    jobTitleAr: (profile.job_title_ar as string | null) ?? null,
    companyName: (profile.company_name as string | null) ?? null,
    yearsInRole: (profile.years_in_role as number | null) ?? null,
    upskillingGoals: (profile.upskilling_goals as string[] | null) ?? [],
  }
}

// ───────────────────────────────────────────────────────────
// University
// ───────────────────────────────────────────────────────────
export interface UniversityProfileData {
  name: string | null
  nameAr: string | null
  logoUrl: string | null
  location: string | null
  totalStudents: number
}

export async function fetchUniversityProfile(userId: string): Promise<UniversityProfileData | null> {
  const { data, error } = await supabase
    .from('universities')
    .select('name, name_ar, logo_url, location, total_students')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  const row = data as Record<string, unknown>

  return {
    name: (row.name as string | null) ?? null,
    nameAr: (row.name_ar as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    totalStudents: (row.total_students as number | null) ?? 0,
  }
}

// ───────────────────────────────────────────────────────────
// Course Provider
// ───────────────────────────────────────────────────────────
export interface ProviderCourse {
  id: string
  name: string
  nameAr: string | null
  enrollmentCount: number
  isActive: boolean
}

export interface ProviderProfileData {
  name: string | null
  nameAr: string | null
  logoUrl: string | null
  rating: number
  totalCourses: number
  totalEnrollments: number
  courses: ProviderCourse[]
}

export async function fetchProviderProfile(userId: string): Promise<ProviderProfileData | null> {
  // 1. Provider row
  const { data: provider } = await supabase
    .from('course_providers')
    .select('id, name, name_ar, logo_url, rating')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; name: string; name_ar: string | null; logo_url: string | null; rating: number }>()

  if (!provider) return null

  // 2. Trainings (now stored in opportunities) with embedded application counts
  const { data: rows } = await supabase
    .from('opportunities')
    .select('id, title, title_ar, is_active, applications(count)')
    .eq('provider_id', provider.id)
    .order('created_at', { ascending: false })

  const list: ProviderCourse[] = ((rows ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    name: c.title as string,
    nameAr: (c.title_ar as string | null) ?? null,
    isActive: Boolean(c.is_active ?? true),
    enrollmentCount: (() => {
      const arr = c.applications as Array<{ count: number }> | undefined
      return arr?.[0]?.count ?? 0
    })(),
  }))

  return {
    name: provider.name,
    nameAr: provider.name_ar,
    logoUrl: provider.logo_url,
    rating: typeof provider.rating === 'number' ? provider.rating : Number(provider.rating ?? 0),
    totalCourses: list.length,
    totalEnrollments: list.reduce((sum, c) => sum + c.enrollmentCount, 0),
    courses: list,
  }
}

// ───────────────────────────────────────────────────────────
// Save / upsert helpers — one per role
// ───────────────────────────────────────────────────────────

export interface StudentProfilePatch {
  university?: string | null
  universityAr?: string | null
  college?: string | null
  collegeAr?: string | null
  major?: string | null
  majorAr?: string | null
  graduationYear?: number | null
  gpa?: number | null
  studentNumber?: string | null
  currentStatus?: string | null
  careerInterests?: string[]
  preferredOpportunityTypes?: string[]
  workPreference?: string | null
  availableFrom?: string | null
  linkedinUrl?: string | null
  portfolioUrl?: string | null
  githubUrl?: string | null
  behanceUrl?: string | null
  additionalLinks?: string[]
  languages?: StudentProfileLanguage[]
  professionalSummary?: string | null
}

export async function saveStudentProfile(userId: string, patch: StudentProfilePatch): Promise<void> {
  const payload = {
    user_id: userId,
    university: patch.university ?? null,
    university_ar: patch.universityAr ?? null,
    college: patch.college ?? null,
    college_ar: patch.collegeAr ?? null,
    major: patch.major ?? null,
    major_ar: patch.majorAr ?? null,
    graduation_year: patch.graduationYear ?? null,
    gpa: patch.gpa ?? null,
    student_number: patch.studentNumber ?? null,
    current_status: patch.currentStatus ?? null,
    career_interests: patch.careerInterests ?? [],
    preferred_opportunity_types: patch.preferredOpportunityTypes ?? [],
    work_preference: patch.workPreference ?? null,
    available_from: patch.availableFrom ?? null,
    linkedin_url: patch.linkedinUrl ?? null,
    portfolio_url: patch.portfolioUrl ?? null,
    github_url: patch.githubUrl ?? null,
    behance_url: patch.behanceUrl ?? null,
    additional_links: patch.additionalLinks ?? [],
    languages: (patch.languages ?? []) as unknown as Json,
    professional_summary: patch.professionalSummary ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('student_profiles')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export interface StudentProfileLanguage {
  language: string
  proficiency: string
}

export interface RetireeProfilePatch {
  industry?: string | null
  industryAr?: string | null
  yearsExperience?: number | null
  expertise?: string[]
  expertiseAr?: string[]
  availability?: string | null
  preferredWork?: string[]
}

export async function saveRetireeProfile(userId: string, patch: RetireeProfilePatch): Promise<void> {
  const payload = {
    user_id: userId,
    industry: patch.industry ?? null,
    industry_ar: patch.industryAr ?? null,
    years_experience: patch.yearsExperience ?? null,
    expertise: patch.expertise ?? [],
    expertise_ar: patch.expertiseAr ?? [],
    availability: patch.availability ?? null,
    preferred_work: patch.preferredWork ?? [],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('retiree_profiles')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export interface EmployeeProfilePatch {
  jobTitle?: string | null
  jobTitleAr?: string | null
  companyName?: string | null
  yearsInRole?: number | null
  upskillingGoals?: string[]
}

export async function saveEmployeeProfile(userId: string, patch: EmployeeProfilePatch): Promise<void> {
  const payload = {
    user_id: userId,
    job_title: patch.jobTitle ?? null,
    job_title_ar: patch.jobTitleAr ?? null,
    company_name: patch.companyName ?? null,
    years_in_role: patch.yearsInRole ?? null,
    upskilling_goals: patch.upskillingGoals ?? [],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('employee_profiles')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export interface CompanyPatch {
  name?: string
  nameAr?: string | null
  industry?: string | null
  size?: string | null
  location?: string | null
}

export async function saveCompanyProfile(userId: string, patch: CompanyPatch): Promise<void> {
  const updates = {
    name: patch.name,
    name_ar: patch.nameAr ?? null,
    industry: patch.industry ?? null,
    size: patch.size ?? null,
    location: patch.location ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('companies')
    .update(updates)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export interface UniversityPatch {
  name?: string
  nameAr?: string | null
  location?: string | null
  totalStudents?: number | null
}

export async function saveUniversityProfile(userId: string, patch: UniversityPatch): Promise<void> {
  const updates = {
    name: patch.name,
    name_ar: patch.nameAr ?? null,
    location: patch.location ?? null,
    total_students: patch.totalStudents ?? 0,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('universities')
    .update(updates)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export interface ProviderPatch {
  name?: string
  nameAr?: string | null
}

export async function saveProviderProfile(userId: string, patch: ProviderPatch): Promise<void> {
  const updates = {
    name: patch.name,
    name_ar: patch.nameAr ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('course_providers')
    .update(updates)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// Read student-profile fields for the editor.
export interface StudentProfileData {
  phone: string | null
  city: string | null
  region: string | null
  university: string | null
  universityAr: string | null
  college: string | null
  collegeAr: string | null
  major: string | null
  majorAr: string | null
  graduationYear: number | null
  gpa: number | null
  studentNumber: string | null
  currentStatus: string | null
  careerInterests: string[]
  preferredOpportunityTypes: string[]
  workPreference: string | null
  availableFrom: string | null
  linkedinUrl: string | null
  portfolioUrl: string | null
  githubUrl: string | null
  behanceUrl: string | null
  additionalLinks: string[]
  languages: StudentProfileLanguage[]
  professionalSummary: string | null
  updatedAt: string | null
  recommendedCareerPathId: string | null
  recommendedCareerPathTitle: string | null
  recommendedCareerPathTitleAr: string | null
  assessmentCompleted: boolean
  lastAssessmentAt: string | null
}

export async function fetchStudentProfileData(userId: string): Promise<StudentProfileData | null> {
  const [userRes, profileRes, assessmentRes] = await Promise.all([
    supabase
      .from('users')
      .select('phone, city, region')
      .eq('id', userId)
      .maybeSingle<{ phone: string | null; city: string | null; region: string | null }>(),
    supabase
    .from('student_profiles')
      .select('university, university_ar, college, college_ar, major, major_ar, graduation_year, gpa, student_number, current_status, career_interests, preferred_opportunity_types, work_preference, available_from, linkedin_url, portfolio_url, github_url, behance_url, additional_links, languages, professional_summary, recommended_career_path_id, assessment_completed, updated_at')
    .eq('user_id', userId)
    .maybeSingle<{
      university: string | null
      university_ar: string | null
        college: string | null
        college_ar: string | null
      major: string | null
      major_ar: string | null
      graduation_year: number | null
      gpa: number | null
        student_number: string | null
        current_status: string | null
        career_interests: string[] | null
        preferred_opportunity_types: string[] | null
        work_preference: string | null
        available_from: string | null
        linkedin_url: string | null
        portfolio_url: string | null
        github_url: string | null
        behance_url: string | null
        additional_links: string[] | null
        languages: Json | null
        professional_summary: string | null
        recommended_career_path_id: string | null
        assessment_completed: boolean | null
        updated_at: string | null
      }>(),
    supabase
      .from('assessment_responses')
      .select('completed_at')
      .eq('user_id', userId)
      .maybeSingle<{ completed_at: string | null }>(),
  ])

  const data = profileRes.data
  if (!data) return null

  let recommendedCareerPathTitle: string | null = null
  let recommendedCareerPathTitleAr: string | null = null
  if (data.recommended_career_path_id) {
    const { data: careerPath } = await supabase
      .from('career_paths')
      .select('title, title_ar')
      .eq('id', data.recommended_career_path_id)
      .maybeSingle<{ title: string | null; title_ar: string | null }>()
    recommendedCareerPathTitle = careerPath?.title ?? null
    recommendedCareerPathTitleAr = careerPath?.title_ar ?? null
  }

  return {
    phone: userRes.data?.phone ?? null,
    city: userRes.data?.city ?? null,
    region: userRes.data?.region ?? null,
    university: data.university,
    universityAr: data.university_ar,
    college: data.college,
    collegeAr: data.college_ar,
    major: data.major,
    majorAr: data.major_ar,
    graduationYear: data.graduation_year,
    gpa: data.gpa,
    studentNumber: data.student_number,
    currentStatus: data.current_status,
    careerInterests: data.career_interests ?? [],
    preferredOpportunityTypes: data.preferred_opportunity_types ?? [],
    workPreference: data.work_preference,
    availableFrom: data.available_from,
    linkedinUrl: data.linkedin_url,
    portfolioUrl: data.portfolio_url,
    githubUrl: data.github_url,
    behanceUrl: data.behance_url,
    additionalLinks: data.additional_links ?? [],
    languages: normalizeLanguages(data.languages),
    professionalSummary: data.professional_summary,
    updatedAt: data.updated_at,
    recommendedCareerPathId: data.recommended_career_path_id,
    recommendedCareerPathTitle,
    recommendedCareerPathTitleAr,
    assessmentCompleted: data.assessment_completed ?? false,
    lastAssessmentAt: assessmentRes.data?.completed_at ?? null,
  }
}

export async function fetchStudentSkills(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('student_skills')
    .select('name')
    .eq('student_id', userId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.name as string).filter(Boolean)
}

export async function saveStudentSkills(userId: string, skills: string[]): Promise<void> {
  const unique = Array.from(new Set(skills.map((skill) => skill.trim()).filter(Boolean)))
  const { error: deleteError } = await supabase
    .from('student_skills')
    .delete()
    .eq('student_id', userId)
  if (deleteError) throw new Error(deleteError.message)

  if (unique.length === 0) return
  const { error } = await supabase
    .from('student_skills')
    .insert(unique.map((name) => ({ student_id: userId, name, level: null })))
  if (error) throw new Error(error.message)
}

function normalizeLanguages(value: Json | null): StudentProfileLanguage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const record = entry as Record<string, Json | undefined>
      const language = typeof record.language === 'string' ? record.language : ''
      const proficiency = typeof record.proficiency === 'string' ? record.proficiency : ''
      if (!language && !proficiency) return null
      return { language, proficiency }
    })
    .filter((entry): entry is StudentProfileLanguage => Boolean(entry))
}

export interface CompanyProfileData {
  name: string
  nameAr: string | null
  industry: string | null
  size: string | null
  location: string | null
}

export async function fetchCompanyProfileData(userId: string): Promise<CompanyProfileData | null> {
  const { data } = await supabase
    .from('companies')
    .select('name, name_ar, industry, size, location')
    .eq('user_id', userId)
    .maybeSingle<CompanyProfileData>()
  return data ?? null
}
