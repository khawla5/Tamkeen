/**
 * Locale + digit presentation (CLAUDE.md §2 "Digits & dates", D-018).
 *
 * Arabic is the default and primary locale. Digits default to Western Arabic
 * numerals (0-9); switching to Arabic-Indic (٠-٩) must be a single config
 * change, never a code change in feature files — hence this single source of
 * truth shared by web and api (both format dates/numbers, e.g. for PDFs).
 */
export const LOCALES = ['ar'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export const NUMBER_FORMATS = ['western', 'arabic-indic'] as const;

export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const DEFAULT_NUMBER_FORMAT: NumberFormat = 'western';

export function isNumberFormat(value: unknown): value is NumberFormat {
  return typeof value === 'string' && (NUMBER_FORMATS as readonly string[]).includes(value);
}

/**
 * The BCP-47 tag handed to `Intl.*`. The `nu` extension is what actually flips
 * the digit system, so both apps must derive it from here rather than
 * hardcoding a tag.
 */
export function intlLocaleFor(locale: Locale, numberFormat: NumberFormat): string {
  return numberFormat === 'arabic-indic' ? `${locale}-u-nu-arab` : `${locale}-u-nu-latn`;
}
