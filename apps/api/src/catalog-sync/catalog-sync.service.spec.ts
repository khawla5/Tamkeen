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
  status: string;
  durationMinutes: number | null;
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
  } = {},
) {
  const rows = options.rows ?? [];
  const upserts: Array<{ where: unknown; create: unknown; update: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; status: string }> = [];
  const audits: AuditEntry[] = [];

  const prisma = {
    course: {
      findMany: () => Promise.resolve(rows),
      upsert: (args: { where: unknown; create: unknown; update: Record<string, unknown> }) => {
        upserts.push(args);
        return Promise.resolve({});
      },
      update: (args: { where: { id: string }; data: { status: string } }) => {
        updates.push({ id: args.where.id, status: args.data.status });
        return Promise.resolve({});
      },
    },
    userPathCourse: {
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
  } as unknown as LmsPort;

  const config = {
    get: (key: string) => (key === 'MOODLE_MODE' ? (options.mode ?? 'mock') : undefined),
  } as unknown as AppConfigService;

  return {
    service: new CatalogSyncService(prisma, audit, config, lms),
    upserts,
    updates,
    audits,
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
        rows: [{ id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: null }],
      });

      await expect(service.sync()).resolves.toMatchObject({ created: 0, updated: 1 });
    });

    it('never writes product metadata on an update', async () => {
      /* objectives, prerequisites, duration and path membership are ours. An LMS
         that has no opinion about them must not be able to erase them. */
      const { service, upserts } = harness({
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [{ id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: 90 }],
      });

      await service.sync();

      const update = upserts[0]!.update;
      expect(update).not.toHaveProperty('objectives');
      expect(update).not.toHaveProperty('prerequisites');
      expect(update.durationMinutes).toBe(90);
    });

    it('is idempotent — a second identical run writes the same thing', async () => {
      const options = {
        courses: [lmsCourse({ lmsCourseId: 7 })],
        rows: [{ id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: 30 }],
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
        { id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: null },
        { id: 'gone', moodleCourseId: 99, status: 'AVAILABLE', durationMinutes: null },
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
          { id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: null },
          { id: 'gone', moodleCourseId: 99, status: 'RETIRED', durationMinutes: null },
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
  });

  describe('an empty catalogue', () => {
    it('changes nothing rather than withdrawing everything', async () => {
      /* The likeliest causes of an empty result — a capability lost, an instance
         mid-upgrade — are transient. Acting on it would take the whole catalogue
         out in one pass. */
      const { service, upserts, updates } = harness({
        courses: [],
        rows: [{ id: 'c1', moodleCourseId: 7, status: 'AVAILABLE', durationMinutes: null }],
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
});
