import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { CourseLaunchView, CoursePlayerView } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

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
    private readonly settings: SettingsService,
    private readonly enrollment: EnrollmentService,
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

    const userPath = await this.prisma.userPath.findUnique({
      where: { userId },
      select: {
        confirmedAt: true,
        path: { select: { name: true } },
        courses: {
          orderBy: { displayOrder: 'asc' },
          select: {
            courseId: true,
            displayOrder: true,
            status: true,
            gradePercent: true,
          },
        },
      },
    });

    const chosen = userPath?.courses.find((entry) => entry.courseId === courseId) ?? null;
    const confirmed = userPath?.confirmedAt != null;
    const passThreshold = await this.settings.get('PASS_THRESHOLD');

    /*
     * Passing is re-derived from the stored grade rather than stored as a flag
     * on the chosen course. The threshold is a product setting (D-007): if it
     * changed, a frozen boolean would keep asserting the old policy on screen
     * while `completions` recorded the new one.
     */
    const gradePercent = chosen?.gradePercent ?? null;
    const passed =
      chosen?.status === 'COMPLETED' && gradePercent !== null && gradePercent >= passThreshold;

    return {
      courseId: course.id,
      title: course.title,
      summary: course.summary,
      durationMinutes: course.durationMinutes,
      pathName: chosen ? (userPath?.path.name ?? null) : null,
      orderInPath: chosen?.displayOrder ?? null,
      totalInPath: chosen ? (userPath?.courses.length ?? null) : null,
      status: chosen?.status ?? 'NOT_STARTED',
      gradePercent,
      passed,
      passThreshold,
      /* Nothing is enrolled before the commitment gate (§4.5), so an enabled
         button would be one that cannot do what it says. */
      canLaunch: confirmed && chosen !== null,
      nextCourseId: this.findNext(userPath?.courses ?? [], chosen?.displayOrder ?? null),
    };
  }

  /**
   * Mints the one-shot handoff and hands back its URL (§5.3, D-044).
   *
   * Minted **per request**, not embedded in a page, because it carries a
   * short-lived credential whose life must start when the learner actually
   * clicks. Every refusal below is a case where issuing one would grant entry
   * to a course the learner is not entitled to.
   */
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
       * Two different causes, one answer: the course is not in a confirmed path
       * (nothing to enrol into), or the LMS refused the enrolment. Both mean the
       * learner cannot enter, and distinguishing them here would tell an
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

    /* D-102: framed by the player, or the full-page handoff. Same credential,
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

  /** The next course in the path after this one, for "continue" after a pass. */
  private findNext(
    courses: ReadonlyArray<{ courseId: string; displayOrder: number; status: string }>,
    afterOrder: number | null,
  ): string | null {
    if (afterOrder === null) {
      return null;
    }

    const next = courses.find(
      (entry) => entry.displayOrder > afterOrder && entry.status !== 'COMPLETED',
    );

    return next?.courseId ?? null;
  }
}
