import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { CourseDetail, CourseSummary } from '@tamkeen/types';

import { JourneyStateService, type JourneyState } from '../journey/journey-state.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCourseAction } from './course-action';
import type { CourseQueryDto } from './courses.dto';

/**
 * The courses catalogue and course detail (§4.6, §4.7).
 *
 * Course *content* lives in the LMS; what this serves is our cached mirror plus
 * the product metadata layered on top (§6). The one thing still asked of the LMS
 * at request time is `courseUrl`, because building a deep link is the LMS's
 * business and hardcoding its URL shape here would leak the boundary.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  /**
   * Which course statuses this user may see.
   *
   * AVAILABLE always. A course that has left the catalogue stays visible only to
   * someone who already selected it — that is exactly the "available to add"
   * versus "still completable if already enrolled" distinction D-015 asks the
   * catalogue to make. RETIRED is visible to nobody.
   */
  private visibleCourseFilter(state: JourneyState) {
    const selected = state.userPath?.selectedCourseIds ?? [];

    return selected.length > 0
      ? {
          OR: [
            { status: 'AVAILABLE' as const },
            { id: { in: selected }, status: { not: 'RETIRED' as const } },
          ],
        }
      : { status: 'AVAILABLE' as const };
  }

  async list(userId: string, query: CourseQueryDto): Promise<CourseSummary[]> {
    const state = await this.journey.getState(userId);

    const courses = await this.prisma.course.findMany({
      where: {
        AND: [
          this.visibleCourseFilter(state),
          query.pathId
            ? { pathCourses: { some: { pathId: query.pathId, status: 'APPROVED' } } }
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
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        summary: true,
        durationMinutes: true,
        status: true,
        language: true,
        pathCourses: {
          /* TAM-132: a membership still awaiting the admin is not a membership yet. */
          where: { status: 'APPROVED', path: { isActive: true } },
          orderBy: { path: { displayOrder: 'asc' } },
          select: { path: { select: { id: true, name: true, riasecLetter: true } } },
        },
      },
    });

    return courses.map((course) => ({
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
        riasecLetter: entry.path.riasecLetter,
      })),
    }));
  }

  async getDetail(userId: string, courseId: string): Promise<CourseDetail> {
    const state = await this.journey.getState(userId);

    const course = await this.prisma.course.findFirst({
      where: { AND: [{ id: courseId }, this.visibleCourseFilter(state)] },
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        summary: true,
        durationMinutes: true,
        status: true,
        language: true,
        objectives: true,
        prerequisites: true,
        pathCourses: {
          /* TAM-132: a membership still awaiting the admin is not a membership yet. */
          where: { status: 'APPROVED', path: { isActive: true } },
          orderBy: { path: { displayOrder: 'asc' } },
          select: { pathId: true, path: { select: { id: true, name: true, riasecLetter: true } } },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    const action = resolveCourseAction({
      userPath: state.userPath
        ? {
            confirmed: JourneyStateService.isCommitted(state),
            courseInPath: course.pathCourses.some(
              (entry) => entry.pathId === state.userPath!.pathId,
            ),
            selectedCourseIds: state.userPath.selectedCourseIds,
          }
        : null,
      courseId: course.id,
      courseStatus: course.status,
      completed: await this.isCompleted(state, course.id),
    });

    return {
      id: course.id,
      moodleCourseId: course.moodleCourseId,
      title: course.title,
      summary: course.summary,
      durationMinutes: course.durationMinutes,
      status: course.status,
      language: course.language,
      objectives: course.objectives,
      prerequisites: course.prerequisites,
      paths: course.pathCourses.map((entry) => ({
        id: entry.path.id,
        name: entry.path.name,
        riasecLetter: entry.path.riasecLetter,
      })),
      action,
      /* Only meaningful when the action is ADD_TO_PATH or IN_PATH; the client
         uses it to link to the right build page rather than guessing. */
      buildablePathId: state.userPath?.pathId ?? null,
    };
  }

  private async isCompleted(state: JourneyState, courseId: string): Promise<boolean> {
    if (!state.userPath?.selectedCourseIds.includes(courseId)) {
      return false;
    }

    const chosen = await this.prisma.userPathCourse.findFirst({
      where: { userPathId: state.userPath.id, courseId },
      select: { status: true },
    });

    return chosen?.status === 'COMPLETED';
  }
}
