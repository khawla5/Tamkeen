/**
 * Audit action codes (§2 security baseline).
 *
 * Stable string constants rather than a Prisma enum, so a later phase can append
 * an action without a schema migration. Naming is `DOMAIN_THING_PAST_TENSE`:
 * the log records what *happened*, not what was attempted.
 *
 * When adding an action in a later phase: add the constant here, and log it from
 * the service that performs the change — never from a controller, so the entry
 * cannot be bypassed by a second caller of the same logic.
 */
export const AuditAction = {
  // Authentication
  AUTH_REGISTERED: 'AUTH_REGISTERED',
  AUTH_REGISTRATION_REJECTED: 'AUTH_REGISTRATION_REJECTED',
  AUTH_EMAIL_VERIFIED: 'AUTH_EMAIL_VERIFIED',
  AUTH_LOGIN_SUCCEEDED: 'AUTH_LOGIN_SUCCEEDED',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_LOGGED_OUT: 'AUTH_LOGGED_OUT',
  AUTH_PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_COMPLETED: 'AUTH_PASSWORD_RESET_COMPLETED',

  // Authorization
  AUTHZ_DENIED: 'AUTHZ_DENIED',

  // Assessment and path (Phase 1)
  ASSESSMENT_SUBMITTED: 'ASSESSMENT_SUBMITTED',
  /** A path entered the BUILDING state, or the user switched which one. */
  PATH_SELECTED: 'PATH_SELECTED',
  PATH_COURSES_UPDATED: 'PATH_COURSES_UPDATED',
  /** The hard commitment gate (§2). Auditable by name in CLAUDE.md. */
  PATH_CONFIRMED: 'PATH_CONFIRMED',
  /** LMS enrolment requested for a confirmed path's courses. */
  PATH_ENROLMENT_REQUESTED: 'PATH_ENROLMENT_REQUESTED',

  // LMS integration (Phase 2)
  /** A catalogue sync run finished. Recorded with counts, never course content. */
  LMS_CATALOG_SYNCED: 'LMS_CATALOG_SYNCED',
  /**
   * A synced course left the catalogue — the LMS stopped returning it. Audited
   * on its own because it is the one sync outcome that changes what a learner
   * can see, and D-015 makes getting it wrong a product violation.
   */
  LMS_COURSE_WITHDRAWN: 'LMS_COURSE_WITHDRAWN',
  /** A completion-sync run finished. Counts only, never grades or names. */
  LMS_COMPLETION_SYNCED: 'LMS_COMPLETION_SYNCED',
  /**
   * A learner passed a course. Recorded on the transition only, so the trail
   * shows when it happened rather than once per poll. The grade is deliberately
   * absent: it is in `completions`, and an audit log is not the place for it.
   */
  LMS_COURSE_PASSED: 'LMS_COURSE_PASSED',
  /** Every chosen course passed. The path certificate itself is Phase 3. */
  PATH_COMPLETED: 'PATH_COMPLETED',
} as const;

export type AuditActionCode = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Reason codes for failures. Kept as an enumeration so the audit trail is
 * queryable and so no free-text — which could carry PII — reaches the log.
 */
export const AuditReason = {
  UNKNOWN_EMAIL: 'UNKNOWN_EMAIL',
  BAD_PASSWORD: 'BAD_PASSWORD',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  DOMAIN_NOT_ALLOWED: 'DOMAIN_NOT_ALLOWED',
  EMPLOYEE_ID_INVALID: 'EMPLOYEE_ID_INVALID',
  SELF_REGISTRATION_DISABLED: 'SELF_REGISTRATION_DISABLED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMPLOYEE_ID_ALREADY_REGISTERED: 'EMPLOYEE_ID_ALREADY_REGISTERED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',

  /* Phase 1 — rejected submissions. These match SCORING_ERROR exactly, so
     `reason: error.code` typechecks without a cast; a test asserts they stay
     in step. */
  ASSESSMENT_INCOMPLETE: 'ASSESSMENT_INCOMPLETE',
  ASSESSMENT_UNKNOWN_QUESTION: 'ASSESSMENT_UNKNOWN_QUESTION',
  ASSESSMENT_UNKNOWN_OPTION: 'ASSESSMENT_UNKNOWN_OPTION',
  ASSESSMENT_DUPLICATE_ANSWER: 'ASSESSMENT_DUPLICATE_ANSWER',

  // Phase 1 — path building and commitment
  PATH_ALREADY_CONFIRMED: 'PATH_ALREADY_CONFIRMED',
  PATH_NOT_SELECTED: 'PATH_NOT_SELECTED',
  COURSE_COUNT_OUT_OF_RANGE: 'COURSE_COUNT_OUT_OF_RANGE',
  COURSE_NOT_IN_PATH: 'COURSE_NOT_IN_PATH',
  COURSE_NOT_AVAILABLE: 'COURSE_NOT_AVAILABLE',
} as const;

export type AuditReasonCode = (typeof AuditReason)[keyof typeof AuditReason];
