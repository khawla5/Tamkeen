import type { AppConfigService } from '../config/app-config.module';
import type { LmsPort } from '../moodle/lms.port';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

/**
 * §4C.1's aggregation, against a fake Prisma.
 *
 * The queries themselves are ordinary counts and the integration suite proves
 * they run. What is worth pinning down here is the *arithmetic on top of them* —
 * the three places where a plausible-looking implementation would be quietly
 * wrong:
 *
 *  1. a retake must not count as a second assessed person (D-033),
 *  2. the career-type distribution must use each person's newest result, not
 *     all of them, or it describes the indecisive rather than the ministry,
 *  3. a completion rate over nobody is undefined, not 0%.
 */

interface ResultRow {
  userId: string;
  code: string;
  completedAt: Date;
}

function harness(
  options: {
    results?: ResultRow[];
    userPaths?: Array<{ status: string }>;
    lmsReachable?: boolean;
    lastRuns?: Record<string, Date>;
    activity?: Array<{ id: bigint; action: string; actorName: string | null }>;
    activeAssessment?: { version: number; effectiveFrom: Date | null; createdAt: Date } | null;
    draftCount?: number;
    activePathLetters?: string[];
  } = {},
) {
  const results = options.results ?? [];
  const userPaths = options.userPaths ?? [];
  const activity = options.activity ?? [];

  const groupBy = (rows: Array<Record<string, string>>, key: string) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row[key]!, (counts.get(row[key]!) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({
      [key]: value,
      _count: { _all: count },
    }));
  };

  const prisma = {
    user: {
      groupBy: () => Promise.resolve(groupBy([{ role: 'EMPLOYEE' }, { role: 'ENTITY' }], 'role')),
      count: () => Promise.resolve(0),
    },
    entity: { groupBy: () => Promise.resolve(groupBy([{ status: 'ACTIVE' }], 'status')) },
    path: {
      count: () => Promise.resolve(4),
      groupBy: () =>
        Promise.resolve(
          groupBy(
            (options.activePathLetters ?? []).map((riasecLetter) => ({ riasecLetter })),
            'riasecLetter',
          ),
        ),
    },
    course: { count: () => Promise.resolve(48) },
    assessmentResult: {
      findMany: (args: { distinct: string[]; orderBy?: unknown; select: { code?: boolean } }) => {
        /* Mirrors Postgres DISTINCT ON: the first row per userId in the given
           order wins. The service asks for completedAt descending, so that is
           the newest — and a test below depends on this being modelled rather
           than assumed. */
        const seen = new Set<string>();
        const ordered = args.orderBy
          ? [...results].sort(
              (a, b) => a.userId.localeCompare(b.userId) || +b.completedAt - +a.completedAt,
            )
          : results;

        const distinct = ordered.filter((row) => {
          if (seen.has(row.userId)) return false;
          seen.add(row.userId);
          return true;
        });

        return Promise.resolve(
          args.select.code ? distinct.map((row) => ({ code: row.code })) : distinct,
        );
      },
    },
    userPath: { groupBy: () => Promise.resolve(groupBy(userPaths, 'status')) },
    completion: { count: () => Promise.resolve(11) },
    certificate: { count: () => Promise.resolve(7) },
    auditLog: {
      findFirst: (args: { where: { action: string } }) => {
        const at = options.lastRuns?.[args.where.action];
        return Promise.resolve(at ? { occurredAt: at } : null);
      },
      findMany: () =>
        Promise.resolve(
          activity.map((row) => ({
            id: row.id,
            action: row.action,
            outcome: 'SUCCESS' as const,
            targetType: 'course',
            occurredAt: new Date('2026-08-23T10:00:00Z'),
            actor: row.actorName === null ? null : { fullName: row.actorName },
          })),
        ),
    },
    assessment: {
      findFirst: () =>
        Promise.resolve(
          options.activeAssessment === undefined
            ? {
                version: 1,
                effectiveFrom: new Date('2026-08-01T00:00:00Z'),
                createdAt: new Date('2026-07-01T00:00:00Z'),
              }
            : options.activeAssessment,
        ),
      count: () => Promise.resolve(options.draftCount ?? 0),
    },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => (key === 'MOODLE_MODE' ? 'mock' : 'http://localhost:8080'),
  } as unknown as AppConfigService;

  const lms = {
    checkHealth: () =>
      options.lmsReachable === false
        ? Promise.resolve({ reachable: false, failureCode: 'UNAUTHORISED' as const })
        : Promise.resolve({ reachable: true, siteName: 'Tamkeen LMS' }),
  } as unknown as LmsPort;

  return new AdminDashboardService(prisma, config, lms);
}

