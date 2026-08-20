import { useState } from 'react'
import { cn } from '@/lib/utils'
import { isAvatarUrl, getInitials } from '@/lib/avatar'

interface Props {
  avatar: string                  // URL, or a non-URL value (legacy emoji) that falls back to initials
  alt?: string                    // display name — used for the image alt AND to derive initials
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  ring?: boolean                  // soft ring around the image
}

const SIZE: Record<NonNullable<Props['size']>, { box: string; initials: string; px: number }> = {
  xs: { box: 'w-6 h-6',   initials: 'text-[10px]', px: 24 },
  sm: { box: 'w-8 h-8',   initials: 'text-xs',     px: 32 },
  md: { box: 'w-10 h-10', initials: 'text-sm',     px: 40 },
  lg: { box: 'w-14 h-14', initials: 'text-lg',     px: 56 },
  xl: { box: 'w-24 h-24', initials: 'text-2xl',    px: 96 },
}

export default function UserAvatar({ avatar, alt = '', size = 'md', className, ring = false }: Props) {
  const dims = SIZE[size]
  const [imgError, setImgError] = useState(false)
  // Reset the error flag if the avatar value changes (e.g. a new upload).
  const [lastAvatar, setLastAvatar] = useState(avatar)
  if (avatar !== lastAvatar) {
    setLastAvatar(avatar)
    setImgError(false)
  }
  if (isAvatarUrl(avatar) && !imgError) {
    return (
      <img
        src={avatar}
        alt={alt}
        width={dims.px}
        height={dims.px}
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        className={cn(
          'rounded-full object-cover bg-gray-100 shrink-0',
          dims.box,
          ring && 'ring-2 ring-white/15',
          className,
        )}
      />
    )
  }
  // Initials fallback — a navy circle with white initials derived from the
  // display name. Replaces the legacy emoji avatars. Empty alt → decorative.
  const initials = getInitials(alt)
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-imamu-navy font-bold uppercase leading-none text-white shrink-0',
        dims.box,
        dims.initials,
        ring && 'ring-2 ring-white/15',
        className,
      )}
    >
      {initials || '—'}
    </span>
  )
}
