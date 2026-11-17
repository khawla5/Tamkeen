import type { PrismaService } from '../prisma/prisma.service';
import { AdminImpactService, byDepartment } from './admin-impact.service';

/**
 * §4C.8's «الأثر», against a fake Prisma (TAM-149).
 *
 * The queries themselves are ordinary aggregates and the integration suite
 * proves they run. What is worth pinning down here is everything a
 * plausible-looking implementation would get quietly wrong — and every one of
 * these is a report that would be *believed*:
 *
 *  1. the previous period must be the same window shifted, ending the
 *     millisecond before this one, or the delta invents growth;
 *  2. a course with no duration set must contribute no hours *and say so*,
 *     rather than silently shortening the ministry's training total;
 *  3. the participation rate must be cumulative, or it exceeds 100%;
 *  4. a department that took no part must still have a row;
 *  5. an undated pass must still fall in a period rather than vanish;
 *  6. `cefr` is null until TAM-148 — "not enabled" is not "nobody took it".
 */

const PERIOD = { from: '2026-08-01T00:00:00.000', to: '2026-08-31T23:59:59.999' };

/** August's comparison is July, to the millisecond. */
const PREVIOUS_START = new Date('2026-07-01T00:00:00.000').getTime();
const PERIOD_START = new Date(PERIOD.from).getTime();

interface Script {
  registered?: { current: string[]; previous: string[] };
  assessed?: { current: string[]; previous: string[] };
  committed?: { current: string[]; previous: string[] };
  active?: { current: string[]; previous: string[] };
  departments?: string[];
  /** Verified accounts and committed employees at each period's end. */
  toDate?: { accounts: [number, number]; committed: [number, number] };
  passes?: {
    current: Array<{ moodleCourseId: number; count: number; avgGrade: number | null }>;
    previous: Array<{ moodleCourseId: number; count: number; avgGrade: number | null }>;
  };
  courses?: Array<{
    id: string;
    moodleCourseId: number;
    title: string;
    durationMinutes: number | null;
  }>;
  certificates?: { current: [number, number]; previous: [number, number] };
  pathCertificates?: Array<{ pathId: string | null; count: number }>;
  paths?: Array<{ id: string; name: string }>;
  trendPasses?: Array<{ completedAt: Date | null; syncedAt: Date }>;
  trendCertificates?: Date[];
  /** Placements made in the period, as `groupBy` returns them. */
  placements?: Array<{ pathId: string; levelId: string; count: number }>;
  /** The levels those placements name. */
  levels?: Array<{
    id: string;
    name: string;
    position: number;
    path: { id: string; name: string; displayOrder: number };
  }>;
}

/**
 * A filter the service handed Prisma, read structurally.
 *
 * The fake asserts on the *shape* of the query rather than on a typed client,
 * which is the point: what these tests are pinning down is that the period, the
 * department and the undated-pass branch actually reach the database.
 */
type Filter = Record<string, unknown>;

/** One step at a time, so a missing level is `undefined` rather than a throw. */
function dig(source: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    return (node as Record<string, unknown>)[key];
  }, source);
}

const asDate = (...values: unknown[]): Date | undefined =>
  values.find((value): value is Date => value instanceof Date);

/** Where in the query's filter the period ended up, whatever shape it took. */
function startOf(where: Filter): number {
  return (
    asDate(
      dig(where, ['createdAt', 'gte']),
      dig(where, ['placements', 'some', 'placedAt', 'gte']),
      dig(where, ['userPaths', 'some', 'assignedAt', 'gte']),
      dig(where, ['OR', '0', 'completions', 'some', 'completedAt', 'gte']),
      dig(where, ['OR', '0', 'completedAt', 'gte']),
      dig(where, ['issuedAt', 'gte']),
      dig(where, ['completedAt', 'gte']),
    )?.getTime() ?? Number.NaN
  );
}

const isCurrent = (where: Filter) => startOf(where) === PERIOD_START;

