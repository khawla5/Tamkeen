// Supabase schema types — keep in sync with supabase/migrations/*
// You can later auto-generate this with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole =
  | 'student'
  | 'retiree'
  | 'employee'
  | 'company'
  | 'university'
  | 'provider'

export type OpportunityType =
  | 'job'
  | 'training'
  | 'coop'
  | 'certification'
  | 'career_path'
  | 'consulting'

export type ApplicationStatus =
  | 'submitted'
  | 'reviewed'
  | 'shortlisted'
  | 'accepted'
  | 'rejected'
  | 'cv_update_required'

export type InterviewType = 'technical' | 'behavioral' | 'hr' | 'panel'
export type CompanyPlan = 'basic' | 'premium'

export interface UserRow {
  id: string
  role: UserRole
  email: string
  name: string | null
  name_ar: string | null
  avatar_url: string | null
  phone: string | null
  city: string | null
  region: string | null
  subtitle: string | null
  subtitle_ar: string | null
  onboarded_at: string | null
  created_at: string
  updated_at: string
}

export interface StudentProfileRow {
  user_id: string
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
  career_interests: string[]
  preferred_opportunity_types: string[]
  work_preference: string | null
  available_from: string | null
  linkedin_url: string | null
  portfolio_url: string | null
  github_url: string | null
  behance_url: string | null
  additional_links: string[]
  languages: Json
  professional_summary: string | null
  profile_completion: number
  cv_score: number
  recommended_career_path_id: string | null
  assessment_completed: boolean
  created_at: string
  updated_at: string
}

export interface RetireeProfileRow {
  user_id: string
  industry: string | null
  industry_ar: string | null
  years_experience: number | null
  expertise: string[]
  expertise_ar: string[]
  availability: string | null
  preferred_work: string[]
  profile_completion: number
  created_at: string
  updated_at: string
}

export interface EmployeeProfileRow {
  user_id: string
  job_title: string | null
  job_title_ar: string | null
  company_name: string | null
  years_in_role: number | null
  upskilling_goals: string[]
  created_at: string
  updated_at: string
}

export interface CompanyRow {
  id: string
  user_id: string | null
  name: string
  name_ar: string | null
  logo_url: string | null
  industry: string | null
  size: string | null
  location: string | null
  plan: CompanyPlan
  created_at: string
  updated_at: string
}

export interface UniversityRow {
  id: string
  user_id: string | null
  name: string
  name_ar: string | null
  logo_url: string | null
  location: string | null
  total_students: number
  created_at: string
  updated_at: string
}

export interface CourseProviderRow {
  id: string
  user_id: string | null
  name: string
  name_ar: string | null
  logo_url: string | null
  rating: number
  created_at: string
  updated_at: string
}

export interface CareerPathRow {
  id: string
  title: string
  title_ar: string | null
  icon: string | null
  description: string | null
  description_ar: string | null
  stages: string[]
  stages_ar: string[]
  required_skills: string[]
  avg_salary: string | null
  created_at: string
}

export interface AssessmentQuestionRow {
  id: string
  section: string
  question: string
  question_ar: string | null
  options: Array<{ text: string; text_ar?: string; career: string }>
  display_order: number
}

export interface AssessmentResponseRow {
  id: string
  user_id: string
  answers: Json
  result_career_path_id: string | null
  ai_analysis: Json | null
  match_score: number | null
  completed_at: string
}

export interface CvTemplateRow {
  id: string
  name: string
  name_ar: string | null
  color: string | null
  popular: boolean
}

export interface CvDataRow {
  user_id: string
  template_id: string | null
  personal: Json
  education: Json
  experience: Json
  skills: Json
  languages: Json
  cv_file_url: string | null
  ai_rating: Json | null
  ai_rating_at: string | null
  updated_at: string
}

export interface StudentSkillRow {
  id: string
  student_id: string
  name: string
  level: number | null
  created_at: string
}

