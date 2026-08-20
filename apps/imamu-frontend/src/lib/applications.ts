import { supabase } from '@/lib/supabase'
import type { ApplicationStatus, OpportunityType, UserRole } from '@/types/database'

export interface MyApplication {
  id: string
  status: ApplicationStatus
  appliedAt: string
  updatedAt: string
  opportunityId: string
  role: string
  roleAr: string | null
  company: string
  companyAr: string | null
  type: OpportunityType | null
  location: string | null
  locationAr: string | null
  duration: string | null
  durationAr: string | null
}

export interface CompanyApplicant {
  id: string                // application id
  applicantUserId: string
  status: ApplicationStatus
  appliedAt: string
  name: string
  nameAr: string | null
  email: string
  avatarUrl: string | null
  applicantRole: UserRole
  opportunityId: string
  opportunityTitle: string
  opportunityTitleAr: string | null
}

// Has the current user already applied to this opportunity?
export async function checkAlreadyApplied(
  userId: string,
  opportunityId: string
): Promise<{ applied: boolean; status: ApplicationStatus | null }> {
  const { data, error } = await supabase
    .from('applications')
    .select('status')
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId)
    .maybeSingle<{ status: ApplicationStatus }>()

  if (error) throw error
  return { applied: !!data, status: data?.status ?? null }
}

// Submit an application
export async function applyToOpportunity(
  userId: string,
  opportunityId: string
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .insert({ user_id: userId, opportunity_id: opportunityId })

  if (error) throw error
}

// Update an application's status (company side)
export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', applicationId)

  if (error) throw error
}

// List the current user's applications (student / retiree)
export async function fetchMyApplications(userId: string): Promise<MyApplication[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      id, status, applied_at, updated_at, opportunity_id,
      opportunities (
        title, title_ar, type, location, location_ar, duration, duration_ar,
        companies ( name, name_ar ),
        course_providers ( name, name_ar )
      )
    `)
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })

  if (error) throw error

  type Row = {
    id: string
    status: ApplicationStatus
    applied_at: string
    updated_at: string
    opportunity_id: string
    opportunities: {
      title: string
      title_ar: string | null
      type: OpportunityType | null
      location: string | null
      location_ar: string | null
      duration: string | null
      duration_ar: string | null
      companies: { name: string | null; name_ar: string | null } | null
      course_providers: { name: string | null; name_ar: string | null } | null
    } | null
  }

  return (data ?? []).map((r) => {
    const row = r as unknown as Row
    return {
      id: row.id,
      status: row.status,
      appliedAt: row.applied_at,
      updatedAt: row.updated_at,
      opportunityId: row.opportunity_id,
      role: row.opportunities?.title ?? '—',
      roleAr: row.opportunities?.title_ar ?? null,
      company: row.opportunities?.companies?.name ?? row.opportunities?.course_providers?.name ?? '—',
      companyAr: row.opportunities?.companies?.name_ar ?? row.opportunities?.course_providers?.name_ar ?? null,
      type: row.opportunities?.type ?? null,
      location: row.opportunities?.location ?? null,
      locationAr: row.opportunities?.location_ar ?? null,
      duration: row.opportunities?.duration ?? null,
      durationAr: row.opportunities?.duration_ar ?? null,
    }
  })
}

// List applicants to opportunities owned by the current company.
// RLS already restricts visible rows to those belonging to the caller's company,
// so no explicit company filter is needed.
export async function fetchApplicantsForMyCompany(): Promise<CompanyApplicant[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      id, status, applied_at, opportunity_id, user_id,
      users ( name, name_ar, email, avatar_url, role ),
      opportunities ( title, title_ar )
    `)
    .order('applied_at', { ascending: false })

  if (error) throw error

  type Row = {
    id: string
    status: ApplicationStatus
    applied_at: string
    opportunity_id: string
    user_id: string
    users: {
      name: string | null
      name_ar: string | null
      email: string
      avatar_url: string | null
      role: UserRole
    } | null
    opportunities: { title: string; title_ar: string | null } | null
  }

  return (data ?? []).map((r) => {
    const row = r as unknown as Row
    return {
      id: row.id,
      applicantUserId: row.user_id,
      status: row.status,
      appliedAt: row.applied_at,
      name: row.users?.name ?? row.users?.email?.split('@')[0] ?? '—',
      nameAr: row.users?.name_ar ?? null,
      email: row.users?.email ?? '',
      avatarUrl: row.users?.avatar_url ?? null,
      applicantRole: row.users?.role ?? 'student',
      opportunityId: row.opportunity_id,
      opportunityTitle: row.opportunities?.title ?? '—',
      opportunityTitleAr: row.opportunities?.title_ar ?? null,
    }
  })
}
