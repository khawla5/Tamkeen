import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Menu, Search, X, Briefcase, Brain, FileText, Plus, CheckCircle2, ArrowRight, Inbox, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth, type Role } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import type { Opportunity } from '@/types'
import { cn } from '@/lib/utils'
import UserAvatar from '@/components/shared/UserAvatar'
import CompanyLogo from '@/components/shared/CompanyLogo'
import { fetchActiveOpportunities } from '@/lib/opportunities'
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  subscribeToNotifications, renderNotification, relativeTime,
  type AppNotification,
} from '@/lib/notifications'
import type { NotificationType } from '@/types/database'

interface TopBarProps {
  title: string
  onMenuToggle: () => void
}

const QUICK_LINKS = [
  { label: 'Opportunities', labelAr: 'الفرص', to: '/opportunities', icon: Briefcase },
  { label: 'Skills Record', labelAr: 'السجل المهاري', to: '/skills-record', icon: FileText },
  { label: 'Career Assessment', labelAr: 'تقييم المسار المهني', to: '/assessment', icon: Brain },
]

function getRoleCTA(role: Role | null, isArabic: boolean): { label: string; to: string; icon: LucideIcon } | null {
  switch (role) {
    case 'student':
    case 'employee':
    case 'retiree':
      return { label: isArabic ? 'استكشف الفرص' : 'Explore Opportunities', to: '/opportunities', icon: Briefcase }
    case 'company':
      return { label: isArabic ? 'نشر فرصة' : 'Post Opportunity', to: '/post-opportunity', icon: Plus }
    default:
      return null
  }
}

function notifIcon(type: NotificationType): { Icon: LucideIcon; bg: string } {
  switch (type) {
    case 'application_received':
      return { Icon: UserPlus, bg: 'bg-teal/10 text-teal' }
    case 'application_status_changed':
      return { Icon: CheckCircle2, bg: 'bg-green-500/10 text-green-500' }
    default:
      return { Icon: Inbox, bg: 'bg-info/10 text-info' }
  }
}

