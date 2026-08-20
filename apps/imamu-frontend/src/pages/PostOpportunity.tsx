import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, MapPin, Clock, DollarSign, FileText, Users,
  CheckCircle2, ArrowRight, ArrowLeft, Plus, Send, Layers, AlertCircle,
  ChevronDown, BookOpen, GraduationCap, Handshake,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { useAuth } from '@/context/AuthContext'
import { createPosting, fetchOpportunityById, updateOpportunity } from '@/lib/opportunities'
import type { OpportunityType } from '@/types/database'
import { FieldError } from '@/components/ui/FieldError'
import {
  PostOpportunityTypeSchema,
  PostOpportunityDetailsSchema,
  PostOpportunityRequirementsSchema,
  flattenErrors,
  type FieldErrors,
} from '@/lib/validation'

const typeOptions: { value: string; icon: LucideIcon; en: string; ar: string }[] = [
  { value: 'job',        icon: Briefcase,     en: 'Full-time Job',         ar: 'وظيفة بدوام كامل' },
  { value: 'training',   icon: BookOpen,      en: 'Training Program',      ar: 'برنامج تدريبي' },
  { value: 'coop',       icon: GraduationCap, en: 'Co-op / Internship',    ar: 'تعاوني / تدريب' },
  { value: 'consulting', icon: Handshake,     en: 'Part-time / Consulting', ar: 'جزئي / استشارات' },
]

const skillSuggestions = ['React', 'Python', 'SQL', 'JavaScript', 'TypeScript', 'Figma', 'Data Analysis', 'Project Management', 'SEO', 'Machine Learning', 'Node.js', 'AWS']

type LocalizedOption = { value: string; en: string; ar: string }

const cityOptions: LocalizedOption[] = [
  { value: 'Riyadh', en: 'Riyadh', ar: 'الرياض' },
  { value: 'Jeddah', en: 'Jeddah', ar: 'جدة' },
  { value: 'Dammam', en: 'Dammam', ar: 'الدمام' },
  { value: 'Khobar', en: 'Khobar', ar: 'الخبر' },
  { value: 'Makkah', en: 'Makkah', ar: 'مكة' },
  { value: 'Madinah', en: 'Madinah', ar: 'المدينة المنورة' },
  { value: 'Abha', en: 'Abha', ar: 'أبها' },
  { value: 'Tabuk', en: 'Tabuk', ar: 'تبوك' },
  { value: 'Qassim', en: 'Qassim', ar: 'القصيم' },
  { value: 'Taif', en: 'Taif', ar: 'الطائف' },
  { value: 'Jubail', en: 'Jubail', ar: 'الجبيل' },
  { value: 'Yanbu', en: 'Yanbu', ar: 'ينبع' },
  { value: 'NEOM', en: 'NEOM', ar: 'نيوم' },
  { value: 'AlUla', en: 'AlUla', ar: 'العلا' },
  { value: 'Remote', en: 'Remote', ar: 'عن بعد' },
  { value: 'Hybrid', en: 'Hybrid', ar: 'هجين' },
]

const durationOptionsByType: Record<string, LocalizedOption[]> = {
  job: [
    { value: 'Permanent', en: 'Permanent', ar: 'دائم' },
    { value: '3 months', en: '3 months', ar: '3 أشهر' },
    { value: '6 months', en: '6 months', ar: '6 أشهر' },
    { value: '12 months', en: '12 months', ar: '12 شهر' },
    { value: 'Flexible', en: 'Flexible', ar: 'مرن' },
  ],
  training: [
    { value: '2 weeks', en: '2 weeks', ar: 'أسبوعان' },
    { value: '4 weeks', en: '4 weeks', ar: '4 أسابيع' },
    { value: '8 weeks', en: '8 weeks', ar: '8 أسابيع' },
    { value: '3 months', en: '3 months', ar: '3 أشهر' },
    { value: 'Self-paced', en: 'Self-paced', ar: 'ذاتي' },
  ],
  coop: [
    { value: '3 months', en: '3 months', ar: '3 أشهر' },
    { value: '4 months', en: '4 months', ar: '4 أشهر' },
    { value: '6 months', en: '6 months', ar: '6 أشهر' },
    { value: 'One semester', en: 'One semester', ar: 'فصل دراسي' },
  ],
  consulting: [
    { value: 'One-off project', en: 'One-off project', ar: 'مشروع واحد' },
    { value: '1 month', en: '1 month', ar: 'شهر واحد' },
    { value: '3 months', en: '3 months', ar: '3 أشهر' },
    { value: 'Flexible', en: 'Flexible', ar: 'مرن' },
  ],
}

