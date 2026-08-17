import type {
  EnrolInput,
  LmsCourse,
  LmsCourseId,
  LmsCourseProgress,
  LmsHealth,
  LmsUserId,
  LmsUserRef,
  ProvisionUserInput,
} from './lms.types';

/**
 * The one interface through which the application reaches the LMS.
 *
 * Phase 2 replaces the mock with a real Moodle adapter by implementing exactly
 * this — **no caller changes**. That is the whole point of writing it first
 * (CLAUDE.md §2A, Phase 0 deliverable "the mock must implement the exact same
 * interface/contract as the real module").
 *
 * Rules this interface encodes:
 *
 *  - **One direction.** Completion flows LMS → us. There is no method to write a
 *    grade or a completion *into* the LMS, because the LMS owns those.
 *  - **No product logic.** Nothing here evaluates a pass threshold, decides a
 *    certificate, or knows what a path is. Those are ours (D-007).
 *  - **Idempotent writes.** `provisionUser` and `enrol` must be safe to call
 *    twice: the completion-sync job polls, and retries are normal.
 *  - **No LMS types escape.** Every parameter and return value is from
 *    `lms.types.ts`, so no Moodle payload shape reaches a caller.
 *
 * Methods a *mock* can offer but the real adapter cannot — seeding canned
 * completions, for instance — must live on the mock class, never here. If it is
 * on the port, Phase 2 has to implement it against a real Moodle.
 */
export interface LmsPort {
  /**
   * Connectivity and credential check. Never throws: an unreachable LMS is a
   * normal operational state that the Phase 5 dashboard reports, not an
   * exception to handle at every call site.
   */
  checkHealth(): Promise<LmsHealth>;

  /**
   * Creates the LMS counterpart of one of our users, returning its id for
   * `users.moodle_user_id`.
   *
   * Idempotent: called with an email that already exists in the LMS, it returns
   * the existing reference rather than failing or creating a duplicate. Without
   * this, a registration that half-failed could never be retried.
   */
  provisionUser(input: ProvisionUserInput): Promise<LmsUserRef>;

  findUserByEmail(email: string): Promise<LmsUserRef | null>;

  /** Full catalogue, for the Phase 2 sync into our cached `courses` table. */
  listCourses(): Promise<LmsCourse[]>;

  getCourse(lmsCourseId: LmsCourseId): Promise<LmsCourse | null>;

  /**
   * Enrols a user in a course. Idempotent — enrolling an already-enrolled user
   * is a successful no-op, so confirming a path twice cannot fail halfway.
   */
  enrol(input: EnrolInput): Promise<void>;

  isEnrolled(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): Promise<boolean>;

  /**
   * Progress for one enrolment, or null if the user is not enrolled.
   * Returns the raw grade; pass/fail is evaluated by us against the product
   * threshold (D-007).
   */
  getCourseProgress(
    lmsUserId: LmsUserId,
    lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null>;

  /**
   * Progress across all of a user's enrolments — what the scheduled
   * completion-sync job actually needs, in one call rather than N.
   */
  listProgressForUser(lmsUserId: LmsUserId): Promise<LmsCourseProgress[]>;

  /**
   * Deep link for the course-view handoff (§5.4).
   *
   * Synchronous and URL-building only: it must not embed a token or a secret,
   * because this value is handed to the browser. Seamless sign-in is a separate
   * Phase 2 concern.
   */
  courseUrl(lmsCourseId: LmsCourseId): string;
}

/**
 * DI token. An interface has no runtime identity, so Nest needs a symbol to
 * inject against — and callers inject `LMS_PORT`, never a concrete class, which
 * is what keeps the mock swappable.
 */
export const LMS_PORT = Symbol('LMS_PORT');
