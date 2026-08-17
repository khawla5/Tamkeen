import {
  DEFAULT_CALENDAR,
  DEFAULT_LOCALE,
  DEFAULT_NUMBER_FORMAT,
  isNumberFormat,
  type Calendar,
  type FormatContext,
} from '@tamkeen/types';

/**
 * Resolves the locale/digit/calendar configuration for the web app.
 *
 * This is the *only* place the web app reads the presentation environment.
 * Everything downstream — next-intl, the React format provider, the server
 * components — takes its context from here, which is what makes D-018's
 * "flip the digits in one place" claim actually true.
 */

/** `lang` attribute value. Always the bare language tag — never the `-u-…` form. */
export const HTML_LANG = DEFAULT_LOCALE;

/** RTL is not conditional in this product (D-001). */
export const HTML_DIR = 'rtl' as const;

/**
 * Asia/Riyadh, not the server's zone: a certificate issued at 23:30 local time
 * must not display the previous day because the container runs in UTC.
 * Overridable so a deployment can correct it without a code change.
 */
export const DEFAULT_TIME_ZONE = process.env.TIME_ZONE ?? 'Asia/Riyadh';

export function getFormatContext(): FormatContext {
  const raw = process.env.NUMBER_FORMAT;
  const calendar = (process.env.DATE_CALENDAR as Calendar | undefined) ?? DEFAULT_CALENDAR;

  return {
    locale: DEFAULT_LOCALE,
    /* An unrecognised value falls back to the documented default rather than
       throwing — the API already validates this variable strictly at boot, so a
       hard failure here would only ever break the UI twice over. */
    numberFormat: isNumberFormat(raw) ? raw : DEFAULT_NUMBER_FORMAT,
    calendar,
  };
}
