// Tamkeen brand lockup.
//
// On LIGHT surfaces the real brand PNG (public/brand/tamkeen_logo_transparent.png)
// is rendered as-is — navy «تمكين» + gold "TAMKEEN" + the gold-sun constellation.
//
// On DARK surfaces that PNG's navy Arabic wordmark loses contrast, so — without
// ever recoloring the PNG — we render the constellation mark (a vector copy of the
// logo's "sun + diamond" mark, palette-shifted for dark) next to a WHITE «تمكين»
// and warm-gold "TAMKEEN" wordmark.
//
// Variants:
//   • full       — mark + bilingual wordmark (PNG on light, mark+text on dark)
//   • icon       — just the constellation mark (favicon spots, loaders, watermarks)
//   • wordmark   — just "تمكين / TAMKEEN" text (tight spaces, footer fallbacks)

import { cn } from '@/lib/utils'

type LogoVariant = 'full' | 'icon' | 'wordmark'
type LogoSize = 'sm' | 'md' | 'lg'

interface TamkeenLogoProps {
  variant?: LogoVariant
  size?: LogoSize
  darkBg?: boolean
  className?: string
  /** Override the default rendered title for screen readers. */
  title?: string
}

interface SizeSpec {
  /** Height of the real PNG lockup on light surfaces. */
  imgHeight: number
  /** Height of the vector mark used on dark surfaces / for the icon variant. */
  iconHeight: number
  arabicCls: string
  englishCls: string
  gap: string
}

const SIZES: Record<LogoSize, SizeSpec> = {
  sm: { imgHeight: 38, iconHeight: 34, arabicCls: 'text-lg', englishCls: 'text-[9px]', gap: 'gap-2' },
  md: { imgHeight: 50, iconHeight: 46, arabicCls: 'text-3xl', englishCls: 'text-[11px]', gap: 'gap-2.5' },
  lg: { imgHeight: 76, iconHeight: 70, arabicCls: 'text-5xl', englishCls: 'text-base', gap: 'gap-4' },
}

interface NetworkMarkProps {
  height: number
  navy: string
  lightBlue: string
  gold: string
  ariaLabel?: string
}

// Vector copy of the Tamkeen logomark: a gold "sun" apex linked to a four-node
// diamond constellation. Two navy nodes (top + right) read as the core stages;
// two light-blue nodes (left + bottom) are the entry points; the gold sun is the
// outcome. Geometry mirrors public/brand/tamkeen_logo_transparent.png so the mark
// looks identical whether the PNG (light) or this SVG (dark) is on screen.
function NetworkMark({ height, navy, lightBlue, gold, ariaLabel }: NetworkMarkProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={height}
      height={height}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="shrink-0"
    >
      {/* Stem: sun → top node */}
      <line x1="46" y1="14" x2="30" y2="38" stroke={gold} strokeWidth="1.6" />

      {/* Diamond edges */}
      <line x1="30" y1="38" x2="54" y2="52" stroke={lightBlue} strokeWidth="1.3" />
      <line x1="54" y1="52" x2="36" y2="66" stroke={lightBlue} strokeWidth="1.3" />
      <line x1="36" y1="66" x2="16" y2="52" stroke={lightBlue} strokeWidth="1.3" />
      <line x1="16" y1="52" x2="30" y2="38" stroke={lightBlue} strokeWidth="1.3" />

      {/* Sun rays */}
      <g stroke={gold} strokeWidth="1.4" strokeLinecap="round">
        <line x1="46" y1="5.5" x2="46" y2="1" />
        <line x1="52" y1="8" x2="55.2" y2="4.8" />
        <line x1="54.5" y1="14" x2="59" y2="14" />
        <line x1="52" y1="20" x2="55.2" y2="23.2" />
        <line x1="46" y1="22.5" x2="46" y2="27" />
        <line x1="37.5" y1="14" x2="33" y2="14" />
        <line x1="40" y1="8" x2="36.8" y2="4.8" />
      </g>

      {/* Nodes */}
      <circle cx="16" cy="52" r="5" fill={lightBlue} />
      <circle cx="36" cy="66" r="4.5" fill={lightBlue} />
      <circle cx="30" cy="38" r="5.5" fill={navy} />
      <circle cx="54" cy="52" r="5" fill={navy} />
      <circle cx="46" cy="14" r="7" fill={gold} />
    </svg>
  )
}

export default function TamkeenLogo({
  variant = 'full',
  size = 'md',
  darkBg = false,
  className,
  title,
}: TamkeenLogoProps) {
  const spec = SIZES[size]
  const accessibleTitle = title ?? 'Tamkeen — تمكين'

  // Light surface: navy primary, gold apex.
  // Dark surface: shift navy → sky and gold → warm-gold so the mark stays legible.
  const navy = darkBg ? '#B3DDF5' : '#045D84'
  const lightBlue = '#80BACE'
  const gold = darkBg ? '#B7A362' : '#99823F'

  if (variant === 'icon') {
    return (
      <NetworkMark
        height={spec.iconHeight}
        navy={navy}
        lightBlue={lightBlue}
        gold={gold}
        ariaLabel={accessibleTitle}
      />
    )
  }

  if (variant === 'wordmark') {
    const arabicColor = darkBg ? 'text-white' : 'text-imamu-navy'
    const englishColor = darkBg ? 'text-imamu-warm-gold' : 'text-imamu-gold'
    return (
      <span className={cn('inline-flex items-baseline gap-2', className)} aria-label={accessibleTitle}>
        <span
          className={cn('font-arabic font-extrabold', spec.arabicCls, arabicColor)}
          dir="rtl"
        >
          تمكين
        </span>
        <span className={cn('font-display font-bold tracking-[0.18em] uppercase', spec.englishCls, englishColor)} dir="ltr">
          Tamkeen
        </span>
      </span>
    )
  }

  // full — render the vector mark next to the bilingual wordmark. We deliberately
  // do NOT use the brand PNG here: the shipped file has a solid (non-transparent)
  // background, which renders as a dark box on light surfaces. The vector mark is
  // transparent and palette-shifts cleanly for both light and dark backgrounds.
  const arabicColor = darkBg ? 'text-white' : 'text-imamu-navy'
  const englishColor = darkBg ? 'text-imamu-warm-gold' : 'text-imamu-gold'
  return (
    <span
      className={cn('inline-flex items-center', spec.gap, className)}
      aria-label={accessibleTitle}
      role="img"
    >
      <NetworkMark height={spec.iconHeight} navy={navy} lightBlue={lightBlue} gold={gold} />
      <span className="inline-flex flex-col leading-none">
        <span className={cn('font-arabic font-extrabold', spec.arabicCls, arabicColor)} dir="rtl">
          تمكين
        </span>
        <span className={cn('font-display font-bold tracking-[0.18em] uppercase mt-0.5', spec.englishCls, englishColor)} dir="ltr">
          Tamkeen
        </span>
      </span>
    </span>
  )
}
