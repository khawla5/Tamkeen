import {
  Wrench, Plane, Leaf,
  Code2, BrainCircuit, Stethoscope,
  Building2, Clapperboard, Palette,
  GraduationCap, HeartPulse, Users,
  Rocket, Megaphone, Landmark,
  Banknote, Calculator, Truck,
  Compass,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Maps each RIASEC career-path slug to a clean line icon. Keeps the
// catalog consistent and replaces the emoji rendering used previously.
const ICON_MAP: Record<string, LucideIcon> = {
  // R — Realistic
  mechanical_engineering:    Wrench,
  aerospace_aviation:        Plane,
  renewable_energy:          Leaf,
  // I — Investigative
  software_engineering:      Code2,
  data_science_ai:           BrainCircuit,
  healthcare_medicine:       Stethoscope,
  // A — Artistic
  architecture_design:       Building2,
  film_media_gaming:         Clapperboard,
  visual_arts_design:        Palette,
  // S — Social
  education_teaching:        GraduationCap,
  nursing_therapy:           HeartPulse,
  counseling_hr:             Users,
  // E — Enterprising
  business_entrepreneurship: Rocket,
  marketing_brand:           Megaphone,
  hospitality_tourism:       Landmark,
  // C — Conventional
  finance_banking:           Banknote,
  accounting_auditing:       Calculator,
  operations_supply_chain:   Truck,
}

interface CareerIconProps {
  slug: string | null | undefined
  className?: string
}

export default function CareerIcon({ slug, className }: CareerIconProps) {
  const Icon = (slug && ICON_MAP[slug]) || Compass
  return <Icon className={className} aria-hidden="true" />
}
