import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/i18n/context'
import { cn } from '@/lib/utils'
import { FieldError } from '@/components/ui/FieldError'
import { ForgotPasswordSchema, flattenErrors, type FieldErrors } from '@/lib/validation'
import { supabase } from '@/lib/supabase'

export default function ForgotPassword() {
  const { isArabic, lang, setLang, t } = useLanguage()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const id = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = ForgotPasswordSchema.safeParse({ email: email.trim() })
    if (!parsed.success) {
      setErrors(flattenErrors(parsed.error))
      return
    }
    setErrors({})

    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)

    if (error) {
      setSubmitError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafbfc] px-4 py-10">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        {/* Language toggle */}
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

          {sent ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h1 className="font-display text-xl font-bold text-teal-dark mb-2">
                {isArabic ? 'تحقّق من بريدك الإلكتروني' : 'Check your email'}
              </h1>
              <p className="text-sm text-muted leading-relaxed mb-6">
                {isArabic
                  ? 'إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.'
                  : "If that email is registered, we've sent a password-reset link. Open the email and follow the link to choose a new password."}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-deep transition-colors"
              >
                {isArabic ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {isArabic ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-teal-dark mb-2 text-center">
                {isArabic ? 'استعادة كلمة المرور' : 'Reset your password'}
              </h1>
              <p className="text-sm text-muted text-center mb-6 leading-relaxed">
                {isArabic
                  ? 'أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة التعيين.'
                  : "Enter the email you signed up with and we'll send you a reset link."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor={id} className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider">
                    {isArabic ? 'البريد الإلكتروني' : 'Email address'}
                  </label>
                  <div className={cn(
                    'flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition',
                    errors.email
                      ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                      : 'border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]',
                  )}>
                    <Mail className={cn('w-4 h-4 shrink-0', errors.email ? 'text-red-300' : 'text-gray-300')} />
                    <input
                      id={id}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors({}) }}
                      placeholder="you@tamkeen.imamu.edu.sa"
                      className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
                    />
                  </div>
                  <FieldError message={errors.email} />
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
                      {isArabic ? 'جارٍ الإرسال…' : 'Sending…'}
                    </>
                  ) : (
                    <>
                      {isArabic ? 'إرسال رابط الاستعادة' : 'Send reset link'}
                      {isArabic ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-muted pt-1">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1 text-teal-deep font-semibold hover:text-teal transition-colors"
                  >
                    {isArabic ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                    {isArabic ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
