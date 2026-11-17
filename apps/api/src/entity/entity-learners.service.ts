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
    const rows = await this.prisma.enrollment.findMany({
      where: {
        course: {
          ...this.scope.courseFilter(scope),
          ...(courseId ? { id: courseId } : {}),
        },
      },
      orderBy: [{ course: { title: 'asc' } }, { createdAt: 'asc' }],
      select: {
        enrolledAt: true,
        course: { select: { id: true, title: true, moodleCourseId: true } },
        /* Explicit columns, never the whole user row — see the class comment and
           D-064. Adding `email` here would be a one-word privacy regression that
           nothing else would catch. */
        user: { select: { id: true, fullName: true, department: true } },
      },
    });

    if (rows.length === 0) {
      return [];
    }

    /* One read of every relevant completion, then the per-row status is derived
       from it. Progress lives in `completions` and nowhere else since D-134, so
       there is no second opinion for this screen to disagree with. */
    const completions = await this.completionsFor(rows);

    return rows.map((row) => {
      const completion =
        completions.get(`${row.user.id}:${String(row.course.moodleCourseId)}`) ?? null;

      return {
        userId: row.user.id,
        fullName: row.user.fullName,
        department: row.user.department,
        courseId: row.course.id,
        courseTitle: row.course.title,
        status: completion?.passed
          ? ('COMPLETED' as const)
          : completion && (completion.completed || completion.gradePercent !== null)
            ? ('IN_PROGRESS' as const)
            : ('NOT_STARTED' as const),
        gradePercent: completion?.gradePercent ?? null,
        /*
         * Our verdict against the product threshold, never the LMS's. A course
         * can be complete in the LMS's sense and still not passed — the defect
         * D-054 corrected in the path certificate — and a review screen that
         * called a failing learner "passed" would be worse than one that showed
         * nothing.
         */
        passed: completion?.passed === true,
        enrolledAt: row.enrolledAt?.toISOString() ?? null,
        completedAt: completion?.completedAt?.toISOString() ?? null,
      };
    });
  }

  /** Every relevant completion, keyed `userId:moodleCourseId`. */
  private async completionsFor(
    rows: ReadonlyArray<{ course: { moodleCourseId: number }; user: { id: string } }>,
  ): Promise<
    Map<
      string,
      { passed: boolean; completed: boolean; gradePercent: number | null; completedAt: Date | null }
    >
  > {
    const completions = await this.prisma.completion.findMany({
      where: {
        userId: { in: [...new Set(rows.map((row) => row.user.id))] },
        moodleCourseId: { in: [...new Set(rows.map((row) => row.course.moodleCourseId))] },
      },
      select: {
        userId: true,
        moodleCourseId: true,
        passed: true,
        completed: true,
        gradePercent: true,
        completedAt: true,
      },
    });

    return new Map(
      completions.map((row) => [`${row.userId}:${String(row.moodleCourseId)}`, row] as const),
    );
  }
}
