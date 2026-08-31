import {
  bucketByMonth,
  monthKey,
  previousRangeOf,
  resolveRange,
  spanOf,
  trailingMonths,
  withDelta,
} from './impact-period';

/**
 * The time axis of «الأثر» (TAM-149).
 *
 * Every figure on that tab is a count over a period compared against another
 * period, so an off-by-one here is not a rendering glitch — it is the ministry
 * being told participation grew when it did not.
 */

/** The screen's own two ends: midnight to the last millisecond of the day. */
const day = (iso: string, end = false) =>
  new Date(`${iso}T${end ? '23:59:59.999' : '00:00:00.000'}`);

describe('resolveRange', () => {
  it('takes the two ends the screen sends', () => {
    const range = resolveRange('2026-07-01T00:00:00.000', '2026-09-30T23:59:59.999');

    expect(range.from).toEqual(day('2026-07-01'));
    expect(range.to).toEqual(day('2026-09-30', true));
  });

  it('defaults to the current calendar month', () => {
    const now = new Date();
    const range = resolveRange(undefined, undefined);

    expect(range.from.getDate()).toBe(1);
    expect(range.from.getMonth()).toBe(now.getMonth());
    expect(range.to.getMonth()).toBe(now.getMonth());
    /* The last instant of the month, not the first of the next one — an
       exclusive end would drop everything that happened on the last day. */
    expect(range.to.getHours()).toBe(23);
    expect(new Date(range.to.getTime() + 1).getMonth()).toBe((now.getMonth() + 1) % 12);
  });

  it('corrects a reversed range rather than refusing it', () => {
    const range = resolveRange('2026-09-30T23:59:59.999', '2026-07-01T00:00:00.000');

    expect(range.from).toEqual(day('2026-07-01'));
    expect(range.to).toEqual(day('2026-09-30', true));
  });
});

describe('previousRangeOf', () => {
  it('ends one millisecond before the period starts', () => {
    const previous = previousRangeOf({ from: day('2026-08-01'), to: day('2026-08-31', true) });

    expect(previous.to).toEqual(new Date(day('2026-08-01').getTime() - 1));
  });

  it('is exactly as long as the period, so the comparison is like-for-like', () => {
    const range = { from: day('2026-07-01'), to: day('2026-09-30', true) };
    const previous = previousRangeOf(range);

    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });

  it('gives the preceding calendar month for a calendar month', () => {
    /* The case that matters most, because it is the default period: August's
       comparison has to be July, to the millisecond. */
    const previous = previousRangeOf({ from: day('2026-08-01'), to: day('2026-08-31', true) });

    expect(previous.from).toEqual(day('2026-07-01'));
    expect(previous.to).toEqual(day('2026-07-31', true));
  });
});

describe('trailingMonths', () => {
  it('returns twelve months ending with the period, oldest first', () => {
    const months = trailingMonths(day('2026-08-31', true));

    expect(months).toHaveLength(12);
    expect(monthKey(months[0]!.from)).toBe('2025-09');
    expect(monthKey(months[11]!.from)).toBe('2026-08');
  });

  it('crosses the year boundary without repeating a month', () => {
    const keys = trailingMonths(day('2026-02-15')).map((month) => monthKey(month.from));

    expect(keys).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('covers every month end to end with no gap', () => {
    const months = trailingMonths(day('2026-08-31', true));

    for (let index = 1; index < months.length; index += 1) {
      expect(months[index]!.from.getTime()).toBe(months[index - 1]!.to.getTime() + 1);
    }
  });

  it('spans from the first month to the last', () => {
    const months = trailingMonths(day('2026-08-31', true));
    const span = spanOf(months);

    expect(monthKey(span.from)).toBe('2025-09');
    expect(monthKey(span.to)).toBe('2026-08');
  });
});

describe('bucketByMonth', () => {
  const months = trailingMonths(day('2026-03-31', true), 3);

  it('starts every month at zero, including the ones nothing happened in', () => {
    const counts = bucketByMonth([], months);

    expect([...counts.entries()]).toEqual([
      ['2026-01', 0],
      ['2026-02', 0],
      ['2026-03', 0],
    ]);
  });

  it('counts each date into its own month', () => {
    const counts = bucketByMonth(
      [day('2026-01-31', true), day('2026-03-01'), day('2026-03-20')],
      months,
    );

    expect(counts.get('2026-01')).toBe(1);
    expect(counts.get('2026-02')).toBe(0);
    expect(counts.get('2026-03')).toBe(2);
  });

  it('ignores dates older than the window rather than folding them into the first month', () => {
    const counts = bucketByMonth([day('2025-11-04')], months);

    expect([...counts.values()]).toEqual([0, 0, 0]);
  });
});

describe('withDelta', () => {
  it('subtracts the previous period from this one', () => {
    expect(withDelta(42, 30)).toEqual({ value: 42, previous: 30, delta: 12 });
  });

  it('reports a fall as a negative, and no change as a real zero', () => {
    expect(withDelta(8, 11).delta).toBe(-3);
    expect(withDelta(5, 5).delta).toBe(0);
  });
});
