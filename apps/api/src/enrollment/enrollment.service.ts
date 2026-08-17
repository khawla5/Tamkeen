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
  type DashboardView,
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

    const live = await this.liveProgress(userId);

    let nextAssigned = false;
    const courses: MyPathCourseView[] = userPath.courses.map((chosen) => {
      const progress = live.get(chosen.course.moodleCourseId);

      /*
       * Stored status is the record; live LMS progress is an overlay on top of
       * it. Phase 1 deliberately does not write the overlay back — persisting
       * completions is the Phase 2 sync job's job, and doing it here would put
       * two writers on the same rows.
       */
      const status: UserPathCourseStatus = progress?.completed
        ? 'COMPLETED'
        : progress?.gradePercent != null
          ? 'IN_PROGRESS'
          : chosen.status;

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
        gradePercent: progress?.gradePercent ?? chosen.gradePercent,
        isNextUp,
        courseUrl: this.lms.courseUrl(chosen.course.moodleCourseId),
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
      /* Presentation only — issuing the certificate is Phase 3. An empty path
         must not read as "finished". */
      pathCertificateUnlocked: courses.length > 0 && completedCount === courses.length,
    };
  }

  /** §4.2 — which of the three dashboard states applies. */
  async getDashboard(userId: string): Promise<DashboardView> {
    const state = await this.journey.getState(userId);

    if (!state.latestResult) {
      return { state: 'PRE_ASSESSMENT', codeString: null, path: null };
    }

    const codeString = state.latestResult.profile.codeString;

    /* A path being *built* is still "no path chosen": §4.2 has three states, and
       the user's next action is the same either way — go and choose. */
    if (!JourneyStateService.isCommitted(state)) {
      return { state: 'ASSESSED_NO_PATH', codeString, path: null };
    }

    const myPath = await this.getMyPath(userId);

    if (!myPath) {
      return { state: 'ASSESSED_NO_PATH', codeString, path: null };
    }

    const next = myPath.courses.find((course) => course.isNextUp) ?? null;

    return {
      state: 'ACTIVE_PATH',
      codeString,
      path: {
        id: myPath.pathId,
        name: myPath.pathName,
        completedCount: myPath.completedCount,
        totalCount: myPath.totalCount,
        nextCourse: next ? { id: next.id, courseId: next.courseId, title: next.title } : null,
      },
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

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
   * irreversible decision did not take, when it did. The failure is audited so
   * it is visible, and Phase 2's sync job is where reconciliation belongs.
   *
   * Provisioning the LMS user here is the same reasoning: `provisionUser` is
   * idempotent by contract, so calling it at the first moment an LMS account is
   * actually needed is safe, and it goes through the port — Phase 2 changes the
   * implementation, not this call (D-034).
   */
  private async enrol(
    userId: string,
    userPathId: string,
    courseIds: string[],
    ipAddress: string | null,
  ): Promise<void> {
    if (courseIds.length === 0) {
      return;
    }

    try {
      const lmsUserId = await this.resolveLmsUserId(userId);

      const courses = await this.prisma.userPathCourse.findMany({
        where: { userPathId, courseId: { in: courseIds } },
        select: { id: true, course: { select: { moodleCourseId: true } } },
      });

      for (const chosen of courses) {
        await this.lms.enrol({ lmsUserId, lmsCourseId: chosen.course.moodleCourseId });
        await this.prisma.userPathCourse.update({
          where: { id: chosen.id },
          data: { enrolledAt: new Date() },
        });
      }

      await this.audit.record({
        action: AuditAction.PATH_ENROLMENT_REQUESTED,
        outcome: 'SUCCESS',
        actorUserId: userId,
        ipAddress,
        targetType: 'user_path',
        targetId: userPathId,
        detail: { courses: courses.length },
      });
    } catch (error) {
      this.logger.error(
        `LMS enrolment failed for user path ${userPathId}: ${
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
      });
    }
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

  /**
   * Live progress from the LMS, keyed by course.
   *
   * Never throws: My Path must render whether or not the LMS is reachable. An
   * empty map degrades to the stored status, which is the honest fallback —
   * "we do not know of any progress" rather than "there is none".
   */
  private async liveProgress(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { moodleUserId: true },
    });

    if (user?.moodleUserId == null) {
      return new Map<number, { completed: boolean; gradePercent: number | null }>();
    }

    try {
      const progress = await this.lms.listProgressForUser(user.moodleUserId);

      return new Map(
        progress.map((entry) => [
          entry.lmsCourseId,
          { completed: entry.completed, gradePercent: entry.gradePercent },
        ]),
      );
    } catch (error) {
      this.logger.warn(
        `Could not read LMS progress: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      return new Map<number, { completed: boolean; gradePercent: number | null }>();
    }
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
