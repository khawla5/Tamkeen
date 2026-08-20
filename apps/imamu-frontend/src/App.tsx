import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import PublicLayout from '@/components/layout/PublicLayout'
import ProtectedLayout from '@/components/layout/ProtectedLayout'
import NavigationProgress from '@/components/layout/NavigationProgress'

const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/Login'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Opportunities = lazy(() => import('@/pages/Opportunities'))
const OpportunityDetail = lazy(() => import('@/pages/OpportunityDetail'))
const SkillsRecord = lazy(() => import('@/pages/SkillsRecord'))
const CareerAssessment = lazy(() => import('@/pages/CareerAssessment'))
const CareerDetail = lazy(() => import('@/pages/CareerDetail'))
const CareerPaths = lazy(() => import('@/pages/CareerPaths'))
const Profile = lazy(() => import('@/pages/Profile'))
const InterviewPrep = lazy(() => import('@/pages/InterviewPrep'))
const MyApplications = lazy(() => import('@/pages/MyApplications'))
const TrainingPath = lazy(() => import('@/pages/TrainingPath'))
const Alumni = lazy(() => import('@/pages/Alumni'))
const StudentDashboard = lazy(() => import('@/pages/dashboards/StudentDashboard'))
const CompanyDashboard = lazy(() => import('@/pages/dashboards/CompanyDashboard'))
const PostOpportunity = lazy(() => import('@/pages/PostOpportunity'))
const UniversityDashboard = lazy(() => import('@/pages/dashboards/UniversityDashboard'))
const CourseProviderDashboard = lazy(() => import('@/pages/dashboards/CourseProviderDashboard'))

function RouteFallback() {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center"
      style={{
        background:
          'linear-gradient(135deg, var(--color-imamu-ice) 0%, var(--color-imamu-navy-50) 50%, #ffffff 100%)',
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-imamu-navy-50" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-imamu-navy border-r-imamu-gold animate-spin" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-imamu-gold-deep">
          Tamkeen
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <NavigationProgress />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public routes — navbar + footer */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Login />} />
          </Route>

          {/* Auth flows — no layout */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected routes — sidebar layout */}
          <Route element={<ProtectedLayout />}>
            <Route path="/assessment" element={<CareerAssessment />} />
            <Route path="/careers" element={<CareerPaths />} />
            <Route path="/career/:slug" element={<CareerDetail />} />
            <Route path="/skills-record" element={<SkillsRecord />} />
            {/* Legacy CV builder URL — redirects users with old bookmarks */}
            <Route path="/cv-builder" element={<Navigate to="/skills-record" replace />} />
            <Route path="/training-path" element={<TrainingPath />} />
            <Route path="/alumni" element={<Alumni />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/opportunities/:id" element={<OpportunityDetail />} />
            <Route path="/applications" element={<MyApplications />} />
            <Route path="/interview-prep" element={<InterviewPrep />} />
            <Route path="/dashboard/student" element={<StudentDashboard />} />
            {/* Retiree + Employee dashboards: HIDDEN in Tamkeen UI but kept in
                the codebase for future re-enable. Anyone with that role lands
                on the student dashboard's empty state for now. */}
            <Route path="/dashboard/retiree" element={<Navigate to="/" replace />} />
            <Route path="/dashboard/employee" element={<Navigate to="/" replace />} />
            <Route path="/dashboard/company" element={<CompanyDashboard />} />
            <Route path="/post-opportunity" element={<PostOpportunity />} />
            <Route path="/post-opportunity/:id" element={<PostOpportunity />} />
            <Route path="/dashboard/university" element={<UniversityDashboard />} />
            <Route path="/dashboard/provider" element={<CourseProviderDashboard />} />
          </Route>
        </Routes>
      </Suspense>
    </TooltipProvider>
  )
}