function optionLabel(options: LocalizedOption[], value: string, isArabic: boolean) {
  const option = options.find((o) => o.value === value)
  return option ? (isArabic ? option.ar : option.en) : value
}

export default function PostOpportunity() {
  const { isArabic } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id: editId } = useParams<{ id?: string }>()
  const isEditing = Boolean(editId)

  const [step, setStep] = useState(isEditing ? 0 : 1) // 0=type, 1=details, 2=requirements, 3=preview/success
  const [form, setForm] = useState({
    type: isEditing ? '' : 'job',
    title: '',
    location: '',
    duration: '',
    salary: '',
    description: '',
    skills: [] as string[],
    deadline: '',
    applicantLimit: '',
    price: '',
  })
  const [skillInput, setSkillInput] = useState('')
  const [posted, setPosted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(isEditing)

  // Load the existing opportunity into the form when editing.
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    fetchOpportunityById(editId)
      .then((row) => {
        if (cancelled || !row) return
        setForm({
          type: row.type,
          title: row.title,
          location: row.location ?? '',
          duration: row.duration ?? '',
          salary: row.salary ?? '',
          description: row.description ?? '',
          skills: row.skills ?? [],
          deadline: row.deadline ?? '',
          applicantLimit: row.applicant_limit?.toString() ?? '',
          price: row.price ? String(row.price) : '',
        })
      })
      .finally(() => { if (!cancelled) setLoadingExisting(false) })
    return () => { cancelled = true }
  }, [editId])

  function clearField(name: string) {
    setFieldErrors(prev => {
      if (!(name in prev)) return prev
      const { [name]: _omit, ...rest } = prev
      void _omit
      return rest
    })
  }

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    clearField(key)
  }

  function validateStep(): boolean {
    if (step === 0) {
      const r = PostOpportunityTypeSchema.safeParse({ type: form.type })
      if (!r.success) { setFieldErrors(flattenErrors(r.error)); return false }
    } else if (step === 1) {
      const r = PostOpportunityDetailsSchema.safeParse({
        title: form.title, location: form.location,
        duration: form.duration, description: form.description,
      })
      if (!r.success) { setFieldErrors(flattenErrors(r.error)); return false }
    } else if (step === 2) {
      const r = PostOpportunityRequirementsSchema.safeParse({
        skills: form.skills, salary: form.salary,
        deadline: form.deadline, applicantLimit: form.applicantLimit,
      })
      if (!r.success) { setFieldErrors(flattenErrors(r.error)); return false }
    }
    setFieldErrors({})
    return true
  }

  function addSkill(skill: string) {
    const s = skill.trim()
    if (s && !form.skills.includes(s)) {
      setForm(prev => ({ ...prev, skills: [...prev.skills, s] }))
      clearField('skills')
    }
    setSkillInput('')
  }

  function removeSkill(skill: string) {
    setForm(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))
  }

  function handleNext() {
    if (!validateStep()) return
    if (step === 2) { void handlePost() }
    else setStep(s => s + 1)
  }

  async function handlePost() {
    if (!user) {
      setSubmitError(isArabic ? 'يجب تسجيل الدخول لنشر فرصة' : 'You must be signed in')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const payload = {
      title: form.title.trim(),
      type: form.type as OpportunityType,
      location: form.location.trim() || null,
      duration: form.duration.trim() || null,
      salary: form.salary.trim() || null,
      description: form.description.trim() || null,
      skills: form.skills,
      deadline: form.deadline ? form.deadline : null,
      applicant_limit: form.applicantLimit ? Number(form.applicantLimit) : null,
      price: form.price ? Number(form.price) : 0,
    }

    try {
      if (isEditing && editId) {
        await updateOpportunity(editId, payload)
      } else {
        await createPosting(user.id, payload)
      }
      setPosted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const stepTitles = [
    { en: 'Choose Opportunity Type',         ar: 'اختر نوع الفرصة' },
    { en: 'Opportunity Details',             ar: 'تفاصيل الفرصة' },
    { en: 'Requirements & Compensation',     ar: 'المتطلبات والتعويضات' },
  ]

  const stepDescs = [
    { en: 'What kind of opportunity are you offering?',  ar: 'ما نوع الفرصة التي تقدمها؟' },
    { en: 'Tell applicants about this opportunity',       ar: 'أخبر المتقدمين عن هذه الفرصة' },
    { en: 'Define the skills needed and compensation',    ar: 'حدد المهارات المطلوبة والتعويضات' },
  ]

  const selectedType = typeOptions.find(t => t.value === form.type)
  const durationOptions = durationOptionsByType[form.type] ?? durationOptionsByType.job
  const displayLocation = optionLabel(cityOptions, form.location, isArabic)
  const displayDuration = optionLabel(durationOptions, form.duration, isArabic)

  // ── Success screen ──
  if (posted) {
    return (
      <div className="min-h-screen bg-imamu-ice text-imamu-dark flex items-center justify-center px-4 py-12">
        <motion.div
          className="max-w-md w-full text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <div className="w-20 h-20 rounded-full bg-green-50 ring-4 ring-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-imamu-dark mb-3">
            {isEditing
              ? (isArabic ? 'تم تحديث الفرصة' : 'Opportunity Updated')
              : (isArabic ? 'تم نشر الفرصة بنجاح' : 'Opportunity Posted')}
          </h1>
          <p className="text-imamu-dark/80 mb-2 text-lg font-semibold">{form.title}</p>
          <div className="flex items-center justify-center gap-3 text-sm text-imamu-blue mb-8">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{displayLocation}</span>
            {form.salary && <span className="inline-flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{form.salary}</span>}
          </div>

          <div className="relative bg-white rounded-2xl border border-imamu-navy-50 shadow-[0_8px_28px_-12px_rgba(4,93,132,0.18)] p-5 mb-8 text-start overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
            <p className="text-xs text-imamu-gold-deep font-extrabold uppercase tracking-[0.18em] mb-3">
              {isArabic ? 'ملخص' : 'Summary'}
            </p>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-imamu-blue">{isArabic ? 'النوع' : 'Type'}</span>
                <span className="text-imamu-dark font-semibold">{isArabic ? selectedType?.ar : selectedType?.en}</span>
              </div>
              {form.duration && (
                <div className="flex justify-between text-sm">
                  <span className="text-imamu-blue">{isArabic ? 'المدة' : 'Duration'}</span>
                  <span className="text-imamu-dark font-semibold">{displayDuration}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-imamu-blue">{isArabic ? 'المهارات' : 'Skills'}</span>
                <span className="text-imamu-dark font-semibold">{form.skills.length}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setPosted(false); setStep(1); setSubmitError(null); setFieldErrors({}); setForm({ type: 'job', title: '', location: '', duration: '', salary: '', description: '', skills: [], deadline: '', applicantLimit: '', price: '' }); }}
              className="flex-1 py-3 rounded-xl border border-imamu-navy-100 bg-white text-sm font-bold text-imamu-navy hover:bg-imamu-navy-50 transition"
            >
              {isArabic ? 'نشر فرصة أخرى' : 'Post Another'}
            </button>
            <button
              onClick={() => navigate('/dashboard/company')}
              className="flex-1 py-3 rounded-xl bg-imamu-navy text-white text-sm font-bold hover:bg-imamu-navy-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-imamu-navy/25 transition"
            >
              {isArabic ? 'العودة إلى لوحة التحكم' : 'Back to Dashboard'}
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Wizard ──
  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark">
      {/* Hero header — IMSIU navy band with a thin gold seam */}
      <section className="relative bg-gradient-to-br from-imamu-dark to-imamu-navy py-12 text-center overflow-hidden">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-imamu-warm-gold mb-3">
            {isArabic ? 'منصة تمكين · صاحب العمل' : 'Tamkeen · Employer'}
          </p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-imamu-gold/35 bg-imamu-gold/15 text-imamu-warm-gold">
              <Plus className="w-6 h-6" aria-hidden="true" />
            </span>
            <h1 className="font-display font-bold text-white text-[clamp(22px,3vw,30px)] tracking-tight">
              {isEditing
                ? (isArabic ? 'تعديل الفرصة' : 'Edit Opportunity')
                : (isArabic ? 'نشر فرصة جديدة' : 'Post a New Opportunity')}
            </h1>
          </div>
          <p className="text-imamu-navy-100 text-sm max-w-md mx-auto leading-7">
            {isArabic
              ? 'أنشئ قائمة فرصة جذابة وابدأ باستقبال طلبات من أفضل الكفاءات الجامعية.'
              : 'Create an attractive listing and start receiving applications from top university talent.'}
          </p>
        </div>
      </section>

      <section className="relative min-h-[60vh]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          {loadingExisting && (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-imamu-navy-100 border-t-imamu-navy" />
            </div>
          )}
          {!loadingExisting && (<>
          {/* Step indicator */}
          <div className="flex gap-1.5 mb-8">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className={cn(
                  'h-1.5 rounded-full w-full transition duration-500',
                  i < step ? 'bg-imamu-navy' : i === step ? 'bg-imamu-gold' : 'bg-imamu-navy-100/60',
                )} />
                <span className={cn(
                  'text-[10px] font-bold uppercase tracking-wider transition-colors hidden sm:block',
                  i === step ? 'text-imamu-gold-deep'
                    : i < step ? 'text-imamu-navy'
                    : 'text-imamu-dark/45',
                )}>
                  {isArabic ? stepTitles[i].ar : stepTitles[i].en}
                </span>
              </div>
            ))}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <div className="relative bg-white rounded-[20px] p-8 border border-imamu-navy-50 shadow-[0_8px_28px_-12px_rgba(4,93,132,0.20)] overflow-hidden">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
                  <h2 className="font-display text-xl font-bold text-imamu-dark mb-1">
                    {isArabic ? stepTitles[0].ar : stepTitles[0].en}
                  </h2>
                  <p className="text-sm text-imamu-blue mb-6">{isArabic ? stepDescs[0].ar : stepDescs[0].en}</p>

                  <div className="grid grid-cols-2 gap-3">
                    {typeOptions.map(opt => {
                      const TypeIcon = opt.icon
                      return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update('type', opt.value)}
                        className={cn(
                          'flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition duration-200 text-center',
                          form.type === opt.value
                            ? 'border-imamu-navy bg-imamu-navy-50 shadow-sm shadow-imamu-navy/10'
                            : fieldErrors.type
                              ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                              : 'border-imamu-navy-100 bg-white hover:border-imamu-navy/45 hover:bg-imamu-navy-50/40',
                        )}
                      >
                        <TypeIcon className={cn('w-7 h-7', form.type === opt.value ? 'text-imamu-navy' : 'text-imamu-dark/55')} aria-hidden="true" />
                        <span className={cn(
                          'text-sm font-semibold',
                          form.type === opt.value ? 'text-imamu-navy' : 'text-imamu-dark/65',
                        )}>
                          {isArabic ? opt.ar : opt.en}
                        </span>
                        {form.type === opt.value && (
                          <div className="w-5 h-5 rounded-full bg-imamu-navy flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                      )
                    })}
                  </div>
                  <FieldError message={fieldErrors.type} />
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <div className="relative bg-white rounded-[20px] p-8 border border-imamu-navy-50 shadow-[0_8px_28px_-12px_rgba(4,93,132,0.20)] overflow-hidden">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
                  <div className="flex items-center gap-2 mb-1">
                    {selectedType && <selectedType.icon className="w-5 h-5 text-imamu-navy" aria-hidden="true" />}
                    <h2 className="font-display text-xl font-bold text-imamu-dark">
                      {isArabic ? stepTitles[1].ar : stepTitles[1].en}
                    </h2>
                  </div>
                  <p className="text-sm text-imamu-blue mb-6">{isArabic ? stepDescs[1].ar : stepDescs[1].en}</p>

                  <div className="space-y-4">
                    <FormField icon={<Briefcase className="w-4 h-4" />} label={isArabic ? 'عنوان الفرصة' : 'Job Title'} value={form.title} onChange={v => update('title', v)} placeholder={isArabic ? 'مثال: مهندس برمجيات متدرب' : 'e.g. Software Engineer Intern'} error={fieldErrors.title} />
                    <SelectField
                      icon={<MapPin className="w-4 h-4" />}
                      label={isArabic ? 'المدينة / نمط العمل' : 'City / Work Mode'}
                      value={form.location}
                      onChange={v => update('location', v)}
                      options={cityOptions}
                      placeholder={isArabic ? 'اختر المدينة' : 'Select a city'}
                      error={fieldErrors.location}
                      isArabic={isArabic}
                    />
                    <ChoiceField
                      icon={<Clock className="w-4 h-4" />}
                      label={isArabic ? 'المدة' : 'Duration'}
                      value={form.duration}
                      onChange={v => update('duration', v)}
                      options={durationOptions}
                      error={fieldErrors.duration}
                      isArabic={isArabic}
                    />

                    <div>
                      <label className="block text-[11px] font-bold text-imamu-blue mb-1.5 uppercase tracking-wider">
                        {isArabic ? 'الوصف' : 'Description'}
                      </label>
                      <div className={cn(
                        'flex gap-2.5 bg-white border rounded-xl px-4 py-3 transition',
                        fieldErrors.description
                          ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                          : 'border-imamu-navy-100 focus-within:border-imamu-navy focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.10)]',
                      )}>
                        <FileText className={cn('w-4 h-4 shrink-0 mt-0.5', fieldErrors.description ? 'text-red-300' : 'text-imamu-navy-100')} />
                        <textarea
                          value={form.description}
                          onChange={e => update('description', e.target.value)}
                          placeholder={isArabic ? 'اكتب وصفاً جذاباً للفرصة...' : 'Write an engaging description of this opportunity...'}
                          rows={4}
                          className="flex-1 bg-transparent text-sm text-imamu-dark placeholder:text-imamu-navy-100 focus:outline-none resize-none"
                        />
                      </div>
                      <FieldError message={fieldErrors.description} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <div className="relative bg-white rounded-[20px] p-8 border border-imamu-navy-50 shadow-[0_8px_28px_-12px_rgba(4,93,132,0.20)] overflow-hidden">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
                  <h2 className="font-display text-xl font-bold text-imamu-dark mb-1">
                    {isArabic ? stepTitles[2].ar : stepTitles[2].en}
                  </h2>
                  <p className="text-sm text-imamu-blue mb-6">{isArabic ? stepDescs[2].ar : stepDescs[2].en}</p>

                  <div className="space-y-5">
                    {/* Skills input */}
                    <div>
                      <label className="block text-[11px] font-bold text-imamu-blue mb-1.5 uppercase tracking-wider">
                        {isArabic ? 'المهارات المطلوبة' : 'Required Skills'}
                      </label>
                      <div className={cn(
                        'flex items-center gap-2.5 bg-white border rounded-xl px-4 py-3 transition mb-1',
                        fieldErrors.skills
                          ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                          : 'border-imamu-navy-100 focus-within:border-imamu-navy focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.10)]',
                      )}>
                        <Layers className={cn('w-4 h-4 shrink-0', fieldErrors.skills ? 'text-red-300' : 'text-imamu-navy-100')} />
                        <input
                          value={skillInput}
                          onChange={e => setSkillInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                          placeholder={isArabic ? 'اكتب مهارة واضغط Enter' : 'Type a skill and press Enter'}
                          className="flex-1 bg-transparent text-sm text-imamu-dark placeholder:text-imamu-navy-100 focus:outline-none"
                        />
                      </div>
                      <FieldError message={fieldErrors.skills} />

                      {/* Selected skills */}
                      {form.skills.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {form.skills.map(skill => (
                            <span key={skill} className="inline-flex items-center gap-1.5 bg-imamu-navy-50 text-imamu-navy border border-imamu-navy-100 rounded-full px-3 py-1.5 text-xs font-semibold">
                              {skill}
                              <button onClick={() => removeSkill(skill)} className="text-imamu-navy/55 hover:text-imamu-navy-deep transition-colors text-base leading-none">&times;</button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Suggested skills */}
                      <p className="text-[10px] text-imamu-blue font-bold uppercase tracking-wider mb-2">
                        {isArabic ? 'مهارات مقترحة' : 'Suggested Skills'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {skillSuggestions.filter(s => !form.skills.includes(s)).slice(0, 8).map(skill => (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => addSkill(skill)}
                            className="inline-flex items-center gap-1 bg-white text-imamu-dark/70 rounded-full px-3 py-1.5 text-xs font-medium border border-imamu-navy-100 hover:bg-imamu-navy-50 hover:text-imamu-navy hover:border-imamu-navy/45 transition"
                          >
                            <Plus className="w-3 h-3" />{skill}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Salary or Price */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {form.type === 'training' ? (
                        <FormField icon={<DollarSign className="w-4 h-4" />} label={isArabic ? 'سعر التدريب (ر.س)' : 'Course price (SAR)'} value={form.price} onChange={v => update('price', v)} placeholder={isArabic ? '0 = مجاني' : '0 = free'} type="number" error={fieldErrors.price} />
                      ) : (
                        <FormField icon={<DollarSign className="w-4 h-4" />} label={isArabic ? 'الراتب / التعويض' : 'Salary / Compensation'} value={form.salary} onChange={v => update('salary', v)} placeholder={isArabic ? '5,000 - 8,000 ر.س' : '5,000 - 8,000 SAR'} error={fieldErrors.salary} />
                      )}
                      <FormField icon={<Users className="w-4 h-4" />} label={form.type === 'training' ? (isArabic ? 'عدد المقاعد' : 'Capacity') : (isArabic ? 'عدد المقاعد' : 'Open Positions')} value={form.applicantLimit} onChange={v => update('applicantLimit', v)} placeholder={isArabic ? 'مثال: 30' : 'e.g. 30'} type="number" error={fieldErrors.applicantLimit} />
                    </div>
                    <FormField icon={<Users className="w-4 h-4" />} label={isArabic ? 'آخر موعد للتقديم' : 'Application Deadline'} value={form.deadline} onChange={v => update('deadline', v)} placeholder="2026-06-01" type="date" error={fieldErrors.deadline} />

                    {/* Preview summary — gold-themed coaching panel */}
                    <div className="relative bg-imamu-gold-50/50 rounded-xl p-4 border border-imamu-gold-100 overflow-hidden">
                      <div className="pointer-events-none absolute inset-y-0 start-0 w-[3px] bg-imamu-gold" aria-hidden="true" />
                      <p className="text-xs text-imamu-gold-deep font-extrabold mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                        {isArabic ? 'معاينة سريعة' : 'Quick Preview'}
                      </p>
                      <p className="text-sm font-bold text-imamu-dark">{form.title || (isArabic ? 'عنوان الفرصة' : 'Opportunity Title')}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-imamu-blue">
                        {form.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{displayLocation}</span>}
                        {form.duration && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{displayDuration}</span>}
                        {form.salary && <span className="inline-flex items-center gap-1"><DollarSign className="w-3 h-3" />{form.salary}</span>}
                      </div>
                      {form.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.skills.map(s => (
                            <span key={s} className="bg-white text-imamu-navy border border-imamu-navy-100 rounded-full px-2 py-0.5 text-[10px] font-semibold">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit error banner */}
          {submitError && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button
                onClick={() => { setFieldErrors({}); setStep(s => s - 1) }}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-imamu-navy-100 bg-white text-sm font-semibold text-imamu-navy hover:bg-imamu-navy-50 hover:border-imamu-navy transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isArabic ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {isArabic ? 'السابق' : 'Back'}
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition duration-200 bg-imamu-navy text-white hover:bg-imamu-navy-deep hover:shadow-xl hover:shadow-imamu-navy/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {step === 2 ? (
                submitting ? (
                  <>
                    {isEditing
                      ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                      : (isArabic ? 'جارٍ النشر…' : 'Posting…')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {isEditing
                      ? (isArabic ? 'حفظ التعديلات' : 'Save changes')
                      : (isArabic ? 'نشر الفرصة' : 'Post Opportunity')}
                  </>
                )
              ) : (
                <>
                  {isArabic ? 'التالي' : 'Next'}
                  {isArabic ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </>
              )}
            </button>
          </div>
          </>)}
        </div>
      </section>
    </div>
  )
}

/* ── Reusable Form Field ─────────────────────────────────── */
function FormField({ icon, label, value, onChange, placeholder, type = 'text', error }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-imamu-blue mb-1.5 uppercase tracking-wider">{label}</label>
      <div className={cn(
        'flex items-center gap-2.5 bg-white border rounded-xl px-4 py-3 transition duration-200',
        error
          ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
          : 'border-imamu-navy-100 focus-within:border-imamu-navy focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.10)]',
      )}>
        <span className={cn('shrink-0', error ? 'text-red-300' : 'text-imamu-navy-100')}>{icon}</span>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent text-sm text-imamu-dark placeholder:text-imamu-navy-100 focus:outline-none" />
      </div>
      <FieldError message={error} />
    </div>
  )
}

function SelectField({ icon, label, value, onChange, options, placeholder, error, isArabic }: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  options: LocalizedOption[]
  placeholder: string
  error?: string
  isArabic: boolean
}) {
  const hasCustomValue = value !== '' && !options.some((option) => option.value === value)

  return (
    <div>
      <label className="block text-[11px] font-bold text-imamu-blue mb-1.5 uppercase tracking-wider">{label}</label>
      <div className={cn(
        'relative flex items-center gap-2.5 bg-white border rounded-xl px-4 py-3 transition duration-200',
        error
          ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
          : 'border-imamu-navy-100 focus-within:border-imamu-navy focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.10)]',
      )}>
        <span className={cn('shrink-0', error ? 'text-red-300' : 'text-imamu-navy-100')}>{icon}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn(
            'w-full appearance-none bg-transparent pe-8 text-sm focus:outline-none',
            value ? 'text-imamu-dark' : 'text-imamu-navy-100',
          )}
        >
          <option value="">{placeholder}</option>
          {hasCustomValue && <option value={value}>{value}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {isArabic ? option.ar : option.en}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-imamu-navy/55" />
      </div>
      <FieldError message={error} />
    </div>
  )
}

function ChoiceField({ icon, label, value, onChange, options, error, isArabic }: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  options: LocalizedOption[]
  error?: string
  isArabic: boolean
}) {
  const hasCustomValue = value !== '' && !options.some((option) => option.value === value)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('shrink-0', error ? 'text-red-300' : 'text-imamu-navy-100')}>{icon}</span>
        <label className="block text-[11px] font-bold text-imamu-blue uppercase tracking-wider">{label}</label>
      </div>
      <div className={cn(
        'grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border bg-white p-2 transition duration-200',
        error ? 'border-red-300' : 'border-imamu-navy-100',
      )}>
        {hasCustomValue && (
          <button
            type="button"
            onClick={() => onChange(value)}
            className="rounded-lg border border-imamu-navy bg-imamu-navy-50 px-3 py-2 text-sm font-bold text-imamu-navy"
          >
            {value}
          </button>
        )}
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold transition',
                active
                  ? 'border-imamu-navy bg-imamu-navy-50 text-imamu-navy shadow-sm'
                  : 'border-imamu-navy-50 bg-white text-imamu-dark/65 hover:border-imamu-navy/45 hover:bg-imamu-navy-50/45 hover:text-imamu-navy',
              )}
            >
              {isArabic ? option.ar : option.en}
            </button>
          )
        })}
      </div>
      <FieldError message={error} />
    </div>
  )
}
