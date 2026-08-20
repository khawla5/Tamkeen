import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { UserRow } from '@/types/database'
import type { CareerAnalysis } from '@/lib/career-analysis'

// 'retiree' and 'employee' are HIDDEN from the Tamkeen UI but kept in the union
// type because the database constraint and migrations still allow them. They
// must remain a valid runtime value so existing rows continue to load.
export type Role = 'student' | 'retiree' | 'employee' | 'company' | 'university' | 'provider'

// Frontend-shaped user. Kept the DemoUser name as an alias so older imports keep working.
export interface AppUser {
  id: string
  name: string
  nameAr: string
  email: string
  role: Role
  avatar: string
  subtitle: string
  subtitleAr: string
  onboardedAt: string | null
}
export type DemoUser = AppUser

export interface SignUpInput {
  email: string
  password: string
  role: Role
  name?: string
  nameAr?: string
  roleFields?: Record<string, string>
}

interface AuthContextType {
  user: AppUser | null
  role: Role | null
  isSignedIn: boolean
  loading: boolean
  // null while the value hasn't been fetched yet (or N/A for non-students),
  // true/false once known. The route guard in ProtectedLayout watches this.
  assessmentCompleted: boolean | null
  // Cached career-assessment artefacts so /careers can render instantly on
  // every visit. null = not loaded yet, undefined-as-never; an empty result
  // (assessment not taken) is represented by `savedAnalysis: null` AFTER
  // the loadProfile pass has completed.
  savedAnalysis: CareerAnalysis | null
  savedAnswers: number[] | null
  signUp: (input: SignUpInput) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>      // re-fetches the public.users row
  markOnboarded: () => Promise<void>    // stamps users.onboarded_at = now()
  setAssessmentCompleted: (v: boolean) => void   // optimistic local flip
  setSavedAnalysis: (a: CareerAnalysis | null) => void
}

const roleAvatars: Record<Role, string> = {
  student: '',
  retiree: '',
  employee: '',
  company: '',
  university: '',
  provider: '',
}

function rowToAppUser(row: UserRow): AppUser {
  const localPart = row.email.split('@')[0]
  return {
    id: row.id,
    name: row.name ?? localPart,
    nameAr: row.name_ar ?? row.name ?? localPart,
    email: row.email,
    role: row.role,
    avatar: row.avatar_url ?? roleAvatars[row.role],
    subtitle: row.subtitle ?? '',
    subtitleAr: row.subtitle_ar ?? row.subtitle ?? '',
    onboardedAt: row.onboarded_at ?? null,
  }
}

// Where to land each role after sign-in/sign-up. For students this is decided
// dynamically based on whether they've finished the career assessment.
const roleEntryRoutes: Record<Role, string> = {
  student: '/dashboard/student',
  // Retiree + Employee dashboards are hidden in Tamkeen — drop them on the
  // landing page until those roles get re-enabled.
  retiree: '/',
  company: '/dashboard/company',
  employee: '/',
  university: '/dashboard/university',
  provider: '/dashboard/provider',
}

async function studentEntryRoute(userId: string): Promise<string> {
  // First-time students get pushed straight into the assessment so the rest
  // of the experience is grounded in their Holland code from day one.
  try {
    const { data } = await supabase
      .from('student_profiles')
      .select('assessment_completed')
      .eq('user_id', userId)
      .maybeSingle<{ assessment_completed: boolean }>()
    return data?.assessment_completed ? '/dashboard/student' : '/assessment'
  } catch {
    return '/assessment'
  }
}

export const roleRoutes: Record<Role, string[]> = {
  student: ['/assessment', '/careers', '/career', '/skills-record', '/cv-builder', '/training-path', '/alumni', '/opportunities', '/applications', '/interview-prep', '/dashboard/student', '/profile'],
  retiree: ['/opportunities', '/applications', '/profile'],
  employee: ['/opportunities', '/applications', '/profile'],
  company: ['/dashboard/company', '/post-opportunity', '/profile'],
  university: ['/dashboard/university', '/alumni', '/profile'],
  provider: ['/dashboard/provider', '/post-opportunity', '/profile'],
}

