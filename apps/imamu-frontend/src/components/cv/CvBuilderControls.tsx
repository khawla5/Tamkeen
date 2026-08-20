import { useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Compass, X } from 'lucide-react'

import { FieldError } from '@/components/ui/FieldError'
import { cn } from '@/lib/utils'

type CvTextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  dir?: 'rtl'
  type?: string
  autoComplete?: string
  className?: string
  placeholder?: string
  error?: string
}

export function CvTextField({
  label,
  value,
  onChange,
  dir,
  type = 'text',
  autoComplete,
  className,
  placeholder,
  error,
}: CvTextFieldProps) {
  const id = useId()

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-imamu-dark/60">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        dir={dir}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-imamu-dark transition duration-200 placeholder:text-imamu-dark/30 focus:outline-none',
          error
            ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
            : 'border-imamu-navy-100 focus:border-imamu-navy focus:shadow-[0_0_0_3px_rgba(179,221,245,0.45)]',
          dir === 'rtl' && 'font-arabic',
        )}
      />
      <FieldError message={error} />
    </div>
  )
}

type CvStepperProps = {
  steps: string[]
  current: number
  onSelect: (index: number) => void
}

export function CvStepper({ steps, current, onSelect }: CvStepperProps) {
  return (
    <div className="flex justify-center overflow-x-auto scrollbar-hide py-6">
      <div className="inline-flex gap-1.5 rounded-2xl border border-imamu-navy-50 bg-white p-1.5 shadow-sm">
      {steps.map((label, index) => {
        const completed = index < current
        const active = index === current

        return (
          <button
            key={label}
            onClick={() => onSelect(index)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-[12px] font-bold transition duration-200',
              active && 'bg-imamu-navy border-imamu-navy text-white shadow-sm',
              completed && 'bg-white border-imamu-navy-100 text-imamu-navy-deep hover:bg-imamu-navy-50',
              !active && !completed && 'bg-imamu-navy-50 border-imamu-navy-100 text-imamu-navy hover:border-imamu-navy/40 hover:bg-white',
            )}
          >
            <span
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                active && 'bg-white text-imamu-navy',
                completed && 'bg-imamu-navy-50 text-imamu-navy',
                !active && !completed && 'bg-white text-imamu-navy border border-imamu-navy-100',
              )}
            >
              {completed ? <Check className="w-3 h-3" /> : index + 1}
            </span>
            {label}
            {/* Subtle gold underline on the active step — premium accent
                without competing with the navy fill. */}
            {active && (
              <span
                className="absolute bottom-0.5 inset-x-3 h-[2px] rounded-full bg-imamu-gold"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
      </div>
    </div>
  )
}

type AiSuggestionNoteProps = {
  message: string
  typing: boolean
  onDismiss?: () => void
  showTitle?: boolean
}

export function AiSuggestionNote({ message, typing, onDismiss, showTitle = false }: AiSuggestionNoteProps) {
  return (
    <AnimatePresence>
      {(message || typing) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden mb-3"
        >
          <div className="relative bg-imamu-gold-50 rounded-xl p-3 flex items-start gap-2.5 border border-imamu-gold-100 overflow-hidden">
            <div
              className="pointer-events-none absolute inset-y-0 start-0 w-[3px] bg-imamu-gold"
              aria-hidden="true"
            />
            <Compass className="w-4 h-4 text-imamu-gold shrink-0 mt-0.5 ms-1" />
            <div className="flex-1">
              {showTitle && <p className="text-[11px] font-bold text-imamu-gold uppercase tracking-wide mb-0.5">AI Assistant</p>}
              <p className="text-sm text-imamu-dark leading-relaxed">{message}{typing ? '▊' : ''}</p>
            </div>
            {!typing && onDismiss && (
              <button onClick={onDismiss} className="text-imamu-gold/60 hover:text-imamu-gold-deep" aria-label="Dismiss AI suggestion">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
