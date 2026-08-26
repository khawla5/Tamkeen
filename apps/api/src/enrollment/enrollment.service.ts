import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  PATH_MAX_COURSES,
  PATH_MIN_COURSES,
  type DashboardActivity,
  type DashboardView,
  rankPathsByRecommendation,
  type MyPathCourseView,
  type MyPathView,
  type UserPathCourseStatus,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { JourneyStateService, type JourneyState } from '../journey/journey-state.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Building and committing to the one path (§4.5, §4.9, §4.2).
 *
 * This is where the product's hardest rules are enforced, and they are enforced
 * **here rather than in the controller** so a job or an admin screen added later
 * cannot route around them:
 *
 *  - one path per user, no switching after confirmation (D-002);
 *  - between five and ten courses to confirm (§2);
 *  - selection may only change while building, except the quiet post-commitment
 *    add §4.9 allows while under ten;
 *  - a course must belong to the chosen path and be on offer.
 *
 * The client enforces the same bounds to avoid offering a doomed action. That is
 * a courtesy; this is the authority.
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
    private readonly audit: AuditService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  /**
   * Chooses (or, while still building, changes) the path being built.
   *
   * Changing before confirmation is deliberate: the commitment gate is the
   * confirm dialog, not the act of opening a path. Switching clears the previous
   * selection, because courses belong to a path and carrying them across would
   * produce a selection whose courses are not in the path.
   */
  async selectPath(userId: string, pathId: string, ipAddress: string | null): Promise<void> {
    const state = await this.journey.getState(userId);

    if (JourneyStateService.isCommitted(state)) {
      await this.auditFailure(AuditAction.PATH_SELECTED, userId, ipAddress, {
        reason: AuditReason.PATH_ALREADY_CONFIRMED,
        targetId: pathId,
      });
      throw new ConflictException('PATH_ALREADY_CONFIRMED');
    }

    const path = await this.prisma.path.findFirst({
      where: { id: pathId, isActive: true },
      select: { id: true },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    if (state.userPath?.pathId === path.id) {
      return; // Idempotent: re-opening the same path is not a change.
    }

    await this.prisma.$transaction(async (tx) => {
      if (state.userPath) {
        await tx.userPathCourse.deleteMany({ where: { userPathId: state.userPath.id } });
        await tx.userPath.update({
          where: { id: state.userPath.id },
          data: { pathId: path.id, status: 'BUILDING' },
        });
        return;
      }

      await tx.userPath.create({ data: { userId, pathId: path.id, status: 'BUILDING' } });
    });

    await this.audit.record({
      action: AuditAction.PATH_SELECTED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'path',
      targetId: path.id,
    });
  }

  /** Replaces the whole selection. The build page sends what is ticked. */
  async setCourses(
    userId: string,
    courseIds: string[],
    ipAddress: string | null,
  ): Promise<string[]> {
    const state = await this.journey.getState(userId);
    const userPath = this.requireUncommittedPath(state);

    if (courseIds.length > PATH_MAX_COURSES) {
      await this.auditFailure(AuditAction.PATH_COURSES_UPDATED, userId, ipAddress, {
        reason: AuditReason.COURSE_COUNT_OUT_OF_RANGE,
        targetId: userPath.pathId,
      });
      throw new BadRequestException('COURSE_COUNT_OUT_OF_RANGE');
    }

    await this.assertCoursesSelectable(userId, userPath.pathId, courseIds, ipAddress);

    await this.prisma.$transaction(async (tx) => {
      await tx.userPathCourse.deleteMany({ where: { userPathId: userPath.id } });

      if (courseIds.length > 0) {
        await tx.userPathCourse.createMany({
          data: courseIds.map((courseId, index) => ({
            userPathId: userPath.id,
            courseId,
            displayOrder: index + 1,
          })),
        });
      }
    });

    await this.audit.record({
      action: AuditAction.PATH_COURSES_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'user_path',
      targetId: userPath.id,
      detail: { selected: courseIds.length },
    });

    return courseIds;
  }

  /**
   * The quiet add §4.9 permits: one more course, after commitment, while under
   * ten. Adding is allowed; removing is not — a confirmed path is a commitment,
   * and letting courses leave it would be switching by instalments.
   */
  async addCourse(userId: string, courseId: string, ipAddress: string | null): Promise<void> {
    const state = await this.journey.getState(userId);
    const userPath = state.userPath;

    if (!userPath) {
      throw new ConflictException('PATH_NOT_SELECTED');
    }

    if (userPath.selectedCourseIds.includes(courseId)) {
      return; // Already there — idempotent.
    }

    if (userPath.selectedCourseIds.length >= PATH_MAX_COURSES) {
      await this.auditFailure(AuditAction.PATH_COURSES_UPDATED, userId, ipAddress, {
        reason: AuditReason.COURSE_COUNT_OUT_OF_RANGE,
        targetId: userPath.id,
      });
      throw new BadRequestException('COURSE_COUNT_OUT_OF_RANGE');
    }

    await this.assertCoursesSelectable(userId, userPath.pathId, [courseId], ipAddress);

    await this.prisma.userPathCourse.create({
      data: {
        userPathId: userPath.id,
        courseId,
        displayOrder: userPath.selectedCourseIds.length + 1,
      },
    });

    /* Already committed, so this course needs enrolling on its own — the bulk
       enrolment at confirm time has been and gone. */
    if (JourneyStateService.isCommitted(state)) {
      await this.enrol(userId, userPath.id, [courseId], ipAddress);
    }

    await this.audit.record({
      action: AuditAction.PATH_COURSES_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'user_path',
      targetId: userPath.id,
      detail: { added: 1, selected: userPath.selectedCourseIds.length + 1 },
    });
  }

  /**
   * The hard commitment gate (§2, §4.5).
   *
   * The count is re-read inside the transaction rather than taken from the
   * state loaded above: two concurrent requests could otherwise each see nine
   * courses and both confirm, and the 5-10 rule would have been checked against
   * a snapshot rather than the row that got written.
   */
  async confirm(userId: string, ipAddress: string | null): Promise<MyPathView> {
    const state = await this.journey.getState(userId);
    const userPath = this.requireUncommittedPath(state);

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const count = await tx.userPathCourse.count({ where: { userPathId: userPath.id } });

      if (count < PATH_MIN_COURSES || count > PATH_MAX_COURSES) {
        throw new BadRequestException('COURSE_COUNT_OUT_OF_RANGE');
      }

      /* `updateMany` with the guard in the WHERE clause, so a second concurrent
         confirm matches zero rows instead of overwriting the first one's
         timestamp. */
      const updated = await tx.userPath.updateMany({
        where: { id: userPath.id, confirmedAt: null },
        data: { status: 'ACTIVE', confirmedAt: new Date() },
      });

      if (updated.count === 0) {
        throw new ConflictException('PATH_ALREADY_CONFIRMED');
      }

      return count;
    });

    await this.audit.record({
      action: AuditAction.PATH_CONFIRMED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'user_path',
      targetId: userPath.id,
      detail: { pathId: userPath.pathId, courses: confirmed },
    });

    await this.enrol(userId, userPath.id, userPath.selectedCourseIds, ipAddress);

    const view = await this.getMyPath(userId);

    if (!view) {
      /* Unreachable — the path was just confirmed. Throwing beats returning a
         lie typed as MyPathView. */
      throw new ConflictException('PATH_NOT_SELECTED');
    }

    return view;
  }

  /** §4.9 — the run view. */
  async getMyPath(userId: string): Promise<MyPathView | null> {
    const state = await this.journey.getState(userId);

    if (!state.userPath) {
      return null;
    }

    const userPath = await this.prisma.userPath.findUnique({
      where: { id: state.userPath.id },
      select: {
        id: true,
        status: true,
        confirmedAt: true,
        path: { select: { id: true, name: true, riasecLetter: true } },
        courses: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            displayOrder: true,
            status: true,
            gradePercent: true,
            course: {
              select: { id: true, moodleCourseId: true, title: true, durationMinutes: true },
            },
          },
        },
      },
    });

    if (!userPath) {
      return null;
    }

    /* One read for every course certificate on this path (TAM-126): the link
       on a done stop, not a promise — null until the sync has issued one. */
    const certificates = await this.prisma.certificate.findMany({
      where: {
        userId,
        type: 'COURSE',
        courseId: { in: userPath.courses.map((chosen) => chosen.course.id) },
      },
      select: { id: true, courseId: true },
    });
    const certificateByCourse = new Map(
      certificates.map((certificate) => [certificate.courseId, certificate.id]),
    );

    let nextAssigned = false;
    const courses: MyPathCourseView[] = userPath.courses.map((chosen) => {
      /*
       * The stored status is now the whole truth. Phase 1 overlaid live LMS
       * progress here because nothing persisted it yet; the completion-sync job
       * is that missing writer, and it has arrived (D-036, D-042).
       *
       * Removing the overlay is not merely tidying: it took an N+1 call to the
       * LMS on every render of this page, which against a real Moodle means the
       * page's latency — and its ability to render at all — depended on the LMS
       * being up. It no longer does.
       */
      const status: UserPathCourseStatus = chosen.status;

      const isNextUp = !nextAssigned && status !== 'COMPLETED';
      if (isNextUp) {
        nextAssigned = true;
      }

      return {
        id: chosen.id,
        courseId: chosen.course.id,
        moodleCourseId: chosen.course.moodleCourseId,
        title: chosen.course.title,
        durationMinutes: chosen.course.durationMinutes,
        order: chosen.displayOrder,
        status,
        gradePercent: chosen.gradePercent,
        isNextUp,
        certificateId: certificateByCourse.get(chosen.course.id) ?? null,
      };
    });

    const completedCount = courses.filter((course) => course.status === 'COMPLETED').length;

    return {
      userPathId: userPath.id,
      pathId: userPath.path.id,
      pathName: userPath.path.name,
      riasecLetter: userPath.path.riasecLetter,
      status: userPath.status,
      confirmedAt: userPath.confirmedAt?.toISOString() ?? null,
      courses,
      completedCount,
      totalCount: courses.length,
      /*
       * Read from the path's own status rather than recounted here, because the
       * two are not the same question. `completedCount` counts courses the LMS
       * reports as finished, which includes ones the learner *failed* — a
       * course can be completed and below the product threshold (D-042 §4). The
       * path only reaches `COMPLETED` when every chosen course was **passed**,
       * which is exactly when the certificate exists.
       *
       * Recounting statuses here would unlock the slot for a learner who
       * finished everything and passed nothing, promising a certificate that
       * was never issued.
       */
      pathCertificateUnlocked: userPath.status === 'COMPLETED',
    };
  }

  /**
   * §4.2 — which of the three dashboard states applies, plus what that state
   * needs to be meaningful (TAM-123): the top recommendations while choosing,
   * the next courses and the latest certificate while working, and the last
   * few things that happened throughout. One payload, decided here, so the
   * page renders one branch and never re-derives the rule.
   */
  async getDashboard(userId: string): Promise<DashboardView> {
    const state = await this.journey.getState(userId);
    const empty = {
      recommendedPaths: [],
      upcomingCourses: [],
      latestCertificate: null,
      recentActivity: [] as DashboardActivity[],
    };

    if (!state.latestResult) {
      return { state: 'PRE_ASSESSMENT', codeString: null, path: null, ...empty };
    }

    const codeString = state.latestResult.profile.codeString;
    const recentActivity = await this.recentActivity(userId);

    /* A path being *built* is still "no path chosen": §4.2 has three states, and
       the user's next action is the same either way — go and choose. */
    if (!JourneyStateService.isCommitted(state)) {
      return {
        state: 'ASSESSED_NO_PATH',
        codeString,
        path: null,
        ...empty,
        recommendedPaths: await this.topRecommendedPaths(state),
        recentActivity,
      };
    }

    const myPath = await this.getMyPath(userId);

    if (!myPath) {
      return {
        state: 'ASSESSED_NO_PATH',
        codeString,
        path: null,
        ...empty,
        recommendedPaths: await this.topRecommendedPaths(state),
        recentActivity,
      };
    }

    const next = myPath.courses.find((course) => course.isNextUp) ?? null;
    const latest = await this.prisma.certificate.findFirst({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, type: true, subjectTitle: true, issuedAt: true },
    });

    return {
      state: 'ACTIVE_PATH',
      codeString,
      recommendedPaths: [],
      /* Current first, then what follows, in path order — the "what's after
         this one" a learner actually wants. Three is a glance, not a list. */
      upcomingCourses: myPath.courses
        .filter((course) => course.status !== 'COMPLETED')
        .slice(0, 3)
        .map((course) => ({
          id: course.id,
          courseId: course.courseId,
          title: course.title,
          status: course.status,
        })),
      latestCertificate: latest
        ? {
            id: latest.id,
            type: latest.type,
            subjectTitle: latest.subjectTitle,
            issuedAt: latest.issuedAt.toISOString(),
          }
        : null,
      recentActivity,
      path: {
        id: myPath.pathId,
        name: myPath.pathName,
        riasecLetter: myPath.riasecLetter,
        completedCount: myPath.completedCount,
        inProgressCount: myPath.courses.filter((course) => course.status === 'IN_PROGRESS').length,
        totalCount: myPath.totalCount,
        nextCourse: next ? { id: next.id, courseId: next.courseId, title: next.title } : null,
      },
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** The recommended paths in the user's rank order, at most three. */
  private async topRecommendedPaths(
    state: JourneyState,
  ): Promise<DashboardView['recommendedPaths']> {
    const code = JourneyStateService.hollandCode(state);
    const paths = await this.prisma.path.findMany({
      where: { isActive: true },
      select: { id: true, name: true, riasecLetter: true, displayOrder: true },
    });
    return rankPathsByRecommendation(
      paths.map((path) => ({
        id: path.id,
        riasecLetter: path.riasecLetter,
        displayOrder: path.displayOrder,
        source: path,
      })),
      code,
    )
      .filter((entry) => entry.recommended)
      .slice(0, 3)
      .map((entry) => ({
        id: entry.path.source.id,
        name: entry.path.source.name,
        riasecLetter: entry.path.source.riasecLetter,
      }));
  }

  /**
   * The last three things the learner did, newest first, read from the product
   * tables rather than the audit log: those rows carry the titles a person
   * recognises, and the audit log is deliberately minimal (no PII, ids only).
   */
  private async recentActivity(userId: string): Promise<DashboardActivity[]> {
    const [results, userPath, passed, certificates] = await Promise.all([
      this.prisma.assessmentResult.findMany({
        where: { userId },
        orderBy: { completedAt: 'desc' },
        take: 3,
        select: { completedAt: true },
      }),
      this.prisma.userPath.findFirst({
        where: { userId, confirmedAt: { not: null } },
        select: { confirmedAt: true, path: { select: { name: true } } },
      }),
      this.prisma.completion.findMany({
        where: { userId, passed: true, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 3,
        select: { completedAt: true, moodleCourseId: true },
      }),
      this.prisma.certificate.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
        take: 3,
        select: { issuedAt: true, subjectTitle: true },
      }),
    ]);

    const courseTitles = new Map<number, string>();
    if (passed.length > 0) {
      const courses = await this.prisma.course.findMany({
        where: { moodleCourseId: { in: passed.map((c) => c.moodleCourseId) } },
        select: { moodleCourseId: true, title: true },
      });
      for (const course of courses) courseTitles.set(course.moodleCourseId, course.title);
    }

    const events: DashboardActivity[] = [
      ...results.map((r) => ({
        kind: 'ASSESSMENT_COMPLETED' as const,
        title: null,
        at: r.completedAt.toISOString(),
      })),
      ...(userPath?.confirmedAt
        ? [
            {
              kind: 'PATH_CONFIRMED' as const,
              title: userPath.path.name,
              at: userPath.confirmedAt.toISOString(),
            },
          ]
        : []),
      ...passed.map((c) => ({
        kind: 'COURSE_PASSED' as const,
        title: courseTitles.get(c.moodleCourseId) ?? null,
        at: c.completedAt!.toISOString(),
      })),
      ...certificates.map((c) => ({
        kind: 'CERTIFICATE_ISSUED' as const,
        title: c.subjectTitle,
        at: c.issuedAt.toISOString(),
      })),
    ];

    return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 3);
  }

  private requireUncommittedPath(state: JourneyState) {
    if (!state.userPath) {
      throw new ConflictException('PATH_NOT_SELECTED');
    }

    if (JourneyStateService.isCommitted(state)) {
      throw new ConflictException('PATH_ALREADY_CONFIRMED');
    }

    return state.userPath;
  }

  /**
   * Every course must belong to the chosen path and still be on offer.
   *
   * Checked in one query rather than per id: the interesting failure is a
   * request naming a course from a *different* path, which a per-id existence
   * check would happily accept.
   */
  private async assertCoursesSelectable(
    userId: string,
    pathId: string,
    courseIds: string[],
    ipAddress: string | null,
  ): Promise<void> {
    if (courseIds.length === 0) {
      return;
    }

    const membership = await this.prisma.pathCourse.findMany({
      where: { pathId, courseId: { in: courseIds } },
      select: { courseId: true, course: { select: { status: true } } },
    });

    const inPath = new Set(membership.map((entry) => entry.courseId));
    const notInPath = courseIds.filter((id) => !inPath.has(id));

    if (notInPath.length > 0) {
      await this.auditFailure(AuditAction.PATH_COURSES_UPDATED, userId, ipAddress, {
        reason: AuditReason.COURSE_NOT_IN_PATH,
        targetId: pathId,
      });
      throw new BadRequestException('COURSE_NOT_IN_PATH');
    }

    /* A course that has left the catalogue stays completable for whoever
       already had it, but cannot enter a new selection (D-015). */
    if (membership.some((entry) => entry.course.status !== 'AVAILABLE')) {
      await this.auditFailure(AuditAction.PATH_COURSES_UPDATED, userId, ipAddress, {
        reason: AuditReason.COURSE_NOT_AVAILABLE,
        targetId: pathId,
      });
      throw new BadRequestException('COURSE_NOT_AVAILABLE');
    }
  }

  /**
   * Requests LMS enrolment for the given courses.
   *
   * **Best effort, deliberately.** The commitment already happened and is
   * recorded in our database, which is the source of truth for it; failing the
   * request because the LMS was unreachable would tell the user their
   * irreversible decision did not take, when it did. Failures are audited so
   * they are visible, and `retryPendingEnrolments` reconciles them (D-036).
   *
   * **Each course is attempted independently.** With the mock this did not
   * matter, because nothing failed; against a real Moodle a single refused
   * course would otherwise abandon every course after it in the list and audit
   * the whole batch as failed, leaving a learner with a half-enrolled path and
   * no record of which half.
   *
   * Only courses not yet enrolled are attempted, so a retry cannot double-enrol
   * even before the port's own idempotency is considered.
   */
  private async enrol(
    userId: string,
    userPathId: string,
    courseIds: string[],
    ipAddress: string | null,
  ): Promise<{ enrolled: number; failed: number }> {
    if (courseIds.length === 0) {
      return { enrolled: 0, failed: 0 };
    }

    const courses = await this.prisma.userPathCourse.findMany({
      where: { userPathId, courseId: { in: courseIds }, enrolledAt: null },
      select: { id: true, course: { select: { moodleCourseId: true } } },
    });

    if (courses.length === 0) {
      // Everything already enrolled — nothing to do, and nothing to audit.
      return { enrolled: 0, failed: 0 };
    }

    let lmsUserId: number;

    try {
      lmsUserId = await this.resolveLmsUserId(userId);
    } catch (error) {
      /* Without an LMS account nothing can be enrolled, so this is the one
         whole-batch failure left. */
      this.logger.error(
        `LMS provisioning failed for user path ${userPathId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      await this.audit.record({
        action: AuditAction.PATH_ENROLMENT_REQUESTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'user_path',
        targetId: userPathId,
        detail: { requested: courses.length, enrolled: 0, failed: courses.length },
      });

      return { enrolled: 0, failed: courses.length };
    }

    let enrolled = 0;
    let failed = 0;

    for (const chosen of courses) {
      try {
        await this.lms.enrol({ lmsUserId, lmsCourseId: chosen.course.moodleCourseId });
        await this.prisma.userPathCourse.update({
          where: { id: chosen.id },
          data: { enrolledAt: new Date() },
        });
        enrolled += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `LMS enrolment failed for user path ${userPathId}, course ${
            chosen.course.moodleCourseId
          }: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    await this.audit.record({
      action: AuditAction.PATH_ENROLMENT_REQUESTED,
      outcome: failed === 0 ? 'SUCCESS' : 'FAILURE',
      actorUserId: userId,
      ipAddress,
      targetType: 'user_path',
      targetId: userPathId,
      detail: { requested: courses.length, enrolled, failed },
    });

    return { enrolled, failed };
  }

  /**
   * Makes sure this learner is actually enrolled in this course, right now.
   *
   * Called when they click into a course rather than waiting for the scheduled
   * reconciliation. The gap it closes is real and otherwise invisible: a learner
   * who confirmed their path while the LMS was unreachable has a committed path
   * with no enrolments, and clicking a course would drop them into a Moodle page
   * telling them they cannot access it. Enrolling on demand turns "wait up to a
   * sync interval and hope" into "it works".
   *
   * Idempotent at both layers — the query only picks up rows with no
   * `enrolledAt`, and `LmsPort.enrol` is idempotent by contract.
   */
  async ensureEnrolledForLaunch(userId: string, courseId: string): Promise<boolean> {
    const chosen = await this.prisma.userPathCourse.findFirst({
      where: {
        courseId,
        userPath: { userId, confirmedAt: { not: null } },
      },
      select: { id: true, enrolledAt: true, userPathId: true },
    });

    if (!chosen) {
      /* Not in a confirmed path: there is nothing to enrol into, and minting a
         launch token would hand out entry to a course they never chose. */
      return false;
    }

    if (chosen.enrolledAt !== null) {
      return true;
    }

    await this.enrol(userId, chosen.userPathId, [courseId], null);

    const after = await this.prisma.userPathCourse.findUnique({
      where: { id: chosen.id },
      select: { enrolledAt: true },
    });

    return after?.enrolledAt !== null && after?.enrolledAt !== undefined;
  }

  /**
   * Reconciles confirmed paths whose LMS enrolments never landed (D-036).
   *
   * This is the other half of best-effort enrolment: the confirm request is
   * allowed to succeed with the LMS down precisely because something later comes
   * back for the leftovers. Without it, "best effort" would just mean "sometimes
   * silently not enrolled".
   *
   * Bounded per run so one bad batch cannot monopolise the scheduler, and safe
   * to run at any time — it only ever looks at rows with no `enrolledAt`.
   */
  async retryPendingEnrolments(limit = 100): Promise<{
    paths: number;
    enrolled: number;
    stillPending: number;
  }> {
    const pending = await this.prisma.userPathCourse.findMany({
      where: { enrolledAt: null, userPath: { confirmedAt: { not: null } } },
      select: { courseId: true, userPathId: true, userPath: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: limit,
    });

    if (pending.length === 0) {
      return { paths: 0, enrolled: 0, stillPending: 0 };
    }

    const byPath = new Map<string, { userId: string; courseIds: string[] }>();

    for (const row of pending) {
      const group = byPath.get(row.userPathId) ?? { userId: row.userPath.userId, courseIds: [] };
      group.courseIds.push(row.courseId);
      byPath.set(row.userPathId, group);
    }

    let enrolled = 0;

    for (const [userPathId, group] of byPath) {
      /* No IP address: this is a background reconciliation, not a user action,
         and inventing one would make the audit trail lie about who acted. */
      const result = await this.enrol(group.userId, userPathId, group.courseIds, null);
      enrolled += result.enrolled;
    }

    /* Counted from what each attempt actually did, not derived from a global
       tally: with more rows outstanding than the batch limit, "pending minus
       what remains" would report zero enrolled on a run that enrolled plenty. */
    const stillPending = await this.prisma.userPathCourse.count({
      where: { enrolledAt: null, userPath: { confirmedAt: { not: null } } },
    });

    this.logger.log(
      `Enrolment reconciliation: ${byPath.size} path(s), ${enrolled} enrolled, ${stillPending} still pending`,
    );

    return { paths: byPath.size, enrolled, stillPending };
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

  private async auditFailure(
    action: (typeof AuditAction)[keyof typeof AuditAction],
    userId: string,
    ipAddress: string | null,
    options: { reason: (typeof AuditReason)[keyof typeof AuditReason]; targetId: string },
  ): Promise<void> {
    await this.audit.record({
      action,
      outcome: 'FAILURE',
      actorUserId: userId,
      ipAddress,
      targetId: options.targetId,
      reason: options.reason,
    });
  }
}
