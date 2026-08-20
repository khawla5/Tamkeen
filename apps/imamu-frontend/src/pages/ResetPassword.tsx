import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock,
} from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { cn } from '@/lib/utils'
import { FieldError } from '@/components/ui/FieldError'
import { ResetPasswordSchema, flattenErrors, type FieldErrors } from '@/lib/validation'
import { supabase } from '@/lib/supabase'

type LinkState = 'checking' | 'valid' | 'invalid'

export default function ResetPassword() {
  const { isArabic, lang, setLang, t } = useLanguage()
  const navigate = useNavigate()
  const [linkState, setLinkState] = useState<LinkState>('checking')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const idA = useId()
  const idB = useId()

  // When the user lands here from the email, supabase-js auto-detects the
  // recovery token in the URL and creates a temporary "recovery" session.
  // We just listen for the PASSWORD_RECOVERY event and unblock the form.
  useEffect(() => {
    let cancelled = false
    let resolved = false

    // Subscribe first so we don't miss the event
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        resolved = true
        if (!cancelled) setLinkState('valid')
      }
    })

    // Also check the existing session in case the event already fired
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || resolved) return
      // If there's any active session, treat the link as valid (recovery
      // tokens get auto-exchanged into a session by detectSessionInUrl).
      if (session) {
        setLinkState('valid')
      } else {
        // Give the URL detection a moment to fire, then mark invalid.
        setTimeout(() => { if (!cancelled && !resolved) setLinkState('invalid') }, 1500)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = ResetPasswordSchema.safeParse({ newPassword, confirmPassword })
    if (!parsed.success) {
      setErrors(flattenErrors(parsed.error))
      return
    }
    setErrors({})

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword })
    setSubmitting(false)

    if (error) {
      setSubmitError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => navigate('/'), 2000) // back to landing after success
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafbfc] px-4 py-10">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="text-xs font-semibold text-teal-dark/60 hover:text-teal-dark px-3 py-1.5 rounded-lg bg-teal-50 transition-colors"
          >
            {isArabic ? t('common.switchToEnglish') : t('common.switchToArabic')}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/40 border border-gray-100 p-7 sm:p-9">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-2xl bg-teal/10 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-teal" />
            </div>
          </div>

          {linkState === 'checking' && (
            <div className="text-center py-6">
              <Loader2 className="w-7 h-7 animate-spin text-teal/40 mx-auto mb-3" />
              <p className="text-sm text-muted">
                {isArabic ? 'جارٍ التحقّق من الرابط...' : 'Verifying your link…'}
              </p>
            </div>
          )}

          {linkState === 'invalid' && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h1 className="font-display text-xl font-bold text-teal-dark mb-2">
                {isArabic ? 'الرابط غير صالح أو منتهي' : 'Link expired or invalid'}
              </h1>
              <p className="text-sm text-muted mb-5 leading-relaxed">
                {isArabic
                  ? 'روابط استعادة كلمة المرور صالحة لساعة واحدة فقط. اطلب رابطًا جديدًا.'
                  : 'Reset links are only valid for an hour. Request a new one.'}
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal text-white rounded-xl text-sm font-bold hover:bg-teal-deep transition-colors"
              >
                {isArabic ? 'طلب رابط جديد' : 'Request a new link'}
              </Link>
            </div>
          )}

          {linkState === 'valid' && !done && (
            <>
              <h1 className="font-display text-2xl font-bold text-teal-dark mb-2 text-center">
                {isArabic ? 'كلمة مرور جديدة' : 'Choose a new password'}
              </h1>
              <p className="text-sm text-muted text-center mb-6 leading-relaxed">
                {isArabic
                  ? 'لتأمين حسابك، اختر كلمة مرور جديدة لم تستخدمها مسبقًا.'
                  : 'For security, pick a password you haven\'t used before.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor={idA} className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider">
                    {isArabic ? 'كلمة المرور الجديدة' : 'New password'}
                  </label>
                  <div className={cn(
                    'flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition',
                    errors.newPassword
                      ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                      : 'border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]',
                  )}>
                    <Lock className={cn('w-4 h-4 shrink-0', errors.newPassword ? 'text-red-300' : 'text-gray-300')} />
                    <input
                      id={idA}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setErrors({}) }}
                      placeholder="••••••••"
                      className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? (isArabic ? "إخفاء كلمة المرور" : "Hide password") : (isArabic ? "إظهار كلمة المرور" : "Show password")} aria-pressed={showPassword} className="text-gray-300 hover:text-teal-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded">
                      {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <FieldError message={errors.newPassword} />
                  {!errors.newPassword && (
                    <p className="mt-1.5 text-[11px] text-gray-400">{t('validation.passwordHint')}</p>
                  )}
                </div>

                <div>
                  <label htmlFor={idB} className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider">
                    {isArabic ? 'تأكيد كلمة المرور' : 'Confirm password'}
                  </label>
                  <div className={cn(
                    'flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition',
                    errors.confirmPassword
                      ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                      : 'border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]',
                  )}>
                    <Lock className={cn('w-4 h-4 shrink-0', errors.confirmPassword ? 'text-red-300' : 'text-gray-300')} />
                    <input
                      id={idB}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setErrors({}) }}
                      placeholder="••••••••"
                      className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
                    />
                  </div>
                  <FieldError message={errors.confirmPassword} />
                </div>

                {submitError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 bg-teal text-white rounded-xl py-3 text-sm font-bold hover:bg-teal-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal/25 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isArabic ? 'جارٍ التحديث…' : 'Updating…'}
                    </>
                  ) : (
                    <>
                      {isArabic ? 'حفظ كلمة المرور' : 'Save password'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {done && (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3"
              >
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </motion.div>
              <h1 className="font-display text-xl font-bold text-teal-dark mb-2">
                {isArabic ? 'تم تحديث كلمة المرور' : 'Password updated'}
              </h1>
              <p className="text-sm text-muted leading-relaxed">
                {isArabic
                  ? 'تم تسجيل دخولك. إعادة توجيه...'
                  : "You're signed in. Redirecting…"}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
