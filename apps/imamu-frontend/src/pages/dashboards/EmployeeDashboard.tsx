import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Briefcase, TrendingUp, Award, Target, Star, BookOpen,
  CheckCircle2, Clock, Users, Rocket,
} from 'lucide-react'
import DashboardCard from '@/components/shared/DashboardCard'
import MatchBadge from '@/components/shared/MatchBadge'
import OpportunityDetailModal from '@/components/shared/OpportunityDetailModal'
import CompanyLogo from '@/components/shared/CompanyLogo'
import StatCard from '@/components/shared/StatCard'
import DashboardWelcomeBanner from '@/components/shared/DashboardWelcomeBanner'
import NextStepCard from '@/components/shared/NextStepCard'
import QuickStatsGrid from '@/components/shared/QuickStatsGrid'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { useLocalizedField } from '@/hooks/useLocalizedData'
import { useAuth } from '@/context/AuthContext'
import { fetchEmployeeProfile } from '@/lib/profiles'
import { fetchActiveOpportunities } from '@/lib/opportunities'
import { applyMatchScores, fetchMatchContext } from '@/lib/match-score'
import type { Opportunity } from '@/types'

// Calm institutional motion: a single short opacity fade on mount, no stagger,
// no drift, no scroll-triggered reveal. The `delay` arg is accepted for
// call-site compatibility but intentionally ignored.
const fade = (_delay = 0) => ({ initial: { opacity: 0 } as const, animate: { opacity: 1 } as const, transition: { duration: 0.18 } })

// Default employee profile (curated visuals; live fields are merged in below)
const defaultEmployeeProfile = {
  currentRole: 'Software Engineer',
  currentRoleAr: 'مهندس برمجيات',
  company: 'TechCorp Arabia',
  companyAr: 'تك كورب العربية',
  department: 'Engineering',
  departmentAr: 'الهندسة',
  yearsAtCompany: 3,
  performanceScore: 92,
  skills: [
    { name: 'React', level: 90, endorsed: 12 },
    { name: 'TypeScript', level: 85, endorsed: 8 },
    { name: 'Node.js', level: 78, endorsed: 6 },
    { name: 'Python', level: 72, endorsed: 5 },
    { name: 'System Design', level: 65, endorsed: 3 },
    { name: 'AWS', level: 60, endorsed: 4 },
  ],
  certifications: [
    { name: 'AWS Solutions Architect', issuer: 'Amazon', date: '2025-11', status: 'completed' },
    { name: 'PMP Certification', issuer: 'PMI', date: '2025-08', status: 'completed' },
    { name: 'Google Cloud Professional', issuer: 'Google', date: '2026-03', status: 'in-progress' },
  ],
  courses: [
    { name: 'Advanced System Design', provider: 'Tamkeen Academy', progress: 75 },
    { name: 'Leadership for Engineers', provider: 'LinkedIn Learning', progress: 45 },
    { name: 'Data Engineering with Python', provider: 'Saudi Digital Academy', progress: 100 },
  ],
  goals: [
    { title: 'Get promoted to Senior Engineer', titleAr: 'الترقية لمهندس أول', progress: 70, deadline: '2026-Q3' },
    { title: 'Complete 3 certifications', titleAr: 'إكمال 3 شهادات', progress: 66, deadline: '2026-Q4' },
    { title: 'Mentor 2 junior developers', titleAr: 'توجيه 2 مطورين مبتدئين', progress: 50, deadline: '2026-Q2' },
  ],
  workHistory: [
    { role: 'Software Engineer', roleAr: 'مهندس برمجيات', company: 'TechCorp Arabia', companyAr: 'تك كورب العربية', period: '2023 – Present', periodAr: '2023 – الحالي', current: true },
    { role: 'Junior Developer', roleAr: 'مطور مبتدئ', company: 'Elm', companyAr: 'علم', period: '2021 – 2023', periodAr: '2021 – 2023', current: false },
    { role: 'Intern', roleAr: 'متدرب', company: 'Saudi Aramco', companyAr: 'أرامكو السعودية', period: '2020 – 2021', periodAr: '2020 – 2021', current: false },
  ],
}

