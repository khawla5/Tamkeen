import { z, type ZodError } from 'zod'

// All schema messages are translation keys (e.g. "validation.emailRequired").
// They get translated by <FieldError> at render time via useLanguage().t().

// ──────────────────────────────────────────────────────────
// Shared field validators
// ──────────────────────────────────────────────────────────
export const emailSchema = z
  .email('validation.emailInvalid')
  .min(1, 'validation.emailRequired')

export const passwordSchema = z
  .string()
  .min(8, 'validation.passwordMin')
  .regex(/[A-Z]/, 'validation.passwordUppercase')
  .regex(/[a-z]/, 'validation.passwordLowercase')
  .regex(/[0-9]/, 'validation.passwordNumber')

export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9\s\-()]{7,}$/, 'validation.phoneInvalid')

export const urlOptionalSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}.*$/i.test(v),
    'validation.urlInvalid'
  )
  .optional()

// ──────────────────────────────────────────────────────────
// Auth — sign in
// ──────────────────────────────────────────────────────────
export const SignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.passwordRequired'),
})

// ──────────────────────────────────────────────────────────
// Auth — forgot password (request email)
// ──────────────────────────────────────────────────────────
export const ForgotPasswordSchema = z.object({
  email: emailSchema,
})

// ──────────────────────────────────────────────────────────
// Auth — reset password (set new password)
// ──────────────────────────────────────────────────────────
export const ResetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  })

// ──────────────────────────────────────────────────────────
// Auth — sign up (basic info step)
// ──────────────────────────────────────────────────────────
export const SignUpBasicSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullNameEn: z.string().trim().min(2, 'validation.min2'),
  fullNameAr: z.string().trim().min(2, 'validation.min2'),
})

export const SignUpRoleSchema = z.object({
  role: z.enum(
    ['student', 'retiree', 'employee', 'company', 'university', 'provider'],
    { message: 'validation.roleRequired' }
  ),
})

// ──────────────────────────────────────────────────────────
// CV Builder
// ──────────────────────────────────────────────────────────
export const CvPersonalSchema = z.object({
  nameEn: z.string().trim().min(2, 'validation.min2'),
  nameAr: z.string().trim().min(2, 'validation.min2'),
  email: emailSchema,
  phone: phoneSchema,
  city: z.string().trim().min(2, 'validation.min2'),
  linkedin: urlOptionalSchema,
  summary: z
    .string()
    .trim()
    .min(20, 'validation.min20')
    .max(500, 'validation.max500'),
})

export const CvEducationItemSchema = z.object({
  school: z.string().trim().min(2, 'validation.min2'),
  degree: z.string().trim().min(2, 'validation.min2'),
  years: z.string().trim().min(4, 'validation.min4'),
  gpa: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[0-4](\.\d{1,2})?$/.test(v),
      'validation.gpaFormat'
    )
    .optional(),
})
export const CvEducationSchema = z
  .array(CvEducationItemSchema)
  .min(1, 'validation.educationMin')

export const CvExperienceItemSchema = z.object({
  title: z.string().trim().min(2, 'validation.min2'),
  company: z.string().trim().min(2, 'validation.min2'),
  period: z.string().trim().min(2, 'validation.min2'),
  description: z
    .string()
    .trim()
    .min(10, 'validation.min10')
    .max(1000, 'validation.max1000'),
})
export const CvExperienceSchema = z.array(CvExperienceItemSchema)

export const CvSkillsSchema = z
  .array(z.object({ name: z.string().min(1), level: z.number() }))
  .min(1, 'validation.skillsMin')

// ──────────────────────────────────────────────────────────
// Post Opportunity
// ──────────────────────────────────────────────────────────
export const PostOpportunityTypeSchema = z.object({
  type: z.enum(['job', 'training', 'coop', 'consulting'], {
    message: 'validation.opportunityTypeRequired',
  }),
})

export const PostOpportunityDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'validation.min3')
    .max(120, 'validation.max120'),
  location: z.string().trim().min(2, 'validation.min2'),
  duration: z.string().trim().optional(),
  description: z
    .string()
    .trim()
    .min(20, 'validation.min20')
    .max(2000, 'validation.max2000'),
})

