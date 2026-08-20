import { guideName } from '@/components/shared/GuideName'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Check, AlertCircle, Download, X,
  ChevronRight, ChevronLeft, Loader2, Eye, LayoutTemplate, Star,
  Bot, BookOpen, Award, Activity, ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import JourneyBanner from '@/components/shared/JourneyBanner'
import { useLanguage } from '@/i18n/context'
import {
  CvPersonalSchema,
  CvEducationSchema,
  CvExperienceSchema,
  CvSkillsSchema,
  flattenErrors,
  type FieldErrors,
} from '@/lib/validation'
import { fetchMyCv, saveMyCv } from '@/lib/cv'
import { fetchRecommendedCareerSlug } from '@/lib/student-path'
import { fetchSavedCvRating, rateCvAndSave, type CvRating } from '@/lib/cv-rating'
import AiCvRatingPanel from '@/components/shared/AiCvRatingPanel'
import {
  CvTemplateRenderer, CvTemplateThumbnail, CV_TEMPLATES,
  type CvTemplateId, type CvData, type CvEducation, type CvExperience, type CvSkill,
} from '@/components/cv/CvTemplates'
import { CvStepper } from '@/components/cv/CvBuilderControls'
import CvBuilderStep from '@/components/cv/CvBuilderSteps'
import { autoTrackedAchievements } from '@/data/tamkeen-data'


// Tiny helper — typewriter-style AI placeholder used in Experience/Skills steps.
const AI_SUGGESTIONS: Record<string, string[]> = {
  experience: [
    'Try quantifying your impact: e.g., "Reduced load time by 40% by optimising React component rendering"',
    'Use action verbs: Led, Developed, Implemented, Automated, Designed, Collaborated',
    'Include the specific technologies and tools you used in each bullet point',
  ],
  skills: [
    'Add "TypeScript" — it\'s increasingly required for React developer roles',
    'Consider adding soft skills: "Team Collaboration", "Agile Methodology"',
    'Cloud skills like "AWS" or "Docker" are highly valued in the Saudi job market',
  ],
}

function isCvTemplateId(value: string | null): value is CvTemplateId {
  return CV_TEMPLATES.some((template) => template.id === value)
}

function SyncChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-imamu-gold-100 bg-imamu-gold-50/70 px-3 py-1.5 text-[11px] font-bold text-imamu-gold-deep">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-extrabold">{value}</span>
      <span>{label}</span>
    </span>
  )
}