export default function EmployeeDashboard() {
  const { t, isArabic } = useLanguage()
  const l = useLocalizedField()
  const { user } = useAuth()
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [employeeOpps, setEmployeeOpps] = useState<Opportunity[]>([])

  // Curated visual baseline; the four live fields below get overwritten from DB.
  const [employeeProfile, setEmployeeProfile] = useState(defaultEmployeeProfile)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    fetchEmployeeProfile(user.id)
      .then((real) => {
        if (cancelled || !real) return
        setEmployeeProfile((prev) => ({
          ...prev,
          currentRole:    real.jobTitle    ?? prev.currentRole,
          currentRoleAr:  real.jobTitleAr  ?? prev.currentRoleAr,
          company:        real.companyName ?? prev.company,
          yearsAtCompany: real.yearsInRole ?? prev.yearsAtCompany,
        }))
      })
      .catch(() => { /* fallback already in state */ })

    Promise.all([fetchActiveOpportunities(), fetchMatchContext(user.id, 'employee')])
      .then(([opps, ctx]) => {
        if (cancelled) return
        const scored = applyMatchScores(opps, ctx)
        setEmployeeOpps([...scored].sort((a, b) => b.matchScore - a.matchScore).slice(0, 4))
      })
      .catch(() => { /* card will show empty state */ })

    return () => { cancelled = true }
  }, [user])

  const completedCourses = employeeProfile.courses.filter(c => c.progress === 100).length
  const totalEndorsements = employeeProfile.skills.reduce((s, sk) => s + sk.endorsed, 0)
  const inProgressCert = employeeProfile.certifications.find(c => c.status === 'in-progress')
  const topGoal = employeeProfile.goals.reduce((a, b) => (a.progress >= b.progress ? a : b))

  return (
    <>
      <DashboardWelcomeBanner
        storageKey="tamkeen-employee-welcome-dismissed"
        gradient="from-imamu-dark to-imamu-navy"
        icon={<Rocket className="w-6 h-6 text-white" />}
        title={
          isArabic
            ? `مرحباً ${user?.nameAr ?? ''}`
            : `Welcome, ${user?.name?.split(' ')[0] ?? ''}`
        }
        description={
          isArabic
            ? `أداؤك ${employeeProfile.performanceScore}% — أنت في المسار الصحيح نحو الترقية`
            : `Your performance is at ${employeeProfile.performanceScore}% — you're on track for promotion`
        }
      />

      <NextStepCard
        icon={<Target className="w-7 h-7 text-white" />}
        label={isArabic ? 'خطوتك التالية' : 'Your Next Step'}
        heading={
          inProgressCert
            ? (isArabic ? `أكمل شهادة ${inProgressCert.name}` : `Finish your ${inProgressCert.name}`)
            : (isArabic ? 'واصل نمو مسارك المهني' : 'Keep growing your career')
        }
        bullets={[
          isArabic
            ? `${topGoal.progress}% نحو هدفك: ${topGoal.titleAr}`
            : `${topGoal.progress}% toward your goal: ${topGoal.title}`,
          isArabic
            ? `أداؤك الحالي: ${employeeProfile.performanceScore}% — في المسار الصحيح`
            : `Current performance: ${employeeProfile.performanceScore}% — on track`,
          isArabic
            ? `${totalEndorsements} تأييداً للمهارات من زملائك`
            : `${totalEndorsements} skill endorsements from peers`,
        ]}
        ctaHref="/opportunities"
        ctaLabel={isArabic ? 'استكشف الفرص' : 'Explore Opportunities'}
      />

      <QuickStatsGrid
        items={[
          {
            icon: <Briefcase className="w-4 h-4 text-teal" />,
            iconBg: 'bg-teal/15',
            label: t('dashboard.currentRole'),
            value: isArabic ? employeeProfile.currentRoleAr : employeeProfile.currentRole,
          },
          {
            icon: <Users className="w-4 h-4 text-blue-400" />,
            iconBg: 'bg-blue-500/15',
            label: t('dashboard.department'),
            value: isArabic ? employeeProfile.departmentAr : employeeProfile.department,
          },
          {
            icon: <Clock className="w-4 h-4 text-yellow-400" />,
            iconBg: 'bg-yellow-500/15',
            label: t('dashboard.yearsAtCompany'),
            value: `${employeeProfile.yearsAtCompany} ${isArabic ? 'سنوات' : 'years'}`,
          },
          {
            icon: <TrendingUp className="w-4 h-4 text-green-400" />,
            iconBg: 'bg-green-500/15',
            label: t('dashboard.performanceScore'),
            value: `${employeeProfile.performanceScore}%`,
          },
        ]}
      />

      {/* Stat cards */}
      <div className="mx-auto px-4 sm:px-6 mt-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<TrendingUp className="w-5 h-5 text-teal" />} iconBg="bg-teal/15" value={`${employeeProfile.performanceScore}%`} label={t('dashboard.performanceScore')} progress={employeeProfile.performanceScore} progressColor="bg-teal" index={0} />
          <StatCard icon={<Star className="w-5 h-5 text-yellow-400" />} iconBg="bg-yellow-500/15" value={String(totalEndorsements)} label={t('dashboard.skillsEndorsed')} index={1} />
          <StatCard icon={<Award className="w-5 h-5 text-green-400" />} iconBg="bg-green-500/15" value={String(completedCourses)} label={t('dashboard.coursesCompleted')} index={2} />
          <StatCard icon={<Target className="w-5 h-5 text-blue-400" />} iconBg="bg-blue-500/15" value={`${employeeProfile.goals.filter(g => g.progress === 100).length}/${employeeProfile.goals.length}`} label={t('dashboard.goalsCompleted')} index={3} />
        </div>
      </div>

      <div className="mx-auto px-4 sm:px-6 pb-12">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-6">
            {/* Skills with endorsements */}
            <motion.div {...fade(0)}>
              <DashboardCard id="skills" title={t('dashboard.skillDevelopment')} icon={<Star className="w-[18px] h-[18px] text-teal" />}>
                <div className="space-y-4">
                  {employeeProfile.skills.map((s) => (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/70 font-medium">{s.name}</span>
                          <span className="text-[10px] text-teal bg-teal/10 rounded-full px-2 py-0.5 font-bold">
                            {s.endorsed} {isArabic ? 'تأييد' : 'endorsed'}
                          </span>
                        </div>
                        <span className="text-xs text-teal font-bold">{s.level}%</span>
                      </div>
                      <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                        <div className="h-full bg-teal rounded-full" style={{ width: `${s.level}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            {/* Recommended opportunities */}
            <motion.div {...fade(0.1)}>
              <DashboardCard id="opportunities" title={t('dashboard.aiRecommendedOpps')} icon={<Briefcase className="w-[18px] h-[18px] text-teal" />} action={{ label: t('common.viewAll'), href: '/opportunities' }}>
                {employeeOpps.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="w-8 h-8 text-white/15 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-white/60">
                      {isArabic ? 'لا توجد توصيات الآن' : 'No recommendations yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {employeeOpps.map((opp) => (
                    <div
                      key={opp.id}
                      className="glass-inner p-4 rounded-xl transition duration-200 cursor-pointer hover:bg-white/[0.08]"
                      onClick={() => setSelectedOpp(opp)}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-9 h-9 rounded-lg text-xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{l(opp, 'title')}</p>
                          <p className="text-xs text-white/60 mt-0.5">{l(opp, 'company')} · {l(opp, 'location')}</p>
                        </div>
                        <MatchBadge score={opp.matchScore} />
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </DashboardCard>
            </motion.div>

            {/* Work history */}
            <motion.div {...fade(0.2)}>
              <DashboardCard id="experience" title={t('dashboard.workExperience')} icon={<Briefcase className="w-[18px] h-[18px] text-teal" />}>
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute start-[18px] top-3 bottom-3 w-[2px] bg-white/[0.08]" />
                  <div className="space-y-4">
                    {employeeProfile.workHistory.map((job) => (
                      <div
                        key={job.company + job.role}
                        className="flex gap-4 relative"
                      >
                        <div className={cn(
                          'w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 z-10',
                          job.current ? 'bg-teal/20' : 'bg-white/[0.06]',
                        )}>
                          <Briefcase className={cn('w-4 h-4', job.current ? 'text-teal' : 'text-white/30')} />
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{isArabic ? job.roleAr : job.role}</p>
                            {job.current && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 rounded-full px-2 py-0.5">
                                {isArabic ? 'حالي' : 'Current'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/60 mt-0.5">
                            {isArabic ? job.companyAr : job.company} · {isArabic ? job.periodAr : job.period}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DashboardCard>
            </motion.div>
          </div>

          <div className="space-y-6">
            {/* Career goals */}
            <motion.div {...fade(0.05)}>
              <DashboardCard id="goals" title={t('dashboard.careerGoals')} icon={<Target className="w-[18px] h-[18px] text-teal" />}>
                <div className="space-y-3">
                  {employeeProfile.goals.map((goal) => (
                    <div key={goal.title} className="glass-inner p-4 rounded-xl transition duration-200">
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <p className="text-sm font-semibold text-white">{isArabic ? goal.titleAr : goal.title}</p>
                        <span className="text-xs text-white/30 shrink-0">{goal.deadline}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 60 ? 'bg-teal' : 'bg-yellow-500')}
                            style={{ width: `${goal.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-teal min-w-[36px] text-end">{goal.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            {/* Certifications */}
            <motion.div {...fade(0.15)}>
              <DashboardCard id="certifications" title={t('dashboard.certifications')} icon={<Award className="w-[18px] h-[18px] text-teal" />}>
                <div className="space-y-2.5">
                  {employeeProfile.certifications.map((cert) => (
                    <div key={cert.name} className="glass-inner flex items-center gap-3 p-4 rounded-xl transition duration-200">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        cert.status === 'completed' ? 'bg-green-500/15' : 'bg-yellow-500/15',
                      )}>
                        {cert.status === 'completed'
                          ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                          : <Clock className="w-5 h-5 text-yellow-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{cert.name}</p>
                        <p className="text-xs text-white/60 mt-0.5">{cert.issuer} · {cert.date}</p>
                      </div>
                      <span className={cn(
                        'rounded-full text-[10px] font-bold px-3 py-1 shrink-0',
                        cert.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400',
                      )}>
                        {cert.status === 'completed' ? (isArabic ? 'مكتمل' : 'Completed') : (isArabic ? 'قيد التقدم' : 'In Progress')}
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            {/* Learning progress */}
            <motion.div {...fade(0.25)}>
              <DashboardCard id="learning" title={t('dashboard.learningProgress')} icon={<BookOpen className="w-[18px] h-[18px] text-teal" />}>
                <div className="space-y-2.5">
                  {employeeProfile.courses.map((c) => (
                    <div key={c.name} className="glass-inner p-4 rounded-xl transition duration-200">
                      <p className="text-sm font-semibold text-white">{c.name}</p>
                      <p className="text-xs text-white/60 mt-0.5 mb-3">{c.provider}</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', c.progress === 100 ? 'bg-green-500' : 'bg-teal')}
                            style={{ width: `${c.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-teal min-w-[36px] text-end">{c.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Opportunity detail modal */}
      {selectedOpp && (
        <OpportunityDetailModal opportunity={selectedOpp} onClose={() => setSelectedOpp(null)} />
      )}
    </>
  )
}
