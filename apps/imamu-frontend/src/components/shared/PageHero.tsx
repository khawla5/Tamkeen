import type { LucideIcon } from 'lucide-react'

interface PageHeroProps {
  icon: LucideIcon
  title: string
  subtitle: string
  className?: string
  iconClassName?: string
}

export default function PageHero({
  icon: Icon,
  title,
  subtitle,
  className = 'py-10',
  iconClassName = 'w-7 h-7',
}: PageHeroProps) {
  return (
    <section className={`relative bg-gradient-to-b from-teal-dark to-[#0a3139] text-center overflow-hidden ${className}`}>
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Gold radial halo + bottom-edge gold seam — every page hero now opens
          with the navy + gold heritage atmosphere instead of pure navy. */}
      <div className="pointer-events-none absolute -top-20 -end-24 w-80 h-80 rounded-full bg-imamu-gold/15 blur-[100px]" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-imamu-gold/40 to-transparent" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Icon className={`${iconClassName} text-imamu-warm-gold`} aria-hidden="true" />
          <h1 className="font-display font-bold text-white text-[clamp(24px,3.5vw,32px)] tracking-tight">
            {title}
          </h1>
        </div>
        <p className="text-white/45 text-[15px] max-w-lg mx-auto">
          {subtitle}
        </p>
      </div>
    </section>
  )
}
