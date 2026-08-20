/**
 * Locale + digit presentation (CLAUDE.md §2 "Digits & dates", D-018).
 *
 * Arabic is the default and primary locale. Digits default to Western Arabic
 * numerals (0-9); switching to Arabic-Indic (٠-٩) must be a single config
 * change, never a code change in feature files — hence this single source of
 * truth shared by web and api (both format dates/numbers, e.g. for PDFs).
 */
/**
 * `ar` is the product's locale. `en` exists for exactly one thing: the CV.
 *
 * D-050 makes the CV an English document — the builder's chrome stays
 * Arabic-first, but the CV body and its exported PDF are English, because a CV
 * is used externally and professionally. Its dates therefore have to read
 * "March 2021", not "مارس 2021", and they still have to go through this layer
 * rather than a stray `Intl` call in the CV template (D-018).
 *
 * Adding `en` here does **not** make the app bilingual. `DEFAULT_LOCALE` is
 * unchanged, `<html lang>` is still fixed to Arabic, the API's config still
 * accepts only `ar`, and there is no message catalogue for English. Introducing
 * an English *interface* remains the separate, larger change D-024 describes.
 */
export const LOCALES = ['ar', 'en'] as const;

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
