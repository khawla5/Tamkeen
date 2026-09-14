import type { AppConfigService } from '../config/app-config.module';
import type { LmsPort } from '../moodle/lms.port';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

/**
 * §4C.1's aggregation, against a fake Prisma (D-134).
 *
 * The queries themselves are ordinary counts and the integration suite proves
 * they run. What is worth pinning down here is the *arithmetic on top of them* —
 * the places where a plausible-looking implementation would be quietly wrong:
 *
 *  1. an employee on two paths is one person in training, not two (D-130),
 *  2. the completion rate's denominator is the people actually placed, not
 *     everyone assigned — otherwise an unpublished assessment reads as a
 *     completion problem,
 *  3. a rate over nobody is undefined, not 0%,
 *  4. a published path nobody is on still appears, because a zero is a finding.
 */

interface PathRow {
  id: string;
  name: string;
  statuses: Array<'ACTIVE' | 'COMPLETED'>;
  placed?: number;
  hasAssessment?: boolean;
}

function harness(
  options: {
    paths?: PathRow[];
    /** Distinct employees holding at least one path. */
    assignedUserIds?: string[];
    placedLearnerIds?: string[];
    completedUserIds?: string[];
    lmsReachable?: boolean;
    lastRuns?: Record<string, Date>;
    activity?: Array<{ id: bigint; action: string; actorName: string | null }>;
  } = {},
) {
  const paths = options.paths ?? [];
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
      count: () => Promise.resolve(paths.length),
      findMany: (args: { where?: { assessments?: unknown }; select: Record<string, unknown> }) => {
        /* Two different reads share this method: the assignment share wants
           every published path with its learners, and `pathsWithoutAssessment`
           wants only the ones with no ACTIVE version. The `assessments` filter
           is what tells them apart. */
        if (args.where && 'assessments' in args.where) {
          return Promise.resolve(
            paths
              .filter((path) => path.hasAssessment === false)
              .map((path) => ({ id: path.id, name: path.name })),
          );
        }

        return Promise.resolve(
          paths.map((path) => ({
            id: path.id,
            name: path.name,
            userPaths: path.statuses.map((status) => ({ status })),
          })),
        );
      },
    },
    course: { count: () => Promise.resolve(48) },
    userPath: {
      findMany: (args: { where?: { status?: string } }) =>
        Promise.resolve(
          (args.where?.status === 'COMPLETED'
            ? (options.completedUserIds ?? [])
            : (options.assignedUserIds ?? [])
          ).map((userId) => ({ userId })),
        ),
    },
    learnerPlacement: {
      findMany: () =>
        Promise.resolve((options.placedLearnerIds ?? []).map((learnerId) => ({ learnerId }))),
      groupBy: () =>
        Promise.resolve(
          paths
            .filter((path) => (path.placed ?? 0) > 0)
            .map((path) => ({ pathId: path.id, _count: { _all: path.placed ?? 0 } })),
        ),
    },
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
  it('counts an employee once however many paths they hold', async () => {
    /* D-130 allows more than one assignment per person, so counting rows would
       report one well-served employee as several people in training. */
    const view = await harness({ assignedUserIds: ['u1', 'u2'] }).get();

    expect(view.journey.assigned).toBe(2);
  });

  it('rates completion over the people who were actually placed', async () => {
    /* Four assigned, two of whom sat the assessment, one of those finished. The
       rate is one of two, not one of four: a learner waiting on an unpublished
       assessment has not failed to finish anything. */
    const view = await harness({
      assignedUserIds: ['u1', 'u2', 'u3', 'u4'],
      placedLearnerIds: ['u1', 'u2'],
      completedUserIds: ['u1'],
    }).get();

    expect(view.journey.placed).toBe(2);
    expect(view.journey.pathCompletionRate).toBe(50);
  });

  it('leaves the completion rate undefined when nobody has been placed', async () => {
    /* 0% of nobody reads as failure, which is a different claim. */
    const view = await harness({ assignedUserIds: ['u1'] }).get();

    expect(view.journey.pathCompletionRate).toBeNull();
  });

  it('lists a published path nobody is on, with zeroes', async () => {
    /* A path the ministry built and never used is exactly the finding this
       section exists for, and a row that disappears cannot be read. */
    const view = await harness({
      paths: [
        { id: 'p1', name: 'مسار أ', statuses: ['ACTIVE', 'COMPLETED'], placed: 1 },
        { id: 'p2', name: 'مسار ب', statuses: [] },
      ],
    }).get();

    expect(view.pathDistribution).toEqual([
      { pathId: 'p1', name: 'مسار أ', assigned: 2, placed: 1, completed: 1 },
      { pathId: 'p2', name: 'مسار ب', assigned: 0, placed: 0, completed: 0 },
    ]);
  });

  it('orders the distribution by how many people were assigned', async () => {
    const view = await harness({
      paths: [
        { id: 'p1', name: 'مسار أ', statuses: ['ACTIVE'] },
        { id: 'p2', name: 'مسار ب', statuses: ['ACTIVE', 'ACTIVE', 'ACTIVE'] },
      ],
    }).get();

    expect(view.pathDistribution.map((row) => row.pathId)).toEqual(['p2', 'p1']);
  });

  it('names published paths whose assessment nobody has published', async () => {
    /* The one genuinely stuck thing on this page: every learner assigned to such
       a path waits at «بانتظار تحديد المستوى» and nothing else says why. */
    const view = await harness({
      paths: [
        { id: 'p1', name: 'مسار أ', statuses: [], hasAssessment: true },
        { id: 'p2', name: 'مسار ب', statuses: [], hasAssessment: false },
      ],
    }).get();

    expect(view.pathsWithoutAssessment).toEqual([{ id: 'p2', name: 'مسار ب' }]);
  });

  it('separates a reachable LMS from a sync job that has not run', async () => {
    /* A healthy Moodle behind a stalled scheduler is the failure a single green
       tick would hide, and the one an operator has to act on. */
    const view = await harness({
      lastRuns: { LMS_CATALOG_SYNCED: new Date('2026-08-20T09:00:00Z') },
    }).get();

    expect(view.lms.reachable).toBe(true);
    expect(view.lms.lastCatalogSyncAt).toBe('2026-08-20T09:00:00.000Z');
    expect(view.lms.lastCompletionSyncAt).toBeNull();
  });

  it('says why the LMS is unreachable, not merely that it is', async () => {
    /* A bad token and a down server need different fixes; collapsing them would
       waste the operator's first hour. */
    const view = await harness({ lmsReachable: false }).get();

    expect(view.lms.reachable).toBe(false);
    expect(view.lms.failureCode).toBe('UNAUTHORISED');
  });
});
