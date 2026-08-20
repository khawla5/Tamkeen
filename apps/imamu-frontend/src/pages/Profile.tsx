import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  Award,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  CheckCircle2,
  Compass,
  FileText,
  GraduationCap,
  IdCard,
  Languages,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import { cn } from '@/lib/utils'
import { FieldError } from '@/components/ui/FieldError'
import UserAvatar from '@/components/shared/UserAvatar'
import { uploadAvatar, clearAvatar, AvatarError } from '@/lib/avatar'
import { resetAssessment } from '@/lib/career-analysis'
import {
  CompanyEditSchema,
  EmployeeProfileEditSchema,
  ProfileIdentitySchema,
  ProviderEditSchema,
  RetireeProfileEditSchema,
  StudentProfileSchema,
  UniversityEditSchema,
  flattenErrors,
  type FieldErrors,
} from '@/lib/validation'
import {
  fetchCompanyProfileData,
  fetchEmployeeProfile,
  fetchProviderProfile,
  fetchRetireeProfile,
  fetchStudentSkills,
  fetchStudentProfileData,
  fetchUniversityProfile,
  saveCompanyProfile,
  saveEmployeeProfile,
  saveProviderProfile,
  saveRetireeProfile,
  saveStudentSkills,
  saveStudentProfile,
  saveUniversityProfile,
  updateUserNames,
} from '@/lib/profiles'
import BilingualSelect from '@/components/ui/BilingualSelect'
import { SAUDI_UNIVERSITIES, MAJORS } from '@/data/saudi-academic'
import { autoTrackedAchievements } from '@/data/tamkeen-data'

const cardBase = 'relative overflow-hidden rounded-[20px] bg-white border border-imamu-navy-50 shadow-lg shadow-imamu-navy/5'
const iconTile = 'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70'
const goldIconTile = 'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100'
const fieldControlClass = 'w-full border rounded-xl py-3 px-4 text-sm text-imamu-dark transition duration-200 placeholder:text-imamu-dark/30 border-imamu-navy-100 bg-white focus:outline-none focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(4,93,132,0.10)]'

interface LanguageEntry {
  language: string
  proficiency: string
}

const SAUDI_REGIONS = [
  { value: 'riyadh', ar: 'الرياض', en: 'Riyadh' },
  { value: 'makkah', ar: 'مكة المكرمة', en: 'Makkah' },
  { value: 'madinah', ar: 'المدينة المنورة', en: 'Madinah' },
  { value: 'eastern', ar: 'المنطقة الشرقية', en: 'Eastern Province' },
  { value: 'qassim', ar: 'القصيم', en: 'Qassim' },
  { value: 'asir', ar: 'عسير', en: 'Asir' },
  { value: 'tabuk', ar: 'تبوك', en: 'Tabuk' },
  { value: 'hail', ar: 'حائل', en: 'Hail' },
  { value: 'northern_borders', ar: 'الحدود الشمالية', en: 'Northern Borders' },
  { value: 'jazan', ar: 'جازان', en: 'Jazan' },
  { value: 'najran', ar: 'نجران', en: 'Najran' },
  { value: 'bahah', ar: 'الباحة', en: 'Al Bahah' },
  { value: 'jouf', ar: 'الجوف', en: 'Al Jouf' },
]

const CURRENT_STATUS_OPTIONS = [
  { value: 'student', ar: 'طالب', en: 'Student' },
  { value: 'recent_graduate', ar: 'خريج حديث', en: 'Recent graduate' },
  { value: 'seeking_training', ar: 'أبحث عن تدريب', en: 'Seeking training' },
  { value: 'seeking_job', ar: 'أبحث عن وظيفة', en: 'Seeking a job' },
  { value: 'employed', ar: 'موظف حالياً', en: 'Currently employed' },
]

const CAREER_INTEREST_OPTIONS = [
  { value: 'software_engineering', ar: 'هندسة البرمجيات', en: 'Software engineering' },
  { value: 'data_science', ar: 'علم البيانات', en: 'Data science' },
  { value: 'cybersecurity', ar: 'الأمن السيبراني', en: 'Cybersecurity' },
  { value: 'product_management', ar: 'إدارة المنتجات', en: 'Product management' },
  { value: 'design', ar: 'التصميم', en: 'Design' },
  { value: 'marketing', ar: 'التسويق', en: 'Marketing' },
]

const OPPORTUNITY_TYPE_OPTIONS = [
  { value: 'job', ar: 'وظائف', en: 'Jobs' },
  { value: 'training', ar: 'تدريب', en: 'Training' },
  { value: 'coop', ar: 'برنامج تعاوني', en: 'Co-op' },
  { value: 'certification', ar: 'شهادات', en: 'Certifications' },
  { value: 'event', ar: 'فعاليات', en: 'Events' },
]

const WORK_PREFERENCE_OPTIONS = [
  { value: 'onsite', ar: 'حضوري', en: 'On-site' },
  { value: 'remote', ar: 'عن بُعد', en: 'Remote' },
  { value: 'hybrid', ar: 'هجين', en: 'Hybrid' },
]

const LANGUAGE_PROFICIENCIES = [
  { value: 'native', ar: 'اللغة الأم', en: 'Native' },
  { value: 'advanced', ar: 'متقدم', en: 'Advanced' },
  { value: 'intermediate', ar: 'متوسط', en: 'Intermediate' },
  { value: 'basic', ar: 'أساسي', en: 'Basic' },
]

interface FormState {
  // Identity (all roles)
  name: string
  nameAr: string
  phone: string
  city: string
  region: string
  // Student
  university: string
  universityAr: string
  college: string
  collegeAr: string
  major: string
  majorAr: string
  graduationYear: string
  gpa: string
  studentNumber: string
  currentStatus: string
  careerInterests: string[]
  preferredOpportunityTypes: string[]
  workPreference: string
  availableFrom: string
  linkedinUrl: string
  portfolioUrl: string
  githubUrl: string
  behanceUrl: string
  additionalLinks: string[]
  skills: string[]
  languages: LanguageEntry[]
  professionalSummary: string
  profileUpdatedAt: string
  recommendedCareerPathTitle: string
  recommendedCareerPathTitleAr: string
  lastAssessmentAt: string
  // Retiree
  industry: string
  industryAr: string
  yearsExperience: string
  expertiseCsv: string
  expertiseArCsv: string
  availability: string
  preferredWorkCsv: string
  // Employee
  jobTitle: string
  jobTitleAr: string
  companyName: string
  yearsInRole: string
  // Company
  companyOwnName: string
  companyOwnNameAr: string
  companyIndustry: string
  companySize: string
  companyLocation: string
  // University
  universityOwnName: string
  universityOwnNameAr: string
  universityLocation: string
  universityTotalStudents: string
  // Provider
  providerOwnName: string
  providerOwnNameAr: string
}

const EMPTY_FORM: FormState = {
  name: '', nameAr: '', phone: '', city: '', region: '',
  university: '', universityAr: '', college: '', collegeAr: '', major: '', majorAr: '', graduationYear: '', gpa: '',
  studentNumber: '', currentStatus: '', careerInterests: [], preferredOpportunityTypes: [], workPreference: '',
  availableFrom: '', linkedinUrl: '', portfolioUrl: '', githubUrl: '', behanceUrl: '', additionalLinks: [],
  skills: [], languages: [], professionalSummary: '', profileUpdatedAt: '', recommendedCareerPathTitle: '',
  recommendedCareerPathTitleAr: '', lastAssessmentAt: '',
  industry: '', industryAr: '', yearsExperience: '', expertiseCsv: '', expertiseArCsv: '',
  availability: '', preferredWorkCsv: '',
  jobTitle: '', jobTitleAr: '', companyName: '', yearsInRole: '',
  companyOwnName: '', companyOwnNameAr: '', companyIndustry: '', companySize: '', companyLocation: '',
  universityOwnName: '', universityOwnNameAr: '', universityLocation: '', universityTotalStudents: '',
  providerOwnName: '', providerOwnNameAr: '',
}

