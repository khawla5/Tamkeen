import {
  DEFAULT_CALENDAR,
  DEFAULT_LOCALE,
  DEFAULT_NUMBER_FORMAT,
  directionFor,
  isLocale,
  isNumberFormat,
  type Calendar,
  type Direction,
  type FormatContext,
  type Locale,
} from '@tamkeen/types';

/**
 * Resolves the locale/digit/calendar configuration for the web app.
 *
 * This is the *only* place the web app reads the presentation environment.
 * Everything downstream — next-intl, the React format provider, the server
 * components — takes its context from here, which is what makes D-018's
 * "flip the digits in one place" claim actually true.
 *
 * Deliberately free of `next/headers`: this module is imported by tests running
 * in a plain Node environment, and by the request config. Reading the cookie is
 * a separate, server-only concern (`locale.server.ts`) so that everything here
 * stays a pure function of its inputs.
 */

/**
 * Where the reader's choice lives (D-041).
 *
 * A cookie rather than a `/[locale]` route segment: the app is Arabic-first
 * with one canonical URL per page, and prefixing every route would rewrite the
 * whole link graph — including the certificate verification URLs §2 requires to
 * be stable and shareable — to serve a preference that is not part of a page's
 * identity. NOT httpOnly, because the switcher sets it from the browser.
 */
export const LOCALE_COOKIE = 'tamkeen.locale';

/** A year: the choice should outlive the session that made it. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * An unrecognised or absent cookie resolves to Arabic. A visitor with a
 * corrupted cookie gets the default product, never an error page.
 */
export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Recovers the bare locale from the extended tag next-intl is handed
 * (`ar-u-nu-latn-ca-gregory` → `ar`). Client components read the locale through
 * `useLocale()`, which returns that tag, so without this every caller would be
 * left doing its own string surgery on a value whose shape is D-018's business.
 */
export function baseLocale(tag: string): Locale {
  return resolveLocale(tag.split('-')[0]);
}

/** `lang` attribute value. Always the bare language tag — never the `-u-…` form. */
export function htmlLang(locale: Locale): string {
  return locale;
}

/** `dir` follows from the locale; there is no independent direction switch. */
export function htmlDir(locale: Locale): Direction {
  return directionFor(locale);
}

/**
 * Asia/Riyadh, not the server's zone: a certificate issued at 23:30 local time
 * must not display the previous day because the container runs in UTC.
 * Overridable so a deployment can correct it without a code change.
 */
export const DEFAULT_TIME_ZONE = process.env.TIME_ZONE ?? 'Asia/Riyadh';

export function getFormatContext(locale: Locale = DEFAULT_LOCALE): FormatContext {
  const raw = process.env.NUMBER_FORMAT;
  const calendar = (process.env.DATE_CALENDAR as Calendar | undefined) ?? DEFAULT_CALENDAR;

  return {
    locale,
    /* An unrecognised value falls back to the documented default rather than
       throwing — the API already validates this variable strictly at boot, so a
       hard failure here would only ever break the UI twice over. */
    numberFormat: isNumberFormat(raw) ? raw : DEFAULT_NUMBER_FORMAT,
    calendar,
  };
}
