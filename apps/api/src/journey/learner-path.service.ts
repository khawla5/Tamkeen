import { Injectable } from '@nestjs/common';

import type { CourseProgressStatus, LevelRef } from '@tamkeen/types';

import { levelStanding, visibleCourseWhere } from '../paths/path-access';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyStateService, type JourneyState } from './journey-state.service';

/**
 * One learner's ladder on one path: the levels, the courses placed on them, and
 * how far they have got (D-134).
 *
 * **This is the single derivation of "what does this person owe".** My Path, the
 * dashboard, enrolment, the player and certificate issuance all need the same
 * answer, and before D-134 each of them re-derived it from `user_path_courses`.
 * With that table gone there is nothing to disagree with: the placed courses
 * come from the path, the progress comes from `completions`, and both are read
 * here.
 *
 * A course **below** the learner's rung is returned but is not owed: the
 * placement says they have covered that ground, so it is theirs to read and not
 * theirs to do. Nothing counts it, and nothing enrols them in it.
 */

export interface LadderCourse {
  courseId: string;
  moodleCourseId: number;
  title: string;
  summary: string;
  durationMinutes: number | null;
  /** 1-based within its level. */
  position: number;
  status: CourseProgressStatus;
  gradePercent: number | null;
  passed: boolean;
  /** False below the learner's rung, and before they have one at all. */
  startable: boolean;
}

export interface LadderLevel {
  id: string;
  name: string;
  position: number;
  standing: 'BELOW' | 'PLACED' | 'ABOVE';
  courses: LadderCourse[];
}

export interface Ladder {
  pathId: string;
  pathName: string;
  userPathId: string;
  status: 'ACTIVE' | 'COMPLETED';
  assignedAt: Date;
  placedLevel: LevelRef | null;
  pendingAssessmentId: string | null;
  levels: LadderLevel[];
}

@Injectable()
export class LearnerPathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
  ) {}

  /** Every assigned path's ladder, in assignment order. */
  async allLadders(userId: string, state?: JourneyState): Promise<Ladder[]> {
    const resolved = state ?? (await this.journey.getState(userId));

    return Promise.all(
      resolved.paths.map((assigned) => this.ladderFor(userId, assigned.pathId, resolved)),
    );
  }

  /** One ladder, or null when the path is not assigned to this learner. */
  async ladder(userId: string, pathId: string, state?: JourneyState): Promise<Ladder | null> {
    const resolved = state ?? (await this.journey.getState(userId));

    if (!JourneyStateService.findPath(resolved, pathId)) {
      return null;
    }

    return this.ladderFor(userId, pathId, resolved);
  }

  private async ladderFor(userId: string, pathId: string, state: JourneyState): Promise<Ladder> {
    const assigned = JourneyStateService.findPath(state, pathId);

    /* Only ever called for a path the state says is assigned. */
    if (!assigned) {
      throw new Error(`ladderFor called for an unassigned path ${pathId}`);
    }

    const levels = await this.prisma.level.findMany({
      where: { pathId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        position: true,
        pathCourses: {
          where: { course: visibleCourseWhere(state.enrolledCourseIds) },
          orderBy: { position: 'asc' },
          select: {
            position: true,
            course: {
              select: {
                id: true,
                moodleCourseId: true,
                title: true,
                summary: true,
                durationMinutes: true,
              },
            },
          },
        },
      },
    });

    const moodleIds = levels.flatMap((level) =>
      level.pathCourses.map((entry) => entry.course.moodleCourseId),
    );

    const completions =
      moodleIds.length === 0
        ? []
        : await this.prisma.completion.findMany({
            where: { userId, moodleCourseId: { in: moodleIds } },
            select: { moodleCourseId: true, completed: true, passed: true, gradePercent: true },
          });

    const byMoodleId = new Map(completions.map((row) => [row.moodleCourseId, row]));
    const placedPosition = assigned.placedLevel?.position ?? null;

    return {
      pathId,
      pathName: assigned.pathName,
      userPathId: assigned.userPathId,
      status: assigned.status,
      assignedAt: assigned.assignedAt,
      placedLevel: assigned.placedLevel,
      pendingAssessmentId: assigned.pendingAssessmentId,
      levels: levels.map((level) => {
        const standing = levelStanding(level.position, placedPosition);

        return {
          id: level.id,
          name: level.name,
          position: level.position,
          standing,
          courses: level.pathCourses.map((entry, index) => {
            const completion = byMoodleId.get(entry.course.moodleCourseId) ?? null;

            return {
              courseId: entry.course.id,
              moodleCourseId: entry.course.moodleCourseId,
              title: entry.course.title,
              summary: entry.course.summary,
              /* Re-derived from the read order rather than trusted from the
                 column: positions are re-packed on every placement change, and
                 a screen numbering "1, 2, 4" after a removal would be reporting
                 a gap the learner has no way to interpret. */
              durationMinutes: entry.course.durationMinutes,
              position: index + 1,
              status: progressOf(completion),
              gradePercent: completion?.gradePercent ?? null,
              passed: completion?.passed === true,
              /* Exactly the learner's own rung — not "at or above" (§8
                 assumption 1). A course above it is real, visible ground they
                 have not reached yet, and letting them start it would let a
                 later rung's work count before the ones beneath it are done.
                 `placedPosition !== null` is still required alongside
                 `standing === 'PLACED'`: `levelStanding` reports the first
                 rung as 'PLACED' even before an assessment has been taken
                 (so an unplaced learner's ladder does not read as entirely
                 locked), which must not make its courses launchable. */
              startable: placedPosition !== null && standing === 'PLACED',
            };
          }),
        };
      }),
    };
  }
}

/** Courses at or above the learner's rung — what they actually owe. */
export function owedCourses(ladder: Ladder): LadderCourse[] {
  if (!ladder.placedLevel) {
    return [];
  }

  return ladder.levels
    .filter((level) => level.standing !== 'BELOW')
    .flatMap((level) => level.courses);
}

/** Whether every owed course is passed — the path-certificate condition. */
export function isPathComplete(ladder: Ladder): boolean {
  const owed = owedCourses(ladder);

  return owed.length > 0 && owed.every((course) => course.passed);
}

/**
 * The learner's progress on one course, from `completions` and nowhere else.
 *
 * A grade with no pass is somebody mid-course; calling that NOT_STARTED would
 * lose the only evidence they began.
 */
function progressOf(
  completion: { completed: boolean; passed: boolean; gradePercent: number | null } | null,
): CourseProgressStatus {
  if (!completion) return 'NOT_STARTED';
  if (completion.passed) return 'COMPLETED';
  if (completion.completed || completion.gradePercent !== null) return 'IN_PROGRESS';

  return 'NOT_STARTED';
}
