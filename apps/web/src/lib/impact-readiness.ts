/**
 * «قياس الأثر» — readiness against a target (the proposal deck's slide 6).
 *
 * The question the ministry asks is not how many people trained but **whether
 * the need was met**: a *target* (a number of employees qualified for a role, by
 * a date), the people who have qualified so far, where the gaps are, how long it
 * took, and what it changed on the ground.
 *
 * **This is illustrative.** The platform records none of it yet — there is no
 * target, no region or work unit on an account, no field-performance indicator.
 * `SAMPLE_READINESS` is one worked example (Civil Defense) so the view can be
 * designed and judged; every figure in it is invented and the screen says so.
 * Replacing it is a matter of returning a `ReadinessTarget` from an API — the
 * calculations below are the part that stays.
 *
 * Pure functions only, with `now` passed in, so every number on the screen can
 * be proved without a clock.
 */

export interface ReadinessUnit {
  name: string;
  /** Employees the target asks for in this unit. */
  target: number;
  /** Of those, how many have qualified (completed the path at the required level). */
  qualified: number;
}

export interface ReadinessRegion {
  /** `SAUDI_REGIONS` id (`SA01`…), so the map and the data share one key. */
  regionId: string;
  units: ReadinessUnit[];
}

export interface ReadinessJob {
  name: string;
  target: number;
  qualified: number;
}

/** A field-performance indicator, before the programme and after it. */
export interface ReadinessIndicator {
  name: string;
  before: number;
  after: number;
  /** A fall is the improvement (response time, complaints). */
  lowerIsBetter: boolean;
  /** The metric is itself a percentage, so it changes in points, not per cent. */
  isRate: boolean;
}

export interface ReadinessTarget {
  title: string;
  need: string;
  path: string;
  /** `YYYY-MM-DD` — when the need was declared. */
  announced: string;
  /** `YYYY-MM-DD` — when it has to be met by. */
  due: string;
  regions: ReadinessRegion[];
  jobs: ReadinessJob[];
  indicators: ReadinessIndicator[];
}

/* ── Calculations ───────────────────────────────────────────────────────── */

export type ReadinessBand = 'low' | 'mid' | 'high';

/** Below this share a region is urgent; at `BAND_HIGH_FROM` and up it is on track. */
export const BAND_MID_FROM = 50;
export const BAND_HIGH_FROM = 75;

export function bandOf(percent: number): ReadinessBand {
  if (percent < BAND_MID_FROM) return 'low';
  if (percent < BAND_HIGH_FROM) return 'mid';

  return 'high';
}

/**
 * Whole per cent, and 0 over an empty denominator — a target of nobody is not a
 * target that was missed.
 */
export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export interface RegionReadiness {
  regionId: string;
  units: Array<ReadinessUnit & { percent: number; band: ReadinessBand }>;
  target: number;
  qualified: number;
  gap: number;
  percent: number;
  band: ReadinessBand;
}

export interface ReadinessTimeline {
  /** Share of the allotted time that has passed, capped at 100. */
  plannedPercent: number;
  daysLeft: number;
  /** When the target is met if the pace so far holds. */
  projected: Date;
  /** Positive: ahead of the due date; negative: behind it. */
  aheadDays: number;
}

export interface ReadinessSummary {
  announced: Date;
  due: Date;
  target: number;
  qualified: number;
  gap: number;
  percent: number;
  regions: RegionReadiness[];
  /** The same regions, biggest gap first — the order to act in. */
  priorities: RegionReadiness[];
  jobs: Array<ReadinessJob & { percent: number; band: ReadinessBand }>;
  timeline: ReadinessTimeline;
  indicators: Array<ReadinessIndicator & { change: number; improved: boolean }>;
}

const DAY_MS = 86_400_000;

function day(value: string): Date {
  /* Noon UTC: a date with no time must not slip a day across a timezone edge. */
  return new Date(`${value}T12:00:00Z`);
}

export function summarize(source: ReadinessTarget, now: Date): ReadinessSummary {
  const regions: RegionReadiness[] = source.regions.map((region) => {
    const target = region.units.reduce((sum, unit) => sum + unit.target, 0);
    const qualified = region.units.reduce((sum, unit) => sum + unit.qualified, 0);
    const percent = percentOf(qualified, target);

    return {
      regionId: region.regionId,
      units: region.units.map((unit) => {
        const unitPercent = percentOf(unit.qualified, unit.target);

        return { ...unit, percent: unitPercent, band: bandOf(unitPercent) };
      }),
      target,
      qualified,
      gap: target - qualified,
      percent,
      band: bandOf(percent),
    };
  });

  const target = regions.reduce((sum, region) => sum + region.target, 0);
  const qualified = regions.reduce((sum, region) => sum + region.qualified, 0);
  const percent = percentOf(qualified, target);

  const announced = day(source.announced);
  const due = day(source.due);
  const allotted = Math.max(1, Math.round((due.getTime() - announced.getTime()) / DAY_MS));
  const elapsed = Math.max(1, Math.round((now.getTime() - announced.getTime()) / DAY_MS));

  /* A straight line from the announcement through where we are now to 100%. With
     nothing qualified yet there is no pace to extend, so it is projected nowhere
     rather than to a date in the far future. */
  const projectedDays = percent === 0 ? Number.POSITIVE_INFINITY : elapsed / (percent / 100);
  const projected = Number.isFinite(projectedDays)
    ? new Date(announced.getTime() + projectedDays * DAY_MS)
    : new Date(Number.POSITIVE_INFINITY);

  return {
    announced,
    due,
    target,
    qualified,
    gap: target - qualified,
    percent,
    regions,
    priorities: [...regions].sort((a, b) => b.gap - a.gap),
    jobs: source.jobs.map((job) => {
      const jobPercent = percentOf(job.qualified, job.target);

      return { ...job, percent: jobPercent, band: bandOf(jobPercent) };
    }),
    timeline: {
      plannedPercent: Math.min(100, percentOf(elapsed, allotted)),
      daysLeft: Math.max(0, Math.round((due.getTime() - now.getTime()) / DAY_MS)),
      projected,
      aheadDays: Number.isFinite(projectedDays)
        ? Math.round((due.getTime() - projected.getTime()) / DAY_MS)
        : Number.NEGATIVE_INFINITY,
    },
    indicators: source.indicators.map((indicator) => {
      const change = indicator.isRate
        ? indicator.after - indicator.before
        : percentOf(indicator.after - indicator.before, indicator.before);
      const improved = indicator.lowerIsBetter
        ? indicator.after < indicator.before
        : indicator.after > indicator.before;

      return { ...indicator, change, improved };
    }),
  };
}

