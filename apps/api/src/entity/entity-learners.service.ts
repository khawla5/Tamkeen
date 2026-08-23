import { Injectable } from '@nestjs/common';

import type { EntityLearnerRow } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import { EntityScopeService, type EntityScope } from './entity-scope.service';

/**
 * Learners on this entity's courses (§4B.5).
 *
 * **Two rules govern every query here, and both are structural rather than
 * remembered.**
 *
 * *Scope* — the query starts from `courses` filtered to the caller's
 * organisation and reaches learners through them. It never starts from `users`.
 * That direction matters: a query over learners with a course filter bolted on
 * is one dropped clause away from listing the whole ministry, whereas this one
 * cannot name a learner who is not on one of the entity's own courses.
 *
 * *PII* — the columns are selected explicitly and the set is deliberately small
 * (D-064): full name, department, progress, grade. No email, no employee ID, no
 * Holland Code, no path, no certificates. A `select: { user: true }` written
 * later would widen this silently, so the shape is asserted in a test.
 */
@Injectable()
export class EntityLearnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: EntityScopeService,
  ) {}

  /**
   * @param courseId restricts to one course; omitted, it spans all of them.
   *   Either way the scope filter is applied, so passing another entity's course
   *   id yields nothing rather than their learners.
   */
  async list(scope: EntityScope, courseId?: string): Promise<EntityLearnerRow[]> {
    const rows = await this.prisma.userPathCourse.findMany({
      where: {
        course: {
          ...this.scope.courseFilter(scope),
          ...(courseId ? { id: courseId } : {}),
        },
      },
      orderBy: [{ course: { title: 'asc' } }, { createdAt: 'asc' }],
      select: {
        status: true,
        gradePercent: true,
        enrolledAt: true,
        completedAt: true,
        course: { select: { id: true, title: true, moodleCourseId: true } },
        userPath: {
          select: {
            /* Explicit columns, never the whole user row — see the class comment
               and D-064. Adding `email` here would be a one-word privacy
               regression that nothing else would catch. */
            user: { select: { id: true, fullName: true, department: true } },
          },
        },
      },
    });

    if (rows.length === 0) {
      return [];
    }

    const passedKeys = await this.passedKeys(rows);

    return rows.map((row) => ({
      userId: row.userPath.user.id,
      fullName: row.userPath.user.fullName,
      department: row.userPath.user.department,
      courseId: row.course.id,
      courseTitle: row.course.title,
      status: row.status,
      gradePercent: row.gradePercent,
      /*
       * Re-derived from `completions`, not read off the course status. A course
       * can be COMPLETED in the LMS's sense and still not passed — the defect
       * D-054 corrected in the path certificate — and a review screen that
       * called a failing learner "passed" would be worse than one that showed
       * nothing.
       */
      passed: passedKeys.has(`${row.userPath.user.id}:${String(row.course.moodleCourseId)}`),
      enrolledAt: row.enrolledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  /** `userId:moodleCourseId` for every passing completion among these rows. */
  private async passedKeys(
    rows: ReadonlyArray<{
      course: { moodleCourseId: number };
      userPath: { user: { id: string } };
    }>,
  ): Promise<Set<string>> {
    const completions = await this.prisma.completion.findMany({
      where: {
        passed: true,
        userId: { in: [...new Set(rows.map((row) => row.userPath.user.id))] },
        moodleCourseId: { in: [...new Set(rows.map((row) => row.course.moodleCourseId))] },
      },
      select: { userId: true, moodleCourseId: true },
    });

    return new Set(completions.map((row) => `${row.userId}:${String(row.moodleCourseId)}`));
  }
}