function harness(script: Script = {}) {
  const seen: { userWhere: Filter[]; completionWhere: Filter[] } = {
    userWhere: [],
    completionWhere: [],
  };

  const pick = <T>(where: Filter, pair: { current: T; previous: T } | undefined, fallback: T): T =>
    pair === undefined ? fallback : isCurrent(where) ? pair.current : pair.previous;

  const asRows = (departments: string[]) => departments.map((department) => ({ department }));

  const prisma = {
    user: {
      findMany: ({ where }: { where: Filter }) => {
        seen.userWhere.push(where);

        if (where.emailVerifiedAt)
          return Promise.resolve(asRows(pick(where, script.registered, [])));
        if (where.placements) return Promise.resolve(asRows(pick(where, script.assessed, [])));
        if (where.userPaths) return Promise.resolve(asRows(pick(where, script.committed, [])));
        return Promise.resolve(asRows(pick(where, script.active, [])));
      },
      count: ({ where }: { where: Filter }) => {
        const asOf = asDate(
          dig(where, ['createdAt', 'lte']),
          dig(where, ['userPaths', 'some', 'assignedAt', 'lte']),
        );
        const index = asOf?.getTime() === new Date(PERIOD.to).getTime() ? 0 : 1;
        const toDate = script.toDate ?? {
          accounts: [0, 0] as [number, number],
          committed: [0, 0] as [number, number],
        };

        return Promise.resolve(
          where.emailVerifiedAt ? toDate.accounts[index] : toDate.committed[index],
        );
      },
      groupBy: () => Promise.resolve(asRows(script.departments ?? [])),
    },
    completion: {
      groupBy: ({ where }: { where: Filter }) => {
        seen.completionWhere.push(where);

        return Promise.resolve(
          pick(where, script.passes, []).map((row) => ({
            moodleCourseId: row.moodleCourseId,
            _count: { _all: row.count },
            _avg: { gradePercent: row.avgGrade },
          })),
        );
      },
      findMany: () => Promise.resolve(script.trendPasses ?? []),
    },
    certificate: {
      groupBy: ({ where, by }: { where: Filter; by: string[] }) => {
        if (by[0] === 'pathId') {
          return Promise.resolve(
            (script.pathCertificates ?? []).map((row) => ({
              pathId: row.pathId,
              _count: { _all: row.count },
            })),
          );
        }

        const [course, path] = pick(where, script.certificates, [0, 0] as [number, number]);
        return Promise.resolve([
          { type: 'COURSE', _count: { _all: course } },
          { type: 'PATH', _count: { _all: path } },
        ]);
      },
      findMany: () =>
        Promise.resolve((script.trendCertificates ?? []).map((issuedAt) => ({ issuedAt }))),
    },
    course: { findMany: () => Promise.resolve(script.courses ?? []) },
    path: { findMany: () => Promise.resolve(script.paths ?? []) },
    level: { findMany: () => Promise.resolve(script.levels ?? []) },
    learnerPlacement: {
      groupBy: () =>
        Promise.resolve(
          (script.placements ?? []).map((row) => ({
            pathId: row.pathId,
            levelId: row.levelId,
            _count: { _all: row.count },
          })),
        ),
    },
  };

  return { service: new AdminImpactService(prisma as unknown as PrismaService), seen };
}

