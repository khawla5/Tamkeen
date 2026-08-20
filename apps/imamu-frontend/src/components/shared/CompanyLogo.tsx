import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/avatar'

interface Props {
  logo: string                    // URL, or a non-URL value (legacy emoji) that falls back to initials
  name: string                    // company name — alt text + initials source
  className?: string              // box sizing + (for the initials block) text size, e.g. 'w-10 h-10 text-sm'
}

// Renders a company logo image when `logo` is a URL, otherwise a neutral
// initials tile derived from the company name. Replaces the legacy emoji
// "logos" so nothing renders an emoji.
export default function CompanyLogo({ logo, name, className }: Props) {
  const [imgError, setImgError] = useState(false)
  const [lastLogo, setLastLogo] = useState(logo)
  if (logo !== lastLogo) {
    setLastLogo(logo)
    setImgError(false)
  }
  const isUrl = !!logo && (logo.startsWith('/') || logo.startsWith('http'))
  if (isUrl && !imgError) {
    return (
      <img
        src={logo}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        className={cn('rounded-lg object-contain bg-white shrink-0', className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center rounded-lg border border-imamu-navy-100 bg-imamu-navy-50 font-bold uppercase leading-none text-imamu-navy shrink-0',
        className,
      )}
    >
      {getInitials(name) || '—'}
    </span>
  )
}
