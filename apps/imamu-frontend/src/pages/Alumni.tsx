import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  GraduationCap,
  Megaphone,
  Network,
  Star,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { alumni, alumniAnnouncements } from '@/data/tamkeen-data'
import { cn } from '@/lib/utils'

const cardSurface = 'bg-white rounded-[20px] border border-imamu-navy-50 shadow-lg shadow-imamu-navy/5'
const navyIconTile = 'inline-flex items-center justify-center rounded-lg bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70'
const goldIconTile = 'inline-flex items-center justify-center rounded-lg bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100'

export default function Alumni() {
  const { isArabic } = useLanguage()

  const total = alumni.length
  const employed = alumni.filter((a) => a.isEmployed).length
  const employedPct = total > 0 ? Math.round((employed / total) * 100) : 0
  const activePct = 78 // mock platform engagement metric

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-imamu-dark to-imamu-navy py-12 text-center">
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-imamu-gold/60" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-3 mb-3">
            <GraduationCap className="w-8 h-8 text-imamu-warm-gold" aria-hidden="true" />
            <h1 className="font-display font-bold text-white text-[clamp(24px,3.5vw,32px)] tracking-tight">
              {isArabic ? 'شبكة الخريجين' : 'Alumni Network'}
            </h1>
          </div>
          <p className="text-imamu-navy-100 text-[15px] max-w-2xl mx-auto">
            {isArabic
              ? 'تواصل مع خريجي الجامعة وتابع رحلاتهم المهنية بعد التخرج.'
              : 'Stay connected with university alumni and follow their professional journeys after graduation.'}
          </p>
        </div>
      </section>

      <section className="relative bg-imamu-ice min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {total === 0 ? (
            <div className={cn(cardSurface, 'flex flex-col items-center justify-center py-20 text-center')}>
              <div className="w-16 h-16 rounded-[18px] bg-imamu-gold-50 text-imamu-gold flex items-center justify-center mb-4 ring-1 ring-imamu-gold-100">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-imamu-dark mb-2">
                {isArabic ? 'شبكة الخريجين في نمو مستمر' : 'The alumni network is growing'}
              </h2>
              <p className="text-imamu-dark/60 max-w-sm leading-relaxed">
                {isArabic
                  ? 'مع تخرج الطلاب وانضمامهم لسوق العمل، ستظهر مساراتهم هنا.'
                  : 'As students graduate and join the workforce, their journeys will appear here.'}
              </p>
            </div>
          ) : <>
          {/* Stats bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile
              icon={Users}
              label={isArabic ? 'إجمالي الخريجين' : 'Total alumni'}
              value={total.toString()}
              caption={isArabic ? 'خريج مسجل' : 'registered alumni'}
            />
            <StatTile
              icon={Briefcase}
              label={isArabic ? 'نسبة التوظيف' : 'Employment rate'}
              value={`${employedPct}%`}
              caption={`${employed}/${total} ${isArabic ? 'موظفون' : 'employed'}`}
              accent
            />
            <StatTile
              icon={Network}
              label={isArabic ? 'نشاط في المنصة' : 'Active on platform'}
              value={`${activePct}%`}
              caption={isArabic ? 'يتفاعلون شهرياً' : 'monthly engagement'}
            />
          </div>

          {/* Report employment CTA */}
          <div className="relative overflow-hidden rounded-[20px] bg-imamu-navy text-white p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-imamu-gold/35 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-imamu-warm-gold" aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-lg font-bold">
                  {isArabic ? 'هل تخرجت مؤخراً؟' : 'Recently graduated?'}
                </p>
                <p className="text-sm text-imamu-navy-100 mt-1 max-w-md">
                  {isArabic
                    ? 'حدّث حالتك المهنية لمساعدة الجامعة على تتبع نتائج التوظيف وتحسين الخدمات.'
                    : 'Report your employment status so the university can track outcomes and improve student services.'}
                </p>
              </div>
            </div>
            <button className="relative px-5 py-2.5 rounded-lg bg-white text-imamu-navy font-bold text-sm hover:bg-imamu-gold-50 hover:ring-1 hover:ring-imamu-gold-100 transition shrink-0">
              {isArabic ? 'تحديث الحالة' : 'Report Status'}
            </button>
          </div>

          {/* Alumni grid */}
          <div>
            <SectionTitle
              icon={Star}
              title={isArabic ? 'خريجون مميزون' : 'Featured Alumni'}
              gold
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {alumni.map((a, idx) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  className="relative overflow-hidden rounded-[20px] bg-white border border-imamu-navy-50 p-5 shadow-sm hover:-translate-y-0.5 hover:border-imamu-navy-100 hover:shadow-md transition duration-200"
                >
                  <div className={cn('absolute inset-x-0 top-0 h-1', idx < 2 ? 'bg-imamu-gold' : 'bg-imamu-navy-100')} aria-hidden="true" />
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-display font-extrabold text-sm border',
                      idx < 2
                        ? 'bg-imamu-gold-50 text-imamu-gold border-imamu-gold-100 ring-2 ring-imamu-gold-50'
                        : 'bg-imamu-navy-50 text-imamu-navy border-imamu-navy-100',
                    )}>
                      {initials(isArabic ? a.nameAr : a.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-imamu-dark text-[15px] truncate">
                        {isArabic ? a.nameAr : a.name}
                      </p>
                      <p className="text-[12px] text-imamu-dark/55 mt-0.5">
                        {isArabic ? `دفعة ${a.graduationYear}` : `Class of ${a.graduationYear}`}
                        {' · '}
                        {isArabic ? a.careerPathAr ?? a.careerPath : a.careerPath}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy text-[10px] font-bold px-2 py-1 shrink-0">
                      <BadgeCheck className="w-3 h-3" />
                      {isArabic ? 'موصول' : 'Connected'}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-imamu-navy-50 space-y-1">
                    <p className="text-[13px] font-semibold text-imamu-dark">
                      {isArabic ? a.currentPositionAr ?? a.currentPosition : a.currentPosition}
                    </p>
                    <div className="flex items-center gap-1.5 text-[12px] text-imamu-navy font-semibold">
                      <Building2 className="w-3.5 h-3.5 text-imamu-gold" aria-hidden="true" />
                      <span className="truncate">{isArabic ? a.currentEmployerAr ?? a.currentEmployer : a.currentEmployer}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {idx < 2 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-2 py-0.5 text-[10px] font-bold text-imamu-gold">
                          <Star className="w-3 h-3" aria-hidden="true" />
                          {isArabic ? 'خريج مميز' : 'Featured'}
                        </span>
                      )}
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        a.isEmployed
                          ? 'border-imamu-navy-100 bg-imamu-navy-50 text-imamu-navy'
                          : 'border-imamu-gold-100 bg-imamu-gold-50 text-imamu-gold',
                      )}>
                        <Briefcase className="w-3 h-3" aria-hidden="true" />
                        {a.isEmployed
                          ? (isArabic ? 'موظف' : 'Employed')
                          : (isArabic ? 'متاح للتواصل' : 'Open to connect')}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* University announcements */}
          <div>
            <SectionTitle
              icon={Megaphone}
              title={isArabic ? 'إعلانات الجامعة' : 'University Announcements'}
              gold
            />
            <div className="space-y-3">
              {alumniAnnouncements.map((a, idx) => (
                <div
                  key={a.id}
                  className="relative overflow-hidden rounded-[20px] bg-white border border-imamu-navy-50 p-4 sm:p-5 shadow-lg shadow-imamu-navy/5"
                >
                  <div className="absolute inset-y-0 start-0 w-1 bg-imamu-gold" aria-hidden="true" />
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-imamu-gold-50 text-imamu-gold ring-1 ring-imamu-gold-100 flex items-center justify-center shrink-0">
                      <Megaphone className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-imamu-dark">
                            {isArabic ? a.titleAr : a.title}
                          </p>
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-imamu-gold-100 bg-imamu-gold-50 px-2 py-0.5 text-[10px] font-bold text-imamu-gold">
                            {announcementType(idx, isArabic)}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] text-imamu-dark/45 shrink-0">
                          <CalendarDays className="w-3.5 h-3.5 text-imamu-navy/50" aria-hidden="true" />
                          {a.date}
                        </span>
                      </div>
                      <p className="text-[13px] text-imamu-dark/65 mt-2 leading-relaxed">
                        {isArabic ? a.bodyAr : a.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>}
        </div>
      </section>
    </>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
  accent,
}: { icon: LucideIcon; label: string; value: string; caption: string; accent?: boolean }) {
  return (
    <div className={cn(
      'rounded-[20px] border p-5 shadow-lg shadow-imamu-navy/5',
      accent ? 'bg-imamu-navy text-white border-imamu-navy' : 'bg-white border-imamu-navy-50',
    )}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-[11px] uppercase tracking-wider font-bold', accent ? 'text-imamu-navy-100' : 'text-imamu-dark/50')}>
        {label}
        </p>
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg', accent ? 'bg-white/10 text-imamu-gold-100 border border-imamu-gold/25' : 'bg-imamu-navy-50 text-imamu-navy ring-1 ring-imamu-navy-100/70')}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      <p className={cn('font-display text-3xl font-extrabold mt-2', accent ? 'text-imamu-gold-100' : 'text-imamu-dark')}>{value}</p>
      <p className={cn('text-[12px] mt-1', accent ? 'text-imamu-navy-100' : 'text-imamu-dark/55')}>{caption}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, gold = false }: { icon: LucideIcon; title: string; gold?: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className={cn(gold ? goldIconTile : navyIconTile, 'h-8 w-8')}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-lg font-bold text-imamu-dark">
          {title}
        </h2>
      </div>
      <div className="mt-2 h-px w-24 bg-imamu-gold" aria-hidden="true" />
    </div>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function announcementType(index: number, isArabic: boolean) {
  const types = isArabic
    ? ['فعالية', 'برنامج', 'استبيان']
    : ['Event', 'Program', 'Survey']
  return types[index] ?? (isArabic ? 'إعلان' : 'Announcement')
}
