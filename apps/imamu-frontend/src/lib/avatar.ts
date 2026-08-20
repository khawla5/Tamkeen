import { supabase } from '@/lib/supabase'

const BUCKET = 'avatars'
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export class AvatarError extends Error {
  code: 'too_large' | 'wrong_type' | 'upload_failed' | 'save_failed'
  constructor(code: AvatarError['code'], message: string) {
    super(message)
    this.code = code
  }
}

// Detect if an avatar value is a URL (vs an emoji / single char).
export function isAvatarUrl(value: string | null | undefined): boolean {
  if (!value) return false
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return true
  return false
}

// Derive up to two initials from a display name. Spread-iterates so Arabic
// and surrogate-pair characters are handled as whole glyphs. Takes the first
// letter of the first and last words (e.g. "أحمد العمري" → "أع",
// "Sara Al-Otaibi" → "SA").
export function getInitials(name: string | null | undefined): string {
  if (!name) return ''
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = [...words[0]][0] ?? ''
  const second = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + second).toUpperCase()
}

export function validateAvatarFile(file: File): void {
  if (!ALLOWED.includes(file.type)) {
    throw new AvatarError('wrong_type', `Unsupported file type: ${file.type}`)
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarError('too_large', 'Image must be 2 MB or less')
  }
}

// Upload to storage + write URL onto users.avatar_url.
// Returns the public URL.
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  validateAvatarFile(file)

  // RLS on the avatars bucket requires the first folder segment to be auth.uid().
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    throw new AvatarError('upload_failed', uploadError.message)
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  // Persist the URL on users.avatar_url
  const { error: saveError } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)

  if (saveError) {
    throw new AvatarError('save_failed', saveError.message)
  }

  return publicUrl
}

// Clear the avatar (remove the URL). Doesn't delete the storage object —
// the bucket lifecycle rules can sweep up orphans separately.
export async function clearAvatar(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ avatar_url: null })
    .eq('id', userId)
  if (error) throw new AvatarError('save_failed', error.message)
}