export default function CVBuilder() {
  const { t, isArabic } = useLanguage()
  const { user, role } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedTemplate, setSelectedTemplate] = useState<CvTemplateId>('modern')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [aiTyping, setAiTyping] = useState(false)
  const [aiMessage, setAiMessage] = useState('')

  // Form state — defaults to empty for new users; hydrated from cv_data on mount.
  const [personal, setPersonal] = useState({
    nameEn: '', nameAr: '',
    email: '', phone: '',
    city: '', linkedin: '',
    summary: '',
  })

  const [education, setEducation] = useState<CvEducation[]>([
    { school: '', degree: '', years: '', gpa: '' },
  ])

  const [experience, setExperience] = useState<CvExperience[]>([
    { title: '', company: '', period: '', description: '' },
  ])

  const [skills, setSkills] = useState<CvSkill[]>([])
  const [newSkill, setNewSkill] = useState('')
  const [languages] = useState(['Arabic (Native)', 'English (Fluent)'])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Persistence state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // AI rating state
  const [aiRating, setAiRating] = useState<CvRating | null>(null)
  const [aiRatedAt, setAiRatedAt] = useState<Date | null>(null)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [recommendedSlug, setRecommendedSlug] = useState<string | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  // Load existing CV on mount + saved AI rating + recommended path slug.
  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    Promise.all([
      fetchMyCv(user.id),
      fetchSavedCvRating(user.id),
      fetchRecommendedCareerSlug(user.id),
    ])
      .then(([cv, savedRating, slug]) => {
        if (cancelled) return
        if (cv) {
          if (cv.personal) setPersonal((prev) => ({ ...prev, ...cv.personal }))
          if (cv.education.length > 0) setEducation(cv.education)
          if (cv.experience.length > 0) setExperience(cv.experience)
          if (cv.skills.length > 0) setSkills(cv.skills)
          if (isCvTemplateId(cv.templateId)) setSelectedTemplate(cv.templateId)
          setSavedAt(new Date())
        }
        if (savedRating) {
          setAiRating(savedRating.rating)
          setAiRatedAt(savedRating.ratedAt)
        }
        setRecommendedSlug(slug)
      })
      .catch((err) => { console.error('[cv] load failed', err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  const runAiRating = useCallback(async () => {
    if (!user) return
    setAiAnalyzing(true)
    setAiError(null)
    try {
      const rating = await rateCvAndSave({
        userId: user.id,
        cv: { personal, education, experience, skills, languages, templateId: selectedTemplate },
        recommendedPathSlug: recommendedSlug,
        language: isArabic ? 'ar' : 'en',
      })
      setAiRating(rating)
      setAiRatedAt(new Date())
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAiAnalyzing(false)
    }
  }, [user, personal, education, experience, skills, languages, selectedTemplate, recommendedSlug, isArabic])

  const persistCv = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveMyCv(user.id, {
        personal, education, experience, skills, languages,
        templateId: selectedTemplate,
      })
      setSavedAt(new Date())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [user, personal, education, experience, skills, languages, selectedTemplate])

  function clearField(name: string) {
    setFieldErrors(prev => {
      if (!(name in prev)) return prev
      const { [name]: _omit, ...rest } = prev
      void _omit
      return rest
    })
  }

  function validateCurrentStep(): boolean {
    if (currentStep === 0) {
      const r = CvPersonalSchema.safeParse(personal)
      if (!r.success) { setFieldErrors(flattenErrors(r.error)); return false }
    } else if (currentStep === 1) {
      const r = CvEducationSchema.safeParse(education)
      if (!r.success) {
        const errs = flattenErrors(r.error)
        const prefixed: FieldErrors = {}
        for (const [k, v] of Object.entries(errs)) prefixed[`education.${k}`] = v
        setFieldErrors(prefixed); return false
      }
    } else if (currentStep === 2) {
      const r = CvExperienceSchema.safeParse(experience)
      if (!r.success) {
        const errs = flattenErrors(r.error)
        const prefixed: FieldErrors = {}
        for (const [k, v] of Object.entries(errs)) prefixed[`experience.${k}`] = v
        setFieldErrors(prefixed); return false
      }
    } else if (currentStep === 3) {
      const r = CvSkillsSchema.safeParse(skills)
      if (!r.success) { setFieldErrors({ skills: r.error.issues[0]?.message ?? 'Invalid' }); return false }
    }
    setFieldErrors({})
    return true
  }

  // 4 form steps now — preview is always live, no separate "preview" step.
  const STEPS = [
    t('cvBuilder.stepPersonal'),
    t('cvBuilder.stepEducation'),
    t('cvBuilder.stepExperience'),
    t('cvBuilder.stepSkills'),
  ]
  const lastStep = STEPS.length - 1

  // Typewriter AI placeholder.
  const triggerAI = useCallback((context: string) => {
    const pool = AI_SUGGESTIONS[context] ?? AI_SUGGESTIONS.experience
    setAiTyping(true)
    setAiMessage('')
    const suggestion = pool[Math.floor(Math.random() * pool.length)]
    let i = 0
    const interval = setInterval(() => {
      setAiMessage(suggestion.slice(0, i + 1))
      i++
      if (i >= suggestion.length) { clearInterval(interval); setAiTyping(false) }
    }, 15)
  }, [])

  function addEducation() { setEducation(prev => [...prev, { school: '', degree: '', years: '', gpa: '' }]) }
  function removeEducation(i: number) { setEducation(prev => prev.filter((_, idx) => idx !== i)) }
  function updateEducation(i: number, field: keyof CvEducation, val: string) {
    setEducation(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  function addExperience() { setExperience(prev => [...prev, { title: '', company: '', period: '', description: '' }]) }
  function removeExperience(i: number) { setExperience(prev => prev.filter((_, idx) => idx !== i)) }
  function updateExperience(i: number, field: keyof CvExperience, val: string) {
    setExperience(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  function addSkill() {
    if (!newSkill.trim()) return
    setSkills(prev => [...prev, { name: newSkill.trim(), level: 70 }])
    setNewSkill('')
    clearField('skills')
  }
  function removeSkill(i: number) { setSkills(prev => prev.filter((_, idx) => idx !== i)) }

  function handleExportPDF() { window.print() }

  async function goNext() {
    if (!validateCurrentStep()) return
    await persistCv()
    setCurrentStep(s => Math.min(s + 1, lastStep))
  }

  async function goFinish() {
    if (!validateCurrentStep()) return
    await persistCv()
    handleExportPDF()
  }

  // Build the data passed to whichever template is selected.
  const previewData: CvData = { personal, education, experience, skills, languages, isArabic }

  // ── Form-side checklist score (used as fallback for the AI rating panel) ──
  const score = Math.min(100, Math.round(
    (personal.nameEn ? 10 : 0) + (personal.email ? 10 : 0) + (personal.summary ? 15 : 0) +
    (education.length > 0 && education[0].school ? 15 : 0) +
    (experience.length > 0 && experience[0].title ? 20 : 0) +
    Math.min(skills.length * 5, 20) +
    (personal.linkedin ? 10 : 0)
  ))
  const readinessItems = [
    { done: Boolean(personal.nameEn || personal.nameAr), label: isArabic ? 'الهوية' : 'Identity' },
    { done: Boolean(personal.email && personal.phone), label: isArabic ? 'التواصل' : 'Contact' },
    { done: education.some((entry) => entry.school && entry.degree), label: isArabic ? 'التعليم' : 'Education' },
    { done: experience.some((entry) => entry.title && entry.company), label: isArabic ? 'الخبرة' : 'Experience' },
    { done: skills.length >= 3, label: isArabic ? 'المهارات' : 'Skills' },
    { done: Boolean(personal.summary), label: isArabic ? 'الملخص' : 'Summary' },
  ]
  const completedReadiness = readinessItems.filter((item) => item.done).length
  const missingReadiness = readinessItems.filter((item) => !item.done).slice(0, 3)
  const currentStepDescription = [
    isArabic
      ? 'أدخل بياناتك الأساسية التي ستظهر في رأس السيرة وملفك المهني.'
      : 'Enter the core identity details used in your CV header and professional profile.',
    isArabic
      ? 'وثّق بياناتك الأكاديمية لأنها تؤثر على الفرص والتدريب المناسب.'
      : 'Document your academic background because it supports matching and training recommendations.',
    isArabic
      ? 'أضف الخبرات والإنجازات بصياغة واضحة وقابلة للقياس.'
      : 'Add experience and achievements with clear, measurable wording.',
    isArabic
      ? 'أكمل المهارات واللغات لتقوية السجل المهاري والجاهزية للتصدير.'
      : 'Complete skills and languages to strengthen your skills record and export readiness.',
  ][currentStep]

  // ── Live preview block (used in both desktop column + mobile overlay) ─────
  function LivePreviewBlock({ scaledDown = false }: { scaledDown?: boolean }) {
    return (
      <div className={cn(
        'bg-white shadow-[0_4px_20px_-8px_rgba(4,93,132,0.20)] border border-imamu-navy-50 rounded-xl overflow-hidden ring-1 ring-imamu-navy-50',
        scaledDown ? 'aspect-[1/1.414]' : '',
      )}>
        <CvTemplateRenderer template={selectedTemplate} data={previewData} />
      </div>
    )
  }

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
              <FileText className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-imamu-warm-gold">
                {isArabic ? 'السجل المهاري وبناء السيرة' : 'Skills Record & CV Builder'}
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {t('cvBuilder.title')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-imamu-navy-100 sm:text-[15px]">
                {t('cvBuilder.subtitle')}
              </p>
            </div>
          </div>

          <div data-tour="tour-cv-score" className="min-w-[240px] rounded-2xl border border-white/15 bg-white px-4 py-3 text-imamu-dark shadow-lg shadow-black/10">
            <p className="text-[11px] font-bold uppercase tracking-wider text-imamu-navy-100">
              {isArabic ? 'جاهزية التصدير' : 'Export Readiness'}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <p className="font-display text-3xl font-extrabold leading-none text-imamu-gold-deep">{score}%</p>
              <p className="pb-0.5 text-xs font-semibold text-imamu-dark/60">
                {isArabic ? `${completedReadiness} من ${readinessItems.length} عناصر` : `${completedReadiness} of ${readinessItems.length} items`}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-imamu-navy-50">
              <div className="h-full rounded-full bg-imamu-navy" style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-screen bg-imamu-ice">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-16">
          <CvStepper steps={STEPS} current={currentStep} onSelect={setCurrentStep} />

          <div className="relative mb-5 overflow-hidden rounded-2xl border border-imamu-gold-100 bg-white p-4 shadow-[0_14px_34px_rgba(4,93,132,0.07)]">
            <div className="absolute inset-y-0 start-0 w-1 bg-imamu-gold" aria-hidden="true" />
            <div className="flex flex-col gap-4 ps-1 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold-deep">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-extrabold text-imamu-dark">
                      {isArabic ? 'تحديث ذكي للسجل المهاري' : 'Smart skills record sync'}
                    </h2>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-imamu-gold-deep">
                      {isArabic ? `مدعوم من ${guideName('ar')}` : `${guideName('en')} supported`}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-imamu-dark/62">
                    {isArabic
                      ? 'يستفيد السجل من بيانات ملفك، تقييم المسار، المهارات، والدورات المكتملة حتى تصبح السيرة أكثر جاهزية للتقديم.'
                      : 'Your record uses profile, assessment, skills, and completed learning data so your CV is more ready for applications.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SyncChip icon={BookOpen} label={isArabic ? 'دورات' : 'Courses'} value={autoTrackedAchievements.courses} />
                    <SyncChip icon={Award} label={isArabic ? 'شهادات' : 'Certifications'} value={autoTrackedAchievements.certifications} />
                    <SyncChip icon={Activity} label={isArabic ? 'أنشطة' : 'Activities'} value={autoTrackedAchievements.activities} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/50 px-4 py-3 md:min-w-[220px]">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-imamu-dark/50">
                  {isArabic ? 'حالة الحفظ' : 'Save status'}
                </p>
                <span className="flex items-center gap-1.5 text-xs">
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-imamu-navy" />
                      <span className="text-imamu-navy font-medium">{isArabic ? 'جارٍ تحميل السيرة...' : 'Loading your CV...'}</span>
                    </>
                  ) : saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-imamu-navy" />
                      <span className="text-imamu-navy font-medium">{isArabic ? 'جارٍ الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : saveError ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-red-500 font-medium">{saveError}</span>
                    </>
                  ) : savedAt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-700" />
                      <span className="text-imamu-dark/70 font-medium">
                        {isArabic ? 'تم الحفظ' : 'Saved'} · {savedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </>
                  ) : (
                    <span className="text-imamu-blue font-medium">
                      {isArabic ? 'يتم حفظ تغييراتك تلقائياً' : 'Your changes save automatically'}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Auto-save banner — slim, white, gold-bordered with a gold accent
              strip and gold "auto" chip. Conveys that the system is quietly
              syncing without competing with the form for attention. */}
          <div className="hidden">
            <div
              className="pointer-events-none absolute inset-y-0 start-0 w-[3px] bg-imamu-gold"
              aria-hidden="true"
            />
            <div className="flex items-center justify-between gap-3 ps-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-imamu-gold-50 text-imamu-gold border border-imamu-gold-100 text-[10px] font-extrabold px-2 py-0.5 uppercase tracking-wider">
                {isArabic ? 'مزامنة تلقائية' : 'Auto-sync'}
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-imamu-navy" />
                    <span className="text-imamu-navy font-medium">{isArabic ? 'جارٍ تحميل سيرتك...' : 'Loading your CV…'}</span>
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-imamu-navy" />
                    <span className="text-imamu-navy font-medium">{isArabic ? 'جارٍ الحفظ...' : 'Saving…'}</span>
                  </>
                ) : saveError ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-red-500 font-medium">{saveError}</span>
                  </>
                ) : savedAt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-700" />
                    <span className="text-imamu-dark/70 font-medium">
                      {isArabic ? 'تم الحفظ' : 'Saved'} · {savedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                ) : (
                  <span className="text-imamu-blue font-medium">
                    {isArabic ? 'يتم حفظ تغييراتك تلقائياً' : 'Your changes save automatically'}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Two-column layout — form on the leading edge, live preview on the trailing edge.
              Mobile collapses to single column with a "Show preview" floating button. */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(480px,1.05fr)]">
            {/* ── Form column ──────────────────────────────────────────────── */}
            <div className="space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  className="bg-white rounded-[20px] p-6 border border-imamu-navy-50 shadow-[0_4px_20px_-8px_rgba(4,93,132,0.15)]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-5 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-imamu-navy-100 bg-white text-imamu-navy">
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="font-display text-base font-extrabold text-imamu-dark">
                            {STEPS[currentStep]}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-imamu-dark/60">
                            {currentStepDescription}
                          </p>
                        </div>
                      </div>
                      {missingReadiness.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          {missingReadiness.map((item) => (
                            <span key={item.label} className="rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-2.5 py-1 text-[10px] font-bold text-imamu-gold-deep">
                              {item.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <CvBuilderStep
                    currentStep={currentStep}
                    t={t}
                    isArabic={isArabic}
                    personal={personal}
                    setPersonal={setPersonal}
                    education={education}
                    experience={experience}
                    skills={skills}
                    newSkill={newSkill}
                    setNewSkill={setNewSkill}
                    languages={languages}
                    fieldErrors={fieldErrors}
                    aiMessage={aiMessage}
                    aiTyping={aiTyping}
                    clearField={clearField}
                    addEducation={addEducation}
                    removeEducation={removeEducation}
                    updateEducation={updateEducation}
                    addExperience={addExperience}
                    removeExperience={removeExperience}
                    updateExperience={updateExperience}
                    addSkill={addSkill}
                    removeSkill={removeSkill}
                    triggerAI={triggerAI}
                    dismissAiMessage={() => setAiMessage('')}
                  />

                  {/* Step nav — navy primary advance, navy-50 secondary back. */}
                  <div className="flex justify-end gap-2 mt-7 pt-5 border-t border-imamu-navy-50">
                    {currentStep > 0 && (
                      <button onClick={() => { setFieldErrors({}); setCurrentStep(s => s - 1) }} className="bg-white border border-imamu-navy-100 text-imamu-navy rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-imamu-navy-50 transition flex items-center gap-2">
                        {isArabic ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        {t('common.back')}
                      </button>
                    )}
                    {currentStep < lastStep ? (
                      <button onClick={goNext} className="bg-imamu-navy text-white rounded-xl px-5 py-2.5 text-sm font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 transition flex items-center gap-2">
                        {STEPS[currentStep + 1]}
                        {isArabic ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    ) : (
                      <button onClick={goFinish} className="bg-imamu-navy text-white rounded-xl px-5 py-2.5 text-sm font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 transition flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        {t('cvBuilder.exportPDF')}
                      </button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Mobile preview trigger */}
              <div className="lg:hidden">
                <button
                  onClick={() => setMobilePreviewOpen(true)}
                  className="w-full py-3 bg-white border border-imamu-navy-100 text-imamu-navy rounded-xl text-sm font-semibold hover:bg-imamu-navy-50 transition inline-flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {isArabic ? 'معاينة السيرة' : 'Preview CV'}
                </button>
              </div>

              {/* CV review panel — a flat white card with a thin gold accent
                  line so it reads as a distinct assistant module without glassy
                  gradient framing. */}
              <div className="relative bg-white rounded-[20px] border border-imamu-navy-50 shadow-sm overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold"
                  aria-hidden="true"
                />
                <button
                  onClick={() => setAiPanelOpen((v) => !v)}
                  aria-expanded={aiPanelOpen}
                  className="w-full flex items-center justify-between gap-3 p-4 text-start"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-imamu-gold-50 text-imamu-gold border border-imamu-gold-100 flex items-center justify-center">
                      <Star className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-imamu-dark">
                        {isArabic ? 'تقييم السيرة بالذكاء الاصطناعي' : 'AI CV review'}
                        <span className="inline-flex items-center rounded-full bg-imamu-gold-50 text-imamu-gold border border-imamu-gold-100 text-[9px] font-extrabold px-1.5 py-0.5 uppercase tracking-wider">
                          AI
                        </span>
                      </span>
                      <span className="block text-[11px] text-imamu-blue mt-0.5">
                        {aiRating
                          ? (isArabic ? `النتيجة: ${aiRating.overall}%` : `Score: ${aiRating.overall}%`)
                          : (isArabic ? `أساس: ${score}% — حلّل لاقتراحات أعمق` : `Baseline: ${score}% — analyse for AI insights`)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className={cn('w-4 h-4 text-imamu-navy transition-transform rtl:rotate-180', aiPanelOpen && 'rotate-90 rtl:rotate-90')} aria-hidden="true" />
                </button>
                <AnimatePresence>
                  {aiPanelOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 -mt-1">
                        <AiCvRatingPanel
                          rating={aiRating}
                          ratedAt={aiRatedAt}
                          analyzing={aiAnalyzing}
                          error={aiError}
                          onAnalyze={runAiRating}
                          fallbackChecklistScore={score}
                          isArabic={isArabic}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Live preview column ──────────────────────────────────────── */}
            <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
              <div className="bg-white rounded-[20px] border border-imamu-navy-50 shadow-[0_4px_20px_-8px_rgba(4,93,132,0.15)] overflow-hidden">
                {/* Preview toolbar — navy-tinted header band with branded
                    template picker + primary export CTA. */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-imamu-navy-50 bg-imamu-navy-50/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-imamu-navy-50 text-imamu-navy border border-imamu-navy-100 flex items-center justify-center shrink-0">
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-[12px] font-bold text-imamu-dark uppercase tracking-wider truncate">
                      {isArabic ? 'معاينة مباشرة' : 'Live preview'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative">
                      <button
                        onClick={() => setTemplatePickerOpen((v) => !v)}
                        aria-expanded={templatePickerOpen}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition border',
                          templatePickerOpen
                            ? 'bg-imamu-navy text-white border-imamu-navy'
                            : 'bg-white border-imamu-navy-100 text-imamu-navy hover:bg-imamu-navy-50',
                        )}
                      >
                        <LayoutTemplate className="w-3.5 h-3.5" aria-hidden="true" />
                        {isArabic ? 'القوالب' : 'Templates'}
                      </button>
                      <AnimatePresence>
                        {templatePickerOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                            className="absolute end-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-[0_8px_30px_-8px_rgba(4,93,132,0.25)] border border-imamu-navy-50 overflow-hidden z-30"
                          >
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {CV_TEMPLATES.map((tmpl) => {
                                const active = selectedTemplate === tmpl.id
                                return (
                                  <button
                                    key={tmpl.id}
                                    onClick={() => { setSelectedTemplate(tmpl.id); setTemplatePickerOpen(false) }}
                                    className={cn(
                                      'group relative flex flex-col rounded-xl border-2 overflow-hidden transition',
                                      active ? 'border-imamu-navy' : 'border-imamu-navy-50 hover:border-imamu-navy-100',
                                    )}
                                  >
                                    <div className="aspect-[1/1.3] bg-imamu-navy-50/40 overflow-hidden">
                                      <CvTemplateThumbnail id={tmpl.id} />
                                    </div>
                                    <div className="px-2.5 py-2 bg-white text-start">
                                      <p className="text-[11px] font-bold text-imamu-dark leading-tight truncate">
                                        {isArabic ? tmpl.nameAr : tmpl.name}
                                      </p>
                                      {tmpl.popular && (
                                        <p className="text-[9px] font-extrabold text-imamu-gold mt-0.5 uppercase tracking-wider">
                                          {t('cvBuilder.popular')}
                                        </p>
                                      )}
                                    </div>
                                    {active && (
                                      <span className="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-imamu-navy text-white flex items-center justify-center ring-2 ring-white">
                                        <Check className="w-3 h-3" aria-hidden="true" />
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button
                      onClick={handleExportPDF}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-imamu-navy text-white hover:bg-imamu-navy-deep transition shadow-sm shadow-imamu-navy/20"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('cvBuilder.exportPDF')}
                    </button>
                  </div>
                </div>

                {/* Preview body — document viewer feel: tinted backing surface
                    with a framed white A4 page that has a subtle navy ring. */}
                <div className="bg-imamu-navy-50/40 p-5 max-h-[calc(100vh-180px)] overflow-auto">
                  <div className="aspect-[1/1.414] bg-white shadow-[0_8px_28px_-10px_rgba(4,93,132,0.30)] mx-auto max-w-[640px] overflow-hidden rounded-md ring-1 ring-imamu-navy-50">
                    <CvTemplateRenderer template={selectedTemplate} data={previewData} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {role === 'student' && currentStep === lastStep && (
            <JourneyBanner text={t('dashboard.journeyCVDone')} ctaLabel={t('dashboard.journeyBrowseOpps')} to="/opportunities" />
          )}
        </div>
      </section>

      {/* Mobile preview overlay */}
      <AnimatePresence>
        {mobilePreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex flex-col lg:hidden"
            onClick={() => setMobilePreviewOpen(false)}
          >
            <div className="flex items-center justify-between p-4 bg-white border-b border-imamu-navy-50" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-imamu-dark text-sm">{isArabic ? 'معاينة السيرة' : 'CV Preview'}</h3>
              <div className="flex gap-2">
                <button onClick={handleExportPDF} className="inline-flex items-center gap-1.5 bg-imamu-navy text-white rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-imamu-navy-deep transition">
                  <Download className="w-3.5 h-3.5" />{t('cvBuilder.exportPDF')}
                </button>
                <button onClick={() => setMobilePreviewOpen(false)} className="p-1.5 rounded-lg text-imamu-navy hover:bg-imamu-navy-50 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-imamu-navy-50/40" onClick={(e) => e.stopPropagation()}>
              <LivePreviewBlock />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
