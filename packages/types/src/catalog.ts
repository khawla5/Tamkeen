import type { RiasecLetter } from './riasec';

/**
 * Paths and courses as the API presents them (CLAUDE.md §4.4, §4.6, §4.7).
 */

/**
 * The 5–10 rule (§2), in one place.
 *
 * Shared rather than duplicated because §2B requires it enforced on **both**
 * client and server: the button-disabling logic and the confirm-endpoint
 * validation must be the same two numbers, or one of them is wrong.
 * The server remains the authority — the client copy only avoids offering an
 * action that would be rejected.
 */
export const PATH_MIN_COURSES = 5;
export const PATH_MAX_COURSES = 10;

/**
 * Our own course lifecycle (§6, D-015) — distinct from the LMS's `visible` flag.
 *
 * `HIDDEN_BUT_COMPLETABLE` is the rule that stops content being pulled out from
 * under a learner: a course already inside someone's confirmed path may leave the
 * catalogue for *new* selections but must stay completable for those enrolled.
 */
export const COURSE_STATUSES = ['AVAILABLE', 'HIDDEN_BUT_COMPLETABLE', 'RETIRED'] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

/** The path a course belongs to, as shown on a course card (§4.6). */
export interface CoursePathRef {
  id: string;
  name: string;
  riasecLetter: RiasecLetter;
}

export interface CourseSummary {
  id: string;
  /** The only bridge to the LMS (§1). Exposed because the course player needs
   *  it; it identifies a course, not a person. */
  moodleCourseId: number;
  title: string;
  summary: string;
  durationMinutes: number | null;
  status: CourseStatus;
  paths: CoursePathRef[];
}

/**
 * The single context-dependent action a course offers (§3, §4.7).
 *
 * Computed by the server from the user's state, so the UI renders exactly one
 * button and never has to decide which rule applies. "Never all three" is a
 * product rule; making the server return one value is how it is enforced rather
 * than merely intended.
 */
export const COURSE_ACTIONS = [
  /** Not assessed / no path yet — browsing is allowed, acting is not (§4.6). */
  'NONE',
  /** Course is in the user's path-in-progress selection; still building. */
  'ADD_TO_PATH',
  /** In the confirmed path, not yet complete. */
  'START_COURSE',
  /** Passed. */
  'COMPLETED',
  /** In the catalogue but not addable — wrong path, or no longer offered. */
  'UNAVAILABLE',
] as const;

export type CourseAction = (typeof COURSE_ACTIONS)[number];

export interface CourseDetail extends CourseSummary {
  objectives: string[];
  prerequisites: string | null;
  /** Deep link for the Phase 2 handoff; built by the LMS port, never guessed. */
  courseUrl: string;
  action: CourseAction;
  /** Set when `action` is `ADD_TO_PATH`, so the card can link to the build page. */
  buildablePathId: string | null;
}

export interface PathSummary {
  id: string;
  name: string;
  description: string;
  riasecLetter: RiasecLetter;
  typicalDurationMinutes: number | null;
  /** How many courses this path offers to choose from (§4.4 card content). */
  courseCount: number;
  displayOrder: number;
  /** True when `riasecLetter` is in the user's Holland Code (§3A). */
  recommended: boolean;
  /** 0-2 — the position of this path's letter in the user's code; null if absent. */
  recommendationRank: number | null;
}

export interface PathDetail extends PathSummary {
  courses: CourseSummary[];
  /** Which of this path's courses the user has selected so far (§4.5). */
  selectedCourseIds: string[];
  /** False once any path is confirmed — one path per user, no switching (D-002). */
  canBuild: boolean;
}

/** §4.4 — the code plus every path, gold first. */
export interface PathRecommendations {
  /** Null before the assessment is taken; the catalogue is still browsable. */
  code: RiasecLetter[] | null;
  paths: PathSummary[];
}
