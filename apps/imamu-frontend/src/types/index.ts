export interface Opportunity {
  id: string | number
  title: string
  titleAr?: string
  company: string
  companyAr?: string
  companyLogo: string
  /** True when posted by a course_provider rather than a company. */
  isFromProvider?: boolean
  type: 'Job' | 'Training' | 'Co-op Training' | 'Certification' | 'Career Path' | 'Part-Time & Consulting'
  typeAr?: string
  category: 'job' | 'training' | 'coop' | 'certification' | 'career-path' | 'consulting'
  location: string
  locationAr?: string
  duration: string
  durationAr?: string
  salary: string
  salaryAr?: string
  /** Numeric price (SAR). 0 means free. Mostly meaningful for trainings. */
  price?: number
  deadline: string
  skills: string[]
  description: string
  descriptionAr?: string
  matchScore: number
  postedDays: number
  applicants: number
  forRetirees?: boolean
}

export interface CareerPath {
  id: number
  title: string
  titleAr?: string
  icon: string
  matchPercent: number
  description: string
  descriptionAr?: string
  stages: string[]
  stagesAr?: string[]
  requiredSkills: string[]
  avgSalary: string
}

export interface Skill {
  name: string
  level: number
}

export interface Application {
  id: number
  company: string
  role: string
  status: 'submitted' | 'reviewed' | 'shortlisted' | 'accepted' | 'rejected' | 'cv_update_required'
  date: string
}

export interface Interview {
  company: string
  date: string
  time: string
  type: 'Technical' | 'Behavioral' | 'HR' | 'Panel'
}

export interface Course {
  name: string
  progress: number
  provider: string
}

export interface StudentProfile {
  name: string
  nameAr: string
  university: string
  universityAr?: string
  major: string
  majorAr?: string
  graduationYear: number
  gpa: number
  profileCompletion: number
  cvScore: number
  avatar: string
  skills: Skill[]
  applications: Application[]
  courses: Course[]
  upcomingInterviews: Interview[]
}

export interface Engagement {
  company: string
  role: string
  duration: string
  rating: number
}

export interface RetireeProfile {
  name: string
  nameAr: string
  industry: string
  industryAr?: string
  yearsExperience: number
  expertise: string[]
  expertiseAr?: string[]
  avatar: string
  availability: string
  preferredWork: string[]
  profileCompletion: number
  applications: Application[]
  engagements: Engagement[]
}

export interface CompanyProfile {
  name: string
  nameAr: string
  logo: string
  industry: string
  size: string
  location: string
  plan: 'basic' | 'premium'
  activeListings: number
  totalApplicants: number
  hiredCount: number
}

export interface UniversityProfile {
  name: string
  nameAr: string
  logo: string
  location: string
  totalStudents: number
  registeredStudents: number
  placementRate: number
  activePartnerships: number
}

export interface CourseProviderProfile {
  name: string
  nameAr: string
  logo: string
  totalCourses: number
  activeEnrollments: number
  completionRate: number
  revenue: number
  rating: number
}

export interface AssessmentQuestion {
  id: number
  question: string
  questionAr?: string
  options: { text: string; textAr?: string; career: string }[]
}

export interface CVTemplate {
  id: number
  name: string
  nameAr?: string
  color: string
  popular: boolean
}

export interface PlatformStats {
  students: number
  retirees: number
  companies: number
  universities: number
  courseProviders: number
  opportunities: number
  placements: number
}
