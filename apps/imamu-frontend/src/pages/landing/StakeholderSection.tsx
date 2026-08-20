import { useState } from 'react'
import {
  FileText,
  BookOpen,
  Target,
  BarChart3,
  Award,
  Briefcase,
  GraduationCap,
  Compass,
  TrendingUp,
  Send,
  ClipboardCheck,
  BadgeCheck,
  Search,
  Handshake,
  Building2,
  Users,
  Layers,
} from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { SectionHeader } from './shared'

export function StakeholderSection() {
  const { t } = useLanguage()
  const [activeIndex, setActiveIndex] = useState(0)

  const stakeholders = [
    {
      icon: <GraduationCap className="w-6 h-6" />, iconBg: 'bg-teal/10 text-teal', activeBg: 'bg-teal text-white',
      name: t('landing.stakeholderStudentName'), desc: t('landing.stakeholderStudentDesc'),
      features: [
        { icon: <Compass className="w-5 h-5" />, title: t('landing.stakeholderStudentF1'), desc: t('landing.stakeholderStudentF1Desc') },
        { icon: <FileText className="w-5 h-5" />, title: t('landing.stakeholderStudentF2'), desc: t('landing.stakeholderStudentF2Desc') },
        { icon: <Target className="w-5 h-5" />, title: t('landing.stakeholderStudentF3'), desc: t('landing.stakeholderStudentF3Desc') },
      ],
    },
    {
      icon: <Building2 className="w-6 h-6" />, iconBg: 'bg-teal-dark/10 text-teal-dark', activeBg: 'bg-teal-dark text-white',
      name: t('landing.stakeholderEmployeeName'), desc: t('landing.stakeholderEmployeeDesc'),
      features: [
        { icon: <Compass className="w-5 h-5" />, title: t('landing.stakeholderEmployeeF1'), desc: t('landing.stakeholderEmployeeF1Desc') },
        { icon: <TrendingUp className="w-5 h-5" />, title: t('landing.stakeholderEmployeeF2'), desc: t('landing.stakeholderEmployeeF2Desc') },
        { icon: <Search className="w-5 h-5" />, title: t('landing.stakeholderEmployeeF3'), desc: t('landing.stakeholderEmployeeF3Desc') },
      ],
    },
    {
      icon: <Briefcase className="w-6 h-6" />, iconBg: 'bg-info/10 text-info', activeBg: 'bg-info text-white',
      name: t('landing.stakeholderExpertName'), desc: t('landing.stakeholderRetireeDesc'),
      features: [
        { icon: <Users className="w-5 h-5" />, title: t('landing.stakeholderRetireeF1'), desc: t('landing.stakeholderRetireeF1Desc') },
        { icon: <Handshake className="w-5 h-5" />, title: t('landing.stakeholderRetireeF2'), desc: t('landing.stakeholderRetireeF2Desc') },
        { icon: <ClipboardCheck className="w-5 h-5" />, title: t('landing.stakeholderRetireeF3'), desc: t('landing.stakeholderRetireeF3Desc') },
      ],
    },
    {
      icon: <Target className="w-6 h-6" />, iconBg: 'bg-terra/10 text-terra', activeBg: 'bg-terra text-white',
      name: t('landing.stakeholderCompanyName'), desc: t('landing.stakeholderCompanyDesc'),
      features: [
        { icon: <Send className="w-5 h-5" />, title: t('landing.stakeholderCompanyF1'), desc: t('landing.stakeholderCompanyF1Desc') },
        { icon: <Search className="w-5 h-5" />, title: t('landing.stakeholderCompanyF2'), desc: t('landing.stakeholderCompanyF2Desc') },
        { icon: <BarChart3 className="w-5 h-5" />, title: t('landing.stakeholderCompanyF3'), desc: t('landing.stakeholderCompanyF3Desc') },
      ],
    },
    {
      icon: <Award className="w-6 h-6" />, iconBg: 'bg-imamu-gold/10 text-imamu-gold-deep', activeBg: 'bg-imamu-gold text-white',
      name: t('landing.stakeholderUniName'), desc: t('landing.stakeholderUniDesc'),
      features: [
        { icon: <TrendingUp className="w-5 h-5" />, title: t('landing.stakeholderUniF1'), desc: t('landing.stakeholderUniF1Desc') },
        { icon: <BarChart3 className="w-5 h-5" />, title: t('landing.stakeholderUniF2'), desc: t('landing.stakeholderUniF2Desc') },
        { icon: <Handshake className="w-5 h-5" />, title: t('landing.stakeholderUniF3'), desc: t('landing.stakeholderUniF3Desc') },
      ],
    },
    {
      icon: <BookOpen className="w-6 h-6" />, iconBg: 'bg-imamu-blue/15 text-imamu-navy', activeBg: 'bg-imamu-navy text-white',
      name: t('landing.stakeholderProviderName'), desc: t('landing.stakeholderProviderDesc'),
      features: [
        { icon: <Layers className="w-5 h-5" />, title: t('landing.stakeholderProviderF1'), desc: t('landing.stakeholderProviderF1Desc') },
        { icon: <BarChart3 className="w-5 h-5" />, title: t('landing.stakeholderProviderF2'), desc: t('landing.stakeholderProviderF2Desc') },
        { icon: <BadgeCheck className="w-5 h-5" />, title: t('landing.stakeholderProviderF3'), desc: t('landing.stakeholderProviderF3Desc') },
      ],
    },
  ]

  const active = stakeholders[activeIndex]

  // Solid gold-light wash — a calm warm step between the sections above and below.
  return (
    <section id="ecosystem" className="relative bg-imamu-gold-50 py-20 lg:py-28 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader tag={t('landing.stakeholdersTag')} title={t('landing.stakeholdersTitle')} subtitle={t('landing.stakeholdersSubtitle')} />

        {/* Stakeholder selector cards — 3×2 grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-8">
          {stakeholders.map((s, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`relative rounded-2xl border p-5 text-center transition-colors duration-200 cursor-pointer ${
                  isActive
                    ? 'border-teal/40 bg-teal-dark/[0.03] shadow-sm'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors duration-200 ${isActive ? s.activeBg : s.iconBg}`}>
                  {s.icon}
                </div>
                <h3 className={`font-display font-semibold text-sm mb-1 transition-colors duration-200 ${isActive ? 'text-teal-dark' : 'text-teal-dark/70'}`}>{s.name}</h3>
                <p className="text-muted text-[12px] leading-relaxed hidden sm:block">{s.desc}</p>
                {isActive && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-imamu-gold" />
                )}
              </button>
            )
          })}
        </div>

        {/* Feature detail panel */}
        <div className="rounded-2xl border border-gray-100 bg-white p-8 lg:p-10 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {active.features.map((f, i) => (
              <div key={i} className="flex gap-4">
                <div className={`w-10 h-10 rounded-xl ${stakeholders[activeIndex].iconBg} flex items-center justify-center shrink-0`}>
                  {f.icon}
                </div>
                <div>
                  <h4 className="font-display font-semibold text-teal-dark text-sm mb-1">{f.title}</h4>
                  <p className="text-muted text-[13px] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
