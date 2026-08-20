import { useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Globe, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import TamkeenLogo from '@/components/TamkeenLogo'

function smoothScrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }
  return false
}

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t, lang, setLang, isArabic } = useLanguage()
  const isDashboard = location.pathname.startsWith('/dashboard')
  const isLanding = location.pathname === '/'
  const [mobileOpen, setMobileOpen] = useState(false)

  const landingLinks: { label: string; section: string }[] = [
    { label: t('common.home'), section: 'hero' },
    { label: t('common.challenges'), section: 'challenges' },
    { label: t('common.features'), section: 'features' },
    { label: t('common.howItWorks'), section: 'how-it-works' },
    { label: t('common.ecosystem'), section: 'ecosystem' },
    { label: t('common.partnerships'), section: 'partnerships' },
    { label: t('common.demo'), section: 'cta' },
  ]

  const pageLinks = [
    { label: t('common.home'), to: '/' },
    { label: t('common.opportunities'), to: '/opportunities' },
    { label: t('common.skillsRecord'), to: '/skills-record' },
    { label: t('common.careerAssessment'), to: '/assessment' },
  ]

  const toggleLang = () => setLang(lang === 'en' ? 'ar' : 'en')

  const handleSectionClick = useCallback(
    (section: string) => {
      if (isLanding) {
        smoothScrollTo(section)
      } else {
        navigate('/')
        setTimeout(() => smoothScrollTo(section), 100)
      }
      setMobileOpen(false)
    },
    [isLanding, navigate]
  )

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 transition duration-300',
        // Bottom seam now uses a gold-tinted hairline so the navbar carries
        // the heritage thread that runs through the rest of the page.
        isDashboard
          ? 'bg-imamu-dark border-b border-imamu-gold/20 shadow-sm'
          : 'bg-white border-b border-imamu-gold/25 shadow-sm'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <TamkeenLogo variant="full" size="md" darkBg={isDashboard} />
          </Link>

          {/* Desktop Nav — hover lifts to a gold tint so every link feels like
              a heritage hint, and the active-link motion pill is gold-rimmed. */}
          <div className="hidden md:flex items-center gap-0.5">
            {isLanding
              ? landingLinks.map((link) => (
                  <button
                    key={link.section}
                    onClick={() => handleSectionClick(link.section)}
                    className={cn(
                      'relative px-3.5 py-2 rounded-xl text-sm font-medium transition duration-200 cursor-pointer',
                      'text-teal-dark/60 hover:text-imamu-gold-deep hover:bg-imamu-gold/10'
                    )}
                  >
                    {link.label}
                  </button>
                ))
              : pageLinks.map((link) => {
                  const active = location.pathname === link.to
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={cn(
                        'relative px-3.5 py-2 rounded-xl text-sm font-medium transition duration-200',
                        active
                          ? isDashboard
                            ? 'text-imamu-warm-gold'
                            : 'text-imamu-gold-deep'
                          : isDashboard
                            ? 'text-teal-light/70 hover:text-imamu-warm-gold hover:bg-imamu-gold/10'
                            : 'text-teal-dark/55 hover:text-imamu-gold-deep hover:bg-imamu-gold/10'
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className={cn(
                            'absolute inset-0 rounded-xl -z-10 ring-1',
                            isDashboard
                              ? 'bg-imamu-gold/15 ring-imamu-gold/30'
                              : 'bg-imamu-gold/10 ring-imamu-gold/30'
                          )}
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}
                      {link.label}
                    </Link>
                  )
                })}
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              onClick={toggleLang}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition duration-200',
                isDashboard
                  ? 'text-white/50 hover:text-imamu-warm-gold hover:bg-imamu-gold/10'
                  : 'text-teal-dark/50 hover:text-imamu-gold-deep hover:bg-imamu-gold/10'
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              {isArabic ? t('common.switchToEnglish') : t('common.switchToArabic')}
            </button>
            {/* Sign-in stays in the gold family across both states — at rest
                it's a soft gold chip, on hover the gold deepens (richer fill
                + stronger border + warm-gold shadow). Same theme, more
                presence — feels like a champagne button warming up rather
                than morphing into a different button. */}
            <Link
              to="/login"
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold border transition duration-200',
                isDashboard
                  ? 'bg-imamu-gold/10 border-imamu-gold/40 text-imamu-warm-gold hover:bg-imamu-gold/25 hover:border-imamu-gold/70 hover:text-imamu-gold-50 hover:shadow-lg hover:shadow-imamu-gold/25 hover:-translate-y-px active:translate-y-0'
                  : 'bg-imamu-gold/10 border-imamu-gold/45 text-imamu-gold-deep hover:bg-imamu-gold/20 hover:border-imamu-gold/70 hover:text-imamu-gold-deep hover:shadow-lg hover:shadow-imamu-gold/25 hover:-translate-y-px active:translate-y-0'
              )}
            >
              {t('common.signIn')}
            </Link>
            {/* Primary CTA stays navy (action rule) but adds a gold ring on
                hover and a warm-gold shadow lift — gives the heritage hint
                without breaking the navy = action rule. */}
            <Link
              to="/login"
              className="px-5 py-2 rounded-xl text-sm font-bold bg-teal text-white ring-1 ring-transparent hover:bg-teal-deep hover:ring-imamu-gold/50 hover:shadow-lg hover:shadow-imamu-gold/25 hover:-translate-y-px active:translate-y-0 transition duration-200"
            >
              {t('common.getStarted')}
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 rounded-xl hover:bg-teal-50/60 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className={cn('h-5 w-5', isDashboard ? 'text-white' : 'text-teal-dark')} />
            ) : (
              <Menu className={cn('h-5 w-5', isDashboard ? 'text-white' : 'text-teal-dark')} />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={cn(
                'md:hidden overflow-hidden border-t',
                isDashboard ? 'border-white/10' : 'border-teal-50/80'
              )}
            >
              <div className="flex flex-col gap-1 py-4">
                {isLanding
                  ? landingLinks.map((link) => (
                      <button
                        key={link.section}
                        onClick={() => handleSectionClick(link.section)}
                        className={cn(
                          'flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-start',
                          'text-teal-dark/70 hover:bg-teal-50/60 hover:text-teal-dark'
                        )}
                      >
                        {link.label}
                        <ChevronRight className="w-3.5 h-3.5 opacity-30 rtl:rotate-180" />
                      </button>
                    ))
                  : pageLinks.map((link) => (
                      <div key={link.to}>
                        <Link
                          to={link.to}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                            location.pathname === link.to
                              ? 'bg-teal-50/80 text-teal-dark font-semibold'
                              : isDashboard
                                ? 'text-teal-light hover:bg-white/5'
                                : 'text-teal-dark/70 hover:bg-teal-50/60'
                          )}
                        >
                          {link.label}
                          <ChevronRight className="w-3.5 h-3.5 opacity-30 rtl:rotate-180" />
                        </Link>
                      </div>
                    ))}
                <div className="mt-3 px-3 space-y-2.5">
                  <button
                    onClick={toggleLang}
                    className={cn(
                      'flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors',
                      isDashboard
                        ? 'text-white/60 bg-white/[0.06]'
                        : 'text-teal-dark/60 bg-teal-50/60'
                    )}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {isArabic ? t('common.switchToEnglish') : t('common.switchToArabic')}
                  </button>
                  <div className="flex gap-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-semibold border border-teal/20 text-teal-deep hover:bg-teal-50/60 transition-colors"
                    >
                      {t('common.signIn')}
                    </Link>
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-bold bg-teal text-white hover:bg-teal-deep transition-colors"
                    >
                      {t('common.getStarted')}
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  )
}
