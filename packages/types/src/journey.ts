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
  /**
   * The course certificate issued to this learner for this course, once the
   * sync has issued one (§4.9, TAM-126) — read-only here, so My Path can link
   * to the same file the gallery opens. Null until issued.
   */
  certificateId: string | null;
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
   * True when the path itself reached `COMPLETED` — every chosen course
   * **passed**, not merely finished in the LMS. That is the same condition the
   * path certificate is issued on, so an unlocked slot always has a certificate
   * behind it.
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

/** One line of what the learner has done, newest first (TAM-123). */
export const DASHBOARD_ACTIVITY_KINDS = [
  'ASSESSMENT_COMPLETED',
  'PATH_CONFIRMED',
  'COURSE_PASSED',
  'CERTIFICATE_ISSUED',
] as const;

export type DashboardActivityKind = (typeof DASHBOARD_ACTIVITY_KINDS)[number];

export interface DashboardActivity {
  kind: DashboardActivityKind;
  /** The course, path or certificate subject the event is about; null for the assessment. */
  title: string | null;
  /** ISO 8601. */
  at: string;
}

export interface DashboardView {
  state: DashboardState;
  /** Present from ASSESSED_NO_PATH onward. */
  codeString: string | null;
  /**
   * ASSESSED_NO_PATH only: the recommended paths in rank order, at most three,
   * so the dashboard can put the decision in front of the user (TAM-123).
   * Empty in the other states.
   */
  recommendedPaths: Array<{ id: string; name: string; riasecLetter: RiasecLetter }>;
  /** ACTIVE_PATH only: the next courses in path order, current first, at most three. */
  upcomingCourses: Array<{
    id: string;
    courseId: string;
    title: string;
    status: UserPathCourseStatus;
  }>;
  /** ACTIVE_PATH only: the most recently issued certificate, if any. */
  latestCertificate: {
    id: string;
    type: 'COURSE' | 'PATH';
    subjectTitle: string;
    issuedAt: string;
  } | null;
  /** The last three things that happened, newest first. */
  recentActivity: DashboardActivity[];
  /** Present only in ACTIVE_PATH. */
  path: {
    id: string;
    name: string;
    /** The path's primary letter — the dashboard names the path by its type. */
    riasecLetter: RiasecLetter;
    completedCount: number;
    /** Courses started in the LMS but not yet completed. Remaining = total − completed − inProgress. */
    inProgressCount: number;
    totalCount: number;
    /** The single "continue where you left off" target, null when all done. */
    nextCourse: { id: string; courseId: string; title: string } | null;
  } | null;
}