export default function TopBar({ title, onMenuToggle }: TopBarProps) {
  const { user, role } = useAuth()
  const { t, isArabic, lang } = useLanguage()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [searchOpportunities, setSearchOpportunities] = useState<Opportunity[]>([])

  // Initial load + realtime subscription, scoped to the signed-in user.
  useEffect(() => {
    if (!user) { setNotifications([]); return }
    let cancelled = false
    fetchNotifications(user.id)
      .then((rows) => { if (!cancelled) setNotifications(rows) })
      .catch(() => { /* silent — notifications are non-critical */ })

    const unsubscribe = subscribeToNotifications(
      user.id,
      (n) => setNotifications((prev) => prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 50)),
      (n) => setNotifications((prev) => prev.map((p) => p.id === n.id ? n : p)),
    )

    return () => { cancelled = true; unsubscribe() }
  }, [user])

  useEffect(() => {
    let cancelled = false
    fetchActiveOpportunities()
      .then((rows) => { if (!cancelled) setSearchOpportunities(rows) })
      .catch(() => { /* keep quick links available if opportunity search fails */ })
    return () => { cancelled = true }
  }, [])

  // Close notifications dropdown on click outside
  useEffect(() => {
    if (!notifOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  async function handleNotifClick(n: AppNotification) {
    if (!n.readAt) {
      // Optimistic: flip read locally; the realtime UPDATE will reconcile.
      setNotifications((prev) => prev.map((p) => p.id === n.id ? { ...p, readAt: new Date().toISOString() } : p))
      try { await markNotificationRead(n.id) } catch { /* ignore */ }
    }
    setNotifOpen(false)
    if (n.link) navigate(n.link)
  }

  async function handleMarkAllRead() {
    if (!user) return
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((p) => p.readAt ? p : { ...p, readAt: now }))
    try { await markAllNotificationsRead(user.id) } catch { /* ignore */ }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12
    ? (isArabic ? 'صباح الخير' : 'Good morning')
    : hour < 18
      ? (isArabic ? 'مساء الخير' : 'Good afternoon')
      : (isArabic ? 'مساء الخير' : 'Good evening')
  const firstName = isArabic
    ? (user?.nameAr?.split(' ')[0] ?? '')
    : (user?.name?.split(' ')[0] ?? '')

  const roleCTA = getRoleCTA(role, isArabic)
  const unreadCount = notifications.filter((n) => !n.readAt).length

  // Keyboard shortcut: press / to open search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '/' && !searchOpen && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [searchOpen])

  useEffect(() => {
    if (searchOpen && inputRef.current) inputRef.current.focus()
  }, [searchOpen])

  const q = query.toLowerCase()
  const filteredOpps = q ? searchOpportunities.filter(o =>
    o.title.toLowerCase().includes(q) ||
    o.company.toLowerCase().includes(q) ||
    o.skills.some(s => s.toLowerCase().includes(q)) ||
    (o.titleAr?.includes(query) ?? false)
  ).slice(0, 5) : []

  const filteredLinks = q ? QUICK_LINKS.filter(l =>
    l.label.toLowerCase().includes(q) || l.labelAr.includes(query)
  ) : QUICK_LINKS

  function goTo(path: string) {
    setSearchOpen(false)
    setQuery('')
    navigate(path)
  }

  return (
    <>
      <header
        className="relative h-[68px] bg-gradient-to-r from-imamu-ice via-[#F0EBD9] to-imamu-ice border-b border-imamu-navy/15 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuToggle}
            className="p-2 -ms-2 rounded-xl hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            aria-label={isArabic ? 'فتح القائمة' : 'Open menu'}
          >
            <Menu className="w-5 h-5 text-[#5A7D82]" />
          </button>
          <div className="min-w-0">
            {user && role !== 'university' && (
              <p className="text-[11px] text-[#6B8289] font-medium leading-tight hidden sm:flex items-center gap-1">
                <span>
                  {isArabic
                    ? `${greeting}${firstName ? ` ${firstName}` : ''}، جاهز لفرص اليوم؟`
                    : `${greeting}${firstName ? `, ${firstName}` : ''} — ready for today's opportunities?`}
                </span>
              </p>
            )}
            <h1 className="font-display text-[17px] sm:text-lg font-semibold text-teal-dark tracking-tight truncate leading-tight mt-0.5">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#D4E5E8] text-sm text-[#8B9DA2] hover:border-imamu-navy/40 focus:border-imamu-navy transition duration-200 min-w-[180px]"
            aria-label={t('common.search') || 'Search'}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-[13px]">{t('common.search') || 'Search'}...</span>
            <kbd className="ms-auto text-[10px] font-mono bg-[#DFE7F4] border border-[#D4E5E8] rounded px-1.5 py-0.5 text-[#8B9DA2] hidden lg:inline">/</kbd>
          </button>

          {/* Mobile search */}
          <button onClick={() => setSearchOpen(true)} className="sm:hidden p-2 rounded-xl hover:bg-white transition-colors" aria-label="Search">
            <Search className="w-5 h-5 text-[#5A7D82]" />
          </button>

          {/* Role-aware quick action CTA */}
          {roleCTA && (
            <Link
              to={roleCTA.to}
              className="hidden md:inline-flex items-center gap-2 bg-teal text-white font-semibold text-[13px] px-4 py-2 rounded-xl shadow-[0_2px_12px_rgba(4,93,132,0.25)] hover:bg-teal-deep hover:shadow-[0_4px_18px_rgba(4,93,132,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition duration-200"
            >
              <roleCTA.icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{roleCTA.label}</span>
            </Link>
          )}

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className={cn(
                'relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
                notifOpen ? 'bg-white' : 'hover:bg-white',
              )}
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px] text-[#5A7D82]" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 end-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-terra ring-2 ring-[#DFE7F4] text-[9px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute end-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 overflow-hidden z-40"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                    <div>
                      <p className="font-display font-bold text-teal-dark text-sm">
                        {isArabic ? 'الإشعارات' : 'Notifications'}
                      </p>
                      {unreadCount > 0 && (
                        <p className="text-[11px] text-muted mt-0.5">
                          {isArabic ? `${unreadCount} غير مقروءة` : `${unreadCount} unread`}
                        </p>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-teal hover:text-teal-deep transition-colors"
                      >
                        {isArabic ? 'تحديد الكل كمقروء' : 'Mark all read'}
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-5 py-10 text-center">
                        <Inbox className="w-7 h-7 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                        <p className="text-[12px] text-muted">
                          {isArabic ? 'لا توجد إشعارات بعد' : "You're all caught up"}
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const { Icon, bg } = notifIcon(n.type)
                        const { title, body } = renderNotification(n, lang as 'en' | 'ar')
                        const unread = !n.readAt
                        return (
                          <button
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className={cn(
                              'w-full flex items-start gap-3 px-5 py-3 text-start hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                              unread && 'bg-teal/[0.02]',
                            )}
                          >
                            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                              <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] font-semibold text-teal-dark leading-snug">
                                  {title}
                                </p>
                                {unread && <span className="w-1.5 h-1.5 rounded-full bg-teal mt-1.5 shrink-0" aria-hidden="true" />}
                              </div>
                              {body && (
                                <p className="text-[12px] text-muted truncate mt-0.5">{body}</p>
                              )}
                              <p className="text-[10px] text-gray-400 mt-1">
                                {relativeTime(n.createdAt, lang as 'en' | 'ar')}
                              </p>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <button
                      onClick={() => { setNotifOpen(false); navigate(role === 'company' ? '/dashboard/company' : role === 'provider' ? '/dashboard/provider' : '/opportunities') }}
                      className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-semibold text-teal hover:bg-teal/[0.04] transition-colors border-t border-gray-100"
                    >
                      {isArabic ? 'فتح لوحة التحكم' : 'Open dashboard'}
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {user && (
            <button
              className="group hidden sm:flex items-center gap-3 ms-1 ps-3 py-1 pe-2 rounded-xl border-s border-[#D4E5E8] hover:bg-white/80 transition duration-200"
              aria-label={isArabic ? user.nameAr : user.name}
            >
              {/* Avatar (image when uploaded, navy initials circle otherwise) + online dot */}
              <div className="relative shrink-0">
                <UserAvatar avatar={user.avatar} size="md" alt={isArabic ? user.nameAr : user.name} className="border border-teal/20 shadow-sm group-hover:shadow-md group-hover:border-imamu-navy/40 transition" />
                <span className="absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-[#DFE7F4]" />
              </div>

              {/* Name + role */}
              <div className="min-w-0 hidden lg:block leading-tight text-start">
                <p className="text-[13px] font-semibold text-teal-dark truncate max-w-[140px]">
                  {isArabic ? user.nameAr : user.name}
                </p>
                {role && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-imamu-navy" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-imamu-navy/70 truncate max-w-[130px]">
                      {t(`common.${role}`)}
                    </p>
                  </div>
                )}
              </div>
            </button>
          )}
        </div>
      </header>

      {/* Search Modal */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[10vh] px-4"
            onClick={() => { setSearchOpen(false); setQuery('') }}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <Search className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={isArabic ? 'ابحث عن فرص، شركات، مهارات...' : 'Search opportunities, companies, skills...'}
                  className="flex-1 text-[15px] text-teal-dark placeholder:text-gray-300 focus:outline-none bg-transparent"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd className="text-[10px] font-mono bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[50vh] overflow-y-auto p-2">
                {/* Quick links */}
                {filteredLinks.length > 0 && (
                  <div className="px-3 pt-2 pb-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {isArabic ? 'روابط سريعة' : 'Quick Links'}
                    </p>
                    {filteredLinks.map(link => (
                      <button
                        key={link.to}
                        onClick={() => goTo(link.to)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-teal-dark hover:bg-imamu-navy/10 hover:text-imamu-navy transition-colors text-start"
                      >
                        <link.icon className="w-4 h-4 text-imamu-navy shrink-0" />
                        {isArabic ? link.labelAr : link.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Opportunity results */}
                {filteredOpps.length > 0 && (
                  <div className="px-3 pt-3 pb-1 border-t border-gray-100 mt-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {isArabic ? 'فرص' : 'Opportunities'}
                    </p>
                    {filteredOpps.map(opp => (
                      <button
                        key={opp.id}
                        onClick={() => goTo('/opportunities?q=' + encodeURIComponent(opp.title))}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-start hover:bg-teal-50/60 transition-colors"
                      >
                        <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-8 h-8 rounded-lg text-[11px]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-teal-dark truncate">{isArabic ? opp.titleAr ?? opp.title : opp.title}</p>
                          <p className="text-xs text-muted truncate">{isArabic ? opp.companyAr ?? opp.company : opp.company}</p>
                        </div>
                        <span className="text-xs font-bold text-teal shrink-0">{opp.matchScore}%</span>
                      </button>
                    ))}
                  </div>
                )}

                {q && filteredOpps.length === 0 && filteredLinks.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted">{isArabic ? 'لا توجد نتائج' : 'No results found'}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
