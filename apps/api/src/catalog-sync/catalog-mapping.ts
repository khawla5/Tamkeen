import type { LmsCourse } from '../moodle/lms.types';

/**
 * The rules that decide what a catalogue sync writes.
 *
 * Pure functions, deliberately: the sync job and the seed runner both mirror an
 * LMS catalogue into `courses`, and if they disagreed about what "hidden" means
 * or about who owns `durationMinutes`, a seeded database and a synced one would
 * describe the same course differently. Keeping the rules here means there is
 * one answer, and it is testable without a database or an LMS.
 */

export type CourseStatusValue = 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';

/** What we already hold for a course, or null when it is new to us. */
export interface ExistingCourseRow {
  status: CourseStatusValue;
  /** Our authored value. Owned by us (D-039), not by the LMS. */
  durationMinutes: number | null;
}

export interface SyncedCourseFields {
  title: string;
  summary: string;
  status: CourseStatusValue;
  durationMinutes: number | null;
}

/**
 * The fields to write for a course the LMS still publishes.
 *
 * Two rules that are easy to get wrong:
 *
 * 1. **A RETIRED course is not resurrected by the LMS making it visible again.**
 *    Retirement is our decision (Phase 4/5 unpublishing, or a course that
 *    vanished); an LMS visibility flag must not silently undo it. Reinstating is
 *    a human action.
 * 2. **`durationMinutes` we already hold always wins.** It is our product
 *    metadata (D-039). Letting the LMS's `null` overwrite an authored value
 *    would erase the catalogue's durations on the first sync — quietly, since
 *    nothing errors when a nullable column becomes null.
 */
export function fieldsForPublishedCourse(
  lmsCourse: LmsCourse,
  existing: ExistingCourseRow | null,
): SyncedCourseFields {
  return {
    title: lmsCourse.title,
    summary: lmsCourse.summary,
    status:
      existing?.status === 'RETIRED'
        ? 'RETIRED'
        : lmsCourse.visible
          ? 'AVAILABLE'
          : 'HIDDEN_BUT_COMPLETABLE',
    durationMinutes: existing?.durationMinutes ?? lmsCourse.durationMinutes ?? null,
  };
}

/**
 * What becomes of a course our database holds but the LMS no longer returns.
 *
 * **Never deletion.** §2/D-015 forbids pulling content out from under a learner
 * mid-path, and our own `RETIRED` is invisible to everyone — including someone
 * who already selected the course — so retiring an in-use course would do
 * exactly what the rule prohibits.
 *
 * So a course anybody has selected becomes `HIDDEN_BUT_COMPLETABLE`: gone from
 * new selections, still completable by those already on it. Only a course no
 * user holds can be retired outright.
 */
export function statusForVanishedCourse(isHeldByAnyUser: boolean): CourseStatusValue {
  return isHeldByAnyUser ? 'HIDDEN_BUT_COMPLETABLE' : 'RETIRED';
}

/**
 * Whether a sync result is safe to act on.
 *
 * An empty catalogue is treated as a fault, not as "every course was deleted".
 * The difference matters enormously: acting on it would mark the entire
 * catalogue vanished in one pass, and the most likely causes — a token that lost
 * a capability, a half-configured instance, a Moodle mid-upgrade — are all
 * transient. The seed runner already refuses an empty catalogue for the same
 * reason.
 */
export function isUsableCatalogue(lmsCourses: readonly LmsCourse[]): boolean {
  return lmsCourses.length > 0;
}
