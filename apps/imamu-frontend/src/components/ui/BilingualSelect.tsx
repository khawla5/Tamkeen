import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/i18n/context'
import { FieldError } from '@/components/ui/FieldError'
import type { BilingualEntry } from '@/data/saudi-academic'

interface Props {
  label: string
  options: BilingualEntry[]
  // Current values stored on the form. We render whichever matches the active
  // language; selecting an option writes both back at once.
  valueEn: string
  valueAr: string
  onSelect: (entry: BilingualEntry) => void
  placeholder?: string
  error?: string
}

export default function BilingualSelect({
  label, options, valueEn, valueAr, onSelect, placeholder, error,
}: Props) {
  const { isArabic } = useLanguage()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Reset the query each time the dropdown reopens.
  useEffect(() => { if (open) setQuery('') }, [open])

  const display = isArabic ? valueAr : valueEn
  const filter = query.trim().toLowerCase()
  const filtered = filter
    ? options.filter((o) => o.en.toLowerCase().includes(filter) || o.ar.includes(query))
    : options

  return (
    <div ref={ref} className="relative">
      <label htmlFor={id} className="block text-[11px] font-bold text-imamu-dark/60 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2 border rounded-xl py-3 px-4 text-sm bg-white text-start transition duration-200',
          error
            ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
            : 'border-imamu-navy-100 hover:border-imamu-navy',
          open && !error && 'border-imamu-navy shadow-[0_0_0_3px_rgba(4,93,132,0.10)]',
        )}
      >
        <span className={cn('flex-1 truncate', display ? 'text-imamu-dark' : 'text-imamu-dark/30')}>
          {display || placeholder || (isArabic ? 'اختر…' : 'Select…')}
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-imamu-navy/55 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <FieldError message={error} />

      {open && (
        <div className="absolute inset-x-0 top-full mt-2 bg-white rounded-2xl shadow-xl shadow-imamu-navy/10 border border-imamu-navy-50 overflow-hidden z-30">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-imamu-navy-50 bg-imamu-navy-50/45">
            <Search className="w-3.5 h-3.5 text-imamu-navy/55 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isArabic ? 'ابحث…' : 'Search…'}
              className="flex-1 bg-transparent text-sm text-imamu-dark placeholder:text-imamu-dark/30 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-imamu-dark/55 text-center">
                {isArabic ? 'لا توجد نتائج' : 'No matches'}
              </li>
            ) : (
              filtered.map((o) => {
                const active = (isArabic ? valueAr : valueEn) === (isArabic ? o.ar : o.en)
                return (
                  <li key={o.en}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { onSelect(o); setOpen(false) }}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-4 py-2 text-start text-sm transition-colors',
                        active ? 'bg-imamu-navy-50 text-imamu-navy font-semibold' : 'hover:bg-imamu-navy-50/60 text-imamu-dark',
                      )}
                    >
                      <span className="truncate">{isArabic ? o.ar : o.en}</span>
                      {active && <Check className="w-4 h-4 text-imamu-gold shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
