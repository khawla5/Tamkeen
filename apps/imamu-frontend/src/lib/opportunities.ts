import { supabase } from '@/lib/supabase'
import type { OpportunityRow, OpportunityType } from '@/types/database'
import type { Opportunity } from '@/types'

// Database `opportunity_type` enum → UI `category` value (UI uses kebab-case)
const dbTypeToCategory: Record<OpportunityType, Opportunity['category']> = {
  job: 'job',
  training: 'training',
  coop: 'coop',
  certification: 'certification',
  career_path: 'career-path',
  consulting: 'consulting',
}

const dbTypeToHumanEn: Record<OpportunityType, Opportunity['type']> = {
  job: 'Job',
  training: 'Training',
  coop: 'Co-op Training',
  certification: 'Certification',
  career_path: 'Career Path',
  consulting: 'Part-Time & Consulting',
}

const dbTypeToHumanAr: Record<OpportunityType, string> = {
  job: 'وظيفة',
  training: 'برنامج تدريبي',
  coop: 'تدريب تعاوني',
  certification: 'شهادة',
  career_path: 'مسار مهني',
  consulting: 'جزئي / استشارات',
}

export const categoryToDbType: Record<Exclude<Opportunity['category'], never>, OpportunityType> = {
  job: 'job',
  training: 'training',
  coop: 'coop',
  certification: 'certification',
  'career-path': 'career_path',
  consulting: 'consulting',
}

interface RowWithOwner extends OpportunityRow {
  companies: {
    name: string | null
    name_ar: string | null
    logo_url: string | null
  } | null
  course_providers: {
    name: string | null
    name_ar: string | null
    logo_url: string | null
  } | null
  applications?: { count: number }[] | null
}

export function mapOpportunityRow(row: RowWithOwner): Opportunity {
  const created = new Date(row.created_at)
  const ms = Date.now() - created.getTime()
  const postedDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
  const applicants = row.applications?.[0]?.count ?? 0
  const owner = row.companies ?? row.course_providers ?? null
  const isFromProvider = !!row.provider_id

  return {
    id: row.id,
    title: row.title,
    titleAr: row.title_ar ?? undefined,
    company: owner?.name ?? '—',
    companyAr: owner?.name_ar ?? undefined,
    companyLogo: owner?.logo_url ?? '',
    isFromProvider,
    type: dbTypeToHumanEn[row.type],
    typeAr: dbTypeToHumanAr[row.type],
    category: dbTypeToCategory[row.type],
    location: row.location ?? '',
    locationAr: row.location_ar ?? undefined,
    duration: row.duration ?? '',
    durationAr: row.duration_ar ?? undefined,
    salary: row.salary ?? '',
    salaryAr: row.salary_ar ?? undefined,
    price: typeof row.price === 'number' ? row.price : Number(row.price ?? 0),
    deadline: row.deadline ?? '',
    skills: row.skills ?? [],
    description: row.description ?? '',
    descriptionAr: row.description_ar ?? undefined,
    matchScore: 80,
    postedDays,
    applicants,
    forRetirees: row.for_retirees,
  }
}

const SELECT_COLS = `
  *,
  companies        ( name, name_ar, logo_url ),
  course_providers ( name, name_ar, logo_url ),
  applications     ( count )
`

export async function fetchActiveOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(SELECT_COLS)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => mapOpportunityRow(row as RowWithOwner))
}

// Postings owned by the current user — works whether they are a company OR a provider.
export async function fetchMyPostings(userId: string): Promise<Opportunity[]> {
  // Look up either a company id or a provider id for this user (only one will exist).
  const [companyRes, providerRes] = await Promise.all([
    supabase.from('companies').select('id').eq('user_id', userId).maybeSingle<{ id: string }>(),
    supabase.from('course_providers').select('id').eq('user_id', userId).maybeSingle<{ id: string }>(),
  ])

  const companyId = companyRes.data?.id ?? null
  const providerId = providerRes.data?.id ?? null
  if (!companyId && !providerId) return []

  let query = supabase.from('opportunities').select(SELECT_COLS)
  if (companyId) query = query.eq('company_id', companyId)
  else if (providerId) query = query.eq('provider_id', providerId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => mapOpportunityRow(row as RowWithOwner))
}

