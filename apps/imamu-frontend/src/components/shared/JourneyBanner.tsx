import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'

interface JourneyBannerProps {
  text: string
  ctaLabel: string
  to: string
}

export default function JourneyBanner({ text, ctaLabel, to }: JourneyBannerProps) {
  return (
    <div className="bg-teal-50 border border-teal/15 rounded-2xl p-5 mt-8 flex items-center justify-between gap-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal/10 flex items-center justify-center shrink-0">
          <Compass className="w-4 h-4 text-teal" />
        </div>
        <p className="text-sm font-semibold text-teal-dark">{text}</p>
      </div>
      <Link
        to={to}
        className="group inline-flex items-center gap-2 bg-teal text-white rounded-xl px-6 py-2.5 text-sm font-bold hover:bg-teal-deep transition-colors duration-200 whitespace-nowrap shrink-0"
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:rotate-180 transition-transform" />
      </Link>
    </div>
  )
}
