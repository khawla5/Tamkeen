import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth, roleRoutes } from '@/context/AuthContext'
import { useLanguage } from '@/i18n/context'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import OnboardingModal from '@/components/onboarding/OnboardingModal'

const routeTitles: Record<string, string> = {
  '/assessment': 'common.careerAssessment',
  '/careers': 'common.careerPaths',
  '/skills-record': 'common.skillsRecord',
  '/training-path': 'common.trainingPath',
  '/alumni': 'common.alumni',
  '/cv-builder': 'common.cvBuilder',
  '/interview-prep': 'common.interviewPrep',
  '/opportunities': 'common.opportunities',
  '/applications': 'applications.title',
  '/profile': 'common.profile',
  '/dashboard/student': 'dashboard.dashboard',
  '/dashboard/retiree': 'dashboard.dashboard',
  '/dashboard/employee': 'dashboard.dashboard',
  '/dashboard/company': 'dashboard.companyDashboard',
  '/post-opportunity': 'dashboard.postOpportunity',
  '/dashboard/university': 'dashboard.dashboard',
  '/dashboard/provider': 'dashboard.dashboard',
}

export default function ProtectedLayout() {
  const { isSignedIn, role, user, loading, assessmentCompleted } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Wait for the initial supabase.auth.getSession() round-trip before
  // redirecting — otherwise a hard reload briefly looks "signed out" and
  // bounces the user to /login.
  useEffect(() => {
    if (loading) return
    if (!isSignedIn) {
      navigate('/login', { replace: true })
    }
  }, [loading, isSignedIn, navigate])

  useEffect(() => {
    if (!role) return

    // Hard gate: students must finish the career assessment before they can
    // do anything else. Wait for the flag to load (null) before deciding.
    if (role === 'student' && assessmentCompleted === false && location.pathname !== '/assessment') {
      navigate('/assessment', { replace: true })
      return
    }

    const allowed = roleRoutes[role]
    const path = location.pathname
    // Match exact paths OR prefix routes (e.g. "/career" allows "/career/data_science_ai")
    const isAllowed = allowed.some((r) => path === r || path.startsWith(r + '/'))
    if (!isAllowed) {
      navigate(allowed[0], { replace: true })
    }
  }, [role, assessmentCompleted, location.pathname, navigate])

  // Splash while the session is still hydrating — keeps the user on this
  // route instead of flashing /login.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-imamu-dark">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-imamu-gold" />
      </div>
    )
  }

  if (!isSignedIn || !role) return null

  const titleKey = routeTitles[location.pathname] ?? 'dashboard.dashboard'
  const pageTitle = t(titleKey)

  return (
    <div
      className="relative flex min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--color-imamu-dark) 0%, #063e58 50%, var(--color-imamu-dark) 100%)' }}
    >
      <div
        className="pointer-events-none fixed -top-40 -end-40 w-[600px] h-[600px] rounded-full blur-[140px]"
        style={{ background: 'rgba(153, 130, 63, 0.22)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-1/2 start-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[120px]"
        style={{ background: 'rgba(183, 163, 98, 0.14)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -bottom-40 -start-40 w-[500px] h-[500px] rounded-full blur-[140px]"
        style={{ background: 'rgba(4, 93, 132, 0.32)' }}
        aria-hidden="true"
      />

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="relative flex-1 flex flex-col min-h-screen">
        <TopBar title={pageTitle} onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* First-login welcome wizard. Renders only until users.onboarded_at is set. */}
      <AnimatePresence>
        {user && !user.onboardedAt && <OnboardingModal />}
      </AnimatePresence>
    </div>
  )
}
