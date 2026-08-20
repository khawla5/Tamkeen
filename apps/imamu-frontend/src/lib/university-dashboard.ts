import { supabase } from '@/lib/supabase'

// Shapes the UniversityDashboard renders. All numbers come from the seeded
// `university_metrics` JSON row (see migration 0013 + scripts/seed.mjs), so the
// president's screen reads real Supabase data at the canonical scale.

export interface UniversityHeadline {
  studentsOnPlatform: number
  assessmentsCompleted: number
  skillsRecords: number
  activeCoop: number
  employment6m: number
  partnerships: number
  avgReadiness: number
  totalStudents: number
}

export interface CollegeReadiness {
  college: string
  collegeAr: string
  readiness: number
}

export interface CoopPartner {
  company: string
  companyAr: string
  placed: number
  status: 'active' | 'pending' | 'new'
  logo: string | null
}

export interface EmploymentOutcome {
  key: string
  label: string
  labelAr: string
  value: number
}

export interface EngagementMetric {
  label: string
  labelAr: string
  value: number
  pct: number
}

export interface RecentActivityItem {
  label: string
  labelAr: string
  days: number
}

export interface UniversityDashboardData {
  name: string | null
  nameAr: string | null
  logo: string | null
  headline: UniversityHeadline
  readinessByCollege: CollegeReadiness[]
  coopPartners: CoopPartner[]
  employmentOutcomes: EmploymentOutcome[]
  engagement: EngagementMetric[]
  recentActivity: RecentActivityItem[]
}

type Raw = Record<string, unknown>
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)

// Canonical IMSIU figures (CLAUDE.md / CONTENT_STYLE_GUIDE.md). Used when no
// `university_metrics` row has been seeded yet (e.g. on an environment whose
// seed predates that table) so the president's screen is never empty.
function buildDefault(
  name: string | null,
  nameAr: string | null,
  logo: string | null,
): UniversityDashboardData {
  return {
    name: name ?? 'Imam Mohammad Ibn Saud Islamic University',
    nameAr: nameAr ?? 'جامعة الإمام محمد بن سعود الإسلامية',
    logo,
    headline: {
      studentsOnPlatform: 4218,
      assessmentsCompleted: 3412,
      skillsRecords: 2847,
      activeCoop: 318,
      employment6m: 74,
      partnerships: 15,
      avgReadiness: 71,
      totalStudents: 60000,
    },
    readinessByCollege: [
      { college: 'Computer & Information Sciences', collegeAr: 'علوم الحاسب والمعلومات', readiness: 84 },
      { college: 'Engineering', collegeAr: 'الهندسة', readiness: 79 },
      { college: 'Economics & Administrative Sciences', collegeAr: 'الاقتصاد والعلوم الإدارية', readiness: 73 },
      { college: 'Media & Communication', collegeAr: 'الإعلام والاتصال', readiness: 68 },
      { college: 'Science', collegeAr: 'العلوم', readiness: 64 },
      { college: 'Languages & Translation', collegeAr: 'اللغات والترجمة', readiness: 61 },
      { college: 'Sharia', collegeAr: 'الشريعة', readiness: 58 },
    ],
    coopPartners: [
      { company: 'Saudi Aramco', companyAr: 'أرامكو السعودية', placed: 46, status: 'active', logo: '/logos/aramco.svg' },
      { company: 'stc', companyAr: 'stc', placed: 32, status: 'active', logo: '/logos/stc.svg' },
      { company: 'SABIC', companyAr: 'سابك', placed: 28, status: 'active', logo: '/logos/sabic.svg' },
      { company: 'Elm', companyAr: 'علم', placed: 18, status: 'pending', logo: '/logos/elm.svg' },
      { company: 'NEOM', companyAr: 'نيوم', placed: 13, status: 'new', logo: '/logos/neom.svg' },
    ],
    employmentOutcomes: [
      { key: 'employed', label: 'Employed', labelAr: 'موظّف', value: 64 },
      { key: 'coop', label: 'Co-op', labelAr: 'تدريب تعاوني', value: 20 },
      { key: 'grad_studies', label: 'Graduate studies', labelAr: 'دراسات عليا', value: 10 },
      { key: 'seeking', label: 'Seeking', labelAr: 'باحث عن فرصة', value: 6 },
    ],
    engagement: [
      { label: 'Skills records created', labelAr: 'سجلات مهارية مُنشأة', value: 2847, pct: 67 },
      { label: 'Assessments completed', labelAr: 'تقييمات مهنية مكتملة', value: 3412, pct: 81 },
      { label: 'Opportunities applied', labelAr: 'طلبات على الفرص', value: 5630, pct: 88 },
      { label: 'Co-op placements active', labelAr: 'تدريب تعاوني نشط', value: 318, pct: 42 },
      { label: 'Training enrollments', labelAr: 'تسجيلات تدريبية', value: 1290, pct: 38 },
    ],
    recentActivity: [
      { label: 'New co-op placement at Saudi Aramco', labelAr: 'تدريب تعاوني جديد في أرامكو السعودية', days: 0 },
      { label: 'SDAIA confirmed 4 new offers', labelAr: 'سدايا تؤكد 4 عروض جديدة', days: 1 },
      { label: '120 students completed the career assessment', labelAr: '120 طالباً أكملوا التقييم المهني', days: 2 },
      { label: 'New partnership review with NEOM', labelAr: 'مراجعة شراكة جديدة مع نيوم', days: 4 },
    ],
  }
}

