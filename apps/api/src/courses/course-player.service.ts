import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { CourseLaunchView, CourseOutlineView, CoursePlayerView } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { LearnerPathService, owedCourses } from '../journey/learner-path.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.module';

/**
 * The course view / player (§4.8).
 *
 * The app's contribution here is deliberately thin: Moodle owns the material,
 * the quiz and the grading, so this provides the context around them and the one
 * action that applies now. Rebuilding Moodle's chrome would duplicate the LMS
 * badly and put us in the business of rendering content we do not own (D-000).
 */
@Injectable()
export class CoursePlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly enrollment: EnrollmentService,
    private readonly learnerPaths: LearnerPathService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async getPlayer(userId: string, courseId: string): Promise<CoursePlayerView> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, summary: true, durationMinutes: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    /* Which of the learner's own paths reaches this course, and where. A course
       in two assigned paths is read through the first; they owe it once, and
       choosing a lens is not a decision to put to them. */
    const found = await this.locate(userId, courseId);
    const passThreshold = this.config.get('PASS_THRESHOLD');

    /*
     * Passing is re-derived from the stored grade rather than trusted from a
     * flag. The threshold is a product setting (D-007): if it changed, a frozen
     * boolean would keep asserting the old policy on screen while `completions`
     * recorded the new one.
     */
    const gradePercent = found?.course.gradePercent ?? null;
    const passed =
      found?.course.status === 'COMPLETED' &&
      gradePercent !== null &&
      gradePercent >= passThreshold;

    return {
      courseId: course.id,
      title: course.title,
      summary: course.summary,
      durationMinutes: course.durationMinutes,
      pathName: found?.pathName ?? null,
      levelName: found?.levelName ?? null,
      orderInLevel: found?.course.position ?? null,
      totalInLevel: found?.totalInLevel ?? null,
      status: found?.course.status ?? 'NOT_STARTED',
      gradePercent,
      passed,
      passThreshold,
      /* Nothing is owed before the assessment places them, and a course below
         their rung is not theirs to start — an enabled button either way would
         be one that cannot do what it says (D-134). */
      canLaunch: found?.course.startable === true,
      nextCourseId: found?.nextCourseId ?? null,
    };
  }

  /**
   * Where this course sits for this learner: the path, the rung, the position on
   * it, and what comes next.
   *
   * Null when no assigned path reaches it — which is the same answer as "the
   * course does not exist for you", and is what keeps the player from confirming
   * that a course is in somebody else's curriculum.
   */
  private async locate(userId: string, courseId: string) {
    const ladders = await this.learnerPaths.allLadders(userId);

    for (const ladder of ladders) {
      for (const level of ladder.levels) {
        const course = level.courses.find((entry) => entry.courseId === courseId);

        if (!course) continue;

        const owed = owedCourses(ladder);
        const index = owed.findIndex((entry) => entry.courseId === courseId);
        const next =
          index === -1 ? null : (owed.slice(index + 1).find((entry) => !entry.passed) ?? null);

        return {
          pathName: ladder.pathName,
          levelName: level.name,
          totalInLevel: level.courses.length,
          course,
          nextCourseId: next?.courseId ?? null,
        };
      }
    }

    return null;
  }

  /**
   * Mints the one-shot handoff and hands back its URL (§5.3, D-044).
   *
   * Minted **per request**, not embedded in a page, because it carries a
   * short-lived credential whose life must start when the learner actually
   * clicks. Every refusal below is a case where issuing one would grant entry
   * to a course the learner is not entitled to.
   */
  /**
   * The activities of a course the learner may enter (D-122). Same gate as the
   * launch — a course they are not enrolled in answers as if it had no outline,
   * so nothing is learned about courses in other people's paths.
   */
  async outline(userId: string, courseId: string): Promise<CourseOutlineView> {
    const enrolment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { course: { select: { moodleCourseId: true } } },
    });

    if (!enrolment) {
      return { items: [] };
    }

    const items = await this.lms.getCourseOutline(enrolment.course.moodleCourseId);

    return {
      items: items.map((item) => ({
        moduleId: item.lmsModuleId,
        name: item.name,
        kind: item.kind,
        url: item.url,
      })),
    };
  }

  async launch(
    userId: string,
    courseId: string,
    ipAddress: string | null,
    options: { embed: boolean } = { embed: false },
  ): Promise<CourseLaunchView> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { moodleCourseId: true, status: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    /* A retired course is completable by nobody — including someone who
       selected it, which is what separates RETIRED from
       HIDDEN_BUT_COMPLETABLE (D-015, D-040). */
    if (course.status === 'RETIRED') {
      throw new ConflictException('COURSE_NOT_AVAILABLE');
    }

    const enrolled = await this.enrollment.ensureEnrolledForLaunch(userId, courseId);

    if (!enrolled) {
      await this.audit.record({
        action: AuditAction.LMS_COURSE_LAUNCHED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
      });

      /*
       * Two different causes, one answer: the course is not one this learner
       * owes (nothing to enrol into), or the LMS refused the enrolment. Both
       * mean they cannot enter, and distinguishing them here would tell an
       * attacker which courses exist in someone else's path.
       */
      throw new ConflictException('COURSE_NOT_ENROLLED');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { moodleUserId: true },
    });

    if (user.moodleUserId === null) {
      /* Unreachable in practice — enrolment provisions the account — but
         returning a launch URL built from a null id would produce a token for
         user 0. */
      throw new ConflictException('COURSE_NOT_ENROLLED');
    }

    await this.audit.record({
      action: AuditAction.LMS_COURSE_LAUNCHED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
    });

    /* D-121: framed by the player, or the full-page handoff. Same credential,
       same audit entry either way — only the presentation differs. */
    return options.embed
      ? {
          url: this.lms.courseLaunchUrl(user.moodleUserId, course.moodleCourseId, {
            embed: 'learner',
          }),
          mode: 'embed',
        }
      : {
          url: this.lms.courseLaunchUrl(user.moodleUserId, course.moodleCourseId),
          mode: 'handoff',
        };
  }
}