function csvToArr(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export default function Profile() {
  const { user, role, refreshUser, setAssessmentCompleted, setSavedAnalysis } = useAuth()
  const { isArabic } = useLanguage()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [skillDraft, setSkillDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState('')

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Retake-assessment flow state
  const [retakeConfirmOpen, setRetakeConfirmOpen] = useState(false)
  const [retakeWorking, setRetakeWorking] = useState(false)

  async function handleRetakeAssessment() {
    if (!user) return
    setRetakeWorking(true)
    try {
      await resetAssessment(user.id)
      // Wipe local quiz progress so the page starts the user fresh.
      localStorage.removeItem('tamkeen-assessment')
      // Drop the gate flag locally so the route guard is enforced again until
      // the user finishes the new assessment. Also clear the cached analysis
      // so /careers doesn't show the stale result.
      setAssessmentCompleted(false)
      setSavedAnalysis(null)
      navigate('/assessment')
    } catch (err) {
      console.error('[profile] retake failed', err)
      setRetakeWorking(false)
      setRetakeConfirmOpen(false)
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setAvatarError(null)
    setUploadingAvatar(true)
    try {
      await uploadAvatar(user.id, file)
      await refreshUser()
    } catch (err) {
      setAvatarError(
        err instanceof AvatarError
          ? (err.code === 'too_large' ? (isArabic ? 'الصورة أكبر من 2 ميغابايت' : 'Image must be 2 MB or smaller')
            : err.code === 'wrong_type' ? (isArabic ? 'نوع الملف غير مدعوم' : 'Unsupported file type')
            : err.message)
          : (err instanceof Error ? err.message : 'Upload failed')
      )
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleClearAvatar() {
    if (!user) return
    setAvatarError(null)
    try {
      await clearAvatar(user.id)
      await refreshUser()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }))
    setDirty(true)
    setErrors((prev) => {
      if (!(k in prev)) return prev
      const { [k]: _omit, ...rest } = prev as Record<string, string>
      void _omit
      return rest as FieldErrors
    })
  }

  function toggleArrayField(key: 'careerInterests' | 'preferredOpportunityTypes', value: string) {
    const current = form[key]
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    setField(key, next)
  }

  function addSkill() {
    const next = skillDraft.trim()
    if (!next || form.skills.some((skill) => skill.toLowerCase() === next.toLowerCase())) return
    setField('skills', [...form.skills, next])
    setSkillDraft('')
  }

  function removeSkill(skill: string) {
    setField('skills', form.skills.filter((item) => item !== skill))
  }

  function addAdditionalLink() {
    const next = linkDraft.trim()
    if (!next || form.additionalLinks.includes(next)) return
    if (!isValidProfileUrl(next)) {
      setErrors((prev) => ({ ...prev, additionalLinks: 'validation.urlInvalid' }))
      return
    }
    setErrors((prev) => {
      const { additionalLinks: _omit, ...rest } = prev
      void _omit
      return rest
    })
    setField('additionalLinks', [...form.additionalLinks, next])
    setLinkDraft('')
  }

  function removeAdditionalLink(link: string) {
    setField('additionalLinks', form.additionalLinks.filter((item) => item !== link))
  }

  function addLanguageRow() {
    setField('languages', [...form.languages, { language: '', proficiency: 'intermediate' }])
  }

  function updateLanguageRow(index: number, patch: Partial<LanguageEntry>) {
    setField('languages', form.languages.map((entry, idx) => idx === index ? { ...entry, ...patch } : entry))
  }

  function removeLanguageRow(index: number) {
    setField('languages', form.languages.filter((_, idx) => idx !== index))
  }

  function resetFormChanges() {
    setForm(initialForm)
    setErrors({})
    setSubmitError(null)
    setDirty(false)
    setSkillDraft('')
    setLinkDraft('')
  }

  // Load existing profile data
  useEffect(() => {
    if (!user || !role) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const next: FormState = { ...EMPTY_FORM, name: user.name, nameAr: user.nameAr }

        if (role === 'student') {
          const [s, skills] = await Promise.all([
            fetchStudentProfileData(user.id),
            fetchStudentSkills(user.id),
          ])
          if (s) {
            next.phone = s.phone ?? ''
            next.city = s.city ?? ''
            next.region = s.region ?? ''
            next.university = s.university ?? ''
            next.universityAr = s.universityAr ?? ''
            next.college = s.college ?? ''
            next.collegeAr = s.collegeAr ?? ''
            next.major = s.major ?? ''
            next.majorAr = s.majorAr ?? ''
            next.graduationYear = s.graduationYear?.toString() ?? ''
            next.gpa = s.gpa?.toString() ?? ''
            next.studentNumber = s.studentNumber ?? ''
            next.currentStatus = s.currentStatus ?? ''
            next.careerInterests = s.careerInterests
            next.preferredOpportunityTypes = s.preferredOpportunityTypes
            next.workPreference = s.workPreference ?? ''
            next.availableFrom = s.availableFrom ?? ''
            next.linkedinUrl = s.linkedinUrl ?? ''
            next.portfolioUrl = s.portfolioUrl ?? ''
            next.githubUrl = s.githubUrl ?? ''
            next.behanceUrl = s.behanceUrl ?? ''
            next.additionalLinks = s.additionalLinks
            next.languages = s.languages
            next.professionalSummary = s.professionalSummary ?? ''
            next.profileUpdatedAt = s.updatedAt ?? ''
            next.recommendedCareerPathTitle = s.recommendedCareerPathTitle ?? ''
            next.recommendedCareerPathTitleAr = s.recommendedCareerPathTitleAr ?? ''
            next.lastAssessmentAt = s.lastAssessmentAt ?? ''
          }
          next.skills = skills
        } else if (role === 'retiree') {
          const r = await fetchRetireeProfile(user.id)
          if (r) {
            next.industry = r.industry ?? ''
            next.industryAr = r.industryAr ?? ''
            next.yearsExperience = r.yearsExperience?.toString() ?? ''
            next.expertiseCsv = r.expertise.join(', ')
            next.expertiseArCsv = r.expertiseAr.join(', ')
            next.availability = r.availability ?? ''
            next.preferredWorkCsv = r.preferredWork.join(', ')
          }
        } else if (role === 'employee') {
          const e = await fetchEmployeeProfile(user.id)
          if (e) {
            next.jobTitle = e.jobTitle ?? ''
            next.jobTitleAr = e.jobTitleAr ?? ''
            next.companyName = e.companyName ?? ''
            next.yearsInRole = e.yearsInRole?.toString() ?? ''
          }
        } else if (role === 'company') {
          const c = await fetchCompanyProfileData(user.id)
          if (c) {
            next.companyOwnName = c.name
            next.companyOwnNameAr = c.nameAr ?? ''
            next.companyIndustry = c.industry ?? ''
            next.companySize = c.size ?? ''
            next.companyLocation = c.location ?? ''
          }
        } else if (role === 'university') {
          const u = await fetchUniversityProfile(user.id)
          if (u) {
            next.universityOwnName = u.name ?? ''
            next.universityOwnNameAr = u.nameAr ?? ''
            next.universityLocation = u.location ?? ''
            next.universityTotalStudents = u.totalStudents.toString()
          }
        } else if (role === 'provider') {
          const p = await fetchProviderProfile(user.id)
          if (p) {
            next.providerOwnName = p.name ?? ''
            next.providerOwnNameAr = p.nameAr ?? ''
          }
        }

        if (!cancelled) {
          setForm(next)
          setInitialForm(next)
          setDirty(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, role])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !role) return
    setSubmitError(null)

    // Validate identity (always)
    const idCheck = ProfileIdentitySchema.safeParse({
      name: form.name,
      nameAr: form.nameAr,
      phone: form.phone,
      city: form.city,
      region: form.region,
    })

    // Validate role-specific. We only inspect .success/.error, so a generic shape works.
    type AnyCheck = { success: true; data: unknown } | { success: false; error: import('zod').ZodError }
    let roleCheck: AnyCheck | null = null
    if (role === 'student') {
      roleCheck = StudentProfileSchema.safeParse({
        university: form.university,
        college: form.college,
        major: form.major,
        studentNumber: form.studentNumber,
        currentStatus: form.currentStatus,
        graduationYear: form.graduationYear,
        gpa: form.gpa,
        workPreference: form.workPreference,
        availableFrom: form.availableFrom,
        linkedinUrl: form.linkedinUrl,
        portfolioUrl: form.portfolioUrl,
        githubUrl: form.githubUrl,
        behanceUrl: form.behanceUrl,
        professionalSummary: form.professionalSummary,
      })
    } else if (role === 'retiree') {
      roleCheck = RetireeProfileEditSchema.safeParse({
        industry: form.industry, yearsExperience: form.yearsExperience, availability: form.availability,
      })
    } else if (role === 'employee') {
      roleCheck = EmployeeProfileEditSchema.safeParse({
        jobTitle: form.jobTitle, companyName: form.companyName, yearsInRole: form.yearsInRole,
      })
    } else if (role === 'company') {
      roleCheck = CompanyEditSchema.safeParse({
        name: form.companyOwnName, industry: form.companyIndustry,
        size: form.companySize, location: form.companyLocation,
      })
    } else if (role === 'university') {
      roleCheck = UniversityEditSchema.safeParse({
        name: form.universityOwnName, location: form.universityLocation,
        totalStudents: form.universityTotalStudents,
      })
    } else if (role === 'provider') {
      roleCheck = ProviderEditSchema.safeParse({ name: form.providerOwnName })
    }

    if (!idCheck.success || (roleCheck && !roleCheck.success)) {
      const merged: FieldErrors = {}
      if (!idCheck.success) Object.assign(merged, flattenErrors(idCheck.error))
      if (roleCheck && !roleCheck.success) Object.assign(merged, flattenErrors(roleCheck.error))
      setErrors(merged)
      return
    }
    setErrors({})

    setSaving(true)
    try {
      // Always update names
      await updateUserNames(user.id, {
        name: form.name.trim(),
        nameAr: form.nameAr.trim(),
        ...(role === 'student'
          ? {
              phone: form.phone.trim() || null,
              city: form.city.trim() || null,
              region: form.region.trim() || null,
            }
          : {}),
      })

      if (role === 'student') {
        await saveStudentProfile(user.id, {
          university: form.university.trim() || null,
          universityAr: form.universityAr.trim() || null,
          college: form.college.trim() || null,
          collegeAr: form.collegeAr.trim() || null,
          major: form.major.trim() || null,
          majorAr: form.majorAr.trim() || null,
          graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
          gpa: form.gpa ? Number(form.gpa) : null,
          studentNumber: form.studentNumber.trim() || null,
          currentStatus: form.currentStatus || null,
          careerInterests: form.careerInterests,
          preferredOpportunityTypes: form.preferredOpportunityTypes,
          workPreference: form.workPreference || null,
          availableFrom: form.availableFrom || null,
          linkedinUrl: form.linkedinUrl.trim() || null,
          portfolioUrl: form.portfolioUrl.trim() || null,
          githubUrl: form.githubUrl.trim() || null,
          behanceUrl: form.behanceUrl.trim() || null,
          additionalLinks: form.additionalLinks,
          languages: form.languages
            .map((entry) => ({ language: entry.language.trim(), proficiency: entry.proficiency }))
            .filter((entry) => entry.language),
          professionalSummary: form.professionalSummary.trim() || null,
        })
        await saveStudentSkills(user.id, form.skills)
      } else if (role === 'retiree') {
        await saveRetireeProfile(user.id, {
          industry: form.industry.trim() || null,
          industryAr: form.industryAr.trim() || null,
          yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
          expertise: csvToArr(form.expertiseCsv),
          expertiseAr: csvToArr(form.expertiseArCsv),
          availability: form.availability.trim() || null,
          preferredWork: csvToArr(form.preferredWorkCsv),
        })
      } else if (role === 'employee') {
        await saveEmployeeProfile(user.id, {
          jobTitle: form.jobTitle.trim() || null,
          jobTitleAr: form.jobTitleAr.trim() || null,
          companyName: form.companyName.trim() || null,
          yearsInRole: form.yearsInRole ? Number(form.yearsInRole) : null,
        })
      } else if (role === 'company') {
        await saveCompanyProfile(user.id, {
          name: form.companyOwnName.trim(),
          nameAr: form.companyOwnNameAr.trim() || null,
          industry: form.companyIndustry.trim() || null,
          size: form.companySize.trim() || null,
          location: form.companyLocation.trim() || null,
        })
      } else if (role === 'university') {
        await saveUniversityProfile(user.id, {
          name: form.universityOwnName.trim(),
          nameAr: form.universityOwnNameAr.trim() || null,
          location: form.universityLocation.trim() || null,
          totalStudents: form.universityTotalStudents ? Number(form.universityTotalStudents) : 0,
        })
      } else if (role === 'provider') {
        await saveProviderProfile(user.id, {
          name: form.providerOwnName.trim(),
          nameAr: form.providerOwnNameAr.trim() || null,
        })
      }

      const savedAt = new Date().toISOString()
      const nextForm = { ...form, profileUpdatedAt: role === 'student' ? savedAt : form.profileUpdatedAt }
      setForm(nextForm)
      setInitialForm(nextForm)
      setDirty(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2400)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!role) return null
  const isStudent = role === 'student'
  const completion = buildProfileCompletion(form, {
    avatar: user?.avatar,
    email: user?.email,
  }, isArabic, role)
  const professionalLinkCount = [
    form.linkedinUrl,
    form.portfolioUrl,
    form.githubUrl,
    form.behanceUrl,
    ...form.additionalLinks,
  ].filter((value) => value.trim()).length
  const updatedLabel = form.profileUpdatedAt ? formatProfileDate(form.profileUpdatedAt, isArabic) : null

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
              <User className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-imamu-warm-gold">
                {isArabic ? 'هوية الطالب المهنية' : 'Student Career Identity'}
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {isArabic ? 'الملف الشخصي' : 'Profile'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-imamu-navy-100 sm:text-[15px]">
                {isArabic
                  ? 'أدر هويتك الأكاديمية ومعلوماتك المهنية داخل تمكين لتدعم السيرة الذاتية، المطابقة مع الفرص، ورحلتك نحو الجاهزية.'
                  : 'Manage your academic identity and career information in Tamkeen so your CV, opportunity matching, and readiness journey stay accurate.'}
              </p>
            </div>
          </div>

          <div className="min-w-[230px] rounded-2xl border border-white/15 bg-white px-4 py-3 text-imamu-dark shadow-lg shadow-black/10">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-navy-100">
              {isArabic ? 'اكتمال الملف' : 'Profile Completion'}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <p className="font-display text-3xl font-extrabold leading-none text-imamu-gold-deep">{completion.percent}%</p>
              <p className="pb-0.5 text-xs font-semibold text-imamu-dark/60">
                {isArabic ? `${completion.completed} من ${completion.total} عناصر` : `${completion.completed} of ${completion.total} items`}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-imamu-navy-50">
              <div className="h-full rounded-full bg-imamu-navy" style={{ width: `${completion.percent}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative min-h-screen bg-imamu-ice">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-imamu-navy/50" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <ProfileSignal
                  icon={IdCard}
                  label={isArabic ? 'هوية موثقة' : 'Verified identity'}
                  value={form.nameAr || form.name || (isArabic ? 'طالب تمكين' : 'Tamkeen student')}
                  helper={roleDisplay(role, isArabic)}
                />
                <ProfileSignal
                  icon={GraduationCap}
                  label={isArabic ? 'البيانات الأكاديمية' : 'Academic profile'}
                  value={isStudent ? (form.majorAr || form.major || (isArabic ? 'أكمل التخصص' : 'Add major')) : roleDisplay(role, isArabic)}
                  helper={isStudent ? (form.universityAr || form.university || (isArabic ? 'أضف الجامعة' : 'Add university')) : (isArabic ? 'بيانات الدور' : 'Role details')}
                />
                <ProfileSignal
                  icon={BriefcaseBusiness}
                  label={isArabic ? 'الجاهزية المهنية' : 'Career readiness'}
                  value={isStudent ? recommendedPathLabel(form, isArabic) : (isArabic ? 'ملف مهني' : 'Professional profile')}
                  helper={isStudent ? (isArabic ? 'يرتبط بالمطابقة والسيرة' : 'Connected to matching and CV') : (isArabic ? 'تحديث مستمر' : 'Keep it current')}
                  featured
                />
              </div>

              <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  {/* Identity card */}
                  <Card title={isArabic ? 'الهوية الشخصية' : 'Personal identity'} icon={IdCard} variant="primary">
                <div className="rounded-[18px] border border-imamu-navy-50 bg-imamu-navy-50/40 p-4 sm:p-5 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="relative h-28 w-28 shrink-0 rounded-full bg-white p-2 ring-1 ring-imamu-navy-100 shadow-lg shadow-imamu-navy/10">
                      <UserAvatar
                        avatar={user?.avatar ?? ''}
                        size="xl"
                        alt={(isArabic ? user?.nameAr : user?.name) ?? ''}
                        className="h-24 w-24 rounded-full ring-2 ring-imamu-gold-50"
                      />
                      <span className="absolute bottom-1 end-2 h-4 w-4 rounded-full bg-imamu-gold ring-2 ring-white" aria-hidden="true" />
                    {uploadingAvatar && (
                        <div className="absolute inset-2 rounded-full bg-imamu-dark/60 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                      <p className="text-xs uppercase tracking-wider font-bold text-imamu-navy/70 mb-2">
                      {isArabic ? 'الصورة الشخصية' : 'Profile photo'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-imamu-navy text-white text-xs font-bold hover:bg-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/20 transition disabled:opacity-50"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {isArabic ? 'تغيير الصورة' : 'Upload'}
                      </button>
                      {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('/')) && (
                        <button
                          type="button"
                          onClick={handleClearAvatar}
                          disabled={uploadingAvatar}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-imamu-navy-100 bg-white text-imamu-navy text-xs font-bold hover:border-red-200 hover:text-red-500 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isArabic ? 'إزالة' : 'Remove'}
                        </button>
                      )}
                    </div>
                      <p className="text-[11px] text-imamu-dark/50 mt-2">
                      {isArabic ? 'JPG, PNG, WEBP — حد أقصى 2 ميغابايت' : 'JPG, PNG, WEBP — max 2 MB'}
                    </p>
                    {avatarError && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                        <AlertCircle className="w-3 h-3" />
                        {avatarError}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                    </div>
                  </div>
                </div>

	                <div className="grid sm:grid-cols-2 gap-4">
	                  <Field label={isArabic ? 'الاسم بالإنجليزية' : 'Full name (English)'} value={form.name} onChange={(v) => setField('name', v)} error={errors.name} />
	                  <Field label={isArabic ? 'الاسم بالعربية' : 'Full name (Arabic)'} value={form.nameAr} onChange={(v) => setField('nameAr', v)} dir="rtl" error={errors.nameAr} />
	                  <Field
	                    label={isArabic ? 'البريد الإلكتروني' : 'Email'}
	                    value={user?.email ?? ''}
	                    onChange={() => {}}
	                    disabled
	                    helper={isArabic ? 'يتم تحديث هذا الحقل من بيانات الحساب' : 'Managed from your account record'}
	                  />
	                  <Field
	                    label={isArabic ? 'نوع الحساب' : 'Account type'}
	                    value={roleDisplay(role, isArabic)}
	                    onChange={() => {}}
	                    disabled
	                    helper={isArabic ? 'يتم تحديده حسب دورك في المنصة' : 'Set by your platform role'}
	                  />
	                  {role === 'student' && (
	                    <>
	                      <Field label={isArabic ? 'رقم الجوال' : 'Mobile number'} value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+966 5X XXX XXXX" error={errors.phone} />
	                      <Field label={isArabic ? 'المدينة' : 'City'} value={form.city} onChange={(v) => setField('city', v)} placeholder={isArabic ? 'الرياض' : 'Riyadh'} error={errors.city} />
	                      <SelectField
	                        label={isArabic ? 'المنطقة' : 'Region'}
	                        value={form.region}
	                        onChange={(v) => setField('region', v)}
	                        options={SAUDI_REGIONS}
	                        placeholder={isArabic ? 'اختر المنطقة' : 'Select region'}
	                        error={errors.region}
	                        className="sm:col-span-2"
	                      />
	                    </>
	                  )}
	                </div>
	              </Card>
	              {role === 'student' && (
	                <Card title={isArabic ? 'النبذة المهنية' : 'Professional summary'} icon={FileText} variant="primary">
	                  <TextAreaField
	                    label={isArabic ? 'النبذة المهنية' : 'Professional bio'}
	                    value={form.professionalSummary}
	                    onChange={(v) => setField('professionalSummary', v)}
	                    maxLength={500}
	                    rows={6}
	                    error={errors.professionalSummary}
	                    placeholder={isArabic ? 'اكتب نبذة مختصرة عن خبراتك واهتماماتك المهنية...' : 'Write a short summary of your strengths, interests, and career direction...'}
	                    helper={isArabic
	                      ? 'قد تُستخدم هذه النبذة في السجل المهاري، السيرة الذاتية، طلبات الفرص، وملف الخريجين.'
	                      : 'This may be reused in your skills record, CV, applications, and alumni profile.'}
	                  />
	                </Card>
	              )}
	              {role === 'student' && (
	                <Card title={isArabic ? 'المهارات واللغات' : 'Skills & languages'} icon={Languages} variant="primary">
                    <div className="mb-5 grid grid-cols-3 gap-3">
                      <MiniProfileMetric label={isArabic ? 'مهارات' : 'Skills'} value={form.skills.length} />
                      <MiniProfileMetric label={isArabic ? 'لغات' : 'Languages'} value={form.languages.length} />
                      <MiniProfileMetric label={isArabic ? 'شهادات' : 'Certs'} value={autoTrackedAchievements.certifications} accent />
                    </div>
	                  <TagInput
	                    label={isArabic ? 'المهارات' : 'Skills'}
	                    value={skillDraft}
	                    onChange={setSkillDraft}
	                    onAdd={addSkill}
	                    tags={form.skills}
	                    onRemove={removeSkill}
	                    placeholder={isArabic ? 'React، Python، تحليل البيانات...' : 'React, Python, data analysis...'}
	                    helper={isArabic ? 'أضف المهارات التي تساعد في مطابقة الفرص وبناء السيرة الذاتية.' : 'Add skills used for opportunity matching and CV generation.'}
	                  />

	                  <div className="mt-5 space-y-3">
	                    <div className="flex items-center justify-between gap-3">
	                      <div>
	                        <p className="text-xs font-bold text-imamu-dark/60 uppercase tracking-wider">
	                          {isArabic ? 'اللغات' : 'Languages'}
	                        </p>
	                        <p className="text-xs text-imamu-dark/50 mt-1">
	                          {isArabic ? 'أضف اللغة ومستوى الإتقان.' : 'Add each language and proficiency level.'}
	                        </p>
	                      </div>
	                      <button
	                        type="button"
	                        onClick={addLanguageRow}
	                        className="inline-flex items-center gap-1.5 rounded-lg border border-imamu-navy-100 bg-imamu-navy-50 px-3 py-2 text-xs font-bold text-imamu-navy hover:border-imamu-navy transition"
	                      >
	                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
	                        {isArabic ? 'إضافة لغة' : 'Add language'}
	                      </button>
	                    </div>
	                    {form.languages.length === 0 ? (
	                      <p className="rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/50 px-3 py-3 text-sm text-imamu-dark/55">
	                        {isArabic ? 'لم تتم إضافة لغات بعد.' : 'No languages added yet.'}
	                      </p>
	                    ) : (
	                      <div className="space-y-2">
	                        {form.languages.map((entry, index) => (
	                          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)_auto] gap-2">
	                            <input
	                              value={entry.language}
	                              onChange={(event) => updateLanguageRow(index, { language: event.target.value })}
	                              placeholder={isArabic ? 'العربية' : 'Arabic'}
	                              className={fieldControlClass}
	                            />
	                            <select
	                              value={entry.proficiency}
	                              onChange={(event) => updateLanguageRow(index, { proficiency: event.target.value })}
	                              className={fieldControlClass}
	                            >
	                              {LANGUAGE_PROFICIENCIES.map((option) => (
	                                <option key={option.value} value={option.value}>
	                                  {isArabic ? option.ar : option.en}
	                                </option>
	                              ))}
	                            </select>
	                            <button
	                              type="button"
	                              onClick={() => removeLanguageRow(index)}
	                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-imamu-navy-100 bg-white text-imamu-navy hover:border-red-200 hover:text-red-500 transition"
	                              aria-label={isArabic ? 'حذف اللغة' : 'Remove language'}
	                            >
	                              <X className="w-4 h-4" aria-hidden="true" />
	                            </button>
	                          </div>
	                        ))}
	                      </div>
	                    )}
	                  </div>
                    <div className="mt-5 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/55 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className={iconTile}>
                            <Award className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-imamu-dark">
                              {isArabic ? 'السجل المهاري المتكامل' : 'Connected skills record'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-imamu-dark/55">
                              {isArabic
                                ? 'الدورات والشهادات والأنشطة تظهر بتفصيل أكبر في السجل المهاري.'
                                : 'Courses, certifications, and activities are managed in the full skills record.'}
                            </p>
                          </div>
                        </div>
                        <Link
                          to="/skills-record"
                          className="inline-flex items-center justify-center rounded-xl border border-imamu-navy-100 bg-white px-4 py-2.5 text-xs font-bold text-imamu-navy transition hover:bg-imamu-navy-50"
                        >
                          {isArabic ? 'فتح السجل' : 'Open record'}
                        </Link>
                      </div>
                    </div>
	                </Card>
	              )}
                  {role === 'student' && (
                    <div className="hidden space-y-6 lg:block">
                      <Card title={isArabic ? 'تقييم المسار المهني' : 'Career assessment'} icon={Brain} variant="utility">
                        {retakeConfirmOpen ? (
                          <div className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50 p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-imamu-gold shrink-0 mt-0.5" aria-hidden="true" />
                              <div className="flex-1">
                                <p className="font-semibold text-imamu-dark text-sm mb-1">
                                  {isArabic ? 'هل أنت متأكد؟' : 'Are you sure?'}
                                </p>
                                <p className="text-[13px] text-imamu-dark/70 leading-relaxed">
                                  {isArabic
                                    ? 'سيتم استبدال نتيجتك السابقة بمجرد إكمال التقييم الجديد.'
                                    : 'Your current result will be replaced once you finish the new assessment.'}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={handleRetakeAssessment}
                                    disabled={retakeWorking}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-imamu-navy text-white rounded-lg text-sm font-bold hover:bg-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/20 transition disabled:opacity-60"
                                  >
                                    {retakeWorking ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                    )}
                                    {isArabic ? 'نعم، ابدأ التقييم' : 'Yes, start the assessment'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRetakeConfirmOpen(false)}
                                    disabled={retakeWorking}
                                    className="px-4 py-2 text-sm font-semibold text-imamu-navy hover:text-imamu-navy-deep transition disabled:opacity-60"
                                  >
                                    {isArabic ? 'إلغاء' : 'Cancel'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50/50 p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white text-imamu-gold ring-1 ring-imamu-gold-100 flex items-center justify-center shrink-0">
                                <Compass className="w-5 h-5" aria-hidden="true" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="grid gap-2 mb-3">
                                  <div className="rounded-xl border border-imamu-gold-100 bg-white/70 px-3 py-2">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold">
                                      {isArabic ? 'المسار الموصى به' : 'Recommended path'}
                                    </p>
                                    <p className="text-sm font-bold text-imamu-dark mt-0.5">
                                      {recommendedPathLabel(form, isArabic)}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[11px] text-imamu-dark/55">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-imamu-navy-50 bg-white px-2 py-1">
                                      <CalendarDays className="w-3.5 h-3.5 text-imamu-navy" aria-hidden="true" />
                                      {form.lastAssessmentAt
                                        ? `${isArabic ? 'آخر تقييم:' : 'Last assessment:'} ${formatProfileDate(form.lastAssessmentAt, isArabic)}`
                                        : (isArabic ? 'لم يتم تسجيل تاريخ تقييم بعد' : 'No assessment date recorded yet')}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-imamu-dark/75 leading-relaxed mb-3">
                                  {isArabic
                                    ? 'إعادة التقييم قد تحدّث المسار المهني، التدريب المقترح، والفرص المطابقة.'
                                    : 'Retaking the assessment may update your career path, recommended training, and matched opportunities.'}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setRetakeConfirmOpen(true)}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-imamu-navy text-white rounded-lg text-sm font-bold hover:bg-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/20 transition"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                  {isArabic ? 'إعادة التقييم' : 'Retake assessment'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Card>

                      <Card title={isArabic ? 'الرؤية والخصوصية' : 'Visibility & privacy'} icon={ShieldCheck}>
                        <div className="space-y-3">
                          <VisibilityRow
                            active
                            title={isArabic ? 'يُستخدم في مطابقة الفرص' : 'Used for opportunity matching'}
                            description={isArabic ? 'تستخدم تمكين بياناتك الأكاديمية والمهنية لتحسين التوصيات داخل المنصة.' : 'Tamkeen uses your academic and career data to improve recommendations inside the platform.'}
                          />
                          <VisibilityRow
                            active={Boolean(form.professionalSummary || professionalLinkCount > 0)}
                            title={isArabic ? 'جاهز للعرض المهني' : 'Ready for professional review'}
                            description={isArabic ? 'أكمل النبذة والروابط لتقديم صورة أوضح عند التقديم.' : 'Complete your bio and links to present a stronger profile when applying.'}
                          />
                          <VisibilityRow
                            active={form.skills.length >= 3}
                            title={isArabic ? 'مرتبط بالسجل المهاري' : 'Connected to skills record'}
                            description={isArabic ? 'كلما زادت المهارات والشهادات، أصبحت المطابقة أكثر دقة.' : 'More skills and certifications make matching more precise.'}
                          />
                        </div>
                      </Card>
                    </div>
                  )}
	                </div>

                <div className="space-y-6">
              <CompletionSummaryCard
                completion={completion}
                isArabic={isArabic}
                updatedLabel={updatedLabel}
                nextActionHref={isStudent ? '/skills-record' : undefined}
              />
              {/* Role-specific card */}
              {role === 'student' && (
                <Card title={isArabic ? 'بيانات الطالب' : 'Student details'} icon={GraduationCap} variant="primary">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* University picker — sets both EN + AR fields from one selection. */}
	                    <BilingualSelect
	                      label={isArabic ? 'الجامعة' : 'University'}
                      options={SAUDI_UNIVERSITIES}
                      valueEn={form.university}
                      valueAr={form.universityAr}
                      onSelect={(entry) => {
                        setField('university', entry.en)
                        setField('universityAr', entry.ar)
	                      }}
	                      error={errors.university}
	                    />
	                    <Field
	                      label={isArabic ? 'الكلية' : 'College'}
	                      value={form.college}
	                      onChange={(v) => setField('college', v)}
	                      placeholder={isArabic ? 'كلية علوم الحاسب والمعلومات' : 'College of Computer and Information Sciences'}
	                      error={errors.college}
	                    />
	                    {/* Major picker — sets both EN + AR fields from one selection. */}
	                    <BilingualSelect
                      label={isArabic ? 'التخصص' : 'Major'}
                      options={MAJORS}
                      valueEn={form.major}
                      valueAr={form.majorAr}
                      onSelect={(entry) => {
                        setField('major', entry.en)
                        setField('majorAr', entry.ar)
                      }}
	                      error={errors.major}
	                    />
	                    <Field label={isArabic ? 'سنة التخرج' : 'Graduation year'} value={form.graduationYear} onChange={(v) => setField('graduationYear', v)} placeholder="2026" error={errors.graduationYear} />
	                    <Field label="GPA" value={form.gpa} onChange={(v) => setField('gpa', v)} placeholder="3.85" error={errors.gpa} />
	                    <Field
	                      label={isArabic ? 'الرقم الجامعي' : 'Student ID'}
	                      value={form.studentNumber}
	                      onChange={(v) => setField('studentNumber', v)}
	                      placeholder="44XXXXXXX"
	                      helper={isArabic ? 'اختياري، ويُستخدم للربط الأكاديمي الداخلي عند الحاجة.' : 'Optional, used only for internal academic reference when needed.'}
	                      error={errors.studentNumber}
	                      className="sm:col-span-2"
	                    />
	                  </div>
	                </Card>
	              )}

	              {role === 'student' && (
	                <Card title={isArabic ? 'التفضيلات المهنية' : 'Career preferences'} icon={BriefcaseBusiness} variant="utility">
	                  <div className="space-y-5">
	                    <p className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50 px-4 py-3 text-sm text-imamu-dark/70 leading-relaxed">
	                      {isArabic
	                        ? 'تساعد هذه التفضيلات في تحسين مطابقة الفرص، اقتراح المسارات التدريبية، وتحضير المقابلات.'
	                        : 'These preferences improve opportunity matching, training recommendations, and interview preparation.'}
	                    </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/50 p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-dark/50">
                            {isArabic ? 'المسار المهني الحالي' : 'Current career path'}
                          </p>
                          <p className="mt-1 text-sm font-bold text-imamu-dark">
                            {recommendedPathLabel(form, isArabic)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-imamu-navy-50 bg-white p-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-imamu-navy" aria-hidden="true" />
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-dark/50">
                                {isArabic ? 'مدينة المطابقة' : 'Matching city'}
                              </p>
                              <p className="mt-1 text-sm font-bold text-imamu-dark">
                                {form.city || (isArabic ? 'أضف المدينة في الهوية' : 'Add city in identity')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
	                    <SelectField
	                      label={isArabic ? 'الحالة الحالية' : 'Current status'}
	                      value={form.currentStatus}
	                      onChange={(v) => setField('currentStatus', v)}
	                      options={CURRENT_STATUS_OPTIONS}
	                      placeholder={isArabic ? 'اختر الحالة' : 'Select status'}
	                      error={errors.currentStatus}
	                    />
	                    <ChipMultiSelect
	                      label={isArabic ? 'المجالات المهنية المهتم بها' : 'Career fields of interest'}
	                      options={CAREER_INTEREST_OPTIONS}
	                      selected={form.careerInterests}
	                      onToggle={(value) => toggleArrayField('careerInterests', value)}
	                      isArabic={isArabic}
	                    />
	                    <ChipMultiSelect
	                      label={isArabic ? 'نوع الفرص المفضلة' : 'Preferred opportunity types'}
	                      options={OPPORTUNITY_TYPE_OPTIONS}
	                      selected={form.preferredOpportunityTypes}
	                      onToggle={(value) => toggleArrayField('preferredOpportunityTypes', value)}
	                      isArabic={isArabic}
	                    />
	                    <SelectField
	                      label={isArabic ? 'تفضيل نمط العمل' : 'Work mode preference'}
	                      value={form.workPreference}
	                      onChange={(v) => setField('workPreference', v)}
	                      options={WORK_PREFERENCE_OPTIONS}
	                      placeholder={isArabic ? 'اختر النمط' : 'Select mode'}
	                      error={errors.workPreference}
	                    />
	                    <Field
	                      label={isArabic ? 'متاح للعمل من تاريخ' : 'Available from'}
	                      value={form.availableFrom}
	                      onChange={(v) => setField('availableFrom', v)}
	                      type="date"
	                      error={errors.availableFrom}
	                      helper={isArabic ? 'اختياري، ويمكن تركه فارغاً إذا لم تكن تبحث حالياً.' : 'Optional; leave blank if you are not actively looking.'}
	                    />
	                  </div>
	                </Card>
	              )}

	              {role === 'student' && (
	                <Card title={isArabic ? 'الروابط المهنية' : 'Professional links'} icon={Link2}>
                    <div className="mb-5 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-imamu-dark">
                            {isArabic ? 'حضورك المهني العام' : 'Your professional presence'}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-imamu-dark/55">
                            {isArabic
                              ? 'هذه الروابط تدعم بناء السيرة وتساعد أصحاب الفرص على مراجعة أعمالك.'
                              : 'These links support CV generation and help opportunity owners review your work.'}
                          </p>
                        </div>
                        <span className="rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-3 py-1 text-xs font-extrabold text-imamu-gold-deep">
                          {professionalLinkCount}
                        </span>
                      </div>
                    </div>
	                  <div className="grid sm:grid-cols-2 gap-4">
	                    <Field label="LinkedIn" value={form.linkedinUrl} onChange={(v) => setField('linkedinUrl', v)} placeholder="https://linkedin.com/in/..." error={errors.linkedinUrl} />
	                    <Field label={isArabic ? 'الموقع الشخصي / Portfolio' : 'Portfolio / personal site'} value={form.portfolioUrl} onChange={(v) => setField('portfolioUrl', v)} placeholder="https://..." error={errors.portfolioUrl} />
	                    <Field label="GitHub" value={form.githubUrl} onChange={(v) => setField('githubUrl', v)} placeholder="https://github.com/..." error={errors.githubUrl} />
	                    <Field label="Behance" value={form.behanceUrl} onChange={(v) => setField('behanceUrl', v)} placeholder="https://behance.net/..." error={errors.behanceUrl} />
	                  </div>
	                  <div className="mt-5">
	                    <TagInput
	                      label={isArabic ? 'روابط مهنية إضافية' : 'Additional professional links'}
	                      value={linkDraft}
	                      onChange={setLinkDraft}
	                      onAdd={addAdditionalLink}
	                      tags={form.additionalLinks}
	                      onRemove={removeAdditionalLink}
	                      placeholder="https://..."
	                      error={errors.additionalLinks}
	                      helper={isArabic ? 'أضف روابط منشورات، مشاريع، أو ملفات مهنية داعمة.' : 'Add project, publication, or professional profile links.'}
	                    />
	                  </div>
	                </Card>
	              )}

	              {/* Career assessment — students only. The only place a retake can be initiated. */}
	              {role === 'student' && (
                    <div className="lg:hidden">
                <Card title={isArabic ? 'تقييم المسار المهني' : 'Career assessment'} icon={Brain} variant="utility">
                  {retakeConfirmOpen ? (
                    <div className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-imamu-gold shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="flex-1">
                          <p className="font-semibold text-imamu-dark text-sm mb-1">
                            {isArabic ? 'هل أنت متأكد؟' : 'Are you sure?'}
                          </p>
                          <p className="text-[13px] text-imamu-dark/70 leading-relaxed">
                            {isArabic
                              ? 'سيتم استبدال نتيجتك السابقة بمجرد إكمال التقييم الجديد.'
                              : 'Your current result will be replaced once you finish the new assessment.'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleRetakeAssessment}
                              disabled={retakeWorking}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-imamu-navy text-white rounded-lg text-sm font-bold hover:bg-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/20 transition disabled:opacity-60"
                            >
                              {retakeWorking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              {isArabic ? 'نعم، ابدأ التقييم' : 'Yes, start the assessment'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRetakeConfirmOpen(false)}
                              disabled={retakeWorking}
                              className="px-4 py-2 text-sm font-semibold text-imamu-navy hover:text-imamu-navy-deep transition disabled:opacity-60"
                            >
                              {isArabic ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
	                  ) : (
	                    <div className="rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50/50 p-4">
	                      <div className="flex items-start gap-3">
	                      <div className="w-10 h-10 rounded-xl bg-white text-imamu-gold ring-1 ring-imamu-gold-100 flex items-center justify-center shrink-0">
	                        <Compass className="w-5 h-5" aria-hidden="true" />
	                      </div>
	                      <div className="flex-1 min-w-0">
	                        <div className="grid gap-2 mb-3">
	                          <div className="rounded-xl border border-imamu-gold-100 bg-white/70 px-3 py-2">
	                            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold">
	                              {isArabic ? 'المسار الموصى به' : 'Recommended path'}
	                            </p>
	                            <p className="text-sm font-bold text-imamu-dark mt-0.5">
	                              {recommendedPathLabel(form, isArabic)}
	                            </p>
	                          </div>
	                          <div className="flex flex-wrap gap-2 text-[11px] text-imamu-dark/55">
	                            <span className="inline-flex items-center gap-1 rounded-full border border-imamu-navy-50 bg-white px-2 py-1">
	                              <CalendarDays className="w-3.5 h-3.5 text-imamu-navy" aria-hidden="true" />
	                              {form.lastAssessmentAt
	                                ? `${isArabic ? 'آخر تقييم:' : 'Last assessment:'} ${formatProfileDate(form.lastAssessmentAt, isArabic)}`
	                                : (isArabic ? 'لم يتم تسجيل تاريخ تقييم بعد' : 'No assessment date recorded yet')}
	                            </span>
	                          </div>
	                        </div>
	                        <p className="text-sm text-imamu-dark/75 leading-relaxed mb-3">
	                          {isArabic
	                            ? 'إعادة التقييم قد تحدّث المسار المهني، التدريب المقترح، والفرص المطابقة.'
	                            : 'Retaking the assessment may update your career path, recommended training, and matched opportunities.'}
	                        </p>
                        <button
                          type="button"
                          onClick={() => setRetakeConfirmOpen(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-imamu-navy text-white rounded-lg text-sm font-bold hover:bg-imamu-navy-deep hover:shadow-md hover:shadow-imamu-navy/20 transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          {isArabic ? 'إعادة التقييم' : 'Retake assessment'}
                        </button>
                      </div>
                      </div>
                    </div>
                  )}
                </Card>
                    </div>
              )}

              {role === 'student' && (
                <div className="lg:hidden">
                <Card title={isArabic ? 'الرؤية والخصوصية' : 'Visibility & privacy'} icon={ShieldCheck}>
                  <div className="space-y-3">
                    <VisibilityRow
                      active
                      title={isArabic ? 'يُستخدم في مطابقة الفرص' : 'Used for opportunity matching'}
                      description={isArabic ? 'تستخدم تمكين بياناتك الأكاديمية والمهنية لتحسين التوصيات داخل المنصة.' : 'Tamkeen uses your academic and career data to improve recommendations inside the platform.'}
                    />
                    <VisibilityRow
                      active={Boolean(form.professionalSummary || professionalLinkCount > 0)}
                      title={isArabic ? 'جاهز للعرض المهني' : 'Ready for professional review'}
                      description={isArabic ? 'أكمل النبذة والروابط لتقديم صورة أوضح عند التقديم.' : 'Complete your bio and links to present a stronger profile when applying.'}
                    />
                    <VisibilityRow
                      active={form.skills.length >= 3}
                      title={isArabic ? 'مرتبط بالسجل المهاري' : 'Connected to skills record'}
                      description={isArabic ? 'كلما زادت المهارات والشهادات، أصبحت المطابقة أكثر دقة.' : 'More skills and certifications make matching more precise.'}
                    />
                  </div>
                </Card>
                </div>
              )}

              {role === 'retiree' && (
                <Card title={isArabic ? 'بيانات المتقاعد' : 'Retiree details'} icon={ShieldCheck}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={isArabic ? 'القطاع' : 'Industry'} value={form.industry} onChange={(v) => setField('industry', v)} error={errors.industry} />
                    <Field label={isArabic ? 'القطاع (عربي)' : 'Industry (Arabic)'} value={form.industryAr} onChange={(v) => setField('industryAr', v)} dir="rtl" />
                    <Field label={isArabic ? 'سنوات الخبرة' : 'Years of experience'} value={form.yearsExperience} onChange={(v) => setField('yearsExperience', v)} placeholder="32" error={errors.yearsExperience} />
                    <Field label={isArabic ? 'التوفر' : 'Availability'} value={form.availability} onChange={(v) => setField('availability', v)} placeholder={isArabic ? 'دوام جزئي · 20 ساعة' : 'Part-time · 20 hrs/week'} />
                    <Field label={isArabic ? 'مجالات الخبرة (مفصولة بفواصل)' : 'Expertise (comma separated)'} value={form.expertiseCsv} onChange={(v) => setField('expertiseCsv', v)} placeholder="Project Management, Oil & Gas" className="sm:col-span-2" />
                    <Field label={isArabic ? 'مجالات الخبرة بالعربية' : 'Expertise in Arabic'} value={form.expertiseArCsv} onChange={(v) => setField('expertiseArCsv', v)} dir="rtl" placeholder="إدارة مشاريع، النفط والغاز" className="sm:col-span-2" />
                    <Field label={isArabic ? 'العمل المُفضل' : 'Preferred work types'} value={form.preferredWorkCsv} onChange={(v) => setField('preferredWorkCsv', v)} placeholder="Consulting, Mentoring, Board Advisory" className="sm:col-span-2" />
                  </div>
                </Card>
              )}

              {role === 'employee' && (
                <Card title={isArabic ? 'بيانات الموظف' : 'Employee details'} icon={ShieldCheck}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={isArabic ? 'المسمى الوظيفي' : 'Job title'} value={form.jobTitle} onChange={(v) => setField('jobTitle', v)} error={errors.jobTitle} />
                    <Field label={isArabic ? 'المسمى الوظيفي (عربي)' : 'Job title (Arabic)'} value={form.jobTitleAr} onChange={(v) => setField('jobTitleAr', v)} dir="rtl" />
                    <Field label={isArabic ? 'الشركة' : 'Company'} value={form.companyName} onChange={(v) => setField('companyName', v)} error={errors.companyName} />
                    <Field label={isArabic ? 'سنوات في هذه الوظيفة' : 'Years in role'} value={form.yearsInRole} onChange={(v) => setField('yearsInRole', v)} placeholder="3" error={errors.yearsInRole} />
                  </div>
                </Card>
              )}

              {role === 'company' && (
                <Card title={isArabic ? 'بيانات الشركة' : 'Company details'} icon={ShieldCheck}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={isArabic ? 'اسم الشركة' : 'Company name'} value={form.companyOwnName} onChange={(v) => setField('companyOwnName', v)} error={errors.name} />
                    <Field label={isArabic ? 'اسم الشركة (عربي)' : 'Company name (Arabic)'} value={form.companyOwnNameAr} onChange={(v) => setField('companyOwnNameAr', v)} dir="rtl" />
                    <Field label={isArabic ? 'القطاع' : 'Industry'} value={form.companyIndustry} onChange={(v) => setField('companyIndustry', v)} placeholder="Technology" />
                    <Field label={isArabic ? 'حجم الشركة' : 'Size'} value={form.companySize} onChange={(v) => setField('companySize', v)} placeholder="500+ employees" />
                    <Field label={isArabic ? 'الموقع' : 'Location'} value={form.companyLocation} onChange={(v) => setField('companyLocation', v)} placeholder={isArabic ? 'الرياض' : 'Riyadh'} className="sm:col-span-2" />
                  </div>
                </Card>
              )}

              {role === 'university' && (
                <Card title={isArabic ? 'بيانات الجامعة' : 'University details'} icon={GraduationCap} variant="primary">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={isArabic ? 'اسم الجامعة' : 'University name'} value={form.universityOwnName} onChange={(v) => setField('universityOwnName', v)} error={errors.name} />
                    <Field label={isArabic ? 'اسم الجامعة (عربي)' : 'University name (Arabic)'} value={form.universityOwnNameAr} onChange={(v) => setField('universityOwnNameAr', v)} dir="rtl" />
                    <Field label={isArabic ? 'الموقع' : 'Location'} value={form.universityLocation} onChange={(v) => setField('universityLocation', v)} />
                    <Field label={isArabic ? 'إجمالي الطلاب' : 'Total students'} value={form.universityTotalStudents} onChange={(v) => setField('universityTotalStudents', v)} placeholder="60000" error={errors.totalStudents} />
                  </div>
                </Card>
              )}

              {role === 'provider' && (
                <Card title={isArabic ? 'بيانات المزود' : 'Provider details'} icon={ShieldCheck}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={isArabic ? 'اسم المزود' : 'Provider name'} value={form.providerOwnName} onChange={(v) => setField('providerOwnName', v)} error={errors.name} />
                    <Field label={isArabic ? 'اسم المزود (عربي)' : 'Provider name (Arabic)'} value={form.providerOwnNameAr} onChange={(v) => setField('providerOwnNameAr', v)} dir="rtl" />
                  </div>
                </Card>
              )}
              </div>
              </div>
              {/* /grid */}

              {/* Submit error */}
              {submitError && (
                <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="rounded-[20px] border border-imamu-navy-50 bg-white p-4 shadow-lg shadow-imamu-navy/5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className={goldIconTile}>
                      <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-display font-bold text-imamu-dark">
                        {isArabic ? 'راجع التغييرات قبل الحفظ' : 'Review changes before saving'}
                      </p>
                      <p className="text-sm text-imamu-dark/55 mt-1">
                        {dirty
                          ? (isArabic ? 'لديك تغييرات غير محفوظة.' : 'You have unsaved changes.')
                          : (isArabic ? 'كل التغييرات محفوظة.' : 'All changes are saved.')}
                        {form.profileUpdatedAt && (
                          <span className="block mt-0.5">
                            {isArabic ? 'آخر تحديث: ' : 'Last updated: '}
                            {formatProfileDate(form.profileUpdatedAt, isArabic)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={resetFormChanges}
                      disabled={!dirty || saving}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy font-bold hover:border-imamu-navy transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      {isArabic ? 'إعادة ضبط' : 'Reset'}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-imamu-navy text-white rounded-xl font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 active:translate-y-0 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {isArabic ? 'جارٍ الحفظ…' : 'Saving…'}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          {isArabic ? 'حفظ التغييرات' : 'Save changes'}
                        </>
                      )}
                    </button>

                    <AnimatePresence>
                      {savedFlash && (
                        <motion.div
                          role="status"
                          aria-live="polite"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="inline-flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg text-sm font-semibold"
                        >
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          {isArabic ? 'تم الحفظ' : 'Saved'}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}

interface CompletionSummary {
  percent: number
  completed: number
  total: number
  missing: string[]
}

function buildProfileCompletion(
  form: FormState,
  userMeta: { avatar?: string | null; email?: string | null },
  isArabic: boolean,
  role: string,
): CompletionSummary {
  const baseItems = [
    { done: Boolean(form.name || form.nameAr), ar: 'الاسم', en: 'Name' },
    { done: Boolean(userMeta.email), ar: 'البريد الإلكتروني', en: 'Email' },
  ]

  const studentItems = role === 'student'
    ? [
        { done: Boolean(userMeta.avatar), ar: 'الصورة الشخصية', en: 'Profile photo' },
        { done: Boolean(form.phone), ar: 'رقم الجوال', en: 'Mobile number' },
        { done: Boolean(form.city && form.region), ar: 'المدينة والمنطقة', en: 'City and region' },
        { done: Boolean(form.university && form.major), ar: 'الجامعة والتخصص', en: 'University and major' },
        { done: Boolean(form.graduationYear), ar: 'سنة التخرج', en: 'Graduation year' },
        { done: Boolean(form.gpa), ar: 'المعدل', en: 'GPA' },
        { done: Boolean(form.professionalSummary), ar: 'النبذة المهنية', en: 'Professional bio' },
        { done: form.careerInterests.length > 0, ar: 'المجالات المهنية', en: 'Career fields' },
        { done: form.preferredOpportunityTypes.length > 0, ar: 'نوع الفرص', en: 'Opportunity types' },
        { done: Boolean(form.workPreference), ar: 'نمط العمل', en: 'Work mode' },
        { done: Boolean(form.linkedinUrl), ar: 'رابط LinkedIn', en: 'LinkedIn URL' },
        { done: Boolean(form.githubUrl || form.portfolioUrl || form.behanceUrl || form.additionalLinks.length), ar: 'رابط أعمال مهني', en: 'Professional work link' },
        { done: form.skills.length >= 3, ar: 'ثلاث مهارات على الأقل', en: 'At least three skills' },
        { done: form.languages.length > 0, ar: 'اللغات', en: 'Languages' },
        { done: Boolean(form.recommendedCareerPathTitle || form.recommendedCareerPathTitleAr), ar: 'تقييم المسار', en: 'Career assessment' },
      ]
    : []

  const items = [...baseItems, ...studentItems]
  const completed = items.filter((item) => item.done).length
  const total = items.length || 1
  return {
    percent: Math.round((completed / total) * 100),
    completed,
    total,
    missing: items.filter((item) => !item.done).slice(0, 4).map((item) => isArabic ? item.ar : item.en),
  }
}

function ProfileSignal({
  icon: Icon,
  label,
  value,
  helper,
  featured = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  helper: string
  featured?: boolean
}) {
  return (
    <div className={cn(
      cardBase,
      'p-4',
      featured && 'border-imamu-gold-100 bg-imamu-gold-50/40',
    )}>
      {featured && <span className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />}
      <div className="flex items-start gap-3">
        <span className={featured ? goldIconTile : iconTile}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-dark/50">{label}</p>
          <p className="mt-1 truncate text-sm font-extrabold text-imamu-dark">{value}</p>
          <p className="mt-0.5 truncate text-xs text-imamu-dark/55">{helper}</p>
        </div>
      </div>
    </div>
  )
}

function CompletionSummaryCard({
  completion,
  isArabic,
  updatedLabel,
  nextActionHref,
}: {
  completion: CompletionSummary
  isArabic: boolean
  updatedLabel: string | null
  nextActionHref?: string
}) {
  return (
    <div className={cn(cardBase, 'p-5 sm:p-6')}>
      <div className="absolute inset-x-0 top-0 h-1 bg-imamu-gold" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imamu-gold-deep">
            {isArabic ? 'حالة اكتمال الملف' : 'Profile Completeness'}
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-imamu-dark">
            {completion.percent}%
          </h2>
        </div>
        <span className={goldIconTile}>
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-imamu-navy-50">
        <div className="h-full rounded-full bg-imamu-navy" style={{ width: `${completion.percent}%` }} />
      </div>
      <p className="mt-3 text-sm leading-6 text-imamu-dark/62">
        {isArabic
          ? `أكملت ${completion.completed} من ${completion.total} عناصر أساسية للهوية والمطابقة.`
          : `${completion.completed} of ${completion.total} essential identity and matching items are complete.`}
      </p>
      {completion.missing.length > 0 && (
        <div className="mt-4 rounded-2xl border border-imamu-gold-100 bg-imamu-gold-50/70 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-gold-deep">
            {isArabic ? 'المتبقي' : 'Still needed'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {completion.missing.map((item) => (
              <span key={item} className="rounded-full border border-imamu-gold-100 bg-white px-2.5 py-1 text-[11px] font-bold text-imamu-gold-deep">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-2 text-xs text-imamu-dark/58">
        <div className="flex items-center justify-between rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/55 px-3 py-2">
          <span>{isArabic ? 'السيرة الذاتية' : 'CV generation'}</span>
          <CheckCircle2 className="h-4 w-4 text-imamu-navy" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/55 px-3 py-2">
          <span>{isArabic ? 'مطابقة الفرص' : 'Opportunity matching'}</span>
          <CheckCircle2 className="h-4 w-4 text-imamu-navy" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/55 px-3 py-2">
          <span>{isArabic ? 'السجل المهاري' : 'Skills record'}</span>
          <CheckCircle2 className="h-4 w-4 text-imamu-navy" aria-hidden="true" />
        </div>
      </div>
      {updatedLabel && (
        <p className="mt-4 text-xs text-imamu-dark/45">
          {isArabic ? 'آخر تحديث: ' : 'Last updated: '}{updatedLabel}
        </p>
      )}
      {nextActionHref && (
        <Link
          to={nextActionHref}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-imamu-navy px-4 py-3 text-sm font-bold text-white transition hover:bg-imamu-navy-deep"
        >
          {isArabic ? 'تحسين الجاهزية' : 'Improve readiness'}
        </Link>
      )}
    </div>
  )
}

function MiniProfileMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn(
      'rounded-2xl border p-3',
      accent ? 'border-imamu-gold-100 bg-imamu-gold-50/65' : 'border-imamu-navy-50 bg-imamu-navy-50/55',
    )}>
      <p className="font-display text-2xl font-extrabold text-imamu-dark">{value}</p>
      <p className={cn('mt-0.5 text-[11px] font-bold', accent ? 'text-imamu-gold-deep' : 'text-imamu-dark/55')}>
        {label}
      </p>
    </div>
  )
}

function VisibilityRow({ active, title, description }: { active: boolean; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-3">
      <span className={cn(
        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
        active ? 'border-green-100 bg-green-50 text-green-600' : 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep',
      )}>
        {active ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div>
        <p className="text-sm font-bold text-imamu-dark">{title}</p>
        <p className="mt-1 text-xs leading-5 text-imamu-dark/55">{description}</p>
      </div>
    </div>
  )
}

function Card({
  title,
  children,
  icon: Icon,
  variant = 'default',
}: {
  title: string
  children: ReactNode
  icon?: LucideIcon
  variant?: 'default' | 'primary' | 'utility'
}) {
  return (
    <div className={cn(cardBase, 'p-5 sm:p-6', variant === 'primary' && 'shadow-xl shadow-imamu-navy/7', variant === 'utility' && 'bg-imamu-gold-50/40')}>
      <div className={cn('absolute inset-x-0 top-0 h-1', variant === 'utility' ? 'bg-imamu-gold' : 'bg-imamu-navy')} aria-hidden="true" />
      <div className="mb-5 flex items-center gap-3">
        {Icon && (
          <span className={variant === 'utility' ? goldIconTile : iconTile}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </span>
        )}
        <div>
          <h2 className="font-display text-lg font-bold text-imamu-dark">
            {title}
          </h2>
          <div className="mt-1 h-px w-16 bg-imamu-gold" aria-hidden="true" />
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({
  label, value, onChange, dir, type = 'text', placeholder, className, error, disabled, helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  dir?: 'rtl'
  type?: string
  placeholder?: string
  className?: string
  error?: string
  disabled?: boolean
  helper?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-bold text-imamu-dark/60 mb-1.5 uppercase tracking-wider">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          fieldControlClass,
          disabled
            ? 'bg-imamu-navy-50/70 border-imamu-navy-50 cursor-not-allowed text-imamu-dark/55'
            : error
              ? 'border-red-300 bg-white focus:outline-none focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
              : '',
          dir === 'rtl' && 'font-arabic',
        )}
      />
      {helper && !error && <p className="mt-1.5 text-xs text-imamu-dark/45">{helper}</p>}
      <FieldError message={error} />
    </div>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  className,
  error,
  helper,
  rows = 4,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  error?: string
  helper?: string
  rows?: number
  maxLength?: number
}) {
  const id = useId()
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-xs font-bold text-imamu-dark/60 uppercase tracking-wider">
          {label}
        </label>
        {maxLength && (
          <span className="text-[11px] text-imamu-dark/40">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={cn(fieldControlClass, 'min-h-28 resize-y leading-relaxed', error && 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]')}
      />
      {helper && !error && <p className="mt-1.5 text-xs text-imamu-dark/45">{helper}</p>}
      <FieldError message={error} />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
  error,
  helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; ar: string; en: string }>
  placeholder?: string
  className?: string
  error?: string
  helper?: string
}) {
  const { isArabic } = useLanguage()
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-bold text-imamu-dark/60 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldControlClass, error && 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]')}
      >
        <option value="">{placeholder ?? (isArabic ? 'اختر...' : 'Select...')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {isArabic ? option.ar : option.en}
          </option>
        ))}
      </select>
      {helper && !error && <p className="mt-1.5 text-xs text-imamu-dark/45">{helper}</p>}
      <FieldError message={error} />
    </div>
  )
}

function ChipMultiSelect({
  label,
  options,
  selected,
  onToggle,
  isArabic,
}: {
  label: string
  options: Array<{ value: string; ar: string; en: string }>
  selected: string[]
  onToggle: (value: string) => void
  isArabic: boolean
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-imamu-dark/60 uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-bold transition',
                active
                  ? 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep shadow-sm shadow-imamu-gold/10'
                  : 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy hover:border-imamu-navy',
              )}
            >
              {isArabic ? option.ar : option.en}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TagInput({
  label,
  value,
  onChange,
  onAdd,
  tags,
  onRemove,
  placeholder,
  helper,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  tags: string[]
  onRemove: (tag: string) => void
  placeholder?: string
  helper?: string
  error?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-imamu-dark/60 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          placeholder={placeholder}
          className={cn(fieldControlClass, error && 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]')}
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-imamu-navy text-white hover:bg-imamu-navy-deep transition"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {helper && !error && <p className="mt-1.5 text-xs text-imamu-dark/45">{helper}</p>}
      <FieldError message={error} />
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-imamu-navy-100 bg-imamu-navy-50 px-3 py-1.5 text-xs font-bold text-imamu-navy">
              {tag}
              <button type="button" onClick={() => onRemove(tag)} className="text-imamu-navy/60 hover:text-red-500 transition">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function roleDisplay(role: string, isArabic: boolean) {
  const labels: Record<string, { ar: string; en: string }> = {
    student: { ar: 'طالب', en: 'Student' },
    retiree: { ar: 'متقاعد', en: 'Retiree' },
    employee: { ar: 'موظف', en: 'Employee' },
    company: { ar: 'شركة', en: 'Company' },
    university: { ar: 'جامعة', en: 'University' },
    provider: { ar: 'مزود تدريب', en: 'Training provider' },
  }
  const label = labels[role]
  return label ? (isArabic ? label.ar : label.en) : role
}

function recommendedPathLabel(form: FormState, isArabic: boolean) {
  const label = isArabic
    ? form.recommendedCareerPathTitleAr || form.recommendedCareerPathTitle
    : form.recommendedCareerPathTitle || form.recommendedCareerPathTitleAr
  return label || (isArabic ? 'لم يتم تحديد مسار بعد' : 'No path selected yet')
}

function formatProfileDate(value: string, isArabic: boolean) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(isArabic ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function isValidProfileUrl(value: string) {
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}.*$/i.test(value)
}
