import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import { EmailService } from '../email/email.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import type { LmsCourseProgress } from '../moodle/lms.types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.module';
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
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async sync(): Promise<CompletionSyncResult> {
    const learners = await this.prisma.user.findMany({
      where: {
        moodleUserId: { not: null },
        userPath: { confirmedAt: { not: null } },
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

    const path = await this.refreshPathStatus(learner.id);

    if (path.completed) {
      await this.onPathCompleted(learner, path.pathId);
    }

    return { completions, newlyPassed, pathCompleted: path.completed };
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

    await this.mirrorOntoChosenCourses(learner.id, entry.lmsCourseId, verdict);

    const newlyPassed = verdict.passed && existing?.passed !== true;

    if (newlyPassed) {
      await this.onCoursePassed(learner, entry.lmsCourseId);
    }

    return newlyPassed;
  }

  /**
   * Reflects a completion onto whichever of the learner's chosen courses it
   * belongs to.
   *
   * Matched through `moodle_course_id`, which is what makes shared-course reuse
   * work (D-003): one completion satisfies the course by whatever route the
   * learner reached it, and nothing is ever re-taken.
   */
  private async mirrorOntoChosenCourses(
    userId: string,
    moodleCourseId: number,
    verdict: { completed: boolean; completedAt: Date | null; gradePercent: number | null },
  ): Promise<void> {
    const chosen = await this.prisma.userPathCourse.findMany({
      where: { userPath: { userId }, course: { moodleCourseId } },
      select: { id: true, status: true },
    });

    for (const row of chosen) {
      const status = verdict.completed
        ? 'COMPLETED'
        : verdict.gradePercent !== null
          ? 'IN_PROGRESS'
          : row.status;

      await this.prisma.userPathCourse.update({
        where: { id: row.id },
        data: {
          status,
          gradePercent: verdict.gradePercent,
          completedAt: verdict.completedAt,
          /* Set once, on first evidence of activity, and never moved backwards. */
          ...(row.status === 'NOT_STARTED' && status !== 'NOT_STARTED'
            ? { startedAt: new Date() }
            : {}),
        },
      });
    }
  }

  /**
   * Marks the path finished once every chosen course has been **passed**.
   *
   * **Passed, not merely completed** — and the distinction is the whole point.
   * `UserPathCourse.status` becomes `COMPLETED` from the LMS's completion
   * signal alone, so a learner who finishes a course in Moodle and scores below
   * the product threshold is completed-but-not-passed, which Phase 2 records
   * correctly (D-042 §4). Reading the status here would have finished a path
   * nobody passed, and then certified it — §4.9 is explicit that the path
   * certificate unlocks on "complete **and** passed".
   *
   * `completions.passed` is our verdict against the threshold (D-007) and
   * already requires the completion signal, so it is the whole test.
   *
   * Returns whether this run is the one that finished it.
   */
  private async refreshPathStatus(userId: string): Promise<{ completed: boolean; pathId: string }> {
    const userPath = await this.prisma.userPath.findUnique({
      where: { userId },
      select: {
        id: true,
        pathId: true,
        status: true,
        confirmedAt: true,
        courses: { select: { course: { select: { moodleCourseId: true } } } },
      },
    });

    if (!userPath || userPath.confirmedAt === null || userPath.status === 'COMPLETED') {
      return { completed: false, pathId: userPath?.pathId ?? '' };
    }

    const moodleCourseIds = userPath.courses.map((chosen) => chosen.course.moodleCourseId);

    /* An empty path must never read as finished. The 5-10 rule makes it
       unreachable, which is why ruling it out costs nothing. */
    if (moodleCourseIds.length === 0) {
      return { completed: false, pathId: userPath.pathId };
    }

    const passedCount = await this.prisma.completion.count({
      where: { userId, moodleCourseId: { in: moodleCourseIds }, passed: true },
    });

    if (passedCount !== moodleCourseIds.length) {
      return { completed: false, pathId: userPath.pathId };
    }

    await this.prisma.userPath.update({
      where: { id: userPath.id },
      data: { status: 'COMPLETED' },
    });

    await this.audit.record({
      action: AuditAction.PATH_COMPLETED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress: null,
      targetType: 'user_path',
      targetId: userPath.id,
      detail: { courses: moodleCourseIds.length },
    });

    return { completed: true, pathId: userPath.pathId };
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

    await this.audit.record({
      action: AuditAction.LMS_COURSE_PASSED,
      outcome: 'SUCCESS',
      actorUserId: learner.id,
      ipAddress: null,
      targetType: 'course',
      targetId: String(moodleCourseId),
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