async function entryRouteFor(role: Role, userId: string): Promise<string> {
  return role === 'student' ? studentEntryRoute(userId) : roleEntryRoutes[role]
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [assessmentCompleted, setAssessmentCompleted] = useState<boolean | null>(null)
  const [savedAnalysis, setSavedAnalysis] = useState<CareerAnalysis | null>(null)
  const [savedAnswers, setSavedAnswers] = useState<number[] | null>(null)
  // Track which user ID we've already loaded so duplicate auth events
  // (SIGNED_IN re-fired on tab focus, etc.) don't trigger a redundant
  // loadProfile and break downstream effects with a fresh user reference.
  const lastLoadedIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (authId: string): Promise<AppUser | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .maybeSingle()

    if (error) {
      console.error('[auth] failed to load profile', error)
      return null
    }
    if (!data) return null

    lastLoadedIdRef.current = authId
    const u = rowToAppUser(data)
    setUser(u)

    // For students, also pull the assessment-completion flag and the saved
    // analysis in parallel — caching the analysis here means /careers can
    // render its result panel instantly on every visit (no per-mount fetch).
    if (u.role === 'student') {
      const [profileRes, assessmentRes] = await Promise.all([
        supabase
          .from('student_profiles')
          .select('assessment_completed')
          .eq('user_id', u.id)
          .maybeSingle<{ assessment_completed: boolean }>(),
        supabase
          .from('assessment_responses')
          .select('ai_analysis, answers')
          .eq('user_id', u.id)
          .maybeSingle<{
            ai_analysis: CareerAnalysis | null
            answers: { raw?: number[] } | null
          }>(),
      ])

      if (profileRes.error) {
        // Transient query failure — keep whatever flag we already have so a
        // brief network blip doesn't bounce a completed student to /assessment.
        console.warn('[auth] student_profiles fetch failed, keeping existing flag', profileRes.error)
      } else {
        setAssessmentCompleted(profileRes.data?.assessment_completed ?? false)
      }

      if (!assessmentRes.error) {
        setSavedAnalysis(assessmentRes.data?.ai_analysis ?? null)
        setSavedAnswers(assessmentRes.data?.answers?.raw ?? null)
      } else {
        console.warn('[auth] assessment fetch failed, keeping cached analysis', assessmentRes.error)
      }
    } else {
      // Other roles don't take the assessment — treat as N/A.
      setAssessmentCompleted(true)
    }

    return u
  }, [])

  // Initial session + subscribe to changes.
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        loadProfile(session.user.id).finally(() => {
          if (!cancelled) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION + TOKEN_REFRESHED fire on tab refocus / token rotation.
      // The user identity hasn't changed in either case — skip the refetch so
      // we don't bounce a completed student to /assessment on a transient
      // student_profiles query.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return

      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null)
        setAssessmentCompleted(null)
        setSavedAnalysis(null)
        setSavedAnswers(null)
        lastLoadedIdRef.current = null
        return
      }

      // For any other event (SIGNED_IN re-emitted on session rehydrate,
      // USER_UPDATED, etc.) — only reload if the user actually changed.
      // Same user → keep existing state, avoid the cascade of re-renders.
      if (session.user.id !== lastLoadedIdRef.current) {
        loadProfile(session.user.id)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback(async (input: SignUpInput) => {
    const { email, password, role, name, nameAr, roleFields } = input
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, name, name_ar: nameAr, role_fields: roleFields ?? {} },
      },
    })
    if (error) return { error: error.message }

    // If email confirmation is OFF in Supabase Auth settings, we'll have a session here
    // and the trigger has already created public.users. Load it and redirect.
    if (data.session && data.user) {
      const u = await loadProfile(data.user.id)
      if (u) navigate(await entryRouteFor(u.role, u.id))
    }

    return { error: null }
  }, [loadProfile, navigate])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      const u = await loadProfile(data.user.id)
      if (u) navigate(await entryRouteFor(u.role, u.id))
    }
    return { error: null }
  }, [loadProfile, navigate])

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user.id)
  }, [loadProfile])

  const markOnboarded = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    // Optimistic local update so the modal closes immediately even if the
    // round-trip is slow.
    setUser((prev) => prev ? { ...prev, onboardedAt: new Date().toISOString() } : prev)
    const { error } = await supabase
      .from('users')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', uid)
    if (error) console.error('[auth] failed to mark onboarded', error)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setAssessmentCompleted(null)
    setSavedAnalysis(null)
    setSavedAnswers(null)
    lastLoadedIdRef.current = null
    navigate('/')
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isSignedIn: user !== null,
        loading,
        assessmentCompleted,
        savedAnalysis,
        savedAnswers,
        signUp,
        signIn,
        signOut,
        refreshUser,
        markOnboarded,
        setAssessmentCompleted,
        setSavedAnalysis,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
