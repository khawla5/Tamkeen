import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.module';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import type { LmsCourse } from '../moodle/lms.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  effectiveCourseStatus,
  fieldsForPublishedCourse,
  isUsableCatalogue,
  type CoursePublicationValue,
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
      select: {
        id: true,
        moodleCourseId: true,
        publication: true,
        durationMinutes: true,
        lmsPresent: true,
      },
    });

    const existingByLmsId = new Map(existing.map((row) => [row.moodleCourseId, row]));
    const heldIds = await this.courseIdsHeldByLearners(existing.map((row) => row.id));

    let created = 0;
    let updated = 0;

    for (const lmsCourse of lmsCourses) {
      const known = existingByLmsId.get(lmsCourse.lmsCourseId) ?? null;
      const fields = fieldsForPublishedCourse(
        lmsCourse,
        known ? { durationMinutes: known.durationMinutes } : null,
      );

      /*
       * A course the LMS has but we have never seen enters as a DRAFT owned by
       * nobody. That is a legitimate state, not an error (D-040): an entity
       * claims and publishes it, and until then it simply belongs to no path.
       * Entering as DRAFT rather than AVAILABLE is a Phase 4 correction — a
       * course with no path membership, no RIASEC letter and no objectives was
       * never usable in the catalogue, so publishing it automatically only ever
       * produced a card a learner could not act on.
       */
      const publication: CoursePublicationValue = known?.publication ?? 'DRAFT';

      const status = effectiveCourseStatus({
        publication,
        lmsPresent: fields.lmsPresent,
        lmsVisible: fields.lmsVisible,
        heldByAnyLearner: known ? heldIds.has(known.id) : false,
      });

      await this.prisma.course.upsert({
        where: { moodleCourseId: lmsCourse.lmsCourseId },
        create: {
          moodleCourseId: lmsCourse.lmsCourseId,
          ...fields,
          status,
          publication,
          objectives: [],
          prerequisites: null,
          lastSyncedAt: new Date(),
        },
        /* `publication` is absent from the update on purpose, and this is the
           single most important line in the file: sync reads our publishing
           decision but may never write it (D-059). */
        update: { ...fields, status, lastSyncedAt: new Date() },
      });

      if (known) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    const withdrawn = await this.withdrawVanished(lmsCourses, existing, heldIds);

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
   * Records that the LMS has stopped returning these courses.
   *
   * **Sync sets `lmsPresent: false` and nothing else about their fate.** What
   * that means for a learner is `effectiveCourseStatus`'s decision, and it turns
   * on whether anyone holds the course: one nobody selected retires cleanly,
   * while one somebody is working through stays completable (§2/D-015).
   *
   * Rows are never deleted, and an entity's `publication` is not touched — a
   * course that vanishes from the LMS has not been unpublished by anyone, and
   * if it comes back the entity's decision is still there to honour.
   */
  private async withdrawVanished(
    lmsCourses: readonly LmsCourse[],
    existing: ReadonlyArray<{
      id: string;
      moodleCourseId: number;
      publication: string;
      lmsPresent: boolean;
    }>,
    heldIds: ReadonlySet<string>,
  ): Promise<number> {
    const present = new Set(lmsCourses.map((course) => course.lmsCourseId));

    /* Already recorded as absent by an earlier run — idempotent, and the reason
       this polls safely forever. */
    const vanished = existing.filter((row) => !present.has(row.moodleCourseId) && row.lmsPresent);

    let withdrawn = 0;

    for (const row of vanished) {
      const status = effectiveCourseStatus({
        publication: row.publication as CoursePublicationValue,
        lmsPresent: false,
        /* Immaterial once absent, but passed honestly rather than guessed. */
        lmsVisible: false,
        heldByAnyLearner: heldIds.has(row.id),
      });

      /*
       * `updateMany`, not `update`, so a row that disappeared between the read
       * above and this write matches nothing instead of throwing.
       *
       * The list was gathered in one query and is walked one row at a time; a
       * reconciliation job that crashes because the world changed underneath it
       * is reconciling badly. Nothing in the product deletes a course — D-040
       * forbids it — so in production this is defensive, and it is *free*: there
       * is nothing to withdraw from a row that is gone, and skipping the audit
       * entry below keeps the trail from claiming a course was withdrawn when no
       * course was there.
       *
       * It also stops one aborted run poisoning the next: the integration suites
       * create and remove courses of their own, and a sync running while one of
       * them cleaned up used to fail the *other* suite.
       */
      const { count } = await this.prisma.course.updateMany({
        where: { id: row.id },
        data: { lmsPresent: false, status, lastSyncedAt: new Date() },
      });

      if (count === 0) {
        continue;
      }

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

  /**
   * Which of these courses any learner has selected.
   *
   * Read once per run rather than per course: the previous shape queried only
   * the vanished subset, but the derivation now needs the answer for every row,
   * and N queries against a catalogue of any size is the kind of thing that is
   * fine until it is not.
   *
   * "Held" deliberately means *any* `user_path_courses` row, including one in a
   * path still being built. §2 states the protection in terms of confirmed
   * paths; counting building ones too is the safer direction of that same rule,
   * and it never costs a learner anything — the worst case is that a course
   * stays completable for someone who was going to drop it anyway.
   */
  private async courseIdsHeldByLearners(courseIds: string[]): Promise<Set<string>> {
    if (courseIds.length === 0) {
      return new Set();
    }

    const held = await this.prisma.userPathCourse.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true },
      distinct: ['courseId'],
    });

    return new Set(held.map((row) => row.courseId));
  }
}
