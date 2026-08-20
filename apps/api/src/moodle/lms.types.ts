/**
 * The vocabulary of the LMS boundary.
 *
 * These types are deliberately **ours**, not Moodle's. Nothing here mirrors a
 * Moodle web-service payload — no `fullname`, no `enrolledusercount`, no
 * `completionstatus`. Translating Moodle's shapes into these is the job of the
 * real adapter in Phase 2, and it is what makes this module an anti-corruption
 * layer rather than a thin proxy (CLAUDE.md §2A).
 *
 * The practical test: if swapping the LMS required changing anything outside
 * `src/moodle`, the boundary has leaked.
 */

/** An LMS-side user identifier. Our `users.moodle_user_id`. */
export type LmsUserId = number;

/** An LMS-side course identifier. Our `courses.moodle_course_id`. */
export type LmsCourseId = number;

export interface LmsHealth {
  reachable: boolean;
  /** Present only when reachable; useful for the Phase 5 health dashboard. */
  siteName?: string;
  lmsVersion?: string;
  /** Populated when unreachable. A code, never a raw driver/HTTP error, so
   *  connection details cannot reach a response or a log. */
  failureCode?: 'UNREACHABLE' | 'UNAUTHORISED' | 'UNEXPECTED_RESPONSE';
}

export interface ProvisionUserInput {
  email: string;
  fullName: string;
  /** Our user id, passed so the adapter can set a stable external reference. */
  externalUserId: string;
}

export interface LmsUserRef {
  lmsUserId: LmsUserId;
  email: string;
}

export interface LmsCourse {
  lmsCourseId: LmsCourseId;
  /** Arabic title as authored in the LMS. */
  title: string;
  summary: string;
  /** Nominal effort in minutes, or null when the LMS does not express one. */
  durationMinutes: number | null;
  /** Whether the LMS currently shows this course to learners. Our own
   *  `courses.status` is separate product metadata and is not this. */
  visible: boolean;
}

export interface EnrolInput {
  lmsUserId: LmsUserId;
  lmsCourseId: LmsCourseId;
}

/**
 * Raw progress for one user in one course.
 *
 * Note what is absent: any notion of *passing*. The pass threshold is a product
 * setting evaluated against the grade the LMS returns (D-007), so this type
 * carries `gradePercent` and never a `passed` boolean. If the LMS decided
 * pass/fail, changing certification policy would mean editing quizzes in Moodle.
 */
export interface LmsCourseProgress {
  lmsUserId: LmsUserId;
  lmsCourseId: LmsCourseId;
  /** The LMS's own course-completion signal. */
  completed: boolean;
  completedAt: Date | null;
  /** 0–100, or null when the course has no graded activity yet attempted. */
  gradePercent: number | null;
}

/** Raised by the module when the LMS is configured but unusable. */
export class LmsUnavailableError extends Error {
  constructor(readonly failureCode: NonNullable<LmsHealth['failureCode']>) {
    super(`LMS_${failureCode}`);
    this.name = 'LmsUnavailableError';
  }
}

/**
 * Raised when the LMS is reachable and answered, but *refused* the operation —
 * a hand-created account already holding the address, a course that will not
 * accept an enrolment.
 *
 * Distinct from `LmsUnavailableError` because the operational response differs:
 * an outage is retried, a refusal needs a human. The underlying LMS error code
 * is deliberately **not** carried here — it is LMS vocabulary and would leak the
 * boundary (D-030). It is written to the log inside the module instead, where an
 * operator can find it and a caller cannot couple to it.
 */
export class LmsOperationError extends Error {
  constructor(readonly operation: 'PROVISION' | 'ENROL' | 'SYNC') {
    super(`LMS_${operation}_REJECTED`);
    this.name = 'LmsOperationError';
  }
}
