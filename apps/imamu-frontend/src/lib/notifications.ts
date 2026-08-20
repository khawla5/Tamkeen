import { supabase } from '@/lib/supabase'
import type {
  NotificationRow,
  NotificationType,
  NotificationMetadata,
  ApplicationStatus,
} from '@/types/database'

export interface AppNotification {
  id: string
  type: NotificationType
  metadata: NotificationMetadata
  link: string | null
  readAt: string | null
  createdAt: string
}

function mapRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    metadata: row.metadata ?? {},
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

const PAGE_SIZE = 20

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, metadata, link, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as NotificationRow))
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
}

// Realtime subscription. Returns an unsubscribe function.
// `onInsert` fires for new rows; the caller should prepend to its list.
// `onUpdate` fires for changes (mainly read_at flips); caller should patch.
export function subscribeToNotifications(
  userId: string,
  onInsert: (n: AppNotification) => void,
  onUpdate: (n: AppNotification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(mapRow(payload.new as NotificationRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onUpdate(mapRow(payload.new as NotificationRow)),
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

// Render-friendly title/body for a notification, in the active language.
// Kept here (not in i18n keys) so it can interpolate metadata fields cleanly.
export function renderNotification(
  n: AppNotification,
  lang: 'en' | 'ar',
): { title: string; body: string } {
  const m = n.metadata
  const ar = lang === 'ar'

  if (n.type === 'application_received') {
    const title = ar
      ? 'تقديم جديد على فرصتك'
      : 'New application received'
    const opp = (ar ? m.opportunity_title_ar : m.opportunity_title) ?? m.opportunity_title ?? '—'
    const who = (ar ? m.applicant_name_ar : m.applicant_name) ?? m.applicant_name ?? (ar ? 'مرشح' : 'A candidate')
    const body = ar ? `${who} · ${opp}` : `${who} · ${opp}`
    return { title, body }
  }

  if (n.type === 'application_status_changed') {
    const status = m.new_status ?? 'submitted'
    const title = ar ? statusTitleAr(status) : statusTitleEn(status)
    const opp = (ar ? m.opportunity_title_ar : m.opportunity_title) ?? m.opportunity_title ?? '—'
    const company = (ar ? m.company_name_ar : m.company_name) ?? m.company_name ?? ''
    const body = company ? `${company} · ${opp}` : opp
    return { title, body }
  }

  return { title: n.type, body: '' }
}

function statusTitleEn(s: ApplicationStatus): string {
  switch (s) {
    case 'reviewed':           return 'Application reviewed'
    case 'shortlisted':        return 'You were shortlisted'
    case 'accepted':           return 'Application accepted'
    case 'rejected':           return 'Application not selected'
    case 'cv_update_required': return 'CV update requested'
    default:                   return 'Application updated'
  }
}

function statusTitleAr(s: ApplicationStatus): string {
  switch (s) {
    case 'reviewed':           return 'تمت مراجعة طلبك'
    case 'shortlisted':        return 'تم إدراجك في القائمة المختصرة'
    case 'accepted':           return 'تم قبول طلبك'
    case 'rejected':           return 'لم يتم اختيارك هذه المرة'
    case 'cv_update_required': return 'مطلوب تحديث السيرة الذاتية'
    default:                   return 'تحديث على طلبك'
  }
}

// Lightweight relative time. We avoid pulling a date library just for this.
export function relativeTime(iso: string, lang: 'en' | 'ar'): string {
  const ar = lang === 'ar'
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.max(1, Math.round(diffMs / 1000))
  if (sec < 60)   return ar ? 'الآن' : 'just now'
  const min = Math.round(sec / 60)
  if (min < 60)   return ar ? `قبل ${min} د` : `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24)    return ar ? `قبل ${hr} س` : `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 7)      return ar ? `قبل ${d} ي` : `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 5)      return ar ? `قبل ${w} أ` : `${w}w ago`
  const mo = Math.round(d / 30)
  return ar ? `قبل ${mo} ش` : `${mo}mo ago`
}
