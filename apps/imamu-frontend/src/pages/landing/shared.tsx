import { useState, useEffect, useRef } from 'react'

export function SectionHeader({
  tag, title, subtitle, dark = false,
}: { tag: string; title: string; subtitle?: string; dark?: boolean }) {
  return (
    <div className="text-center mb-16 max-w-xl mx-auto">
      {/* Section eyebrow — a quiet gold uppercase label, no filled pill, with a
          short gold accent line under the heading (the only gold on the section). */}
      <span className={`inline-block text-xs font-bold uppercase tracking-wide mb-4 ${dark ? 'text-imamu-warm-gold' : 'text-imamu-gold-deep'}`}>
        {tag}
      </span>
      <h2 className={`font-display font-bold leading-tight text-[clamp(28px,4vw,42px)] ${dark ? 'text-white' : 'text-teal-dark'}`}>
        {title}
      </h2>
      <span className="mt-4 inline-block h-px w-12 bg-imamu-gold" aria-hidden="true" />
      {subtitle && (
        <p className={`text-base leading-relaxed max-w-2xl mx-auto mt-4 ${dark ? 'text-white/50' : 'text-muted'}`}>{subtitle}</p>
      )}
    </div>
  )
}

export function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true) },
      { threshold: 0.3 }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return
    const steps = 60
    const increment = target / steps
    const interval = duration / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(current))
    }, interval)
    return () => clearInterval(timer)
  }, [started, target, duration])

  return { count, ref }
}

export function StatCounter({ value, label, featured, suffix = '+' }: { value: number; label: string; featured?: boolean; suffix?: string }) {
  const { count, ref } = useCountUp(value)
  // Featured stat → gold, the achievement we want to anchor the hero on.
  // Supporting stats stay white for hierarchy. `suffix` defaults to "+" so
  // counts like "1,247" become "1,247+"; pass "%" for rate stats.
  return (
    <div ref={ref}>
      <p className={`font-display font-extrabold leading-none ${featured ? 'text-imamu-gold-deep text-[36px]' : 'text-imamu-dark text-[28px]'}`}>
        {count.toLocaleString('en-US')}
        <span className={featured ? 'text-imamu-gold-deep/60 text-[24px]' : 'text-imamu-dark/30 text-[20px]'}>{suffix}</span>
      </p>
      <p className="text-imamu-dark/50 text-[12px] font-medium uppercase tracking-[0.08em] mt-2">{label}</p>
    </div>
  )
}
