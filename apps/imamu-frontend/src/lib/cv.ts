import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export interface CvPersonal {
  nameEn: string
  nameAr: string
  email: string
  phone: string
  city: string
  linkedin: string
  summary: string
}

export interface CvEducation {
  school: string
  degree: string
  years: string
  gpa: string
}

export interface CvExperience {
  title: string
  company: string
  period: string
  description: string
}

export interface CvSkill {
  name: string
  level: number
}

export interface CvSnapshot {
  personal: CvPersonal
  education: CvEducation[]
  experience: CvExperience[]
  skills: CvSkill[]
  languages: string[]
  templateId: string | null
}

export const EMPTY_CV: CvSnapshot = {
  personal: { nameEn: '', nameAr: '', email: '', phone: '', city: '', linkedin: '', summary: '' },
  education: [],
  experience: [],
  skills: [],
  languages: ['Arabic (Native)', 'English (Fluent)'],
  templateId: null,
}

interface CvRow {
  user_id: string
  template_id: string | null
  personal: unknown
  education: unknown
  experience: unknown
  skills: unknown
  languages: unknown
  cv_file_url: string | null
  updated_at: string
}

// Load the current user's CV. Returns null if no row exists yet.
export async function fetchMyCv(userId: string): Promise<CvSnapshot | null> {
  const { data, error } = await supabase
    .from('cv_data')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<CvRow>()

  if (error) throw error
  if (!data) return null

  return {
    personal: (data.personal as CvPersonal | null) ?? EMPTY_CV.personal,
    education: (data.education as CvEducation[] | null) ?? [],
    experience: (data.experience as CvExperience[] | null) ?? [],
    skills: (data.skills as CvSkill[] | null) ?? [],
    languages: (data.languages as string[] | null) ?? EMPTY_CV.languages,
    templateId: data.template_id,
  }
}

// Upsert (insert or replace) the current user's CV.
export async function saveMyCv(userId: string, snapshot: CvSnapshot): Promise<void> {
  const payload = {
    user_id: userId,
    template_id: snapshot.templateId,
    personal: snapshot.personal as unknown as Json,
    education: snapshot.education as unknown as Json,
    experience: snapshot.experience as unknown as Json,
    skills: snapshot.skills as unknown as Json,
    languages: snapshot.languages,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('cv_data')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw error
}
