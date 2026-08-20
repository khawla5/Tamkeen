// Four genuinely distinct CV templates. Each one differs in layout (not just
// accent color) so picking a template materially changes how the CV reads.
//
// All templates accept the same `CvData` shape so the live preview swaps
// instantly when the user picks a different one.

import { Mail, Phone, MapPin, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CvEducation { school: string; degree: string; years: string; gpa: string }
export interface CvExperience { title: string; company: string; period: string; description: string }
export interface CvSkill { name: string; level: number }

export interface CvData {
  personal: {
    nameEn: string
    nameAr: string
    email: string
    phone: string
    city: string
    linkedin: string
    summary: string
  }
  education: CvEducation[]
  experience: CvExperience[]
  skills: CvSkill[]
  languages: string[]
  isArabic: boolean
}

export type CvTemplateId = 'modern' | 'bold' | 'minimal' | 'classic'

export interface CvTemplateMeta {
  id: CvTemplateId
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  popular?: boolean
}

export const CV_TEMPLATES: CvTemplateMeta[] = [
  {
    id: 'modern',
    name: 'Modern Sidebar',
    nameAr: 'احترافي بشريط جانبي',
    description: 'Two-column layout with a dark sidebar for contact + skills.',
    descriptionAr: 'تخطيط بعمودين مع شريط جانبي للتواصل والمهارات.',
    popular: true,
  },
  {
    id: 'bold',
    name: 'Bold Header',
    nameAr: 'بانر إبداعي',
    description: 'Full-width colored header band with a single content column.',
    descriptionAr: 'شريط علوي ملوّن وعمود واحد للمحتوى.',
  },
  {
    id: 'minimal',
    name: 'Clean Minimal',
    nameAr: 'بسيط أنيق',
    description: 'Centered, generous whitespace, hairline dividers — quietly elegant.',
    descriptionAr: 'تنسيق متمركز ومسافات مريحة وفواصل دقيقة.',
    popular: true,
  },
  {
    id: 'classic',
    name: 'Corporate Classic',
    nameAr: 'كلاسيكي مؤسسي',
    description: 'Formal centered header, double divider, two-column footer.',
    descriptionAr: 'ترويسة متمركزة رسمية وفواصل مزدوجة.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Tiny shared atoms — kept inside this file so everything CV-template-related
// lives together.
// ─────────────────────────────────────────────────────────────────────────────

function ContactRow({ data, className, iconClassName }: { data: CvData; className?: string; iconClassName?: string }) {
  const items: { icon: typeof Mail; value: string }[] = []
  if (data.personal.email)   items.push({ icon: Mail, value: data.personal.email })
  if (data.personal.phone)   items.push({ icon: Phone, value: data.personal.phone })
  if (data.personal.city)    items.push({ icon: MapPin, value: data.personal.city })
  if (data.personal.linkedin) items.push({ icon: LinkIcon, value: data.personal.linkedin })
  if (items.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[10.5px]', className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <it.icon className={cn('w-3 h-3 shrink-0', iconClassName)} aria-hidden="true" />
          <span className="truncate">{it.value}</span>
        </span>
      ))}
    </div>
  )
}

