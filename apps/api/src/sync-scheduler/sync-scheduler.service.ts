import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

import { CatalogSyncService } from '../catalog-sync/catalog-sync.service';
import { SettingsService } from '../settings/settings.service';
import { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import { CompletionSyncService } from '../completion-sync/completion-sync.service';
import { AppConfigService } from '../config/app-config.module';
import { EnrollmentService } from '../enrollment/enrollment.service';

const QUEUE_NAME = 'lms-sync';
const JOB_NAME = 'sync-cycle';

export interface SyncCycleResult {
  catalog: { seen: number; withdrawn: number } | null;
  enrolments: { enrolled: number; stillPending: number } | null;
  completions: { completions: number; newlyPassed: number } | null;
  certificates: { issued: number; failed: number } | null;
}

/**
 * The scheduled LMS sync (D-005, D-013).
 *
 * **The schedule and the work are deliberately separate.** Everything this
 * class knows how to do is call three services in order; all the logic lives in
 * them, where it can be tested without Redis, a queue, or a clock. That split is
 * what keeps BullMQ at the edge of the system rather than woven through it.
 *
 * **A broken Redis must not break the API.** Scheduling is set up
 * fire-and-forget at bootstrap and its failure is logged, not thrown — the
 * product still works without sync running, just with staler completion data,
 * and refusing to start would turn a background-job outage into a total one.
 */
@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogSyncService,
    private readonly enrollment: EnrollmentService,
    private readonly completion: CompletionSyncService,
    private readonly certificates: CertificateIssuanceService,
  ) {}

  /**
   * One pass over everything the LMS drives.
   *
   * **Order matters.** The catalogue first, so a course that appeared or
   * vanished is known before anything reasons about it. Then enrolment
   * reconciliation, so a learner whose enrolment never landed is enrolled before
   * we ask the LMS about their progress — otherwise their first sync would read
   * nothing and they would wait a whole interval for no reason. Completion last.
   *
   * Each stage is isolated: one failing must not stop the others, because they
   * fail for unrelated reasons and a catalogue problem should not freeze every
   * learner's progress.
   */
  async runSyncCycle(): Promise<SyncCycleResult> {
    const result: SyncCycleResult = {
      catalog: null,
      enrolments: null,
      completions: null,
      certificates: null,
    };

    try {
      result.catalog = await this.catalog.sync();
    } catch (error) {
      this.logger.error(`Catalogue sync failed: ${describe(error)}`);
    }

    try {
      result.enrolments = await this.enrollment.retryPendingEnrolments();
    } catch (error) {
      this.logger.error(`Enrolment reconciliation failed: ${describe(error)}`);
    }

    try {
      result.completions = await this.completion.sync();
    } catch (error) {
      this.logger.error(`Completion sync failed: ${describe(error)}`);
    }

    /* Last, and after completions, because it exists to catch what the stage
       before it could not finish. Issuance fires from a transition that happens
       exactly once, so a render that failed at that moment is never retried by
       the sync itself — this is the only thing that comes back for it. */
    try {
      result.certificates = await this.certificates.reconcileMissingCertificates();
    } catch (error) {
      this.logger.error(`Certificate reconciliation failed: ${describe(error)}`);
    }

    return result;
  }

  onApplicationBootstrap(): void {
    if (!this.shouldSchedule()) {
      return;
    }

    void this.start().catch((error: unknown) => {
      this.logger.error(
        `Could not start the sync scheduler: ${describe(error)}. ` +
          'The API is running; completion data will be stale until this is fixed.',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    /* Closed explicitly: BullMQ holds Redis connections open, and a test run or
       a redeploy that leaves them dangling exhausts the connection pool. */
    await this.worker?.close();
    await this.queue?.close();
  }

  private shouldSchedule(): boolean {
    if (this.config.get('NODE_ENV') === 'test') {
      /* Never in tests, whatever the flag says. A repeatable job firing mid-suite
         would write to the database underneath assertions, and the failure would
         look like flakiness rather than a scheduler. */
      return false;
    }

    if (!this.config.get('SYNC_SCHEDULER_ENABLED')) {
      this.logger.log('Sync scheduler disabled by configuration');
      return false;
    }

    if (!this.config.get('REDIS_URL')) {
      this.logger.warn('Sync scheduler needs REDIS_URL; not scheduling');
      return false;
    }

    return true;
  }

  private async start(): Promise<void> {
    const connection = { url: this.config.get('REDIS_URL') };
    const everyMinutes = await this.settings.get('COMPLETION_SYNC_INTERVAL_MINUTES');

    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(QUEUE_NAME, async () => this.runSyncCycle(), {
      connection,
      /* One at a time. Two overlapping cycles would have two writers on
         `completions` and could double-send a course-passed email in the window
         between reading the previous verdict and writing the new one. */
      concurrency: 1,
    });

    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Sync cycle failed: ${describe(error)}`);
    });

    await this.registerSchedule(everyMinutes);
  }

  /**
   * Registers — or re-registers — the repeatable job.
   *
   * **A fixed job id is what makes this idempotent**, and it is also what makes
   * §4C.6 able to change the interval without a deployment: `upsertJobScheduler`
   * on the same id replaces the schedule rather than adding a second one that
   * would double the polling rate. Without that, an administrator lowering the
   * interval from five minutes to two would end up with both.
   */
  private async registerSchedule(everyMinutes: number): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.upsertJobScheduler(
      JOB_NAME,
      { every: everyMinutes * 60_000 },
      { name: JOB_NAME },
    );

    this.logger.log(`Sync scheduler running every ${everyMinutes} minute(s)`);
  }

  /**
   * Called when §4C.6 changes the interval.
   *
   * A no-op when the scheduler is not running — in tests, without Redis, or when
   * switched off — so the settings screen never has to know whether there is a
   * queue to talk to.
   */
  async applyIntervalChange(): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.registerSchedule(await this.settings.get('COMPLETION_SYNC_INTERVAL_MINUTES'));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
