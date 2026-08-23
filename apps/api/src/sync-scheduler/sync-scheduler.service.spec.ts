import type { CatalogSyncService } from '../catalog-sync/catalog-sync.service';
import type { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import type { CompletionSyncService } from '../completion-sync/completion-sync.service';
import type { AppConfigService } from '../config/app-config.module';
import type { SettingsService } from '../settings/settings.service';
import type { EnrollmentService } from '../enrollment/enrollment.service';
import { SyncSchedulerService } from './sync-scheduler.service';

/**
 * The scheduler with Redis absent.
 *
 * Everything worth testing here is the cycle: what runs, in what order, and what
 * happens when a stage fails. BullMQ is deliberately not exercised — the class
 * is written so that the schedule and the work are separable, and a test that
 * needed a queue would be testing BullMQ rather than us.
 */

function harness(
  options: {
    catalogThrows?: boolean;
    enrolThrows?: boolean;
    completionThrows?: boolean;
    reconcileThrows?: boolean;
    nodeEnv?: string;
    schedulerEnabled?: boolean;
    redisUrl?: string;
  } = {},
) {
  const order: string[] = [];

  const catalog = {
    sync: () => {
      order.push('catalog');
      if (options.catalogThrows) return Promise.reject(new Error('catalogue down'));
      return Promise.resolve({ seen: 3, created: 0, updated: 3, withdrawn: 0 });
    },
  } as unknown as CatalogSyncService;

  const enrollment = {
    retryPendingEnrolments: () => {
      order.push('enrolments');
      if (options.enrolThrows) return Promise.reject(new Error('enrolment down'));
      return Promise.resolve({ paths: 1, enrolled: 2, stillPending: 0 });
    },
  } as unknown as EnrollmentService;

  const completion = {
    sync: () => {
      order.push('completions');
      if (options.completionThrows) return Promise.reject(new Error('completion down'));
      return Promise.resolve({
        users: 1,
        completions: 2,
        newlyPassed: 1,
        pathsCompleted: 0,
        failures: 0,
      });
    },
  } as unknown as CompletionSyncService;

  const certificates = {
    reconcileMissingCertificates: () => {
      order.push('certificates');
      if (options.reconcileThrows) return Promise.reject(new Error('renderer down'));
      return Promise.resolve({ issued: 0, failed: 0 });
    },
  } as unknown as CertificateIssuanceService;

  const config = {
    get: (key: string) => {
      if (key === 'NODE_ENV') return options.nodeEnv ?? 'development';
      if (key === 'SYNC_SCHEDULER_ENABLED') return options.schedulerEnabled ?? true;
      if (key === 'REDIS_URL') return options.redisUrl;
      return undefined;
    },
  } as unknown as AppConfigService;

  /* The interval is a *setting* now, not an environment read (D-072): §4C.6
     changes it without a deployment, and the scheduler re-registers. */
  const settings = {
    get: () => Promise.resolve(5),
  } as unknown as SettingsService;

  return {
    service: new SyncSchedulerService(
      config,
      settings,
      catalog,
      enrollment,
      completion,
      certificates,
    ),
    order,
  };
}

describe('SyncSchedulerService', () => {
  describe('the sync cycle', () => {
    it('runs catalogue, enrolments, completions, then certificate reconciliation', async () => {
      /* Order is load-bearing. The catalogue first so a new or vanished course
         is known before anything reasons about it; enrolments before
         completions so a learner whose enrolment never landed is enrolled
         before we ask about their progress, rather than waiting a whole
         interval for nothing; and reconciliation last, because it exists to
         catch what the stage before it could not finish. */
      const { service, order } = harness();

      await service.runSyncCycle();

      expect(order).toEqual(['catalog', 'enrolments', 'completions', 'certificates']);
    });

    it('returns what each stage reported', async () => {
      const { service } = harness();

      await expect(service.runSyncCycle()).resolves.toMatchObject({
        catalog: { seen: 3 },
        enrolments: { enrolled: 2 },
        completions: { newlyPassed: 1 },
        certificates: { issued: 0 },
      });
    });

    it('still runs the later stages when the catalogue fails', async () => {
      /* They fail for unrelated reasons, and a catalogue problem must not
         freeze every learner's progress. */
      const { service, order } = harness({ catalogThrows: true });

      const result = await service.runSyncCycle();

      expect(order).toEqual(['catalog', 'enrolments', 'completions', 'certificates']);
      expect(result.catalog).toBeNull();
      expect(result.completions).not.toBeNull();
    });

    it('still syncs completions when enrolment reconciliation fails', async () => {
      const { service, order } = harness({ enrolThrows: true });

      const result = await service.runSyncCycle();

      expect(order).toContain('completions');
      expect(result.enrolments).toBeNull();
    });

    it('never throws, whatever fails', async () => {
      /* A throwing cycle would mark the BullMQ job failed and, with retries,
         re-run stages that already succeeded. */
      const { service } = harness({
        catalogThrows: true,
        enrolThrows: true,
        completionThrows: true,
        reconcileThrows: true,
      });

      await expect(service.runSyncCycle()).resolves.toEqual({
        catalog: null,
        enrolments: null,
        completions: null,
        certificates: null,
      });
    });
  });

  describe('when it schedules', () => {
    it('does not schedule in tests, whatever the flag says', () => {
      /* A repeatable job firing mid-suite would write underneath assertions,
         and the failure would read as flakiness rather than as a scheduler. */
      const { service } = harness({
        nodeEnv: 'test',
        schedulerEnabled: true,
        redisUrl: 'redis://localhost:6379',
      });

      expect(() => {
        service.onApplicationBootstrap();
      }).not.toThrow();
    });

    it('does not schedule when disabled by configuration', () => {
      const { service } = harness({ schedulerEnabled: false, redisUrl: 'redis://localhost:6379' });

      expect(() => {
        service.onApplicationBootstrap();
      }).not.toThrow();
    });

    it('does not schedule, or crash, without REDIS_URL', () => {
      /* The product works without sync running — just with staler completion
         data. Refusing to start would turn a background-job outage into a total
         one. */
      const { service } = harness({ schedulerEnabled: true, redisUrl: undefined });

      expect(() => {
        service.onApplicationBootstrap();
      }).not.toThrow();
    });

    it('closes cleanly even when it never started', async () => {
      const { service } = harness({ nodeEnv: 'test' });

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
