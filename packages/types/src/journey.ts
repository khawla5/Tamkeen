import type { RiasecLetter } from './riasec';

/**
 * The user's journey through their one path (CLAUDE.md §4.2, §4.9).
 */

/**
 * A user has at most one of these (D-002).
 *
 * `BUILDING` exists as a distinct state from `ACTIVE` because selecting courses
 * is reversible and confirming is not. Collapsing the two would make the hard
 * commitment gate a UI convention rather than a data fact.
 */
export const USER_PATH_STATUSES = ['BUILDING', 'ACTIVE', 'COMPLETED'] as const;

export type UserPathStatus = (typeof USER_PATH_STATUSES)[number];

export const USER_PATH_COURSE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export type UserPathCourseStatus = (typeof USER_PATH_COURSE_STATUSES)[number];

export interface MyPathCourseView {
  /** Id of the chosen-course record, stable across LMS changes. */
  id: string;
  courseId: string;
  moodleCourseId: number;
  title: string;
  durationMinutes: number | null;
  /** Position in the path, as chosen at confirm time. */
  order: number;
  status: UserPathCourseStatus;
  /**
   * Raw grade from the LMS, 0-100, or null when nothing has been attempted.
   * Never a pass/fail verdict — that is evaluated against the product threshold
   * (D-007), and issuing anything from it is Phase 3.
   */
  gradePercent: number | null;
  /** Exactly one action applies at a time (§3). */
  isNextUp: boolean;
  courseUrl: string;
}

export interface MyPathView {
  userPathId: string;
  pathId: string;
  pathName: string;
  riasecLetter: RiasecLetter;
  status: UserPathStatus;
  /** ISO 8601; null while still building. */
  confirmedAt: string | null;
  courses: MyPathCourseView[];
  completedCount: number;
  totalCount: number;
  /**
   * True when every chosen course is complete. The path certificate slot shows
   * as unlocked — **issuing it is Phase 3**, so this only drives presentation.
   */
  pathCertificateUnlocked: boolean;
}

/**
 * Which of the three dashboard states applies (§4.2).
 *
 * Decided server-side and sent as a single value, so the dashboard renders one
 * branch instead of re-deriving the rule from several nullable fields — which is
 * how a fourth, unintended state gets rendered by accident.
 */
export const DASHBOARD_STATES = ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH', 'ACTIVE_PATH'] as const;

export type DashboardState = (typeof DASHBOARD_STATES)[number];

export interface DashboardView {
  state: DashboardState;
  /** Present from ASSESSED_NO_PATH onward. */
  codeString: string | null;
  /** Present only in ACTIVE_PATH. */
  path: {
    id: string;
    name: string;
    completedCount: number;
    totalCount: number;
    /** The single "continue where you left off" target, null when all done. */
    nextCourse: { id: string; courseId: string; title: string } | null;
  } | null;
}
