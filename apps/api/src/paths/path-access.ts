import type { Prisma } from '../../generated/prisma';

/**
 * The one place a learner-facing query reaches a course through a path (D-134).
 *
 * **This file exists so the placed-only filter cannot be forgotten.** The spec
 * is explicit that an unassigned course — one in a path but on no level — must
 * appear in no learner response, and the failure mode is silent: a query that
 * omits the filter returns *more* rows and looks like it works. Composing the
 * filter here, and routing every learner query through it, is what turns
 * "remember to add `level_id is not null`" into something a reviewer can check
 * by grepping for the helper's name.
 *
 * There are three conditions and they are not interchangeable:
 *
 *  1. **Placed.** `levelId is not null` — the derived state from D-134.
 *  2. **In a published path.** A path an administrator has taken back to draft
 *     is not offering anything, whatever its memberships say.
 *  3. **A course the catalogue still offers**, with the standing exception for
 *     one this learner is already enrolled in: §2/D-015's rule that content is
 *     never pulled out from under somebody mid-course.
 */

/** Courses this learner may see at all — the D-015 exception, in one place. */
export function visibleCourseWhere(enrolledCourseIds: readonly string[]): Prisma.CourseWhereInput {
  if (enrolledCourseIds.length === 0) {
    return { status: 'AVAILABLE' };
  }

  return {
    OR: [
      { status: 'AVAILABLE' },
      /* Enrolled and not retired: still completable, no longer on offer. */
      { id: { in: [...enrolledCourseIds] }, status: { not: 'RETIRED' } },
    ],
  };
}

/**
 * Memberships a learner may reach: placed, in a published path.
 *
 * Takes the path ids the learner has been assigned. Passing them rather than
 * leaving the caller to add a `pathId` clause is deliberate — a caller that
 * forgot would leak every published path's curriculum to somebody who was
 * assigned none of it.
 */
export function placedMembershipWhere(
  assignedPathIds: readonly string[],
): Prisma.PathCourseWhereInput {
  return {
    levelId: { not: null },
    pathId: { in: [...assignedPathIds] },
    path: { status: 'PUBLISHED' },
  };
}

/** The same, for any published path — the catalogue's wider read (§4.6). */
export function placedInAnyPublishedPathWhere(): Prisma.PathCourseWhereInput {
  return { levelId: { not: null }, path: { status: 'PUBLISHED' } };
}

/**
 * Where a course stands relative to the rung a learner was placed on.
 *
 * All levels are returned to the learner (D-134's decision 7), so this is what
 * distinguishes the ladder they can see from the part of it they owe. `BELOW`
 * is readable and not startable; it counts toward nothing.
 */
export function levelStanding(
  levelPosition: number,
  placedPosition: number | null,
): 'BELOW' | 'PLACED' | 'ABOVE' {
  if (placedPosition === null) {
    /* Not placed yet: nothing is theirs to do, so nothing is below them either.
       Everything reads as ahead, which is what it is. */
    return levelPosition === 1 ? 'PLACED' : 'ABOVE';
  }

  if (levelPosition < placedPosition) return 'BELOW';
  if (levelPosition === placedPosition) return 'PLACED';

  return 'ABOVE';
}

/** Whether a course on this level is the learner's to do (D-134). */
export function isOwed(standing: 'BELOW' | 'PLACED' | 'ABOVE', placed: boolean): boolean {
  return placed && standing !== 'BELOW';
}