/* ── The worked example ─────────────────────────────────────────────────── */

const RESCUE = 'مراكز الإنقاذ والاستجابة';
const OPERATIONS = 'غرفة العمليات والإسعاف';

/** Civil Defense, one target. Invented figures — see the file header. */
export const SAMPLE_READINESS: ReadinessTarget = {
  title: 'منسوبو الدفاع المدني المؤهّلون للاستجابة للحوادث الكبرى',
  need: 'الإنقاذ في المباني العالية والحوادث الكيميائية، والإسعاف الميداني، وإدارة غرف العمليات وإخلاء المباني — جاهزية الاستجابة قبل موسم الأمطار والسيول القادم.',
  path: 'مسار «الاستجابة للحوادث الكبرى»',
  announced: '2026-01-15',
  due: '2027-03-31',
  regions: [
    {
      regionId: 'SA01',
      units: [
        { name: RESCUE, target: 400, qualified: 330 },
        { name: OPERATIONS, target: 200, qualified: 132 },
      ],
    },
    {
      regionId: 'SA02',
      units: [
        { name: RESCUE, target: 450, qualified: 290 },
        { name: 'فرق الإنقاذ البحري', target: 160, qualified: 105 },
        { name: OPERATIONS, target: 90, qualified: 60 },
      ],
    },
    {
      regionId: 'SA04',
      units: [
        { name: RESCUE, target: 300, qualified: 240 },
        { name: 'فرق الحوادث الكيميائية', target: 120, qualified: 85 },
        { name: OPERATIONS, target: 100, qualified: 65 },
      ],
    },
    {
      regionId: 'SA03',
      units: [
        { name: RESCUE, target: 140, qualified: 70 },
        { name: OPERATIONS, target: 120, qualified: 60 },
      ],
    },
    {
      regionId: 'SA07',
      units: [
        { name: RESCUE, target: 70, qualified: 35 },
        { name: OPERATIONS, target: 50, qualified: 31 },
      ],
    },
    {
      regionId: 'SA08',
      units: [
        { name: RESCUE, target: 60, qualified: 24 },
        { name: OPERATIONS, target: 30, qualified: 12 },
      ],
    },
    {
      regionId: 'SA12',
      units: [
        { name: RESCUE, target: 50, qualified: 33 },
        { name: OPERATIONS, target: 30, qualified: 19 },
      ],
    },
    {
      regionId: 'SA10',
      units: [
        { name: RESCUE, target: 70, qualified: 26 },
        { name: OPERATIONS, target: 40, qualified: 14 },
      ],
    },
    {
      regionId: 'SA09',
      units: [
        { name: 'فرق الإنقاذ في السيول', target: 60, qualified: 34 },
        { name: OPERATIONS, target: 70, qualified: 44 },
      ],
    },
    {
      regionId: 'SA14',
      units: [
        { name: 'فرق الإنقاذ الجبلي', target: 80, qualified: 55 },
        { name: OPERATIONS, target: 70, qualified: 44 },
      ],
    },
    {
      regionId: 'SA05',
      units: [
        { name: RESCUE, target: 40, qualified: 37 },
        { name: OPERATIONS, target: 30, qualified: 26 },
      ],
    },
    {
      regionId: 'SA06',
      units: [
        { name: RESCUE, target: 25, qualified: 14 },
        { name: OPERATIONS, target: 15, qualified: 8 },
      ],
    },
    { regionId: 'SA11', units: [{ name: RESCUE, target: 30, qualified: 27 }] },
  ],
  jobs: [
    { name: 'ضابط إنقاذ — الإنقاذ في الحوادث الكبرى', target: 1200, qualified: 840 },
    { name: 'مسعف ميداني — الإسعاف في مواقع الحوادث', target: 800, qualified: 512 },
    { name: 'مشغّل غرفة العمليات — إدارة البلاغات', target: 500, qualified: 272 },
    { name: 'مشرف إخلاء — إخلاء المباني والتجمعات', target: 400, qualified: 296 },
  ],
  indicators: [
    {
      name: 'متوسط زمن الوصول إلى موقع البلاغ (دقيقة)',
      before: 12.5,
      after: 9.8,
      lowerIsBetter: true,
      isRate: false,
    },
    {
      name: 'زمن إخلاء المبنى في التمارين (دقيقة)',
      before: 18,
      after: 12,
      lowerIsBetter: true,
      isRate: false,
    },
    {
      name: 'زمن معالجة البلاغ في غرفة العمليات (ثانية)',
      before: 95,
      after: 62,
      lowerIsBetter: true,
      isRate: false,
    },
    {
      name: 'نسبة البلاغات المُباشَرة خلال الزمن المعياري (%)',
      before: 72,
      after: 86,
      lowerIsBetter: false,
      isRate: true,
    },
  ],
};
