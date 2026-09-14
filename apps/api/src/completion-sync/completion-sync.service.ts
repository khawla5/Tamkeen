import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import { EmailService } from '../email/email.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import type { LmsCourseProgress } from '../moodle/lms.types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.module';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { evaluateCompletion, isGradedButNotComplete } from './pass-threshold';

export interface CompletionSyncResult {
  users: number;
  /** Completion rows written or refreshed. */
  completions: number;
  /** Courses that went from not-passed to passed on this run. */
  newlyPassed: number;
  /** Paths that finished on this run. */
  pathsCompleted: number;
  /** Users whose sync failed; the rest still ran. */
  failures: number;
}

/**
 * Reads completion and grades from the LMS and records them (§5.5, Phase 2E).
 *
 * **The single writer of completion state.** Phase 1's My Path overlaid live LMS
 * progress on the stored status without persisting it, precisely because two
 * writers on those rows would race (D-036). This is that second writer arriving,
 * so the overlay goes and this becomes the only thing that writes.
 *
 * **Idempotent throughout**, which is not optional: this polls, so it re-reads
 * the same completions indefinitely. `completions` is unique on
 * `(user, moodle_course_id)` and every write is an upsert, so a run that has
 * already happened changes nothing. The email is the one irreversible side
 * effect, so it fires only on the transition into passing — never on a re-read.
 *
 * **Certificates are Phase 3.** This stops at recording completion and pass/fail
 * and updating status. `onCoursePassed` is the seam where issuance plugs in.
 */
