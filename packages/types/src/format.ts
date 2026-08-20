import { DEFAULT_LOCALE, DEFAULT_NUMBER_FORMAT, type Locale, type NumberFormat } from './locale';

/**
 * The single number/date formatting layer (CLAUDE.md §2 "Digits & dates", D-018).
 *
 * Every user-visible number and date — in the web UI, in transactional emails,
 * on certificates and in the CV PDF — must go through here. Feature code must
 * never call `Intl` or `toLocaleString` directly, because the whole point of
 * D-018 is that switching to Arabic-Indic digits (٠-٩) is a config change in one
 * place, not an edit across the codebase.
 *
 * Lives in `packages/types` rather than in either app because both format:
 * the web renders the UI, and the api renders PDFs and emails server-side. If
 * they diverged, a certificate could disagree with the screen that announced it.
 */

/** Gregorian is the default; Hijri is the optional presentation per D-018. */
export const CALENDARS = ['gregory', 'islamic-umalqura'] as const;

export type Calendar = (typeof CALENDARS)[number];

export const DEFAULT_CALENDAR: Calendar = 'gregory';

export interface FormatContext {
  locale: Locale;
  numberFormat: NumberFormat;
  calendar: Calendar;
}

export const DEFAULT_FORMAT_CONTEXT: FormatContext = {
  locale: DEFAULT_LOCALE,
  numberFormat: DEFAULT_NUMBER_FORMAT,
  calendar: DEFAULT_CALENDAR,
};

/**
 * Builds the BCP-47 tag. `nu` selects the digit system and `ca` the calendar —
 * the two switches D-018 cares about.
 */
export function formatLocaleTag(context: FormatContext): string {
  const numberingSystem = context.numberFormat === 'arabic-indic' ? 'arab' : 'latn';
  return `${context.locale}-u-nu-${numberingSystem}-ca-${context.calendar}`;
}

/* Intl formatter construction is comparatively expensive; cache by tag+options. */
const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(context: FormatContext, options: Intl.NumberFormatOptions) {
  const tag = formatLocaleTag(context);
  const key = `${tag}|${JSON.stringify(options)}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function dateFormatter(context: FormatContext, options: Intl.DateTimeFormatOptions) {
  const tag = formatLocaleTag(context);
  const key = `${tag}|${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** A plain count — "12 courses", a question number, a score. */
export function formatNumber(
  value: number,
  context: FormatContext = DEFAULT_FORMAT_CONTEXT,
): string {
  return numberFormatter(context, { maximumFractionDigits: 0 }).format(value);
}

/**
 * A quiz grade or progress percentage. Takes 0-100 (the scale Moodle returns and
 * the scale `PASS_THRESHOLD` is expressed in), not 0-1.
 */
export function formatPercent(
  value: number,
  context: FormatContext = DEFAULT_FORMAT_CONTEXT,
): string {
  return numberFormatter(context, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

/** "4 من 10" — the path-build counter and progress readouts (§4.5, §4.2). */
export function formatFraction(
  current: number,
  total: number,
  context: FormatContext = DEFAULT_FORMAT_CONTEXT,
): string {
  return `${formatNumber(current, context)} من ${formatNumber(total, context)}`;
}

export type DateStyle = 'short' | 'long';

/** A certificate issue date, a completion date. */
export function formatDate(
  value: Date,
  context: FormatContext = DEFAULT_FORMAT_CONTEXT,
  style: DateStyle = 'long',
): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { year: 'numeric', month: 'long', day: 'numeric' };

  return dateFormatter(context, options).format(value);
}

/** Only where the time genuinely matters (audit log views, Phase 5). */
export function formatDateTime(
  value: Date,
  context: FormatContext = DEFAULT_FORMAT_CONTEXT,
): string {
  return dateFormatter(context, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

/** Test seam — the caches would otherwise leak between context switches in tests. */
export function clearFormatterCaches(): void {
  numberFormatters.clear();
  dateFormatters.clear();
}

/**
 * The formatting context for the CV (D-050).
 *
 * The CV is an English document, so its dates read "March 2021" and its
 * numerals are Western — regardless of what the app is configured to show
 * elsewhere. It is deliberately a fixed context rather than a switch: the CV's
 * language is a product decision, not a user preference, and letting the D-018
 * digit switch reach it would put Arabic-Indic numerals on an English CV.
 */
export const CV_FORMAT_CONTEXT: FormatContext = {
  locale: 'en',
  numberFormat: 'western',
  calendar: 'gregory',
};

/**
 * "March 2021" — the granularity a CV states, from the `YYYY-MM` the builder
 * stores.
 *
 * Takes the string rather than a `Date` because that is what is stored, and
 * because constructing a `Date` from `YYYY-MM` invites a timezone shift that
 * can move an entry into the previous month.
 */
export function formatMonthYear(value: string, context: FormatContext = CV_FORMAT_CONTEXT): string {
  const [year, month] = value.split('-').map(Number);

  if (!year || !month) {
    return value;
  }

  /* Midday UTC: far enough from either boundary that no timezone can shift the
     rendered month. */
  return dateFormatter(context, { year: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(year, month - 1, 15, 12)),
  );
}

/** A bare year, through the same layer so digits honour the context. */
export function formatYear(value: number, context: FormatContext = CV_FORMAT_CONTEXT): string {
  return numberFormatter(context, { useGrouping: false, maximumFractionDigits: 0 }).format(value);
}
