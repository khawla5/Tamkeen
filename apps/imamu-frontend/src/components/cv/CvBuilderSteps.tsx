import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2, Wand2, X, User, GraduationCap, Briefcase, Award } from 'lucide-react'

import { FieldError } from '@/components/ui/FieldError'
import { cn } from '@/lib/utils'
import type { FieldErrors } from '@/lib/validation'
import type { CvData, CvEducation, CvExperience, CvSkill } from '@/components/cv/CvTemplates'
import { AiSuggestionNote, CvTextField } from '@/components/cv/CvBuilderControls'

type CvBuilderStepProps = {
  currentStep: number
  t: (key: string) => string
  isArabic: boolean
  personal: CvData['personal']
  setPersonal: Dispatch<SetStateAction<CvData['personal']>>
  education: CvEducation[]
  experience: CvExperience[]
  skills: CvSkill[]
  newSkill: string
  setNewSkill: Dispatch<SetStateAction<string>>
  languages: string[]
  fieldErrors: FieldErrors
  aiMessage: string
  aiTyping: boolean
  clearField: (name: string) => void
  addEducation: () => void
  removeEducation: (index: number) => void
  updateEducation: (index: number, field: keyof CvEducation, value: string) => void
  addExperience: () => void
  removeExperience: (index: number) => void
  updateExperience: (index: number, field: keyof CvExperience, value: string) => void
  addSkill: () => void
  removeSkill: (index: number) => void
  triggerAI: (context: string) => void
  dismissAiMessage: () => void
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof User; title: string; description?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-imamu-navy-50 pb-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="font-display text-lg font-extrabold text-imamu-dark">{title}</h3>
        {description && <p className="mt-1 text-sm leading-6 text-imamu-dark/58">{description}</p>}
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-imamu-dark/60">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-xl border bg-white px-3 py-2 text-sm text-imamu-dark placeholder:text-imamu-dark/30 focus:outline-none transition',
          error
            ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
            : 'border-imamu-navy-100 focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(179,221,245,0.45)]',
        )}
      />
      <FieldError message={error} />
    </div>
  )
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute end-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-white text-red-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
      aria-label={label}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