describe('AdminDashboardService', () => {
  it('counts a person once however many times they retook the assessment', async () => {
    const view = await harness({
      results: [
        { userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') },
        { userId: 'u1', code: 'RIC', completedAt: new Date('2026-02-01') },
        { userId: 'u2', code: 'SIA', completedAt: new Date('2026-01-15') },
      ],
    }).get();

    expect(view.journey.assessed).toBe(2);
  });

  it('distributes career types by each person’s newest result, not by every attempt', async () => {
    const view = await harness({
      results: [
        /* u1 changed their mind: the old S must not still be counted, or one
           indecisive employee inflates two different types at once. */
        { userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') },
        { userId: 'u1', code: 'RIC', completedAt: new Date('2026-02-01') },
        { userId: 'u2', code: 'SIA', completedAt: new Date('2026-01-15') },
      ],
    }).get();

    const employees = Object.fromEntries(
      view.letterDistribution.map((row) => [row.letter, row.employees]),
    );

    expect(employees).toEqual({ R: 1, I: 0, A: 0, S: 1, E: 0, C: 0 });
  });

  it('counts the dominant letter, not every letter of the code', async () => {
    const view = await harness({
      results: [{ userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') }],
    }).get();

    /* I and A are in this person's code but are not what they lead with. A
       distribution that counted all three would total more people than exist. */
    const employees = Object.fromEntries(
      view.letterDistribution.map((row) => [row.letter, row.employees]),
    );

    expect(employees).toEqual({ R: 0, I: 0, A: 0, S: 1, E: 0, C: 0 });
    expect(view.letterDistribution.reduce((sum, row) => sum + row.employees, 0)).toBe(1);
  });

  it('returns all six letters, including the ones nobody scored', async () => {
    const view = await harness({
      results: [{ userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') }],
    }).get();

    /* A dimension nobody leads with is a finding, not an absence — and a row
       that disappeared could not be compared against the paths offered for it. */
    expect(view.letterDistribution).toHaveLength(6);
    expect([...view.letterDistribution.map((row) => row.letter)].sort()).toEqual([
      'A',
      'C',
      'E',
      'I',
      'R',
      'S',
    ]);
  });

  it('orders by employee count, breaking a tie on the canonical letter order', async () => {
    const view = await harness({
      results: [
        { userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') },
        { userId: 'u2', code: 'SEC', completedAt: new Date('2026-01-01') },
        { userId: 'u3', code: 'RIC', completedAt: new Date('2026-01-01') },
        { userId: 'u4', code: 'AEC', completedAt: new Date('2026-01-01') },
      ],
    }).get();

    /* S leads on count; R and A tie at one each and fall back to canonical
       R-I-A-S-E-C (D-031), so the order is reproducible between refreshes. */
    expect(view.letterDistribution.map((row) => row.letter)).toEqual([
      'S',
      'R',
      'A',
      'I',
      'E',
      'C',
    ]);
  });

  it('counts only OFFERED paths beside each type', async () => {
    const view = await harness({
      results: [{ userId: 'u1', code: 'SIA', completedAt: new Date('2026-01-01') }],
      activePathLetters: ['S', 'S', 'R'],
    }).get();

    const paths = Object.fromEntries(
      view.letterDistribution.map((row) => [row.letter, row.activePaths]),
    );

    /* Retired paths are excluded by the query's `isActive` filter: a type
       served only by paths no learner can choose is an unserved type, and
       counting them would hide exactly the gap this section exists to show. */
    expect(paths).toEqual({ R: 1, I: 0, A: 0, S: 2, E: 0, C: 0 });
  });

  it('reports no completion rate at all when nobody has committed to a path', async () => {
    const view = await harness({ userPaths: [{ status: 'BUILDING' }] }).get();

    /* Not 0. A rate over an empty denominator is undefined, and "0%" on a
       product nobody has finished yet reads as failure. */
    expect(view.journey.pathCompletionRate).toBeNull();
    expect(view.journey.building).toBe(1);
  });

  it('computes the completion rate over committed learners only', async () => {
    const view = await harness({
      userPaths: [
        { status: 'BUILDING' },
        { status: 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'COMPLETED' },
      ],
    }).get();

    /* 1 of 4 committed — the learner still building has not committed to
       anything and cannot be counted against the rate. */
    expect(view.journey.pathCompletionRate).toBe(25);
  });

  it('separates an unreachable LMS from a stalled sync', async () => {
    const view = await harness({
      lmsReachable: true,
      lastRuns: { LMS_CATALOG_SYNCED: new Date('2026-08-23T09:00:00Z') },
    }).get();

    expect(view.lms.reachable).toBe(true);
    expect(view.lms.lastCatalogSyncAt).toBe('2026-08-23T09:00:00.000Z');
    /* Moodle answers, but the completion job has never completed a run. A single
       "ok" would hide precisely this. */
    expect(view.lms.lastCompletionSyncAt).toBeNull();
  });

  it('carries the failure code when the LMS refuses', async () => {
    const view = await harness({ lmsReachable: false }).get();

    expect(view.lms).toMatchObject({
      reachable: false,
      failureCode: 'UNAUTHORISED',
      siteName: null,
    });
  });

  it('renders a bigint audit id as a string', async () => {
    const view = await harness({
      activity: [{ id: 9007199254740993n, action: 'PATH_CONFIRMED', actorName: 'سارة' }],
    }).get();

    /* Larger than Number.MAX_SAFE_INTEGER on purpose: JSON.stringify throws on a
       bigint rather than rounding it, so this must not reach the serialiser. */
    expect(view.recentActivity[0]!.id).toBe('9007199254740993');
    expect(() => JSON.stringify(view)).not.toThrow();
  });

  it('names an anonymous actor as null rather than inventing one', async () => {
    const view = await harness({
      activity: [{ id: 1n, action: 'AUTH_LOGIN_FAILED', actorName: null }],
    }).get();

    expect(view.recentActivity[0]!.actorName).toBeNull();
  });

  it('reports no assessment rather than throwing when none is active', async () => {
    const view = await harness({ activeAssessment: null }).get();

    expect(view.assessment).toBeNull();
  });

  it('reports the date the version took effect, not the date its row was made', async () => {
    /* A draft copied today and published next week took effect next week. The
       two dates differ by exactly the length of the edit, and §4C.3 promises the
       effective one. */
    const view = await harness().get();

    expect(view.assessment?.effectiveFrom).toBe('2026-08-01T00:00:00.000Z');
  });

  it('falls back to the created date rather than crashing on a null effective date', async () => {
    /* Unreachable for an ACTIVE row — publishing always stamps it — so this is
       about the dashboard staying up rather than about the data being right. */
    const view = await harness({
      activeAssessment: {
        version: 3,
        effectiveFrom: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    }).get();

    expect(view.assessment?.effectiveFrom).toBe('2026-07-01T00:00:00.000Z');
  });

  it('flags an unfinished assessment edit, which is what waits on the administrator', async () => {
    expect((await harness({ draftCount: 1 }).get()).assessment?.hasDraft).toBe(true);
    expect((await harness({ draftCount: 0 }).get()).assessment?.hasDraft).toBe(false);
  });
});
