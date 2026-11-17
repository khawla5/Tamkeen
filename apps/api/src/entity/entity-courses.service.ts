import { Injectable } from '@nestjs/common';

import type { EntityCourseSummary } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import { EntityScopeService, type EntityScope } from './entity-scope.service';

/** §4B.2's filter/search. Narrow on purpose — the list is one entity's courses,
 *  not a catalogue, so it is small and does not need pagination yet. */
export interface EntityCourseQuery {
  q?: string;
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
}

/**
 * The entity's own courses (§4B.2).
 *
 * **Scoped at the query, never after it.** Every read below starts from
 * `scope.courseFilter(...)`; nothing fetches broadly and filters in TypeScript.
 * The difference is not stylistic — a filter applied after the read has already
 * pulled another organisation's rows into this process, and it is one refactor
 * away from returning them.
 */
@Injectable()
export class EntityCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: EntityScopeService,
  ) {}

  async list(scope: EntityScope, query: EntityCourseQuery = {}): Promise<EntityCourseSummary[]> {
    const courses = await this.prisma.course.findMany({
      where: {
        AND: [
          this.scope.courseFilter(scope),
          query.publication ? { publication: query.publication } : {},
          query.q
            ? {
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' as const } },
                  { summary: { contains: query.q, mode: 'insensitive' as const } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ publication: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        summary: true,
        durationMinutes: true,
        language: true,
        publication: true,
        status: true,
        pathCourses: {
          orderBy: { path: { displayOrder: 'asc' } },
          select: {
            levelId: true,
            path: { select: { id: true, name: true } },
            level: { select: { id: true, name: true, position: true } },
          },
        },
      },
    });

    if (courses.length === 0) {
      return [];
    }

    const stats = await this.enrolmentStats(courses.map((course) => course.id));

    return courses.map((course) => {
      const stat = stats.get(course.id) ?? { enrolled: 0, passed: 0 };

      return {
        id: course.id,
        moodleCourseId: course.moodleCourseId,
        title: course.title,
        summary: course.summary,
        durationMinutes: course.durationMinutes,
        language: course.language,
        publication: course.publication,
        status: course.status,
        paths: course.pathCourses.map((entry) => ({
          id: entry.path.id,
          name: entry.path.name,
          placement: entry.levelId === null ? ('UNASSIGNED' as const) : ('PLACED' as const),
          level: entry.level,
        })),
        enrolledCount: stat.enrolled,
        /* Undefined rather than zero over an empty denominator. "0%" on a course
           nobody has started reads as failure, which is a different claim. */
        completionRate:
          stat.enrolled === 0 ? null : Math.round((stat.passed / stat.enrolled) * 100),
      };
    });
  }

  /**
   * How many learners hold each course, and how many have passed it.
   *
   * **"Hold" is an enrolment** (D-134): the row written when a placement put the
   * course among what a learner owes. It replaces the per-learner course
   * selection, which no longer exists.
   *
   * **Passing is re-derived from `completions`.** A course can be complete in
   * the LMS's sense and still not passed — D-054 corrected exactly that defect
   * in the path certificate — so counting completions alone would overstate an
   * entity's rate, and it is the number they will quote to the ministry.
   *
   * Two queries regardless of catalogue size: the holders, then the passes for
   * the learners those holders name. `completions` is keyed on
   * `moodle_course_id` rather than our `courses.id` (§6), which is why the join
   * is done here rather than in SQL.
   */
  private async enrolmentStats(
    courseIds: string[],
  ): Promise<Map<string, { enrolled: number; passed: number }>> {
    const holders = await this.prisma.enrollment.findMany({
      where: { courseId: { in: courseIds } },
      select: {
        courseId: true,
        userId: true,
        course: { select: { moodleCourseId: true } },
      },
    });

    const stats = new Map<string, { enrolled: number; passed: number }>();

    if (holders.length === 0) {
      return stats;
    }

    const completions = await this.prisma.completion.findMany({
      where: {
        passed: true,
        userId: { in: [...new Set(holders.map((row) => row.userId))] },
        moodleCourseId: { in: [...new Set(holders.map((row) => row.course.moodleCourseId))] },
      },
      select: { userId: true, moodleCourseId: true },
    });

    const passedKeys = new Set(
      completions.map((row) => `${row.userId}:${String(row.moodleCourseId)}`),
    );

    for (const row of holders) {
      const current = stats.get(row.courseId) ?? { enrolled: 0, passed: 0 };
      const passed = passedKeys.has(`${row.userId}:${String(row.course.moodleCourseId)}`);

      stats.set(row.courseId, {
        enrolled: current.enrolled + 1,
        passed: current.passed + (passed ? 1 : 0),
      });
    }

    return stats;
  }
}
