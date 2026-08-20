import { AlertCircle } from 'lucide-react'
import { useLanguage } from '@/i18n/context'

export function FieldError({ message }: { message?: string }) {
  const { t } = useLanguage()
  if (!message) return null

  // If the message looks like a translation key (e.g. "validation.emailRequired"),
  // run it through t(). Plain strings (Supabase errors, etc.) pass through unchanged.
  const display = message.includes('.') ? t(message) : message

  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>{display}</span>
    </p>
  )
}