describe('AdminImpactService', () => {
  it('compares the period against the same window shifted, not a calendar guess', async () => {
    const { service } = harness();

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    const period = { from: new Date(view.period.from), to: new Date(view.period.to) };
    const previous = {
      from: new Date(view.previousPeriod.from),
      to: new Date(view.previousPeriod.to),
    };

    expect(previous.to.getTime()).toBe(period.from.getTime() - 1);
    expect(previous.from.getTime()).toBe(PREVIOUS_START);
    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      period.to.getTime() - period.from.getTime(),
    );
  });

  it('answers for the current month when no period is given', async () => {
    const { service } = harness();

    const view = await service.view({});

    expect(new Date(view.period.from).getDate()).toBe(1);
    expect(new Date(view.period.from).getMonth()).toBe(new Date().getMonth());
  });

  it('counts people once and carries the delta against the previous period', async () => {
    const { service } = harness({
      assessed: { current: ['أ', 'أ', 'ب'], previous: ['أ'] },
      registered: { current: ['أ', 'ب'], previous: ['أ', 'ب', 'ب'] },
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    /* Three rows because three *people* were placed — the fake returns one row
       per person, which is the shape the relation filter guarantees: a second
       attempt cannot add a second row, because a placement is unique per
       learner and path (D-134). */
    expect(view.participation.assessed).toEqual({ value: 3, previous: 1, delta: 2 });
    /* A fall is reported as one, rather than clamped at zero. */
    expect(view.participation.registered).toEqual({ value: 2, previous: 3, delta: -1 });
  });

  it('reads activity from either side of the sync, and never from synced_at', async () => {
    const { service, seen } = harness();

    await service.view({ from: PERIOD.from, to: PERIOD.to });

    const active = seen.userWhere.find(
      (where) => dig(where, ['OR', '0', 'completions']) !== undefined,
    );

    expect(dig(active, ['OR'])).toHaveLength(2);
    /* Or enrolled in the period: with no per-learner course rows left (D-134),
       the enrolment is what records that somebody was put in front of a course
       at all. */
    expect(dig(active, ['OR', '1', 'enrollments', 'some', 'enrolledAt', 'gte'])).toBeInstanceOf(
      Date,
    );
    /* `synced_at` is rewritten for every enrolled learner on every scheduled
       run, so using it would report the whole cohort as active every five
       minutes. */
    expect(JSON.stringify(active)).not.toContain('syncedAt');
  });

  it('rates participation cumulatively, so it cannot exceed one hundred per cent', async () => {
    const { service } = harness({
      /* Twelve people committed in the period, but only two accounts were
         created in it: a per-period rate would read 600%. */
      committed: { current: Array.from({ length: 12 }, () => 'أ'), previous: [] },
      registered: { current: ['أ', 'ب'], previous: [] },
      toDate: { accounts: [80, 60], committed: [20, 12] },
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.participation.participationRate).toBe(25);
    expect(view.participation.previousParticipationRate).toBe(20);
    expect(view.participation.accountsToDate).toBe(80);
  });

  it('leaves the rate undefined over an empty denominator', async () => {
    const { service } = harness({ toDate: { accounts: [0, 0], committed: [0, 0] } });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.participation.participationRate).toBeNull();
  });

  it('keeps a department that took no part, as a row of zeros', async () => {
    const { service } = harness({
      departments: ['الجوازات', 'السجون'],
      registered: { current: ['الجوازات'], previous: [] },
      assessed: { current: ['الجوازات', 'الجوازات'], previous: [] },
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.byDepartment).toEqual([
      { department: 'الجوازات', registered: 1, assessed: 2, committed: 0, active: 0 },
      { department: 'السجون', registered: 0, assessed: 0, committed: 0, active: 0 },
    ]);
  });

  it('sums hours from the course duration, and says how many passes had none', async () => {
    const { service } = harness({
      passes: {
        current: [
          { moodleCourseId: 11, count: 4, avgGrade: 82.4 },
          { moodleCourseId: 12, count: 3, avgGrade: null },
        ],
        previous: [{ moodleCourseId: 11, count: 1, avgGrade: 90 }],
      },
      courses: [
        { id: 'c-11', moodleCourseId: 11, title: 'السلامة الميدانية', durationMinutes: 120 },
        { id: 'c-12', moodleCourseId: 12, title: 'التحقيق الجنائي', durationMinutes: null },
      ],
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.learning.coursesPassed).toEqual({ value: 7, previous: 1, delta: 6 });
    expect(view.learning.learningMinutes).toEqual({ value: 480, previous: 120, delta: 360 });
    /* The three passes the total is silently short by (D-035). */
    expect(view.learning.passesWithoutDuration).toBe(3);
  });

  it('names the most-passed courses first, with the grade rounded as it is stored', async () => {
    const { service } = harness({
      passes: {
        current: [
          { moodleCourseId: 12, count: 2, avgGrade: 71.5 },
          { moodleCourseId: 11, count: 9, avgGrade: null },
        ],
        previous: [],
      },
      courses: [
        { id: 'c-11', moodleCourseId: 11, title: 'السلامة الميدانية', durationMinutes: 60 },
        { id: 'c-12', moodleCourseId: 12, title: 'التحقيق الجنائي', durationMinutes: 60 },
      ],
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.topCourses).toEqual([
      { courseId: 'c-11', title: 'السلامة الميدانية', passes: 9, averageGrade: null },
      { courseId: 'c-12', title: 'التحقيق الجنائي', passes: 2, averageGrade: 72 },
    ]);
  });

  it('dates an undated pass by when it was recorded rather than losing it', async () => {
    const { service, seen } = harness();

    await service.view({ from: PERIOD.from, to: PERIOD.to });

    const where = seen.completionWhere[0]!;

    expect(where.passed).toBe(true);
    /* Moodle can report a completed course with no criterion timestamp (D-038);
       without this branch such a pass belongs to no period at all and quietly
       disappears from every report while still counting in the running total
       the reports tab shows. */
    expect(dig(where, ['OR', '1'])).toMatchObject({ completedAt: null });
    expect(dig(where, ['OR', '1', 'syncedAt'])).toBeDefined();
  });

  it('counts a completed path from its certificate, and names the path', async () => {
    const { service } = harness({
      pathCertificates: [
        { pathId: 'p-1', count: 2 },
        { pathId: 'p-2', count: 5 },
        /* A course certificate's null path id must not become a row. */
        { pathId: null, count: 3 },
      ],
      paths: [
        { id: 'p-1', name: 'العمليات الميدانية' },
        { id: 'p-2', name: 'التحليل الجنائي' },
      ],
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.topPaths).toEqual([
      { pathId: 'p-2', name: 'التحليل الجنائي', completions: 5 },
      { pathId: 'p-1', name: 'العمليات الميدانية', completions: 2 },
    ]);
  });

  it('returns twelve months ending with the period, zeros included', async () => {
    const { service } = harness({
      trendPasses: [
        { completedAt: new Date('2026-08-04T10:00:00'), syncedAt: new Date('2026-08-04T10:05:00') },
        /* Undated by the LMS: bucketed by when we recorded it. */
        { completedAt: null, syncedAt: new Date('2026-07-30T09:00:00') },
      ],
      trendCertificates: [new Date('2026-08-20T12:00:00')],
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.trend).toHaveLength(12);
    expect(view.trend[0]!.month).toBe('2025-09');
    expect(view.trend[11]).toEqual({ month: '2026-08', coursesPassed: 1, certificates: 1 });
    expect(view.trend[10]).toEqual({ month: '2026-07', coursesPassed: 1, certificates: 0 });
  });

  it('reports where the period placed people, in path then rung order', async () => {
    const { service } = harness({
      placements: [
        { pathId: 'p-2', levelId: 'l-3', count: 2 },
        { pathId: 'p-1', levelId: 'l-2', count: 5 },
        { pathId: 'p-1', levelId: 'l-1', count: 9 },
      ],
      levels: [
        { id: 'l-1', name: 'تأسيسي', position: 1, path: { id: 'p-1', name: 'أ', displayOrder: 1 } },
        { id: 'l-2', name: 'متقدم', position: 2, path: { id: 'p-1', name: 'أ', displayOrder: 1 } },
        { id: 'l-3', name: 'تأسيسي', position: 1, path: { id: 'p-2', name: 'ب', displayOrder: 2 } },
      ],
    });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.placements.map((row) => [row.pathName, row.levelName, row.employees])).toEqual([
      ['أ', 'تأسيسي', 9],
      ['أ', 'متقدم', 5],
      ['ب', 'تأسيسي', 2],
    ]);
  });

  it('reports an empty placement list when nobody was placed in the period', async () => {
    /* A real finding rather than a gap: a quarter in which no directorate sat an
       assessment is exactly what management needs to see. */
    const { service } = harness();

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(view.placements).toEqual([]);
  });

  it('narrows every population to the department asked for', async () => {
    const { service, seen } = harness({ departments: ['الجوازات'] });

    const view = await service.view({ from: PERIOD.from, to: PERIOD.to, department: 'الجوازات' });

    expect(view.department).toBe('الجوازات');
    expect(seen.userWhere.every((where) => where.department === 'الجوازات')).toBe(true);
    expect(
      seen.completionWhere.every((where) => dig(where, ['user', 'department']) === 'الجوازات'),
    ).toBe(true);
  });

  it('counts employees only — an admin account is not the ministry taking part', async () => {
    const { service, seen } = harness();

    await service.view({ from: PERIOD.from, to: PERIOD.to });

    expect(seen.userWhere.every((where) => where.role === 'EMPLOYEE')).toBe(true);
  });
});

describe('byDepartment', () => {
  it('tallies the same rows the tiles are counted from', () => {
    const rows = {
      registered: [{ department: 'أ' }, { department: 'ب' }],
      assessed: [{ department: 'أ' }, { department: 'أ' }],
      committed: [],
      active: [{ department: 'ب' }],
    };

    /* The column totals must equal the tiles above them, which is the whole
       reason the table is derived from these rows rather than re-queried. */
    const table = byDepartment(['أ', 'ب'], rows);

    expect(table.reduce((sum, row) => sum + row.assessed, 0)).toBe(rows.assessed.length);
    expect(table).toEqual([
      { department: 'أ', registered: 1, assessed: 2, committed: 0, active: 0 },
      { department: 'ب', registered: 1, assessed: 0, committed: 0, active: 1 },
    ]);
  });
});