export const PostOpportunityRequirementsSchema = z.object({
  skills: z.array(z.string()).min(1, 'validation.requiredSkillsMin'),
  salary: z.string().trim().optional(),
  deadline: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || !Number.isNaN(Date.parse(v)),
      'validation.deadlineInvalid'
    )
    .optional(),
  applicantLimit: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'validation.numberPositive'
    )
    .optional(),
})

// ──────────────────────────────────────────────────────────
// Profile editing
// ──────────────────────────────────────────────────────────

// Common identity slice for every role's editor (name in en + ar).
export const ProfileIdentitySchema = z.object({
  name: z.string().trim().min(2, 'validation.min2'),
  nameAr: z.string().trim().min(2, 'validation.min2'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9\s\-()]{7,}$/.test(v), 'validation.phoneInvalid')
    .optional()
    .or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  region: z.string().trim().optional().or(z.literal('')),
})

export const StudentProfileSchema = z.object({
  university: z.string().trim().min(2, 'validation.min2'),
  college: z.string().trim().optional().or(z.literal('')),
  major: z.string().trim().min(2, 'validation.min2'),
  studentNumber: z.string().trim().optional().or(z.literal('')),
  currentStatus: z.string().trim().optional().or(z.literal('')),
  graduationYear: z
    .string()
    .trim()
    .regex(/^(19|20)\d{2}$/, 'validation.invalidYear')
    .optional()
    .or(z.literal('')),
  gpa: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[0-4](\.\d{1,2})?$/.test(v),
      'validation.gpaFormat'
    )
    .optional()
    .or(z.literal('')),
  workPreference: z.string().trim().optional().or(z.literal('')),
  availableFrom: z
    .string()
    .trim()
    .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'validation.deadlineInvalid')
    .optional()
    .or(z.literal('')),
  linkedinUrl: urlOptionalSchema,
  portfolioUrl: urlOptionalSchema,
  githubUrl: urlOptionalSchema,
  behanceUrl: urlOptionalSchema,
  professionalSummary: z.string().trim().max(500, 'validation.max500').optional().or(z.literal('')),
})

export const RetireeProfileEditSchema = z.object({
  industry: z.string().trim().min(2, 'validation.min2'),
  yearsExperience: z
    .string()
    .trim()
    .regex(/^\d+$/, 'validation.numberPositive')
    .optional()
    .or(z.literal('')),
  availability: z.string().trim().optional().or(z.literal('')),
})

export const EmployeeProfileEditSchema = z.object({
  jobTitle: z.string().trim().min(2, 'validation.min2'),
  companyName: z.string().trim().min(2, 'validation.min2'),
  yearsInRole: z
    .string()
    .trim()
    .regex(/^\d+$/, 'validation.numberPositive')
    .optional()
    .or(z.literal('')),
})

export const CompanyEditSchema = z.object({
  name: z.string().trim().min(2, 'validation.min2'),
  industry: z.string().trim().optional().or(z.literal('')),
  size: z.string().trim().optional().or(z.literal('')),
  location: z.string().trim().optional().or(z.literal('')),
})

export const UniversityEditSchema = z.object({
  name: z.string().trim().min(2, 'validation.min2'),
  location: z.string().trim().optional().or(z.literal('')),
  totalStudents: z
    .string()
    .trim()
    .regex(/^\d+$/, 'validation.numberPositive')
    .optional()
    .or(z.literal('')),
})

export const ProviderEditSchema = z.object({
  name: z.string().trim().min(2, 'validation.min2'),
})

// ──────────────────────────────────────────────────────────
// Post Course (provider role)
// ──────────────────────────────────────────────────────────
export const PostCourseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'validation.min3')
    .max(120, 'validation.max120'),
  description: z
    .string()
    .trim()
    .min(20, 'validation.min20')
    .max(2000, 'validation.max2000'),
  price: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0),
      'validation.numberPositive'
    )
    .optional()
    .or(z.literal('')),
})

// ──────────────────────────────────────────────────────────
// Helper: ZodError → flat { fieldPath: firstMessage }
// ──────────────────────────────────────────────────────────
export type FieldErrors = Record<string, string>

export function flattenErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!(path in out)) out[path] = issue.message
  }
  return out
}