// Single opportunity by id — used to pre-fill the edit form.
export async function fetchOpportunityById(id: string): Promise<{
  id: string
  type: string
  title: string
  title_ar: string | null
  location: string | null
  duration: string | null
  salary: string | null
  description: string | null
  skills: string[]
  deadline: string | null
  applicant_limit: number | null
  price: number
  is_active: boolean
} | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('id, type, title, title_ar, location, duration, salary, description, skills, deadline, applicant_limit, price, is_active')
    .eq('id', id)
    .maybeSingle()
  if (error) return null
  return data
}

// Fetch a single opportunity with the full owning-company / provider info
// alongside it. Used by the dedicated /opportunities/:id detail page so it
// can show "About the company" without a second round-trip.
export interface OpportunityFull {
  opportunity: Opportunity
  company: {
    id: string
    name: string
    name_ar: string | null
    logo_url: string | null
    industry: string | null
    size: string | null
    location: string | null
  } | null
  provider: {
    id: string
    name: string
    name_ar: string | null
    logo_url: string | null
    rating: number | null
  } | null
}

export async function fetchOpportunityFull(id: string): Promise<OpportunityFull | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(`
      *,
      companies        ( id, name, name_ar, logo_url, industry, size, location ),
      course_providers ( id, name, name_ar, logo_url, rating ),
      applications     ( count )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null

  const row = data as unknown as RowWithOwner & {
    companies: {
      id: string
      name: string | null
      name_ar: string | null
      logo_url: string | null
      industry: string | null
      size: string | null
      location: string | null
    } | null
    course_providers: {
      id: string
      name: string | null
      name_ar: string | null
      logo_url: string | null
      rating: number | null
    } | null
  }

  return {
    opportunity: mapOpportunityRow(row),
    company: row.companies && row.companies.name
      ? {
          id: row.companies.id,
          name: row.companies.name,
          name_ar: row.companies.name_ar,
          logo_url: row.companies.logo_url,
          industry: row.companies.industry,
          size: row.companies.size,
          location: row.companies.location,
        }
      : null,
    provider: row.course_providers && row.course_providers.name
      ? {
          id: row.course_providers.id,
          name: row.course_providers.name,
          name_ar: row.course_providers.name_ar,
          logo_url: row.course_providers.logo_url,
          rating: row.course_providers.rating,
        }
      : null,
  }
}

export interface OpportunityWritePayload {
  title: string
  type: OpportunityType
  location?: string | null
  duration?: string | null
  salary?: string | null
  description?: string | null
  skills?: string[]
  deadline?: string | null
  applicant_limit?: number | null
  price?: number
  is_active?: boolean
}

// Create a new posting. Looks up the user's company or provider id automatically.
export async function createPosting(userId: string, payload: OpportunityWritePayload): Promise<void> {
  const [companyRes, providerRes] = await Promise.all([
    supabase.from('companies').select('id').eq('user_id', userId).maybeSingle<{ id: string }>(),
    supabase.from('course_providers').select('id').eq('user_id', userId).maybeSingle<{ id: string }>(),
  ])

  const insertPayload = {
    ...payload,
    company_id: companyRes.data?.id ?? null,
    provider_id: providerRes.data?.id ?? null,
    is_active: payload.is_active ?? true,
  }

  if (!insertPayload.company_id && !insertPayload.provider_id) {
    throw new Error('No company or provider profile found for this user')
  }

  const { error } = await supabase
    .from('opportunities')
    .insert(insertPayload)
  if (error) throw new Error(error.message)
}

export async function updateOpportunity(
  id: string,
  patch: OpportunityWritePayload,
): Promise<void> {
  const { error } = await supabase
    .from('opportunities')
    .update({ ...patch })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
