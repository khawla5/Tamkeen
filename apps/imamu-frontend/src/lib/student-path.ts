import { supabase } from '@/lib/supabase'

// Look up a career_paths.id (uuid) by slug.
export async function careerPathIdFromSlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('career_paths')
    .select('id')
    .eq('slug', slug)
    .maybeSingle<{ id: string }>()
  if (error) return null
  return data?.id ?? null
}

// Set the student's recommended career path. Accepts either a slug or a uuid.
export async function setRecommendedCareer(userId: string, slugOrId: string): Promise<void> {
  // If it doesn't look like a uuid, treat as a slug and resolve.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
  const id = isUuid ? slugOrId : await careerPathIdFromSlug(slugOrId)
  if (!id) throw new Error(`Career path not found: ${slugOrId}`)

  const { error } = await supabase
    .from('student_profiles')
    .update({ recommended_career_path_id: id })
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

// Read the student's recommended career path slug (or null).
export async function fetchRecommendedCareerSlug(userId: string): Promise<string | null> {
  const { data: profile, error: pErr } = await supabase
    .from('student_profiles')
    .select('recommended_career_path_id')
    .eq('user_id', userId)
    .maybeSingle<{ recommended_career_path_id: string | null }>()

  if (pErr || !profile?.recommended_career_path_id) return null

  const { data: path } = await supabase
    .from('career_paths')
    .select('slug')
    .eq('id', profile.recommended_career_path_id)
    .maybeSingle<{ slug: string | null }>()

  return path?.slug ?? null
}
