import { PATH_MAX_COURSES, PATH_MIN_COURSES } from '@tamkeen/types';

/**
 * Whether a path may be offered to learners (§4C.4).
 *
 * **The rule this file exists for: an active path always offers at least
 * `PATH_MIN_COURSES` selectable courses.** §2 requires a learner to choose
 * between five and ten before they can confirm, so a path with four available
 * courses is one nobody can ever complete — they reach the build screen, select
 * everything there is, and the confirm button stays disabled with no explanation
 * they can act on. Nothing downstream detects that; the path simply sits in the
 * catalogue looking like a choice.
 *
 * So the check runs where the path becomes offerable — on activation, and on any
 * change that could drop an active path below the floor — rather than being left
 * for a learner to discover. Same shape as `publishBlockers` (D-061) and
 * `assessBank` (D-071): pure, over facts the service gathers, and the same
 * function answers both "may I do this" and "why is this path flagged".
 *
 * **The ceiling is not checked, deliberately.** Ten is the most a learner may
 * *select*, not the most a path may *offer* — a path of thirty courses from
 * which five are chosen is exactly what §4.5 describes.
 */

export const PATH_BLOCKER = {
  /** Fewer selectable courses than a learner needs to confirm. */
  TOO_FEW_COURSES: 'PATH_TOO_FEW_COURSES',
} as const;

export type PathBlockerCode = (typeof PATH_BLOCKER)[keyof typeof PATH_BLOCKER];

export interface PathFacts {
  /** Courses attached to the path that a learner could actually select now. */
  selectableCourses: number;
}

/** Empty when the path may be active. */
export function pathBlockers(facts: PathFacts): PathBlockerCode[] {
  return facts.selectableCourses < PATH_MIN_COURSES ? [PATH_BLOCKER.TOO_FEW_COURSES] : [];
}

/**
 * The bounds, re-exported so §4C.6 can display them without importing the
 * learner-facing catalogue types (D-074: they are shown, never edited).
 */
export const PATH_COURSE_BOUNDS = { min: PATH_MIN_COURSES, max: PATH_MAX_COURSES } as const;
