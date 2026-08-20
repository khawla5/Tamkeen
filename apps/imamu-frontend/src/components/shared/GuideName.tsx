import { useLanguage } from '@/i18n/context'

type Lang = 'ar' | 'en'

// Single source of truth for the AI assistant's name.
//   Arabic UI -> «قايد (Guide)» with the Latin gloss bidi-isolated so the
//               parentheses always hug "Guide" and never reorder in RTL.
//   English UI -> «Guide» only (never Arabic, never "Qaid").

// Plain-string helper for string/i18n/template contexts.
// 'ar' wraps the gloss in FSI (U+2068) / PDI (U+2069) isolates.
export function guideName(lang: Lang): string {
  return lang === 'ar' ? 'قايد ⁨(Guide)⁩' : 'Guide'
}

// JSX component for render contexts — uses a dir="ltr" span for the gloss.
export default function GuideName() {
  const { isArabic } = useLanguage()
  if (isArabic) {
    return (
      <>
        قايد <span dir="ltr">(Guide)</span>
      </>
    )
  }
  return <>Guide</>
}
