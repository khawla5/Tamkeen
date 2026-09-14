import { AuditAction } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { AppConfigService } from '../config/app-config.module';
import type { LmsPort } from '../moodle/lms.port';
import type { LmsCourse } from '../moodle/lms.types';
import type { PrismaService } from '../prisma/prisma.service';
import { CatalogSyncService } from './catalog-sync.service';

/**
 * Prisma and the LMS are both faked here. What is under test is the sync
 * *policy* — what gets written, what is left alone, and what happens to a course
 * that disappears — which is where the product rules live. The database
 * behaviour itself is covered by the integration suite.
 */

interface Row {
  id: string;
  moodleCourseId: number;
  /** Ours, and the thing sync must never write (D-059). */
  publication: string;
  durationMinutes: number | null;
  /** Whether the LMS still returns it — sync's to set, nobody else's. */
  lmsPresent: boolean;
}

const lmsCourse = (overrides: Partial<LmsCourse> = {}): LmsCourse => ({
  lmsCourseId: 101,
  title: 'دورة',
  summary: 'وصف',
  durationMinutes: null,
  visible: true,
  ...overrides,
});

function harness(
  options: {
    rows?: Row[];
    courses?: LmsCourse[];
    held?: string[];
    mode?: 'mock' | 'real';
    /** Rows deleted between the sync's read and its write. */
    missingOnUpdate?: string[];
  } = {},
) {
  const rows = options.rows ?? [];
  const upserts: Array<{ where: unknown; create: unknown; update: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; status: string }> = [];
  const audits: AuditEntry[] = [];
  const lmsCalls = { getCourse: 0 };

  const prisma = {
    course: {
      findMany: () => Promise.resolve(rows),
      findUnique: (args: { where: { moodleCourseId: number } }) =>
        Promise.resolve(
          rows.find((row) => row.moodleCourseId === args.where.moodleCourseId) ?? null,
        ),
      upsert: (args: { where: unknown; create: unknown; update: Record<string, unknown> }) => {
        upserts.push(args);
        return Promise.resolve({});
      },
      /* `updateMany`, matching the service: a row that vanished between the
         read and the write must match nothing rather than throw, so the fake
         reports a count the way Prisma does. `options.vanishedRowIds` lets a
         test say a row is no longer there. */
      updateMany: (args: { where: { id: string }; data: { status: string } }) => {
        if (options.missingOnUpdate?.includes(args.where.id)) {
          return Promise.resolve({ count: 0 });
        }

        updates.push({ id: args.where.id, status: args.data.status });
        return Promise.resolve({ count: 1 });
      },
    },
    /* "Held" is an enrolment since D-134: the row that says a learner was placed
       above this course and owes it. */
    enrollment: {
      findMany: () => Promise.resolve((options.held ?? []).map((courseId) => ({ courseId }))),
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  const lms = {
    listCourses: () => Promise.resolve(options.courses ?? []),
    getCourse: (id: number) => {
      lmsCalls.getCourse += 1;
      return Promise.resolve(
        (options.courses ?? []).find((course) => course.lmsCourseId === id) ?? null,
      );
    },
  } as unknown as LmsPort;

  const config = {
    get: (key: string) => (key === 'MOODLE_MODE' ? (options.mode ?? 'mock') : undefined),
  } as unknown as AppConfigService;

  return {
    service: new CatalogSyncService(prisma, audit, config, lms),
    upserts,
    updates,
    audits,
    lmsCalls,
  };
}

describe('CatalogSyncService', () => {
  describe('mirroring', () => {
    it('creates courses the LMS has and we do not', async () => {
      const { service, upserts } = harness({ courses: [lmsCourse({ lmsCourseId: 7 })] });

      await expect(service.sync()).resolves.toMatchObject({ seen: 1, created: 1, updated: 0 });
      expect(upserts).toHaveLength(1);
    });

    it('counts a course we already hold as an update', async () => {
      const { service } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
      });

      await expect(service.sync()).resolves.toMatchObject({ created: 0, updated: 1 });
    });

    it('never writes product metadata on an update', async () => {
      /* objectives, prerequisites, duration and path membership are ours. An LMS
         that has no opinion about them must not be able to erase them. */
      const { service, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: 90,
            lmsPresent: true,
          },
        ],
      });

      await service.sync();

      const update = upserts[0]!.update;
      expect(update).not.toHaveProperty('objectives');
      expect(update).not.toHaveProperty('prerequisites');
      expect(update.durationMinutes).toBe(90);
    });

    it('never writes `publication` — an entity decision sync may read but not change', async () => {
      /*
       * The Phase 4 defect, as a regression test (D-059). Sync used to recompute
       * `status` from the LMS's `visible` flag, so an entity that hid a course
       * had it flipped back to AVAILABLE by the next scheduled run — silently,
       * minutes later, with their decision recorded nowhere. `publication` is
       * where that decision now lives, and the update payload must not contain
       * it under any circumstances.
       */
      const { service, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7, visible: true })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'UNPUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
      });

      await service.sync();

      expect(upserts[0]!.update).not.toHaveProperty('publication');
    });

    it('leaves an unpublished course out of the catalogue even when the LMS shows it', async () => {
      /* The same rule seen from the other end: not merely "the column is not
         written" but "the learner-visible outcome is right". */
      const { service, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7, visible: true })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'UNPUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
      });

      await service.sync();

      expect(upserts[0]!.update.status).toBe('RETIRED');
    });

    it('keeps an unpublished course completable while a learner holds it', async () => {
      const { service, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7, visible: true })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'UNPUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
        held: ['c1'],
      });

      await service.sync();

      expect(upserts[0]!.update.status).toBe('HIDDEN_BUT_COMPLETABLE');
    });

    it('enters a course nobody has claimed as a DRAFT rather than publishing it', async () => {
      /*
       * A course discovered in the LMS has no path membership, no RIASEC letter
       * and no objectives, so publishing it automatically only ever produced a
       * catalogue card a learner could not act on. It waits for an entity.
       */
      const { service, upserts } = harness({ courses: [lmsCourse({ lmsCourseId: 7 })] });

      await service.sync();

      expect(upserts[0]!.create).toMatchObject({ publication: 'DRAFT', status: 'DRAFT' });
    });

    it('is idempotent — a second identical run writes the same thing', async () => {
      const options = {
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: 30,
            lmsPresent: true,
          },
        ],
      };

      const first = harness(options);
      const second = harness(options);

      const a = await first.service.sync();
      const b = await second.service.sync();

      expect(b).toEqual(a);
      expect(second.updates).toEqual([]);

      /* lastSyncedAt is excluded deliberately: it records when we last checked
         and MUST move on every run. Everything that describes the course itself
         has to be byte-identical, which is what idempotency actually means
         here. */
      const substantive = (runs: typeof first.upserts) =>
        runs.map((call) => {
          const { lastSyncedAt: _ignored, ...rest } = call.update;
          return rest;
        });

      expect(substantive(second.upserts)).toEqual(substantive(first.upserts));
    });
  });

  describe('a course that disappears from the LMS', () => {
    const vanishing = {
      courses: [lmsCourse({ lmsCourseId: 7 })],
      rows: [
        {
          id: 'c1',
          moodleCourseId: 7,
          publication: 'PUBLISHED',
          durationMinutes: null,
          lmsPresent: true,
        },
        {
          id: 'gone',
          moodleCourseId: 99,
          publication: 'PUBLISHED',
          durationMinutes: null,
          lmsPresent: true,
        },
      ],
    };

    it('retires it when no learner holds it', async () => {
      const { service, updates } = harness(vanishing);

      await expect(service.sync()).resolves.toMatchObject({ withdrawn: 1 });
      expect(updates).toEqual([{ id: 'gone', status: 'RETIRED' }]);
    });

    it('keeps it completable when a learner holds it (D-015)', async () => {
      /* RETIRED is invisible to everyone, including someone who already selected
         the course — so retiring an in-use course would do precisely what the
         rule forbids. */
      const { service, updates } = harness({ ...vanishing, held: ['gone'] });

      await service.sync();

      expect(updates).toEqual([{ id: 'gone', status: 'HIDDEN_BUT_COMPLETABLE' }]);
    });

    it('does not re-withdraw on the next run', async () => {
      const { service, updates } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
          {
            id: 'gone',
            moodleCourseId: 99,
            publication: 'PUBLISHED',
            durationMinutes: null,
            lmsPresent: false,
          },
        ],
      });

      await expect(service.sync()).resolves.toMatchObject({ withdrawn: 0 });
      expect(updates).toEqual([]);
    });

    it('audits the withdrawal, because it changes what a learner can see', async () => {
      const { service, audits } = harness(vanishing);
      await service.sync();

      expect(audits).toContainEqual(
        expect.objectContaining({
          action: AuditAction.LMS_COURSE_WITHDRAWN,
          targetId: 'gone',
        }),
      );
    });

    it('carries on when the row disappeared between the read and the write', async () => {
      /*
       * The list is gathered in one query and walked one row at a time, so the
       * world can change in between. A reconciliation job that crashes because
       * the thing it was about to reconcile is gone is reconciling badly — and
       * the crash would abandon every course after it in the list.
       *
       * Nothing in the product deletes a course (D-040), so this is defensive in
       * production; it is not defensive in the integration suites, where it is
       * the difference between a deterministic run and a one-in-five failure in
       * a *different* suite.
       */
      const { service, audits, updates } = harness({ ...vanishing, missingOnUpdate: ['gone'] });

      const result = await service.sync();

      expect(updates).toHaveLength(0);
      /* Not counted and not audited: no course was withdrawn, because no course
         was there. A trail that says otherwise is worse than a silent skip. */
      expect(result.withdrawn).toBe(0);
      expect(audits.some((entry) => entry.action === AuditAction.LMS_COURSE_WITHDRAWN)).toBe(false);
    });
  });

  describe('an empty catalogue', () => {
    it('changes nothing rather than withdrawing everything', async () => {
      /* The likeliest causes of an empty result — a capability lost, an instance
         mid-upgrade — are transient. Acting on it would take the whole catalogue
         out in one pass. */
      const { service, upserts, updates } = harness({
        courses: [],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
      });

      await expect(service.sync()).resolves.toMatchObject({
        seen: 0,
        withdrawn: 0,
        skippedReason: 'EMPTY_CATALOGUE',
      });

      expect(upserts).toEqual([]);
      expect(updates).toEqual([]);
    });

    it('audits the refusal as a failure so it is visible', async () => {
      const { service, audits } = harness({ courses: [], rows: [] });
      await service.sync();

      expect(audits).toContainEqual(
        expect.objectContaining({
          action: AuditAction.LMS_CATALOG_SYNCED,
          outcome: 'FAILURE',
        }),
      );
    });
  });

  describe('when it runs', () => {
    it('syncs at startup in real mode, so a fresh deploy is never stale', async () => {
      const { service, upserts } = harness({ courses: [lmsCourse()], mode: 'real' });

      service.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));

      expect(upserts).toHaveLength(1);
    });

    it('does not sync at startup under the mock, where the seed owns the catalogue', async () => {
      const { service, upserts } = harness({ courses: [lmsCourse()], mode: 'mock' });

      service.onApplicationBootstrap();
      await new Promise((resolve) => setImmediate(resolve));

      expect(upserts).toEqual([]);
    });

    it('never lets a failing startup sync bring the API down', async () => {
      /* The catalogue is cached in our own database. An LMS that is down at
         deploy time is a degraded state, not a reason to refuse to start. */
      const { service } = harness({ mode: 'real' });
      (service as unknown as { sync: () => Promise<never> }).sync = () =>
        Promise.reject(new Error('LMS_UNREACHABLE'));

      expect(() => {
        service.onApplicationBootstrap();
      }).not.toThrow();

      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  it('audits a successful run with counts and no course content', async () => {
    const { service, audits } = harness({ courses: [lmsCourse()] });
    await service.sync();

    const entry = audits.find((record) => record.action === AuditAction.LMS_CATALOG_SYNCED);

    expect(entry).toMatchObject({ outcome: 'SUCCESS', detail: { seen: 1, created: 1 } });
    expect(JSON.stringify(entry)).not.toContain('دورة');
  });

  /**
   * `syncOne` (§4B.4, TAM-133): the per-course resync a live edit in the
   * frame triggers, without waiting for the next scheduled `sync()`.
   */
  describe('syncOne', () => {
    it('writes the identical row sync() would, for the same LMS course (shared mapping)', async () => {
      /* Two separate harnesses, not one service called twice — sync() and
         syncOne must map a *fresh* upsert identically, not merely agree with
         themselves on a second call. */
      const course = lmsCourse({ lmsCourseId: 7, title: 'دورة محدّثة' });
      const rows = [
        {
          id: 'c1',
          moodleCourseId: 7,
          publication: 'PUBLISHED',
          durationMinutes: 45,
          lmsPresent: true,
        },
      ];

      const viaSync = harness({ courses: [course], rows });
      const viaSyncOne = harness({ courses: [course], rows });

      await viaSync.service.sync();
      await viaSyncOne.service.syncOne(7);

      /* `lastSyncedAt` is excluded for the same reason the idempotency test
         above excludes it: it necessarily differs between two separate calls,
         and everything that describes the course itself must not. */
      const substantive = (call: { update: Record<string, unknown> }) => {
        const { lastSyncedAt: _ignored, ...rest } = call.update;
        return rest;
      };

      expect(viaSyncOne.upserts).toHaveLength(1);
      expect(substantive(viaSyncOne.upserts[0]!)).toEqual(substantive(viaSync.upserts[0]!));
    });

    it('reads the LMS once for two concurrent resyncs of the same course', async () => {
      const { service, lmsCalls, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [
          {
            id: 'c1',
            moodleCourseId: 7,
            publication: 'PUBLISHED',
            durationMinutes: null,
            lmsPresent: true,
          },
        ],
      });

      const [a, b] = await Promise.all([service.syncOne(7), service.syncOne(7)]);

      expect(a).toEqual(b);
      expect(lmsCalls.getCourse).toBe(1);
      expect(upserts).toHaveLength(1);
    });

    it('does not coalesce two different courses', async () => {
      const { service, lmsCalls } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 }), lmsCourse({ lmsCourseId: 8 })],
      });

      await Promise.all([service.syncOne(7), service.syncOne(8)]);

      expect(lmsCalls.getCourse).toBe(2);
    });

    it('refuses a course the LMS no longer has, rather than writing nothing silently', async () => {
      const { service } = harness({ courses: [] });

      await expect(service.syncOne(404)).rejects.toThrow('LMS_COURSE_RESYNC_FAILED');
    });

    it('a later call for the same course is not coalesced once the first has settled', async () => {
      const { service, lmsCalls } = harness({ courses: [lmsCourse({ lmsCourseId: 7 })] });

      await service.syncOne(7);
      await service.syncOne(7);

      expect(lmsCalls.getCourse).toBe(2);
    });
  });
});