function fallback(text: string, fallbackText: string) {
  return text.trim() ? text : fallbackText
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Modern — dark sidebar + content column
// ─────────────────────────────────────────────────────────────────────────────

export function ModernTemplate({ data }: { data: CvData }) {
  const { personal, education, experience, skills, languages, isArabic } = data
  return (
    <div className="grid grid-cols-[34%_1fr] min-h-full">
      {/* Sidebar */}
      <aside className="bg-[#0F2F35] text-white p-6 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-[20px] font-bold leading-tight">
            {fallback(personal.nameEn, isArabic ? 'اسمك الكامل' : 'Your Name')}
          </h1>
          {personal.nameAr && (
            <p className="text-[11px] text-white/55 mt-1" dir="rtl">{personal.nameAr}</p>
          )}
        </div>

        <ContactRow data={data} className="flex-col items-start text-white/80" iconClassName="text-teal-light" />

        {skills.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-light mb-2">
              {isArabic ? 'المهارات' : 'Skills'}
            </p>
            <ul className="space-y-2">
              {skills.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span>{s.name}</span>
                    <span className="text-white/50">{s.level}%</span>
                  </div>
                  <div className="h-[3px] bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-light" style={{ width: `${s.level}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {languages.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-light mb-2">
              {isArabic ? 'اللغات' : 'Languages'}
            </p>
            <ul className="space-y-1 text-[11px] text-white/80">
              {languages.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="p-7 bg-white">
        {personal.summary && (
          <section className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-deep mb-2">
              {isArabic ? 'الملخص المهني' : 'Profile'}
            </p>
            <p className="text-[11.5px] text-gray-700 leading-relaxed">{personal.summary}</p>
          </section>
        )}

        {experience.some((e) => e.title) && (
          <section className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-deep mb-3">
              {isArabic ? 'الخبرة' : 'Experience'}
            </p>
            <div className="space-y-3.5">
              {experience.filter((e) => e.title || e.company).map((e, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12.5px] font-bold text-gray-900">{e.title}</p>
                    <p className="text-[10px] text-gray-500 shrink-0">{e.period}</p>
                  </div>
                  <p className="text-[11px] text-teal-deep font-semibold">{e.company}</p>
                  {e.description && <p className="text-[11px] text-gray-600 leading-relaxed mt-1">{e.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {education.some((e) => e.school) && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-deep mb-3">
              {isArabic ? 'التعليم' : 'Education'}
            </p>
            <div className="space-y-2.5">
              {education.filter((e) => e.school || e.degree).map((e, i) => (
                <div key={i}>
                  <p className="text-[12px] font-bold text-gray-900">{e.degree}</p>
                  <p className="text-[11px] text-gray-600">{e.school}{e.years ? ` · ${e.years}` : ''}{e.gpa ? ` · GPA ${e.gpa}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bold — large color band header, single column
// ─────────────────────────────────────────────────────────────────────────────

export function BoldTemplate({ data }: { data: CvData }) {
  const { personal, education, experience, skills, languages, isArabic } = data
  return (
    <div className="bg-white">
      {/* Banner */}
      <header className="bg-gradient-to-r from-[#99823F] via-[#A89149] to-[#F5F0E3] px-9 py-7 text-white">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">
          {fallback(personal.nameEn, isArabic ? 'اسمك الكامل' : 'Your Name')}
        </h1>
        {personal.nameAr && (
          <p className="text-[12px] text-white/85 mt-1" dir="rtl">{personal.nameAr}</p>
        )}
        <ContactRow data={data} className="mt-3 text-white/90" iconClassName="text-white/80" />
      </header>

      <div className="px-9 py-7 space-y-6">
        {personal.summary && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C44C2C] mb-2">
              {isArabic ? 'نبذة عني' : 'About me'}
            </p>
            <p className="text-[12px] text-gray-700 leading-relaxed">{personal.summary}</p>
          </section>
        )}

        {experience.some((e) => e.title) && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C44C2C] mb-3">
              {isArabic ? 'الخبرة العملية' : 'Experience'}
            </p>
            <div className="space-y-4">
              {experience.filter((e) => e.title || e.company).map((e, i) => (
                <div key={i} className="border-s-2 border-[#99823F]/50 ps-4">
                  <p className="text-[13px] font-bold text-gray-900">{e.title}</p>
                  <p className="text-[11.5px] text-[#C44C2C] font-semibold">{e.company} <span className="text-gray-500 font-normal">· {e.period}</span></p>
                  {e.description && <p className="text-[11.5px] text-gray-600 leading-relaxed mt-1.5">{e.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-6">
          {education.some((e) => e.school) && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C44C2C] mb-3">
                {isArabic ? 'التعليم' : 'Education'}
              </p>
              <div className="space-y-2.5">
                {education.filter((e) => e.school || e.degree).map((e, i) => (
                  <div key={i}>
                    <p className="text-[12px] font-bold text-gray-900">{e.degree}</p>
                    <p className="text-[11px] text-gray-600">{e.school}{e.years ? ` · ${e.years}` : ''}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {(skills.length > 0 || languages.length > 0) && (
            <section>
              {skills.length > 0 && (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C44C2C] mb-3">
                    {isArabic ? 'المهارات' : 'Skills'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {skills.map((s) => (
                      <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#FBE6DD] text-[#C44C2C] px-2.5 py-1 rounded-full">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {languages.length > 0 && (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C44C2C] mb-2">
                    {isArabic ? 'اللغات' : 'Languages'}
                  </p>
                  <p className="text-[11.5px] text-gray-700">{languages.join(' · ')}</p>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Minimal — centered, hairline dividers, restrained
// ─────────────────────────────────────────────────────────────────────────────

export function MinimalTemplate({ data }: { data: CvData }) {
  const { personal, education, experience, skills, languages, isArabic } = data
  return (
    <div className="bg-white p-12 max-w-[760px] mx-auto">
      <header className="text-center mb-7">
        <h1 className="font-display text-[24px] font-light tracking-[0.18em] text-gray-900 uppercase">
          {fallback(personal.nameEn, isArabic ? 'اسمك الكامل' : 'Your Name')}
        </h1>
        {personal.nameAr && (
          <p className="text-[11px] text-gray-500 mt-1.5" dir="rtl">{personal.nameAr}</p>
        )}
        <ContactRow data={data} className="mt-3 justify-center text-gray-500" iconClassName="text-gray-400" />
      </header>

      <div className="border-t border-gray-200 mb-7" />

      {personal.summary && (
        <section className="text-center mb-8 max-w-xl mx-auto">
          <p className="text-[12px] text-gray-700 leading-relaxed italic">{personal.summary}</p>
        </section>
      )}

      {experience.some((e) => e.title) && (
        <section className="mb-7">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500 mb-4">
            {isArabic ? 'الخبرة' : 'Experience'}
          </p>
          <div className="space-y-5">
            {experience.filter((e) => e.title || e.company).map((e, i) => (
              <div key={i} className="text-center">
                <p className="text-[13px] font-medium text-gray-900">{e.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{e.company}{e.period ? `  ·  ${e.period}` : ''}</p>
                {e.description && <p className="text-[11.5px] text-gray-600 leading-relaxed mt-2 max-w-lg mx-auto">{e.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {education.some((e) => e.school) && (
        <>
          <div className="border-t border-gray-200 mb-7" />
          <section className="mb-7">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500 mb-4">
              {isArabic ? 'التعليم' : 'Education'}
            </p>
            <div className="space-y-2.5">
              {education.filter((e) => e.school || e.degree).map((e, i) => (
                <div key={i} className="text-center">
                  <p className="text-[12.5px] font-medium text-gray-900">{e.degree}{e.school ? ` — ${e.school}` : ''}</p>
                  <p className="text-[11px] text-gray-500">{e.years}{e.gpa ? ` · GPA ${e.gpa}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {(skills.length > 0 || languages.length > 0) && (
        <>
          <div className="border-t border-gray-200 mb-7" />
          <section className="text-center">
            {skills.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500 mb-2">
                  {isArabic ? 'المهارات' : 'Skills'}
                </p>
                <p className="text-[11.5px] text-gray-700 leading-relaxed mb-4">
                  {skills.map((s) => s.name).join('  ·  ')}
                </p>
              </>
            )}
            {languages.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-500 mb-2">
                  {isArabic ? 'اللغات' : 'Languages'}
                </p>
                <p className="text-[11.5px] text-gray-700">{languages.join('  ·  ')}</p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Classic — formal, double divider, serif-ish header
// ─────────────────────────────────────────────────────────────────────────────

export function ClassicTemplate({ data }: { data: CvData }) {
  const { personal, education, experience, skills, languages, isArabic } = data
  return (
    <div className="bg-white p-10 font-serif">
      <header className="text-center mb-2">
        <h1 className="text-[26px] font-bold text-[#1f2937] tracking-wide">
          {fallback(personal.nameEn, isArabic ? 'اسمك الكامل' : 'Your Name')}
        </h1>
        {personal.nameAr && (
          <p className="text-[12px] text-gray-500 italic mt-1" dir="rtl">{personal.nameAr}</p>
        )}
        <ContactRow data={data} className="mt-2 justify-center text-gray-600 font-sans" iconClassName="text-gray-500" />
      </header>

      <div className="border-y-2 border-[#92733A] my-5 py-[1px]">
        <div className="border-y border-[#92733A]/50" />
      </div>

      <div className="font-sans">
        {personal.summary && (
          <section className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#92733A] mb-1.5">
              {isArabic ? 'النبذة' : 'Profile'}
            </p>
            <p className="text-[11.5px] text-gray-700 leading-relaxed">{personal.summary}</p>
          </section>
        )}

        {experience.some((e) => e.title) && (
          <section className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#92733A] mb-2.5">
              {isArabic ? 'الخبرة المهنية' : 'Professional Experience'}
            </p>
            <div className="space-y-3.5">
              {experience.filter((e) => e.title || e.company).map((e, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <p className="text-[12.5px] font-bold text-gray-900">{e.title}{e.company ? `, ${e.company}` : ''}</p>
                    <p className="text-[10.5px] text-gray-500 italic">{e.period}</p>
                  </div>
                  {e.description && <p className="text-[11.5px] text-gray-700 leading-relaxed mt-1">{e.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {education.some((e) => e.school) && (
          <section className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#92733A] mb-2.5">
              {isArabic ? 'التعليم' : 'Education'}
            </p>
            <div className="space-y-2">
              {education.filter((e) => e.school || e.degree).map((e, i) => (
                <div key={i}>
                  <p className="text-[12px] font-bold text-gray-900">{e.degree}</p>
                  <p className="text-[11px] text-gray-600 italic">{e.school}{e.years ? ` · ${e.years}` : ''}{e.gpa ? ` · GPA ${e.gpa}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {(skills.length > 0 || languages.length > 0) && (
          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
            {skills.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#92733A] mb-2">
                  {isArabic ? 'المهارات' : 'Skills'}
                </p>
                <p className="text-[11.5px] text-gray-700 leading-relaxed">{skills.map((s) => s.name).join(' · ')}</p>
              </section>
            )}
            {languages.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#92733A] mb-2">
                  {isArabic ? 'اللغات' : 'Languages'}
                </p>
                <p className="text-[11.5px] text-gray-700">{languages.join(' · ')}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level switcher
// ─────────────────────────────────────────────────────────────────────────────

export function CvTemplateRenderer({ template, data }: { template: CvTemplateId; data: CvData }) {
  switch (template) {
    case 'bold':    return <BoldTemplate data={data} />
    case 'minimal': return <MinimalTemplate data={data} />
    case 'classic': return <ClassicTemplate data={data} />
    case 'modern':
    default:        return <ModernTemplate data={data} />
  }
}

// Tiny thumbnail for the picker — simulates the shape of each template.
export function CvTemplateThumbnail({ id }: { id: CvTemplateId }) {
  if (id === 'modern') {
    return (
      <div className="w-full h-full bg-white flex">
        <div className="w-[35%] bg-[#0F2F35] flex flex-col gap-1 p-1.5">
          <div className="h-1 bg-white/40 rounded w-full" />
          <div className="h-0.5 bg-white/25 rounded w-3/4" />
          <div className="h-0.5 bg-white/25 rounded w-2/3" />
        </div>
        <div className="flex-1 p-1.5 flex flex-col gap-1">
          <div className="h-0.5 bg-gray-300 rounded w-full" />
          <div className="h-0.5 bg-gray-200 rounded w-5/6" />
          <div className="h-0.5 bg-gray-200 rounded w-4/6" />
          <div className="h-0.5 bg-gray-200 rounded w-3/6" />
        </div>
      </div>
    )
  }
  if (id === 'bold') {
    return (
      <div className="w-full h-full bg-white flex flex-col">
        <div className="h-[35%] bg-gradient-to-r from-[#99823F] via-[#A89149] to-[#F5F0E3]" />
        <div className="flex-1 p-1.5 flex flex-col gap-1">
          <div className="h-0.5 bg-gray-300 rounded w-full" />
          <div className="h-0.5 bg-gray-200 rounded w-5/6" />
          <div className="h-0.5 bg-gray-200 rounded w-4/6" />
        </div>
      </div>
    )
  }
  if (id === 'minimal') {
    return (
      <div className="w-full h-full bg-white p-1.5 flex flex-col items-center gap-1.5">
        <div className="h-0.5 bg-gray-700 rounded w-2/3" />
        <div className="h-0.5 bg-gray-300 rounded w-1/3" />
        <div className="h-px bg-gray-200 w-full mt-0.5" />
        <div className="h-0.5 bg-gray-200 rounded w-3/4 mt-1" />
        <div className="h-0.5 bg-gray-200 rounded w-2/3" />
      </div>
    )
  }
  // classic
  return (
    <div className="w-full h-full bg-white p-1.5 flex flex-col items-center gap-1">
      <div className="h-0.5 bg-gray-700 rounded w-3/4" />
      <div className="h-px bg-[#92733A] w-full" />
      <div className="h-px bg-[#92733A]/50 w-full mt-0.5" />
      <div className="h-0.5 bg-gray-200 rounded w-full mt-1" />
      <div className="h-0.5 bg-gray-200 rounded w-5/6" />
    </div>
  )
}