export interface RetireeEngagementRow {
  id: string
  retiree_id: string
  company: string | null
  role: string | null
  duration: string | null
  rating: number | null
  created_at: string
}

export interface OpportunityRow {
  id: string
  company_id: string | null
  provider_id: string | null
  title: string
  title_ar: string | null
  type: OpportunityType
  location: string | null
  location_ar: string | null
  duration: string | null
  duration_ar: string | null
  salary: string | null
  salary_ar: string | null
  description: string | null
  description_ar: string | null
  skills: string[]
  deadline: string | null
  for_retirees: boolean
  is_active: boolean
  applicant_limit: number | null
  price: number
  created_at: string
  updated_at: string
}

export interface ApplicationRow {
  id: string
  user_id: string
  opportunity_id: string
  status: ApplicationStatus
  cover_letter: string | null
  applied_at: string
  updated_at: string
}

export interface InterviewRow {
  id: string
  user_id: string
  application_id: string | null
  company: string | null
  scheduled_at: string
  type: InterviewType
  notes: string | null
  created_at: string
}

export type NotificationType =
  | 'application_received'
  | 'application_status_changed'

export interface NotificationMetadata {
  application_id?: string
  opportunity_id?: string
  opportunity_title?: string | null
  opportunity_title_ar?: string | null
  company_name?: string | null
  company_name_ar?: string | null
  applicant_name?: string | null
  applicant_name_ar?: string | null
  old_status?: ApplicationStatus
  new_status?: ApplicationStatus
}

export interface NotificationRow {
  id: string
  user_id: string
  type: NotificationType
  metadata: NotificationMetadata
  link: string | null
  read_at: string | null
  created_at: string
}

// Aggregate Database type for the supabase-js generic.
type TableShape<Row, Insert, Update = Partial<Row>> = {
  Row: Row & Record<string, unknown>
  Insert: Insert & Record<string, unknown>
  Update: Update & Record<string, unknown>
  Relationships: []
}

type UserInsert =
  Pick<UserRow, 'id' | 'role' | 'email'> &
  Partial<Omit<UserRow, 'id' | 'role' | 'email'>>
type UserUpdate = Partial<UserRow>

type StudentProfileInsert =
  Pick<StudentProfileRow, 'user_id'> &
  Partial<Omit<StudentProfileRow, 'user_id'>>
type StudentProfileUpdate = Partial<StudentProfileRow>

type RetireeProfileInsert =
  Pick<RetireeProfileRow, 'user_id'> &
  Partial<Omit<RetireeProfileRow, 'user_id'>>
type RetireeProfileUpdate = Partial<RetireeProfileRow>

type EmployeeProfileInsert =
  Pick<EmployeeProfileRow, 'user_id'> &
  Partial<Omit<EmployeeProfileRow, 'user_id'>>
type EmployeeProfileUpdate = Partial<EmployeeProfileRow>

type CompanyInsert =
  Pick<CompanyRow, 'name'> &
  Partial<Omit<CompanyRow, 'name'>>
type CompanyUpdate = Partial<CompanyRow>

type UniversityInsert =
  Pick<UniversityRow, 'name'> &
  Partial<Omit<UniversityRow, 'name'>>
type UniversityUpdate = Partial<UniversityRow>

type CourseProviderInsert =
  Pick<CourseProviderRow, 'name'> &
  Partial<Omit<CourseProviderRow, 'name'>>
type CourseProviderUpdate = Partial<CourseProviderRow>

type CareerPathInsert =
  Pick<CareerPathRow, 'title'> &
  Partial<Omit<CareerPathRow, 'title'>>

type AssessmentQuestionInsert =
  Pick<AssessmentQuestionRow, 'section' | 'question' | 'options'> &
  Partial<Omit<AssessmentQuestionRow, 'section' | 'question' | 'options'>>

