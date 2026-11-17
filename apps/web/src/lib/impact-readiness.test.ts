import { describe, expect, it } from 'vitest';

import {
  SAMPLE_READINESS,
  bandOf,
  percentOf,
  summarize,
  type ReadinessTarget,
} from './impact-readiness';

/**
 * «قياس الأثر» — readiness against a target.
 *
 * What is worth proving is each number a responsible officer would act on: the
 * share met, the order to close gaps in, and the date — including the cases
 * where a calculation has nothing to calculate from, which must say so rather
 * than invent a date.
 */

/** Noon UTC, so a date with no time cannot slip a day in any timezone. */
const NOON = (day: string) => new Date(`${day}T12:00:00Z`);

describe('bandOf', () => {
  it('is urgent below half, on track from three quarters up, and in between otherwise', () => {
    expect(bandOf(0)).toBe('low');
    expect(bandOf(49)).toBe('low');
    expect(bandOf(50)).toBe('mid');
    expect(bandOf(74)).toBe('mid');
    expect(bandOf(75)).toBe('high');
    expect(bandOf(100)).toBe('high');
  });
});

describe('percentOf', () => {
  it('rounds to a whole per cent', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
  });

  it('is 0 over an empty denominator — a target of nobody was not missed', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('summarize — the worked example', () => {
  const summary = summarize(SAMPLE_READINESS, NOON('2026-10-04'));

  it('adds the units up into regions, and the regions into the target', () => {
    expect(summary.target).toBe(2900);
    expect(summary.qualified).toBe(1920);
    expect(summary.gap).toBe(980);
    expect(summary.percent).toBe(66);

    /* The regions and the jobs are two cuts of the same people. */
    const jobsTarget = summary.jobs.reduce((sum, job) => sum + job.target, 0);
    const jobsQualified = summary.jobs.reduce((sum, job) => sum + job.qualified, 0);
    expect(jobsTarget).toBe(summary.target);
    expect(jobsQualified).toBe(summary.qualified);
  });

  it('puts the biggest gap first, because that is the order to act in', () => {
    const gaps = summary.priorities.map((region) => region.gap);

    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
    expect(summary.priorities[0]).toMatchObject({ regionId: 'SA02', gap: 245 });
  });

  it('bands a region by its own share, not by its size', () => {
    const najran = summary.regions.find((region) => region.regionId === 'SA10');
    const qassim = summary.regions.find((region) => region.regionId === 'SA05');

    expect(najran).toMatchObject({ percent: 36, band: 'low' });
    expect(qassim).toMatchObject({ percent: 90, band: 'high' });
  });

  it('measures the time that has passed against the time allotted', () => {
    expect(summary.timeline.plannedPercent).toBe(60);
    expect(summary.timeline.daysLeft).toBe(178);
  });

  it('is ahead when the pace so far would finish before the due date', () => {
    /* 66% done in 60% of the time. */
    expect(summary.timeline.aheadDays).toBeGreaterThan(0);
    expect(summary.timeline.projected.getTime()).toBeLessThan(summary.due.getTime());
  });

  it('measures a rate in points and anything else in per cent, and knows which way is better', () => {
    const [arrival, evacuation, handling, onTime] = summary.indicators;

    expect(arrival).toMatchObject({ change: -22, improved: true });
    expect(evacuation).toMatchObject({ change: -33, improved: true });
    expect(handling).toMatchObject({ change: -35, improved: true });
    /* 72% → 86% is fourteen points, not nineteen per cent. */
    expect(onTime).toMatchObject({ change: 14, improved: true });
  });
});

describe('summarize — the edges', () => {
  const base: ReadinessTarget = {
    ...SAMPLE_READINESS,
    regions: [{ regionId: 'SA01', units: [{ name: 'وحدة', target: 100, qualified: 0 }] }],
    jobs: [],
    indicators: [],
  };

  it('has no pace to extend when nobody has qualified, and says so rather than inventing a date', () => {
    const { timeline, percent } = summarize(base, NOON('2026-10-04'));

    expect(percent).toBe(0);
    expect(timeline.aheadDays).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(timeline.projected.getTime())).toBe(true);
  });

  it('is behind when the share met trails the share of time gone', () => {
    const behind: ReadinessTarget = {
      ...base,
      regions: [{ regionId: 'SA01', units: [{ name: 'وحدة', target: 100, qualified: 20 }] }],
    };

    expect(summarize(behind, NOON('2026-10-04')).timeline.aheadDays).toBeLessThan(0);
  });

  it('never reports a negative number of days left once the date has passed', () => {
    expect(summarize(base, NOON('2028-01-01')).timeline.daysLeft).toBe(0);
  });

  it('handles an empty target without dividing by zero', () => {
    const empty = summarize({ ...base, regions: [] }, NOON('2026-10-04'));

    expect(empty).toMatchObject({ target: 0, qualified: 0, gap: 0, percent: 0 });
  });
});

describe('SAMPLE_READINESS', () => {
  it('names only regions the map knows, so every shaded region has a shape', () => {
    const known = [
      'SA01',
      'SA02',
      'SA03',
      'SA04',
      'SA05',
      'SA06',
      'SA07',
      'SA08',
      'SA09',
      'SA10',
      'SA11',
      'SA12',
      'SA14',
    ];

    for (const region of SAMPLE_READINESS.regions) {
      expect(known).toContain(region.regionId);
    }

    expect(new Set(SAMPLE_READINESS.regions.map((region) => region.regionId)).size).toBe(13);
  });
});
