import { Injectable, NotFoundException } from '@nestjs/common';

import type { CourseDetail, CourseProgressStatus, CourseSummary } from '@tamkeen/types';

import { JourneyStateService, type JourneyState } from '../journey/journey-state.service';
import {
  levelStanding,
  placedInAnyPublishedPathWhere,
  visibleCourseWhere,
} from '../paths/path-access';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCourseAction } from './course-action';
import type { CourseQueryDto } from './courses.dto';

/**
 * The courses catalogue and course detail (§4.6, §4.7).
 *
 * Course *content* lives in the LMS; what this serves is our cached mirror plus
 * the product metadata layered on top (§6).
 *
 * **Every path lens here goes through `path-access`** (D-134). A course sitting
 * in a path on no level is invisible: not in the catalogue's path tags, not in
 * a path filter's results, not on the detail page. The filter is composed in one
 * helper rather than repeated in each query, because forgetting it returns
 * *more* rows and so looks like it works.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
  ) {}

  async list(userId: string, query: CourseQueryDto): Promise<CourseSummary[]> {
    const state = await this.journey.getState(userId);

    const courses = await this.prisma.course.findMany({
      where: {
        AND: [
          visibleCourseWhere(state.enrolledCourseIds),
          /* Only courses placed somewhere a learner could reach. A course in no
             published path, or in one but on no level, is not in the catalogue
             — it is content nobody has finished setting up. */
          { pathCourses: { some: placedInAnyPublishedPathWhere() } },
          query.pathId
            ? {
                pathCourses: {
                  some: { ...placedInAnyPublishedPathWhere(), pathId: query.pathId },
                },
              }
            : {},
          query.maxDurationMinutes ? { durationMinutes: { lte: query.maxDurationMinutes } } : {},
          query.q
            ? {
                /* Case-insensitive contains. Arabic has no case, so `mode`
                   changes nothing for Arabic text — it is here so a search for
                   a Latin acronym in a title behaves as a user expects. */
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' as const } },
                  { summary: { contains: query.q, mode: 'insensitive' as const } },
                ],
              }
            : {},
        ],
      },
      orderBy: { title: 'asc' },
      select: this.summarySelect(),
    });

    return courses.map((course) => this.toSummary(course));
  }

  async getDetail(userId: string, courseId: string): Promise<CourseDetail> {
    const state = await this.journey.getState(userId);

    const course = await this.prisma.course.findFirst({
      where: {
        AND: [
          { id: courseId },
          visibleCourseWhere(state.enrolledCourseIds),
          { pathCourses: { some: placedInAnyPublishedPathWhere() } },
        ],
      },
      select: {
        ...this.summarySelect(),
        objectives: true,
        prerequisites: true,
      },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    /* Which of the learner's own paths this course is reachable through. A
       course in two of their paths is read through the first — they owe it
       once, and picking a lens is not a decision to put to them. */
    const own = course.pathCourses.find((entry) =>
      state.paths.some((path) => path.pathId === entry.pathId),
    );
    const assigned = own ? JourneyStateService.findPath(state, own.pathId) : null;

    const completion = await this.prisma.completion.findUnique({
      where: { userId_moodleCourseId: { userId, moodleCourseId: course.moodleCourseId } },
      select: { passed: true, completed: true, gradePercent: true },
    });

    const action = resolveCourseAction({
      inPath:
        assigned && own?.level
          ? {
              placed: assigned.placedLevel !== null,
              standing: levelStanding(own.level.position, assigned.placedLevel?.position ?? null),
            }
          : null,
      courseStatus: course.status,
      completed: completion?.passed === true,
    });

    return {
      ...this.toSummary(course),
      objectives: course.objectives,
      prerequisites: course.prerequisites,
      action,
      pathId: assigned?.pathId ?? null,
      personalStatus: assigned ? this.progressOf(completion) : null,
      certificateId:
        action === 'COMPLETED' ? await this.findCertificateId(userId, course.id) : null,
    };
  }

  /**
   * The learner's own progress on one course.
   *
   * Read from `completions` and nowhere else (D-134). There is no per-learner
   * course row to disagree with it any more, which is what makes progress
   * survive an administrator moving the course to another level.
   */
  private progressOf(
    completion: { passed: boolean; completed: boolean; gradePercent: number | null } | null,
  ): CourseProgressStatus {
    if (!completion) return 'NOT_STARTED';
    if (completion.passed) return 'COMPLETED';
    /* Attempted but not passed. A grade with no pass is somebody mid-course, and
       calling that NOT_STARTED would lose the only evidence they began. */
    if (completion.completed || completion.gradePercent !== null) return 'IN_PROGRESS';

    return 'NOT_STARTED';
  }

  private summarySelect() {
    return {
      id: true,
      moodleCourseId: true,
      title: true,
      summary: true,
      durationMinutes: true,
      status: true,
      language: true,
      pathCourses: {
        where: placedInAnyPublishedPathWhere(),
        orderBy: { path: { displayOrder: 'asc' } },
        select: {
          pathId: true,
          path: { select: { id: true, name: true } },
          level: { select: { id: true, name: true, position: true } },
        },
      },
    } as const;
  }

  private toSummary(course: {
    id: string;
    moodleCourseId: number;
    title: string;
    summary: string;
    durationMinutes: number | null;
    status: CourseSummary['status'];
    language: CourseSummary['language'];
    pathCourses: Array<{
      path: { id: string; name: string };
      level: { id: string; name: string; position: number } | null;
    }>;
  }): CourseSummary {
    return {
      id: course.id,
      moodleCourseId: course.moodleCourseId,
      title: course.title,
      summary: course.summary,
      durationMinutes: course.durationMinutes,
      status: course.status,
      language: course.language,
      paths: course.pathCourses.map((entry) => ({
        id: entry.path.id,
        name: entry.path.name,
        level: entry.level,
      })),
    };
  }

  /** Only ever queried for a passed course, which the unique constraint on
   *  (user, type, course) guarantees has at most one certificate. */
  private async findCertificateId(userId: string, courseId: string): Promise<string | null> {
    const certificate = await this.prisma.certificate.findFirst({
      where: { userId, courseId, type: 'COURSE' },
      select: { id: true },
    });

    return certificate?.id ?? null;
  }

  /** Exposed for the player, which needs the same state without re-querying. */
  async stateFor(userId: string): Promise<JourneyState> {
    return this.journey.getState(userId);
  }
}
