import type {
  CreateCourseInput,
  EnrolInput,
  LmsCourse,
  LmsCourseContentSummary,
  LmsCourseId,
  LmsCourseProgress,
  LmsHealth,
  LmsUserId,
  LmsUserRef,
  ProvisionUserInput,
  UpdateUserInput,
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

  /**
   * Updates the LMS's record of a user's display name (§4.12).
   *
   * **Idempotent**, matching `provisionUser`/`enrol`: writing the same name
   * twice must not error, since a caller that failed to confirm success is
   * expected to retry. **Best-effort from the caller's side** — a profile
   * edit is not undone because this failed, and D-036's reconciliation
   * pattern is what owns retrying a failure, not this call itself.
   *
   * Nothing here provisions an account: a user with no `moodle_user_id` has
   * nothing to update, and callers must not reach this method for one.
   */
  updateUser(input: UpdateUserInput): Promise<void>;

  /** Full catalogue, for the Phase 2 sync into our cached `courses` table. */
  listCourses(): Promise<LmsCourse[]>;

  getCourse(lmsCourseId: LmsCourseId): Promise<LmsCourse | null>;

  /**
   * Creates an empty course in the LMS and returns it (§4B.3, D-060).
   *
   * **The shell must exist in the LMS, not only in our database.** Our
   * `courses.moodle_course_id` is non-null and unique, and catalogue sync
   * withdraws any row the LMS stops returning — so a course row created without
   * an LMS counterpart would be withdrawn on the next sync run, minutes after an
   * entity created it. A database-only draft is not a lighter version of this;
   * it is a row that self-destructs.
   *
   * It creates a course and nothing in it. Content — lectures, materials, the
   * quiz and its questions — is authored by the entity **inside Moodle** through
   * the seamless-login handoff (Model 1, D-046). There is deliberately no method
   * here for writing activities: adding one would start rebuilding Moodle's
   * authoring API through a boundary designed to hide it.
   *
   * Not idempotent, unlike `provisionUser` and `enrol`. There is no natural key
   * to reconcile on — two courses may legitimately share a title — so a repeat
   * call creates a second course. Callers must not retry it blindly.
   */
  createCourse(input: CreateCourseInput): Promise<LmsCourse>;

  /**
   * What the LMS holds inside a course (§4B.4, D-061).
   *
   * Read back so an entity can see, **before publishing**, whether the course is
   * actually completable. Returns null when the course does not exist.
   */
  getCourseContentSummary(lmsCourseId: LmsCourseId): Promise<LmsCourseContentSummary | null>;

  /**
   * Enrols a user in a course. Idempotent — enrolling an already-enrolled user
   * is a successful no-op, so confirming a path twice cannot fail halfway.
   *
   * `input.role` selects what they are enrolled *as*: a learner taking the
   * course, or an author who needs Moodle's editing capabilities (D-060). It is
   * expressed in our vocabulary because role ids are per-instance configuration
   * the adapter resolves — a caller passing a number would encode one Moodle
   * installation's numbering into the application layer.
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

  /**
   * A URL that drops a specific learner **straight into** a course, already
   * signed in (§5.3, D-044).
   *
   * Unlike `courseUrl`, this one deliberately **does** carry a credential — a
   * short-lived, single-use, HMAC-signed handoff bound to this user and this
   * course. That is the whole point of it, and it is why it is a separate method
   * rather than an option on `courseUrl`: a plain deep link is safe to embed in
   * a page, and this is not.
   *
   * It must therefore be minted **at the moment of the click**, not when a page
   * renders, so its short life starts when it is actually used. It must never
   * contain the web-services token.
   */
  courseLaunchUrl(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): string;
}

/**
 * DI token. An interface has no runtime identity, so Nest needs a symbol to
 * inject against — and callers inject `LMS_PORT`, never a concrete class, which
 * is what keeps the mock swappable.
 */
export const LMS_PORT = Symbol('LMS_PORT');