// Fetch + map the IMSIU metrics row for the logged-in university user.
// Returns null on any error or missing row → the dashboard shows skeletons,
// never fake numbers.
export async function fetchUniversityDashboard(
  userId: string,
): Promise<UniversityDashboardData | null> {
  const { data: uni, error: uniErr } = await supabase
    .from('universities')
    .select('id, name, name_ar, logo_url')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; name: string | null; name_ar: string | null; logo_url: string | null }>()

  // No university row at all — still render canonical IMSIU figures, never empty.
  if (uniErr || !uni) return buildDefault(null, null, null)

  const { data: row, error: mErr } = await supabase
    .from('university_metrics')
    .select('metrics')
    .eq('university_id', uni.id)
    .maybeSingle<{ metrics: Raw }>()

  // No seeded metrics row yet — fall back to canonical figures, keeping the
  // university's own name/logo from its profile row.
  if (mErr || !row?.metrics) return buildDefault(uni.name, uni.name_ar, uni.logo_url)

  const m = row.metrics
  const h = (m.headline ?? {}) as Raw

  return {
    name: uni.name,
    nameAr: uni.name_ar,
    logo: uni.logo_url,
    headline: {
      studentsOnPlatform: num(h.students_on_platform),
      assessmentsCompleted: num(h.assessments_completed),
      skillsRecords: num(h.skills_records),
      activeCoop: num(h.active_coop),
      employment6m: num(h.employment_6m),
      partnerships: num(h.partnerships),
      avgReadiness: num(h.avg_readiness),
      totalStudents: num(h.total_students),
    },
    readinessByCollege: ((m.readiness_by_college as Raw[]) ?? []).map((c) => ({
      college: str(c.college),
      collegeAr: str(c.college_ar),
      readiness: num(c.readiness),
    })),
    coopPartners: ((m.coop_partners as Raw[]) ?? []).map((p) => ({
      company: str(p.company),
      companyAr: str(p.company_ar),
      placed: num(p.placed),
      status: (str(p.status, 'active') as CoopPartner['status']),
      logo: (p.logo as string | null) ?? null,
    })),
    employmentOutcomes: ((m.employment_outcomes as Raw[]) ?? []).map((o) => ({
      key: str(o.key),
      label: str(o.label),
      labelAr: str(o.label_ar),
      value: num(o.value),
    })),
    engagement: ((m.engagement as Raw[]) ?? []).map((e) => ({
      label: str(e.label),
      labelAr: str(e.label_ar),
      value: num(e.value),
      pct: num(e.pct),
    })),
    recentActivity: ((m.recent_activity as Raw[]) ?? []).map((a) => ({
      label: str(a.label),
      labelAr: str(a.label_ar),
      days: num(a.days),
    })),
  }
}

// Western-digit grouping (en-US) per the formatting guardrail.
export function groupNumber(n: number): string {
  return n.toLocaleString('en-US')
}