export default function CvBuilderStep({
  currentStep,
  t,
  isArabic,
  personal,
  setPersonal,
  education,
  experience,
  skills,
  newSkill,
  setNewSkill,
  languages,
  fieldErrors,
  aiMessage,
  aiTyping,
  clearField,
  addEducation,
  removeEducation,
  updateEducation,
  addExperience,
  removeExperience,
  updateExperience,
  addSkill,
  removeSkill,
  triggerAI,
  dismissAiMessage,
}: CvBuilderStepProps) {
  switch (currentStep) {
    case 0: return (
      <>
        <SectionHeader
          icon={User}
          title={t('cvBuilder.personalInfo')}
          description={isArabic ? 'هذه البيانات تظهر في رأس السيرة وتستخدم للتواصل المهني.' : 'These details appear in your CV header and support professional contact.'}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CvTextField label={t('cvBuilder.fullNameEn')} value={personal.nameEn} onChange={value => { setPersonal(prev => ({ ...prev, nameEn: value })); clearField('nameEn') }} autoComplete="name" error={fieldErrors.nameEn} />
          <CvTextField label={t('cvBuilder.fullNameAr')} value={personal.nameAr} onChange={value => { setPersonal(prev => ({ ...prev, nameAr: value })); clearField('nameAr') }} dir="rtl" autoComplete="name" error={fieldErrors.nameAr} />
          <CvTextField label={t('cvBuilder.email')} value={personal.email} onChange={value => { setPersonal(prev => ({ ...prev, email: value })); clearField('email') }} type="email" autoComplete="email" error={fieldErrors.email} />
          <CvTextField label={t('cvBuilder.phone')} value={personal.phone} onChange={value => { setPersonal(prev => ({ ...prev, phone: value })); clearField('phone') }} type="tel" autoComplete="tel" error={fieldErrors.phone} />
          <CvTextField label={t('cvBuilder.city')} value={personal.city} onChange={value => { setPersonal(prev => ({ ...prev, city: value })); clearField('city') }} autoComplete="address-level2" error={fieldErrors.city} />
          <CvTextField label={t('cvBuilder.linkedin')} value={personal.linkedin} onChange={value => { setPersonal(prev => ({ ...prev, linkedin: value })); clearField('linkedin') }} type="url" autoComplete="url" error={fieldErrors.linkedin} />
        </div>
        <div className="mt-5">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-imamu-dark/60">
            {isArabic ? 'الملخص المهني' : 'Professional Summary'}
          </label>
          <textarea
            value={personal.summary}
            onChange={event => { setPersonal(prev => ({ ...prev, summary: event.target.value })); clearField('summary') }}
            className={cn(
              'min-h-[96px] w-full resize-y rounded-xl border bg-white p-3 text-sm text-imamu-dark transition duration-200 placeholder:text-imamu-dark/30 focus:outline-none',
              fieldErrors.summary
                ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                : 'border-imamu-navy-100 focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(179,221,245,0.45)]',
            )}
            placeholder={isArabic ? 'اكتب ملخصاً قصيراً عن خبراتك واتجاهك المهني...' : 'Write a brief summary about yourself...'}
          />
          <FieldError message={fieldErrors.summary} />
        </div>
      </>
    )

    case 1: return (
      <>
        <SectionHeader
          icon={GraduationCap}
          title={t('cvBuilder.education')}
          description={isArabic ? 'أضف الجامعة، الدرجة، السنوات، والمعدل بصياغة واضحة.' : 'Add institution, degree, years, and GPA in a clear academic format.'}
        />
        {education.map((item, index) => (
          <div key={index} className="group relative mb-3 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4">
            {education.length > 1 && <RemoveButton onClick={() => removeEducation(index)} label={isArabic ? 'حذف التعليم' : 'Remove education'} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField label={isArabic ? 'المؤسسة' : 'Institution'} value={item.school} onChange={(v) => { updateEducation(index, 'school', v); clearField(`education.${index}.school`) }} error={fieldErrors[`education.${index}.school`]} placeholder="Imam Mohammad Ibn Saud Islamic University" />
              <InputField label={isArabic ? 'الدرجة' : 'Degree'} value={item.degree} onChange={(v) => { updateEducation(index, 'degree', v); clearField(`education.${index}.degree`) }} error={fieldErrors[`education.${index}.degree`]} placeholder="B.Sc. Computer Science" />
              <InputField label={isArabic ? 'السنوات' : 'Years'} value={item.years} onChange={(v) => { updateEducation(index, 'years', v); clearField(`education.${index}.years`) }} error={fieldErrors[`education.${index}.years`]} placeholder="2022-2026" />
              <InputField label="GPA" value={item.gpa} onChange={(v) => { updateEducation(index, 'gpa', v); clearField(`education.${index}.gpa`) }} error={fieldErrors[`education.${index}.gpa`]} placeholder="3.82" />
            </div>
          </div>
        ))}
        <button type="button" onClick={addEducation} className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-imamu-navy-100 py-2.5 text-sm font-bold text-imamu-navy transition hover:border-imamu-navy hover:bg-imamu-navy-50/50">
          <Plus className="h-4 w-4" aria-hidden="true" />{t('cvBuilder.addAnother')}
        </button>
      </>
    )

    case 2: return (
      <>
        <SectionHeader
          icon={Briefcase}
          title={t('cvBuilder.experience')}
          description={isArabic ? 'استخدم أفعالاً قوية وأرقاماً واضحة لإبراز الأثر المهني.' : 'Use strong action verbs and measurable details to show professional impact.'}
        />
        {experience.map((item, index) => (
          <div key={index} className="group relative mb-3 rounded-2xl border border-imamu-navy-50 bg-imamu-navy-50/45 p-4">
            {experience.length > 1 && <RemoveButton onClick={() => removeExperience(index)} label={isArabic ? 'حذف الخبرة' : 'Remove experience'} />}
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <InputField label={isArabic ? 'المسمى الوظيفي' : 'Job Title'} value={item.title} onChange={(v) => { updateExperience(index, 'title', v); clearField(`experience.${index}.title`) }} error={fieldErrors[`experience.${index}.title`]} placeholder="Web Development Intern" />
              <InputField label={isArabic ? 'الجهة' : 'Company'} value={item.company} onChange={(v) => { updateExperience(index, 'company', v); clearField(`experience.${index}.company`) }} error={fieldErrors[`experience.${index}.company`]} placeholder="Elm Company" />
            </div>
            <div className="mb-3">
              <InputField label={isArabic ? 'الفترة' : 'Period'} value={item.period} onChange={(v) => { updateExperience(index, 'period', v); clearField(`experience.${index}.period`) }} error={fieldErrors[`experience.${index}.period`]} placeholder="Jun 2025 - Aug 2025" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-imamu-dark/60">{isArabic ? 'الوصف' : 'Description'}</label>
              <textarea
                value={item.description}
                onChange={event => { updateExperience(index, 'description', event.target.value); clearField(`experience.${index}.description`) }}
                className={cn(
                  'min-h-[82px] w-full resize-y rounded-xl border bg-white p-3 text-sm text-imamu-dark placeholder:text-imamu-dark/30 focus:outline-none transition',
                  fieldErrors[`experience.${index}.description`]
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-imamu-navy-100 focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(179,221,245,0.45)]',
                )}
              />
              <FieldError message={fieldErrors[`experience.${index}.description`]} />
            </div>
            <button type="button" onClick={() => triggerAI('experience')} className="mt-2.5 inline-flex items-center gap-2 text-[12px] font-bold text-imamu-gold-deep transition-colors hover:text-imamu-gold">
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              {isArabic ? 'اقتراحات ذكية للصياغة' : 'AI writing suggestions'}
            </button>
          </div>
        ))}

        <AiSuggestionNote message={aiMessage} typing={aiTyping} showTitle onDismiss={dismissAiMessage} />

        <button type="button" onClick={addExperience} className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-imamu-navy-100 py-2.5 text-sm font-bold text-imamu-navy transition hover:border-imamu-navy hover:bg-imamu-navy-50/50">
          <Plus className="h-4 w-4" aria-hidden="true" />{t('cvBuilder.addAnother')}
        </button>
      </>
    )

    case 3: return (
      <>
        <SectionHeader
          icon={Award}
          title={t('cvBuilder.skillsCerts')}
          description={isArabic ? 'أضف المهارات الأساسية وراجع اللغات التي ستظهر في السيرة.' : 'Add core skills and review languages that will appear in the CV.'}
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {skills.map((skill, index) => (
            <span key={skill.name} className="group flex items-center gap-2 rounded-full border border-imamu-navy-100 bg-imamu-navy-50 px-3.5 py-1.5 text-sm font-bold text-imamu-navy">
              {skill.name}
              <span className="text-xs font-extrabold text-imamu-gold-deep">{skill.level}%</span>
              <button type="button" onClick={() => removeSkill(index)} className="ms-1 text-red-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" aria-label={isArabic ? 'حذف المهارة' : 'Remove skill'}>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <div className="mb-2 flex gap-2">
          <input
            value={newSkill}
            onChange={event => setNewSkill(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addSkill()
              }
            }}
            placeholder={isArabic ? 'أضف مهارة...' : 'Add a skill...'}
            className={cn(
              'flex-1 rounded-xl border bg-white px-3.5 py-2 text-sm text-imamu-dark placeholder:text-imamu-dark/30 focus:outline-none transition',
              fieldErrors.skills
                ? 'border-red-300 focus:border-red-400'
                : 'border-imamu-navy-100 focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(179,221,245,0.45)]',
            )}
          />
          <button type="button" onClick={addSkill} className="shrink-0 rounded-xl bg-imamu-navy px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-imamu-navy-deep">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <FieldError message={fieldErrors.skills} />
        <button type="button" onClick={() => triggerAI('skills')} className="mb-5 mt-2 inline-flex items-center gap-2 text-[12px] font-bold text-imamu-gold-deep transition-colors hover:text-imamu-gold">
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          {isArabic ? 'اقتراح مهارات ذكي' : 'Suggest skills with AI'}
        </button>

        <AiSuggestionNote message={aiMessage} typing={aiTyping} />

        <h4 className="mb-2.5 text-sm font-bold text-imamu-dark/70">{t('cvBuilder.languages')}</h4>
        <div className="flex flex-wrap gap-2">
          {languages.map(language => (
            <span key={language} className="rounded-full border border-imamu-navy-100 bg-white px-3.5 py-1.5 text-sm font-bold text-imamu-navy">{language}</span>
          ))}
        </div>
      </>
    )

    default: return null
  }
}
