import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  DashboardActivity,
  DashboardPath,
  DashboardState,
  DashboardView,
  MyPathView,
} from '@tamkeen/types';

import { AssessmentAssignmentResolutionService } from '../assessment-assignment/assessment-assignment-resolution.service';
import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { JourneyStateService } from '../journey/journey-state.service';
import {
  LearnerPathService,
  isPathComplete,
  owedCourses,
  type Ladder,
} from '../journey/learner-path.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The learner's assigned paths, and the LMS enrolments they imply (§4.2, §4.9,
 * D-130/D-134).
 *
 * **Nothing here is a choice the learner makes any more.** Selecting a path,
 * ticking five to ten courses and the hard commitment gate are all gone: the
 * ministry assigns the path, the assessment decides where in it they start, and
 * this service's job is to render that and to keep the LMS in step with it.
 *
 * Enrolment is driven by placement rather than by a stored course list. When a
 * learner is placed, or an administrator changes what is on the rungs at or
 * above them, `syncEnrolments` adds what is missing. It never removes: an
 * enrolment a learner has already worked in is not ours to take away, and
 * `completions` outlives it regardless.
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
    private readonly learnerPaths: LearnerPathService,
    private readonly audit: AuditService,
    private readonly assignments: AssessmentAssignmentResolutionService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  /** Every assigned path as My Path renders it (§4.9). */
  async listMyPaths(userId: string): Promise<MyPathView[]> {
    const ladders = await this.learnerPaths.allLadders(userId);

    return ladders.map((ladder) => this.toMyPathView(ladder));
  }

  /** One assigned path. Null — not 404 — when the learner holds none at all. */
  async getMyPath(userId: string, pathId?: string): Promise<MyPathView | null> {
    const state = await this.journey.getState(userId);

    if (state.paths.length === 0) {
      return null;
    }

    const target = pathId ?? state.paths[0]!.pathId;
    const ladder = await this.learnerPaths.ladder(userId, target, state);

    if (!ladder) {
      throw new NotFoundException('PATH_NOT_ASSIGNED');
    }

    return this.toMyPathView(ladder);
  }

  private toMyPathView(ladder: Ladder): MyPathView {
    const owed = owedCourses(ladder);

    return {
      userPathId: ladder.userPathId,
      pathId: ladder.pathId,
      pathName: ladder.pathName,
      status: ladder.status,
      assignedAt: ladder.assignedAt.toISOString(),
      placedLevel: ladder.placedLevel,
      pendingAssessmentId: ladder.pendingAssessmentId,
      levels: ladder.levels.map((level) => ({
        id: level.id,
        name: level.name,
        position: level.position,
        standing: level.standing,
        courses: level.courses.map((course) => ({
          courseId: course.courseId,
          moodleCourseId: course.moodleCourseId,
          title: course.title,
          durationMinutes: course.durationMinutes,
          order: course.position,
          status: course.status,
          gradePercent: course.gradePercent,
          passed: course.passed,
          /* Exactly one course is "next", and only among what they owe (§3). */
          isNextUp: course.courseId === nextUpCourseId(ladder),
          startable: course.startable,
        })),
      })),
      completedCount: owed.filter((course) => course.passed).length,
      totalCount: owed.length,
      pathCertificateUnlocked: isPathComplete(ladder),
    };
  }

  /**
   * §4.2's dashboard.
   *
   * Two states rather than three (D-134). The old ones were about a choice the
   * learner made; the questions now are whether the ministry has given them a
   * path, and whether they have sat its assessment.
   */
  async getDashboard(userId: string): Promise<DashboardView> {
    const state = await this.journey.getState(userId);
    const ladders = await this.learnerPaths.allLadders(userId, state);

    const paths: DashboardPath[] = ladders.map((ladder) => {
      const owed = owedCourses(ladder);
      const next = owed.find((course) => !course.passed) ?? null;

      return {
        id: ladder.pathId,
        name: ladder.pathName,
        placedLevel: ladder.placedLevel,
        pendingAssessmentId: ladder.pendingAssessmentId,
        completedCount: owed.filter((course) => course.passed).length,
        inProgressCount: owed.filter((course) => course.status === 'IN_PROGRESS').length,
        totalCount: owed.length,
        nextCourse: next ? { courseId: next.courseId, title: next.title } : null,
      };
    });

    return {
      state: dashboardState(ladders),
      paths,
      latestCertificate: await this.latestCertificate(userId),
      recentActivity: await this.recentActivity(userId, ladders),
    };
  }

  /**
   * Enrols this learner in every course they owe on one path and are not
   * enrolled in yet.
   *
   * Called when they are placed, and again when an administrator changes what
   * sits on the rungs at or above them. **Best-effort, deliberately** (D-036):
   * the placement and the assignment are recorded in our database, which is the
   * source of truth for them, and failing the request because the LMS was
   * unreachable would tell somebody their placement did not take when it did.
   * Failures are audited so they are visible, and `retryPendingEnrolments`
   * reconciles them.
   *
   * Each course is attempted independently: against a real Moodle a single
   * refused course would otherwise abandon every course after it in the list and
   * audit the whole batch as failed, leaving a learner half-enrolled with no
   * record of which half.
   */
  async syncEnrolments(
    userId: string,
    pathId: string,
    ipAddress: string | null,
  ): Promise<{ enrolled: number; failed: number }> {
    const ladder = await this.learnerPaths.ladder(userId, pathId);

    if (!ladder || !ladder.placedLevel) {
      /* Nothing is owed until a rung is decided, so there is nothing to enrol
         in and nothing to audit. */
      return { enrolled: 0, failed: 0 };
    }

    const owed = owedCourses(ladder);

    if (owed.length === 0) {
      return { enrolled: 0, failed: 0 };
    }

    /* Rows first, LMS second. An `enrollments` row with a null `enrolledAt` is
       the record that this learner is *meant* to be in this course — it is what
       the reconciliation job looks for, so it must exist before the call that
       may fail. */
    await this.prisma.enrollment.createMany({
      data: owed.map((course) => ({ userId, courseId: course.courseId })),
      skipDuplicates: true,
    });

    return this.enrolPending(userId, pathId, ipAddress);
  }

  /** Pushes this learner's unlanded enrolments to the LMS. */
  private async enrolPending(
    userId: string,
    pathId: string | null,
    ipAddress: string | null,
    courseIds?: string[],
  ): Promise<{ enrolled: number; failed: number }> {
    const pending = await this.prisma.enrollment.findMany({
      where: {
        userId,
        enrolledAt: null,
        ...(courseIds ? { courseId: { in: courseIds } } : {}),
      },
      select: { id: true, course: { select: { moodleCourseId: true } } },
    });

    if (pending.length === 0) {
      return { enrolled: 0, failed: 0 };
    }

    let lmsUserId: number;

    try {
      lmsUserId = await this.resolveLmsUserId(userId);
    } catch (error) {
      /* Without an LMS account nothing can be enrolled, so this is the one
         whole-batch failure left. */
      this.logger.error(
        `LMS provisioning failed for user ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      await this.auditEnrolment(userId, pathId, ipAddress, {
        requested: pending.length,
        enrolled: 0,
        failed: pending.length,
      });

      return { enrolled: 0, failed: pending.length };
    }

    let enrolled = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        await this.lms.enrol({ lmsUserId, lmsCourseId: row.course.moodleCourseId });
        await this.prisma.enrollment.update({
          where: { id: row.id },
          data: { enrolledAt: new Date(), lastError: null },
        });
        enrolled += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.error(
          `LMS enrolment failed for user ${userId}, course ${row.course.moodleCourseId}: ${message}`,
        );
        await this.prisma.enrollment.update({
          where: { id: row.id },
          /* Bounded: an LMS can return a very long body, and this column is
             read by an administrator, not parsed. */
          data: { lastError: message.slice(0, 500) },
        });
      }
    }

    await this.auditEnrolment(userId, pathId, ipAddress, {
      requested: pending.length,
      enrolled,
      failed,
    });

    return { enrolled, failed };
  }

  /**
   * Makes sure this learner is actually enrolled in this course, right now.
   *
   * Called when they click into a course rather than waiting for the scheduled
   * reconciliation. The gap it closes is real and otherwise invisible: somebody
   * placed while the LMS was unreachable has courses they owe and no enrolments,
   * and clicking one would drop them into a Moodle page telling them they cannot
   * access it.
   *
   * Idempotent at both layers — the query only picks up rows with no
   * `enrolledAt`, and `LmsPort.enrol` is idempotent by contract.
   */
  async ensureEnrolledForLaunch(userId: string, courseId: string): Promise<boolean> {
    const enrolment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { enrolledAt: true },
    });

    if (!enrolment) {
      /* Not owed: there is nothing to enrol into, and minting a launch token
         would hand out entry to a course they were never placed above. */
      return false;
    }

    if (enrolment.enrolledAt !== null) {
      return true;
    }

    await this.enrolPending(userId, null, null, [courseId]);

    const after = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { enrolledAt: true },
    });

    return after?.enrolledAt != null;
  }

  /**
   * Reconciles enrolments that never landed (D-036).
   *
   * This is the other half of best-effort enrolment: placement is allowed to
   * succeed with the LMS down precisely because something later comes back for
   * the leftovers. Without it, "best effort" would just mean "sometimes silently
   * not enrolled".
   *
   * Bounded per run so one bad batch cannot monopolise the scheduler, and safe
   * to run at any time — it only ever looks at rows with no `enrolledAt`.
   */
  async retryPendingEnrolments(limit = 100): Promise<{
    learners: number;
    enrolled: number;
    stillPending: number;
  }> {
    const pending = await this.prisma.enrollment.findMany({
      where: { enrolledAt: null },
      select: { userId: true, courseId: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    if (pending.length === 0) {
      return { learners: 0, enrolled: 0, stillPending: 0 };
    }

    const byLearner = new Map<string, string[]>();

    for (const row of pending) {
      byLearner.set(row.userId, [...(byLearner.get(row.userId) ?? []), row.courseId]);
    }

    let enrolled = 0;

    for (const [userId, courseIds] of byLearner) {
      /* No IP address: this is a background reconciliation, not a user action,
         and inventing one would make the audit trail lie about who acted. */
      const result = await this.enrolPending(userId, null, null, courseIds);
      enrolled += result.enrolled;
    }

    /* Counted from what each attempt actually did, not derived from a global
       tally: with more rows outstanding than the batch limit, "pending minus
       what remains" would report zero enrolled on a run that enrolled plenty. */
    const stillPending = await this.prisma.enrollment.count({ where: { enrolledAt: null } });

    this.logger.log(
      `Enrolment reconciliation: ${byLearner.size} learner(s), ${enrolled} enrolled, ${stillPending} still pending`,
    );

    return { learners: byLearner.size, enrolled, stillPending };
  }

  /**
   * Marks an assigned path complete when every owed course is passed.
   *
   * Called by the completion sync after it records a pass. Idempotent: a path
   * already COMPLETED is left alone, so re-running the sync cannot re-audit a
   * completion that happened last week.
   */
  async refreshPathCompletion(userId: string, pathId: string): Promise<boolean> {
    const ladder = await this.learnerPaths.ladder(userId, pathId);

    if (!ladder || ladder.status === 'COMPLETED' || !isPathComplete(ladder)) {
      return false;
    }

    await this.prisma.userPath.update({
      where: { userId_pathId: { userId, pathId } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.audit.record({
      action: AuditAction.PATH_COMPLETED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress: null,
      targetType: 'user_path',
      targetId: ladder.userPathId,
      detail: { courses: owedCourses(ladder).length },
    });

    return true;
  }

  private async auditEnrolment(
    userId: string,
    pathId: string | null,
    ipAddress: string | null,
    counts: { requested: number; enrolled: number; failed: number },
  ): Promise<void> {
    await this.audit.record({
      action: AuditAction.PATH_ENROLMENT_REQUESTED,
      outcome: counts.failed === 0 ? 'SUCCESS' : 'FAILURE',
      actorUserId: userId,
      ipAddress,
      /* The path when there is one; otherwise the learner, because a
         reconciliation run spans whatever they hold. */
      targetType: pathId ? 'path' : 'user',
      targetId: pathId ?? userId,
      detail: counts,
    });
  }

  private async resolveLmsUserId(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, moodleUserId: true },
    });

    if (user.moodleUserId !== null) {
      return user.moodleUserId;
    }

    const reference = await this.lms.provisionUser({
      email: user.email,
      fullName: user.fullName,
      externalUserId: user.id,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { moodleUserId: reference.lmsUserId },
    });

    return reference.lmsUserId;
  }

  private async latestCertificate(userId: string): Promise<DashboardView['latestCertificate']> {
    const certificate = await this.prisma.certificate.findFirst({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, type: true, subjectTitle: true, issuedAt: true },
    });

    return certificate
      ? {
          id: certificate.id,
          type: certificate.type,
          subjectTitle: certificate.subjectTitle,
          issuedAt: certificate.issuedAt.toISOString(),
        }
      : null;
  }

  /** The last three things that happened, newest first (TAM-123). */
  private async recentActivity(userId: string, ladders: Ladder[]): Promise<DashboardActivity[]> {
    const [placements, certificates, passes] = await Promise.all([
      this.prisma.learnerPlacement.findMany({
        where: { learnerId: userId },
        select: { placedAt: true, path: { select: { name: true } } },
        orderBy: { placedAt: 'desc' },
        take: 3,
      }),
      this.prisma.certificate.findMany({
        where: { userId },
        select: { subjectTitle: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
        take: 3,
      }),
      this.prisma.completion.findMany({
        where: { userId, passed: true },
        select: { moodleCourseId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
    ]);

    const titles = new Map(
      ladders.flatMap((ladder) =>
        ladder.levels.flatMap((level) =>
          level.courses.map((course) => [course.moodleCourseId, course.title] as const),
        ),
      ),
    );

    const activity: DashboardActivity[] = [
      ...ladders.map((ladder) => ({
        kind: 'PATH_ASSIGNED' as const,
        title: ladder.pathName,
        at: ladder.assignedAt.toISOString(),
      })),
      ...placements.map((row) => ({
        kind: 'ASSESSMENT_COMPLETED' as const,
        title: row.path.name,
        at: row.placedAt.toISOString(),
      })),
      ...passes.map((row) => ({
        kind: 'COURSE_PASSED' as const,
        /* Null rather than an id: a course that has since left the catalogue
           has no title to show, and printing a number would be worse than
           printing nothing. */
        title: titles.get(row.moodleCourseId) ?? null,
        at: row.updatedAt.toISOString(),
      })),
      ...certificates.map((row) => ({
        kind: 'CERTIFICATE_ISSUED' as const,
        title: row.subjectTitle,
        at: row.issuedAt.toISOString(),
      })),
    ];

    return activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  }
}

/**
 * Which of §4.2's two states applies.
 *
 * `AWAITING_PLACEMENT` is a state and not a variant of ACTIVE_PATH because the
 * one action available in it is completely different: the learner has a path and
 * cannot start any of it until they sit the assessment, and a dashboard showing
 * "0 of 0 courses" would be telling them nothing is there.
 */
function dashboardState(ladders: Ladder[]): DashboardState {
  if (ladders.length === 0) return 'NO_PATH';
  if (ladders.every((ladder) => !ladder.placedLevel)) return 'AWAITING_PLACEMENT';

  return 'ACTIVE_PATH';
}

/** The single "continue where you left off" course across one path. */
function nextUpCourseId(ladder: Ladder): string | null {
  return owedCourses(ladder).find((course) => !course.passed)?.courseId ?? null;
}
