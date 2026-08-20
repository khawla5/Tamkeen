import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { translations } from './translations'

type Language = 'en' | 'ar'
type Direction = 'ltr' | 'rtl'

interface LanguageContextType {
  lang: Language
  dir: Direction
  setLang: (lang: Language) => void
  t: (key: string) => string
  isArabic: boolean
}

const LanguageContext = createContext<LanguageContextType | null>(null)

function getInitialLang(): Language {
  try {
    const stored = localStorage.getItem('tamkeen-lang') ?? localStorage.getItem('fursati-lang')
    if (stored === 'ar' || stored === 'en') return stored
  } catch {
    // localStorage unavailable
  }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang)

  const dir: Direction = lang === 'ar' ? 'rtl' : 'ltr'
  const isArabic = lang === 'ar'

  useEffect(() => {
    const html = document.documentElement
    html.dir = dir
    html.lang = lang

    // Use language-specific font stacks so Latin and Arabic text
    // each render at their natural, optimised width. Both are self-hosted
    // (@fontsource): Geist for Latin, IBM Plex Sans Arabic for Arabic.
    const body    = lang === 'ar'
      ? "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Geist Variable', 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"
    const display = lang === 'ar'
      ? "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Geist Variable', 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"

    html.style.setProperty('--font-sans', body)
    html.style.setProperty('--font-body', body)
    html.style.setProperty('--font-display', display)
    html.style.setProperty('--font-heading', display)
    html.style.setProperty('--font-arabic', "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif")

    try {
      localStorage.setItem('tamkeen-lang', lang)
    } catch {
      // localStorage unavailable
    }
  }, [lang, dir, isArabic])

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
  }, [])

  const t = useCallback(
    (key: string): string => {
      const parts = key.split('.')
      if (parts.length !== 2) return key

      const [namespace, field] = parts

      // Try current language first
      const value = translations[lang]?.[namespace]?.[field]
      if (value) return value

      // Fall back to English
      if (lang !== 'en') {
        const fallback = translations.en?.[namespace]?.[field]
        if (fallback) return fallback
      }

      // Return the key itself as last fallback
      return key
    },
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t, isArabic }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
