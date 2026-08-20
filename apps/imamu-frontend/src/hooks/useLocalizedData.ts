import { useLanguage } from '../i18n/context'

export function useLocalizedField() {
  const { isArabic } = useLanguage()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function localized(item: any, field: string): string {
    if (isArabic) {
      const arValue = item[`${field}Ar`]
      if (typeof arValue === 'string' && arValue) return arValue
    }
    const value = item[field]
    return typeof value === 'string' ? value : String(value ?? '')
  }
}