type CvTemplateInsert =
  Pick<CvTemplateRow, 'name'> &
  Partial<Omit<CvTemplateRow, 'name'>>

type AssessmentResponseInsert =
  Pick<AssessmentResponseRow, 'user_id' | 'answers'> &
  Partial<Omit<AssessmentResponseRow, 'user_id' | 'answers'>>
type AssessmentResponseUpdate = Partial<Omit<AssessmentResponseRow, 'id' | 'user_id'>>

type CvDataInsert =
  Pick<CvDataRow, 'user_id'> &
  Partial<Omit<CvDataRow, 'user_id'>>
type CvDataUpdate = Partial<Omit<CvDataRow, 'user_id'>>

type StudentSkillInsert =
  Pick<StudentSkillRow, 'student_id' | 'name'> &
  Partial<Omit<StudentSkillRow, 'student_id' | 'name'>>

type RetireeEngagementInsert =
  Pick<RetireeEngagementRow, 'retiree_id'> &
  Partial<Omit<RetireeEngagementRow, 'retiree_id'>>

type OpportunityInsert =
  Pick<OpportunityRow, 'title' | 'type'> &
  Partial<Omit<OpportunityRow, 'title' | 'type'>>
type OpportunityUpdate = Partial<OpportunityRow>

type ApplicationInsert =
  Pick<ApplicationRow, 'user_id' | 'opportunity_id'> &
  Partial<Omit<ApplicationRow, 'user_id' | 'opportunity_id'>>
type ApplicationUpdate = Partial<ApplicationRow>

type InterviewInsert =
  Pick<InterviewRow, 'user_id' | 'scheduled_at'> &
  Partial<Omit<InterviewRow, 'user_id' | 'scheduled_at'>>

type NotificationInsert =
  Pick<NotificationRow, 'user_id' | 'type' | 'metadata'> &
  Partial<Omit<NotificationRow, 'user_id' | 'type' | 'metadata'>>
type NotificationUpdate = Partial<NotificationRow>

export interface Database {
  public: {
    Tables: {
      users: TableShape<UserRow, UserInsert, UserUpdate>
      student_profiles: TableShape<StudentProfileRow, StudentProfileInsert, StudentProfileUpdate>
      retiree_profiles: TableShape<RetireeProfileRow, RetireeProfileInsert, RetireeProfileUpdate>
      employee_profiles: TableShape<EmployeeProfileRow, EmployeeProfileInsert, EmployeeProfileUpdate>
      companies: TableShape<CompanyRow, CompanyInsert, CompanyUpdate>
      universities: TableShape<UniversityRow, UniversityInsert, UniversityUpdate>
      course_providers: TableShape<CourseProviderRow, CourseProviderInsert, CourseProviderUpdate>
      career_paths: TableShape<CareerPathRow, CareerPathInsert>
      assessment_questions: TableShape<AssessmentQuestionRow, AssessmentQuestionInsert>
      assessment_responses: TableShape<AssessmentResponseRow, AssessmentResponseInsert, AssessmentResponseUpdate>
      cv_templates: TableShape<CvTemplateRow, CvTemplateInsert>
      cv_data: TableShape<CvDataRow, CvDataInsert, CvDataUpdate>
      student_skills: TableShape<StudentSkillRow, StudentSkillInsert>
      retiree_engagements: TableShape<RetireeEngagementRow, RetireeEngagementInsert>
      opportunities: TableShape<OpportunityRow, OpportunityInsert, OpportunityUpdate>
      applications: TableShape<ApplicationRow, ApplicationInsert, ApplicationUpdate>
      interviews: TableShape<InterviewRow, InterviewInsert>
      notifications: TableShape<NotificationRow, NotificationInsert, NotificationUpdate>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      opportunity_type: OpportunityType
      application_status: ApplicationStatus
      interview_type: InterviewType
      company_plan: CompanyPlan
    }
    CompositeTypes: Record<string, never>
  }
}