@Injectable()
export class CompletionSyncService {
  private readonly logger = new Logger(CompletionSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly email: EmailService,
    private readonly certificates: CertificateIssuanceService,
    private readonly enrollment: EnrollmentService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async sync(): Promise<CompletionSyncResult> {
    /* Anyone the ministry has assigned a path and who has an LMS account. A
       learner not yet placed has nothing to sync, but the read is cheap and the
       alternative — joining through placements — would silently stop syncing
       somebody whose placement an administrator later corrects. */
    const learners = await this.prisma.user.findMany({
      where: {
        moodleUserId: { not: null },
        userPaths: { some: {} },
      },
      select: { id: true, email: true, moodleUserId: true },
    });

    const result: CompletionSyncResult = {
      users: learners.length,
      completions: 0,
      newlyPassed: 0,
      pathsCompleted: 0,
      failures: 0,
    };

    for (const learner of learners) {
      try {
        const perUser = await this.syncUser({
          id: learner.id,
          email: learner.email,
          moodleUserId: learner.moodleUserId!,
        });

        result.completions += perUser.completions;
        result.newlyPassed += perUser.newlyPassed;
        result.pathsCompleted += perUser.pathCompleted ? 1 : 0;
      } catch (error) {
        /* One learner's failure must not abandon the rest — an LMS that refuses
           a single account would otherwise stop the whole ministry's sync. */
        result.failures += 1;
        this.logger.error(
          `Completion sync failed for user ${learner.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    await this.audit.record({
      action: AuditAction.LMS_COMPLETION_SYNCED,
      outcome: result.failures === 0 ? 'SUCCESS' : 'FAILURE',
      actorUserId: null,
      ipAddress: null,
      detail: {
        users: result.users,
        completions: result.completions,
        newlyPassed: result.newlyPassed,
        pathsCompleted: result.pathsCompleted,
        failures: result.failures,
      },
    });

    this.logger.log(
      `Completion sync: ${result.users} learner(s), ${result.completions} completion(s), ` +
        `${result.newlyPassed} newly passed, ${result.pathsCompleted} path(s) completed, ` +
        `${result.failures} failure(s)`,
    );

    return result;
  }

  /** Per-learner cooldown for the on-demand sync (D-121). */
  private readonly lastOnDemand = new Map<string, number>();
  private static readonly ON_DEMAND_COOLDOWN_MS = 10_000;

  /**
   * The scheduled sync for one learner, on demand (D-121): the framed course
   * reported a submitted quiz. Same `syncUser`, same idempotency; cooled down
   * per learner so a burst of messages costs one LMS read. Returns false when
   * the learner has no LMS account yet or the cooldown held.
   */
  async syncLearner(userId: string): Promise<boolean> {
    const now = Date.now();
    const last = this.lastOnDemand.get(userId) ?? 0;
    if (now - last < CompletionSyncService.ON_DEMAND_COOLDOWN_MS) {
      return false;
    }
    this.lastOnDemand.set(userId, now);

    const learner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, moodleUserId: true },
    });
    if (!learner || learner.moodleUserId === null) {
      return false;
    }

    try {
      await this.syncUser({
        id: learner.id,
        email: learner.email,
        moodleUserId: learner.moodleUserId,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `On-demand completion sync failed for learner ${learner.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return false;
    }
  }

  private async syncUser(learner: { id: string; email: string; moodleUserId: number }): Promise<{
    completions: number;
    newlyPassed: number;
    pathCompleted: boolean;
  }> {
    const progress = await this.lms.listProgressForUser(learner.moodleUserId);

    if (progress.length === 0) {
      return { completions: 0, newlyPassed: 0, pathCompleted: false };
    }

    /*
     * One read per run, so every verdict in this cycle is decided under the same
     * threshold — which is what `passThresholdUsed` on each row then records.
     *
     * From the environment rather than the settings table since the ministry
     * removed the field from §4C.6 (D-102, TAM-135). Still exactly one source:
     * `AppConfigService` reads the validated object, and there is now no screen
     * that can move the number underneath a running sync.
     */
    const passThreshold = this.config.get('PASS_THRESHOLD');
    let completions = 0;
    let newlyPassed = 0;

    for (const entry of progress) {
      const passedNow = await this.recordCompletion(learner, entry, passThreshold);
      completions += 1;
      if (passedNow) newlyPassed += 1;
    }

    /* Every assigned path is re-checked, not just one: a course can be placed
       in two of them, so one pass may finish both. */
    const finished = await this.refreshPathStatuses(learner.id);

    for (const pathId of finished) {
      await this.onPathCompleted(learner, pathId);
    }

    return { completions, newlyPassed, pathCompleted: finished.length > 0 };
  }

  /**
   * Writes one completion row and mirrors it onto the learner's chosen course.
   *
   * Returns whether this run is the one that turned it into a pass, which is the
   * only moment anything irreversible may happen.
   */
  private async recordCompletion(
    learner: { id: string; email: string },
    entry: LmsCourseProgress,
    passThreshold: number,
  ): Promise<boolean> {
    const verdict = evaluateCompletion(entry, passThreshold);

    if (isGradedButNotComplete(verdict, passThreshold)) {
      /* A silent blocker made loud: almost always a Moodle course with no
         completion criteria, which reports `completed:false` forever, so nobody
         on it can ever pass however well they score. */
      this.logger.warn(
        `LMS course ${entry.lmsCourseId} reports grade ${String(verdict.gradePercent)} for user ` +
          `${learner.id} but is not marked complete — check the course's completion criteria`,
      );
    }

    const existing = await this.prisma.completion.findUnique({
      where: {
        userId_moodleCourseId: { userId: learner.id, moodleCourseId: entry.lmsCourseId },
      },
      select: { passed: true },
    });

    await this.prisma.completion.upsert({
      where: {
        userId_moodleCourseId: { userId: learner.id, moodleCourseId: entry.lmsCourseId },
      },
      create: {
        userId: learner.id,
        moodleCourseId: entry.lmsCourseId,
        completed: verdict.completed,
        completedAt: verdict.completedAt,
        gradePercent: verdict.gradePercent,
        passed: verdict.passed,
        passThresholdUsed: passThreshold,
        syncedAt: new Date(),
      },
      update: {
        completed: verdict.completed,
        completedAt: verdict.completedAt,
        gradePercent: verdict.gradePercent,
        passed: verdict.passed,
        passThresholdUsed: passThreshold,
        syncedAt: new Date(),
      },
    });

    const newlyPassed = verdict.passed && existing?.passed !== true;

    if (newlyPassed) {
      await this.onCoursePassed(learner, entry.lmsCourseId);
    }

    return newlyPassed;
  }

  /**
   * Marks each assigned path finished once every course it **owes** the learner
   * has been passed. Returns the paths this run finished.
   *
   * **Passed, not merely completed** — and the distinction is the whole point.
   * The LMS's completion signal arrives on its own, so a learner who finishes a
   * course in Moodle and scores below the product threshold is
   * completed-but-not-passed, which Phase 2 records correctly (D-042 §4).
   * Treating completion as sufficient here would finish a path nobody passed,
   * and then certify it — §4.9 is explicit that the path certificate unlocks on
   * "complete **and** passed".
   *
   * **Owes** is the D-134 rule: the courses at or above the rung the assessment
   * placed them on. A course below it is ground the placement says they had
   * already covered, so requiring it would make a path uncompletable for exactly
   * the people judged most capable. `EnrollmentService.refreshPathCompletion`
   * owns that derivation, so this and My Path cannot disagree about it.
   */
  private async refreshPathStatuses(userId: string): Promise<string[]> {
    const assigned = await this.prisma.userPath.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { pathId: true },
    });

    const finished: string[] = [];

    for (const row of assigned) {
      if (await this.enrollment.refreshPathCompletion(userId, row.pathId)) {
        finished.push(row.pathId);
      }
    }

    return finished;
  }

  /**
   * The path certificate, and the one email that announces it.
   *
   * Mirrors `onCoursePassed`: reached only on the transition, issuance does its
   * own idempotency check behind a unique index, and neither a failed render
   * nor a failed send may fail the sync. `reconcileMissingCertificates` covers
   * the same gap on this side — `refreshPathStatus` returns early once the path
   * is `COMPLETED`, so nothing re-enters here.
   *
   * Unlike a passed course, this **does** get its own email: finishing a whole
   * path is a distinct event from passing the last course in it, and folding
   * the two into one message would bury the larger award.
   */
  private async onPathCompleted(
    learner: { id: string; email: string },
    pathId: string,
  ): Promise<void> {
    let certificateIssued = false;

    try {
      await this.certificates.issuePathCertificate(learner.id, pathId);
      certificateIssued = true;
    } catch (error) {
      this.logger.error(
        `Could not issue the path certificate for user ${learner.id}, path ${pathId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const path = await this.prisma.path.findUnique({
      where: { id: pathId },
      select: { name: true },
    });

    try {
      await this.email.sendPathCompleted(learner.email, path?.name ?? '', { certificateIssued });
    } catch (error) {
      this.logger.error(
        `Could not send the path-completed email: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * The irreversible side effects of passing a course: the certificate, and the
   * one email that announces both.
   *
   * Reached **only on the transition into passing**, never on a re-read — which
   * is why the previous `passed` value is fetched before the upsert. Polling
   * every few minutes would otherwise email a learner about the same course
   * indefinitely.
   *
   * That guard is about **not spamming, not about uniqueness** (D-042 §5), so
   * issuance does its own idempotency check and is backed by a unique index; a
   * re-run after a partial failure can legitimately arrive here twice.
   *
   * The certificate is issued **before** the email so the message can link to
   * it, and a failure to issue is survivable in both directions: the email still
   * goes out saying only that the course was passed, and
   * `reconcileMissingCertificates` comes back for the certificate — which it
   * must, because this guard has now been spent and no later sync will re-enter
   * here for this course.
   */
  private async onCoursePassed(
    learner: { id: string; email: string },
    moodleCourseId: number,
  ): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { moodleCourseId },
      select: { id: true, title: true },
    });

    /*
     * Our course id, not the LMS's (TAM-138).
     *
     * The entry used to carry `String(moodleCourseId)` under `targetType:
     * 'course'` — a number from a system the ministry does not administer,
     * filed as though it were one of our ids. §4C.8 resolves a target's name by
     * that id, so it never resolved: every pass in the trail read «دورة: 12».
     * The row is looked up two lines above for the certificate; it answers this
     * too. A course the catalogue has since lost names no target rather than a
     * false one.
     */
    await this.audit.record({
      action: AuditAction.LMS_COURSE_PASSED,
      outcome: 'SUCCESS',
      actorUserId: learner.id,
      ipAddress: null,
      targetType: course ? 'course' : null,
      targetId: course?.id ?? null,
    });

    let certificateIssued = false;

    if (course) {
      try {
        await this.certificates.issueCourseCertificate(learner.id, course.id);
        certificateIssued = true;
      } catch (error) {
        /* Rendering needs Chromium and a writable disk, neither of which is
           worth failing a sync over. The pass is recorded and true regardless,
           and reconciliation owns the retry. */
        this.logger.error(
          `Could not issue the course certificate for user ${learner.id}, course ${course.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    try {
      await this.email.sendCoursePassed(learner.email, course?.title ?? '', { certificateIssued });
    } catch (error) {
      /* A failed email must not fail the sync: the completion is recorded and
         true regardless, and the next run must not re-process it just because
         the mail server was down. */
      this.logger.error(
        `Could not send the course-passed email: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
