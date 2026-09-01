/**
 * The time axis of §4C.8's «الأثر» tab (TAM-149).
 *
 * Pure date arithmetic, deliberately separate from the service: everything that
 * can be quietly wrong about a report by period is in here — what "the previous
 * period" means, which month a completion falls in, whether the last day of the
 * range is included — and none of it needs a database to prove.
 */

/** A closed range: both ends are inside the period. */
export interface ImpactRange {
  from: Date;
  to: Date;
}

/** How far back the trend looks, whatever period is selected. */
export const TREND_MONTHS = 12;

/**
 * The period asked for, or this calendar month.
 *
 * The screen sends the two ends it is showing (`from` at 00:00, `to` at
 * 23:59:59.999, exactly as §4C.8's trail filter already does) so that the
 * preset it offers — this month, this quarter, this year, custom — stays a
 * question about presentation and never becomes a second vocabulary the API has
 * to grow a branch for.
 *
 * A reversed range is corrected rather than refused: two date inputs make it
 * trivially easy to pick an end before a start, and answering the obvious
 * question is better than a 400 the administrator has to translate.
 */
export function resolveRange(from: string | undefined, to: string | undefined): ImpactRange {
  const now = new Date();

  const start = from === undefined ? startOfMonth(now) : new Date(from);
  const end = to === undefined ? endOfMonth(now) : new Date(to);

  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/**
 * The period of **equal length** ending immediately before this one.
 *
 * Equal length rather than the previous calendar quarter, and that is a
 * deliberate choice: Q2 has ninety-one days and Q3 ninety-two, so a
 * calendar-to-calendar comparison would report growth of about one per cent
 * that is nothing but the length of the months. A like-for-like window makes
 * the delta a fact about participation.
 *
 * It also keeps the contract at `?from&to`: the server never has to know which
 * preset the screen was showing.
 */
export function previousRangeOf(range: ImpactRange): ImpactRange {
  const length = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);

  return { from: new Date(to.getTime() - length), to };
}

/** The range as the wire carries it. */
export function rangeToJson(range: ImpactRange): { from: string; to: string } {
  return { from: range.from.toISOString(), to: range.to.toISOString() };
}

/**
 * The twelve months ending with the period's last month, oldest first.
 *
 * Anchored to the period rather than to today, so a printed sheet for last
 * quarter carries the trend as it stood then instead of a trailing year that
 * moves every time it is opened.
 */
export function trailingMonths(end: Date, count = TREND_MONTHS): ImpactRange[] {
  const anchor = startOfMonth(end);
  const months: ImpactRange[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - back, 1);
    months.push({ from: start, to: endOfMonth(start) });
  }

  return months;
}

/**
 * `YYYY-MM` for a date, in **local** time.
 *
 * Local because the ranges arrive as local wall-clock instants from the screen,
 * and a completion at 01:00 on the first of the month must not be bucketed into
 * the previous one by a UTC conversion — the month a course was passed in is a
 * fact about the ministry's calendar, not about the server's offset.
 */
export function monthKey(value: Date): string {
  return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

/** Counts dates into the given months, keyed by `YYYY-MM`. */
export function bucketByMonth(
  dates: readonly Date[],
  months: readonly ImpactRange[],
): Map<string, number> {
  const counts = new Map<string, number>(months.map((month) => [monthKey(month.from), 0]));

  for (const date of dates) {
    const key = monthKey(date);
    /* Only months the trend is showing: a date outside the window is not an
       error, it is simply older than the question being asked. */
    if (counts.has(key)) {
      counts.set(key, counts.get(key)! + 1);
    }
  }

  return counts;
}

/** The whole span the trend covers, so the rows can be read in one query. */
export function spanOf(months: readonly ImpactRange[]): ImpactRange {
  return { from: months[0]!.from, to: months[months.length - 1]!.to };
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * `value - previous`, and the two figures beside it.
 *
 * One helper rather than the subtraction repeated at ten call sites: the shape
 * is what the contract promises, and a delta computed the other way round on
 * one tile is the kind of defect nobody notices until a report is wrong in a
 * meeting.
 */
export function withDelta(value: number, previous: number) {
  return { value, previous, delta: value - previous };
}
