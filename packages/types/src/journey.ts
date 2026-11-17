import type { CourseProgressStatus } from './catalog';
import type { LevelRef } from './levels';

/**
 * The learner's journey through the paths the ministry assigned them (§4.2,
 * §4.9, D-130/D-134).
 */

/**
 * Where an assigned path stands for one learner.
 *
 * `BUILDING` is gone with the build flow: nothing about a path is provisional
 * any more. It is assigned, and it is active from that moment.
 */
export const USER_PATH_STATUSES = ['ACTIVE', 'COMPLETED'] as const;

export type UserPathStatus = (typeof USER_PATH_STATUSES)[number];

export interface MyPathCourseView {
  courseId: string;
  moodleCourseId: number;
  title: string;
  durationMinutes: number | null;
  /** Position within its level. */
  order: number;
  status: CourseProgressStatus;
  /**
   * Raw grade from the LMS, 0-100, or null when nothing has been attempted.
   * Never a pass/fail verdict — that is evaluated against the product threshold
   * (D-007).
   */
  gradePercent: number | null;
  /** Our verdict against that threshold. */
  passed: boolean;
  /** Exactly one course carries this at a time (§3). */
  isNextUp: boolean;
  /** False for a course below the learner's placed level (D-134). */
  startable: boolean;
}

export interface MyPathLevelView {
  id: string;
  name: string;
  position: number;
  standing: 'BELOW' | 'PLACED' | 'ABOVE';
  courses: MyPathCourseView[];
}

export interface MyPathView {
  userPathId: string;
  pathId: string;
  pathName: string;
  status: UserPathStatus;
  /** ISO 8601. Never null — an assignment exists from the moment it is made. */
  assignedAt: string;
  /** Null until the learner takes the path's assessment. */
  placedLevel: LevelRef | null;
  /** The assessment standing between them and starting. Null once placed. */
  pendingAssessmentId: string | null;
  levels: MyPathLevelView[];
  /** Counted over the courses at or above the learner's level — what they owe. */
  completedCount: number;
  totalCount: number;
  /**
   * True when every course at or above the placed level is **passed**, not
   * merely finished in the LMS. That is the same condition the path certificate
   * is issued on, so an unlocked slot always has a certificate behind it.
   */
  pathCertificateUnlocked: boolean;
}

/**
 * Which dashboard state applies (§4.2, D-134).
 *
 * Decided server-side and sent as a single value, so the dashboard renders one
 * branch instead of re-deriving the rule from several nullable fields — which is
 * how a fourth, unintended state gets rendered by accident.
 *
 * The old three states were about a choice the learner made. Under the assigned
 * model the question is different: has the ministry given them a path, and have
 * they been placed in it yet.
 */
export const DASHBOARD_STATES = ['NO_PATH', 'AWAITING_PLACEMENT', 'ACTIVE_PATH'] as const;

export type DashboardState = (typeof DASHBOARD_STATES)[number];

/** One line of what the learner has done, newest first (TAM-123). */
export const DASHBOARD_ACTIVITY_KINDS = [
  'PATH_ASSIGNED',
  'ASSESSMENT_COMPLETED',
  'COURSE_PASSED',
  'CERTIFICATE_ISSUED',
] as const;

export type DashboardActivityKind = (typeof DASHBOARD_ACTIVITY_KINDS)[number];

export interface DashboardActivity {
  kind: DashboardActivityKind;
  /** The course, path or certificate the event is about; null where there is none. */
  title: string | null;
  /** ISO 8601. */
  at: string;
}

/** One assigned path on the dashboard, in assignment order. */
export interface DashboardPath {
  id: string;
  name: string;
  /** Null until its assessment is taken. */
  placedLevel: LevelRef | null;
  /** The assessment blocking a start, when there is one. */
  pendingAssessmentId: string | null;
  completedCount: number;
  /** Courses started in the LMS but not yet passed. */
  inProgressCount: number;
  totalCount: number;
  /** The single "continue where you left off" target, null when there is none. */
  nextCourse: { courseId: string; title: string } | null;
}

export interface DashboardView {
  state: DashboardState;
  /** Every path assigned to this learner. Empty in NO_PATH. */
  paths: DashboardPath[];
  /** The most recently issued certificate, if any. */
  latestCertificate: {
    id: string;
    type: 'COURSE' | 'PATH';
    subjectTitle: string;
    issuedAt: string;
  } | null;
  /** The last three things that happened, newest first. */
  recentActivity: DashboardActivity[];
}
