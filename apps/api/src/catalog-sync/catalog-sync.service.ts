import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.module';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import type { LmsCourse } from '../moodle/lms.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  fieldsForPublishedCourse,
  isUsableCatalogue,
  statusForVanishedCourse,
  type CourseStatusValue,
} from './catalog-mapping';

export interface CatalogSyncResult {
  /** Courses the LMS returned, after the site course is discarded. */
  seen: number;
  created: number;
  updated: number;
  /** Rows we hold that the LMS stopped returning. */
  withdrawn: number;
  /** Set when the run declined to act; nothing was written. */
  skippedReason?: 'EMPTY_CATALOGUE';
}

/**
 * Mirrors the LMS catalogue into our cached `courses` table (§6, Phase 2C).
 *
 * **What this owns and what it must not touch.** Moodle is the source of truth
 * for a course *existing* and for its title, summary and visibility. Everything
 * else on the row is ours: `objectives`, `prerequisites`, `durationMinutes`,
 * path membership and ordering. A sync that wrote those would overwrite authored
 * product metadata with an LMS that has no opinion about it — so it never
 * touches them, and `path_courses` is not referenced here at all.
 *
 * **Idempotent by construction.** Rows are matched on `moodle_course_id`, which
 * is unique, and every write is an upsert. Running twice in a row changes
 * nothing the second time, which matters because this runs on a schedule and
 * because a half-finished run must be safe to repeat.
 *
 * **Nothing is ever deleted.** See `statusForVanishedCourse`: a course a learner
 * already selected may not be pulled out from under them (§2/D-015).
 */
@Injectable()
export class CatalogSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  /**
   * When sync runs (Phase 2C).
   *
   * **Once at startup**, so a freshly deployed instance never serves a stale or
   * empty catalogue while waiting for the first scheduled tick; and **on the
   * scheduled interval** thereafter, which the completion-sync job's scheduler
   * owns. It is safe to call at any time besides — every write is an upsert.
   *
   * Deliberately fire-and-forget and **never able to fail boot**: the catalogue
   * is cached in our own database, so an LMS that is down at deploy time is a
   * degraded state, not a reason for the API to refuse to start. Only real mode
   * triggers it; under the mock the catalogue comes from the seed.
   */
  onApplicationBootstrap(): void {
    if (this.config.get('MOODLE_MODE') !== 'real') {
      return;
    }

    void this.sync().catch((error: unknown) => {
      this.logger.error(
        `Startup catalogue sync failed: ${error instanceof Error ? error.message : 'unknown'}. ` +
          'Serving the cached catalogue; the scheduled sync will retry.',
      );
    });
  }

  async sync(): Promise<CatalogSyncResult> {
    const lmsCourses = await this.lms.listCourses();

    if (!isUsableCatalogue(lmsCourses)) {
      /* Treated as a fault, not as "every course was deleted". Acting on it
         would withdraw the entire catalogue in a single pass, and every likely
         cause — a capability lost, an instance mid-upgrade — is transient. */
      this.logger.error(
        'LMS returned no courses; skipping sync rather than withdrawing everything',
      );

      await this.audit.record({
        action: AuditAction.LMS_CATALOG_SYNCED,
        outcome: 'FAILURE',
        actorUserId: null,
        ipAddress: null,
        detail: { skipped: 'EMPTY_CATALOGUE' },
      });

      return { seen: 0, created: 0, updated: 0, withdrawn: 0, skippedReason: 'EMPTY_CATALOGUE' };
    }

    const existing = await this.prisma.course.findMany({
      select: { id: true, moodleCourseId: true, status: true, durationMinutes: true },
    });

    const existingByLmsId = new Map(existing.map((row) => [row.moodleCourseId, row]));

    let created = 0;
    let updated = 0;

    for (const lmsCourse of lmsCourses) {
      const known = existingByLmsId.get(lmsCourse.lmsCourseId) ?? null;
      const fields = fieldsForPublishedCourse(
        lmsCourse,
        known
          ? { status: known.status as CourseStatusValue, durationMinutes: known.durationMinutes }
          : null,
      );

      await this.prisma.course.upsert({
        where: { moodleCourseId: lmsCourse.lmsCourseId },
        create: {
          moodleCourseId: lmsCourse.lmsCourseId,
          ...fields,
          /* A course the LMS has but we have never seen arrives with no product
             metadata. That is a legitimate state, not an error: an entity
             authors it in Phase 4, and until then the course simply belongs to
             no path. The seed runner *does* refuse missing metadata, because it
             is authoring a known catalogue rather than discovering one. */
          objectives: [],
          prerequisites: null,
          lastSyncedAt: new Date(),
        },
        update: { ...fields, lastSyncedAt: new Date() },
      });

      if (known) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    const withdrawn = await this.withdrawVanished(lmsCourses, existing);

    await this.audit.record({
      action: AuditAction.LMS_CATALOG_SYNCED,
      outcome: 'SUCCESS',
      actorUserId: null,
      ipAddress: null,
      detail: { seen: lmsCourses.length, created, updated, withdrawn },
    });

    this.logger.log(
      `Catalogue sync: ${lmsCourses.length} seen, ${created} created, ${updated} updated, ${withdrawn} withdrawn`,
    );

    return { seen: lmsCourses.length, created, updated, withdrawn };
  }

  /**
   * Demotes rows the LMS no longer returns.
   *
   * Whether a course is *held by a user* decides its fate, so that is read from
   * `user_path_courses` rather than assumed — a course nobody selected can
   * retire cleanly, while one somebody is working through must stay completable.
   */
  private async withdrawVanished(
    lmsCourses: readonly LmsCourse[],
    existing: ReadonlyArray<{ id: string; moodleCourseId: number; status: string }>,
  ): Promise<number> {
    const present = new Set(lmsCourses.map((course) => course.lmsCourseId));
    const vanished = existing.filter(
      (row) => !present.has(row.moodleCourseId) && row.status !== 'RETIRED',
    );

    if (vanished.length === 0) {
      return 0;
    }

    const held = await this.prisma.userPathCourse.findMany({
      where: { courseId: { in: vanished.map((row) => row.id) } },
      select: { courseId: true },
      distinct: ['courseId'],
    });

    const heldIds = new Set(held.map((row) => row.courseId));
    let withdrawn = 0;

    for (const row of vanished) {
      const status = statusForVanishedCourse(heldIds.has(row.id));

      if (status === row.status) {
        continue; // Already demoted by an earlier run — idempotent.
      }

      await this.prisma.course.update({ where: { id: row.id }, data: { status } });
      withdrawn += 1;

      await this.audit.record({
        action: AuditAction.LMS_COURSE_WITHDRAWN,
        outcome: 'SUCCESS',
        actorUserId: null,
        ipAddress: null,
        targetType: 'course',
        targetId: row.id,
        detail: { status, heldByLearners: heldIds.has(row.id) },
      });
    }

    return withdrawn;
  }
}
