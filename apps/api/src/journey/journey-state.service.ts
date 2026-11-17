import { Injectable } from '@nestjs/common';

import type { LevelRef } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Where a learner stands: the paths the ministry assigned them, where each one
 * placed them, and what they are enrolled in (D-130/D-134).
 *
 * This exists so the rules that depend on several of those at once live in one
 * place. Four modules need the same picture — paths (what may this person
 * open?), courses (which action applies?), assessment (may they take this, and
 * have they already been placed?), enrollment (what do they owe?) — and if each
 * re-derived it from its own query, they would eventually disagree. Read-only by
 * design: enrollment and the admin services own writes.
 */

export interface AssignedPath {
  userPathId: string;
  pathId: string;
  pathName: string;
  status: 'ACTIVE' | 'COMPLETED';
  assignedAt: Date;
  /** Null until the learner takes this path's assessment. */
  placedLevel: LevelRef | null;
  /** The active assessment version standing between them and starting. */
  pendingAssessmentId: string | null;
}

export interface JourneyState {
  /** In assignment order, oldest first. */
  paths: AssignedPath[];
  /** Course ids this learner has an enrolment row for, in any path. */
  enrolledCourseIds: string[];
}

@Injectable()
export class JourneyStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<JourneyState> {
    const [userPaths, placements, enrollments] = await Promise.all([
      this.prisma.userPath.findMany({
        /* A REVOKED row is history, not something the learner still holds
           (D-134's "absence, not a disabled control") — it never surfaces
           here, only on the admin's own view of the account. */
        where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        orderBy: { assignedAt: 'asc' },
        select: {
          id: true,
          pathId: true,
          status: true,
          assignedAt: true,
          path: {
            select: {
              name: true,
              /* The version a taker would receive. A path whose assessment is
                 still a draft has none, which is a state the dashboard has to
                 be able to show rather than crash on. */
              assessments: {
                where: { status: 'ACTIVE' },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.learnerPlacement.findMany({
        where: { learnerId: userId },
        select: {
          pathId: true,
          level: { select: { id: true, name: true, position: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true },
      }),
    ]);

    const placedBy = new Map(placements.map((row) => [row.pathId, row.level]));

    return {
      paths: userPaths.map((row) => {
        const level = placedBy.get(row.pathId) ?? null;

        return {
          userPathId: row.id,
          pathId: row.pathId,
          pathName: row.path.name,
          /* The `where` above already excludes REVOKED; Prisma's return type
             cannot express that narrowing, so it is asserted here instead. */
          status: row.status as 'ACTIVE' | 'COMPLETED',
          assignedAt: row.assignedAt,
          placedLevel: level,
          /* Only pending while they have not been placed. An assessment they
             have already taken is not standing in their way. */
          pendingAssessmentId: level ? null : (row.path.assessments[0]?.id ?? null),
        };
      }),
      enrolledCourseIds: enrollments.map((row) => row.courseId),
    };
  }

  /** The ids of every path assigned to this learner — the catalogue's scope. */
  static assignedPathIds(state: JourneyState): string[] {
    return state.paths.map((path) => path.pathId);
  }

  /** One assigned path, or null when this learner does not hold it. */
  static findPath(state: JourneyState, pathId: string): AssignedPath | null {
    return state.paths.find((path) => path.pathId === pathId) ?? null;
  }
}
