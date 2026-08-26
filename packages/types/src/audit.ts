/**
 * The audit vocabulary (§2 security baseline, §4C.8).
 *
 * **Shared rather than API-only, and that is the point of it living here
 * (TAM-137).** §4C.8 renders one row per entry and looks its Arabic copy up by
 * action code, so a code with no copy reached the ministry as the raw
 * `AUTH_PASSWORD_CHANGED` — three of them did, and every one of the thirty-odd
 * reason codes did — and with the vocabulary API-side nothing on the web could
 * enumerate the codes to catch it. With the lists shared, the message catalogue
 * is asserted against them and the next such code fails CI. Same reasoning as
 * D-103's move of `SETTING_KEYS`, and the same defect.
 *
 * Stable string constants rather than Prisma enums, so a later phase can append
 * an action without a schema migration. Naming is `DOMAIN_THING_PAST_TENSE`:
 * the log records what *happened*, not what was attempted.
 *
 * When adding an action in a later phase: add the constant here, add its Arabic
 * copy, and log it from the service that performs the change — never from a
 * controller, so the entry cannot be bypassed by a second caller of the same
 * logic.
 */

/**
 * What kind of thing an entry is about (TAM-137).
 *
 * **One spelling per concept, and the type is what enforces it.** Before this
 * the log held both `User` and `user`, and both `Entity` and the snake_case
 * everything else used — one concept in two buckets, so filtering or grouping
 * by type silently returned a fraction of the rows. Snake_case throughout,
 * because that is what the majority of call sites already used and what the
 * tables are named.
 *
 * `user_path` is one learner's journey through a path, which is a different
 * thing from the `path` itself: an entry about the former concerns one person,
 * an entry about the latter concerns the catalogue everybody is offered.
 */
export const AUDIT_TARGET_TYPES = [
  'user',
  'entity',
  'path',
  'user_path',
  'course',
  'assessment',
  'assessment_result',
  'certificate',
  'setting',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

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
  /** A signed-in user changed their own password (§4.12). */
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',
  AUTH_EMAIL_CHANGE_REQUESTED: 'AUTH_EMAIL_CHANGE_REQUESTED',
  AUTH_EMAIL_CHANGED: 'AUTH_EMAIL_CHANGED',

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
  /**
   * A course's availability window opened or closed and its status followed
   * (§4C.5, TAM-134).
   *
   * Recorded for the same reason a withdrawal is: it changes what a learner can
   * see, and it is the one such change nobody performed — so without an entry
   * the trail would show a course going quiet with no cause anywhere in it.
   */
  COURSE_AVAILABILITY_APPLIED: 'COURSE_AVAILABILITY_APPLIED',
  /** A completion-sync run finished. Counts only, never grades or names. */
  LMS_COMPLETION_SYNCED: 'LMS_COMPLETION_SYNCED',
  /**
   * A learner passed a course. Recorded on the transition only, so the trail
   * shows when it happened rather than once per poll. The grade is deliberately
   * absent: it is in `completions`, and an audit log is not the place for it.
   */
  LMS_COURSE_PASSED: 'LMS_COURSE_PASSED',
  /** Every chosen course passed. */
  PATH_COMPLETED: 'PATH_COMPLETED',
  /**
   * A seamless-login handoff was minted (D-044). Audited because it is the one
   * place the product issues a credential that logs someone in somewhere else.
   */
  LMS_COURSE_LAUNCHED: 'LMS_COURSE_LAUNCHED',

  // Certificates (Phase 3)
  /**
   * A certificate was issued. Recorded on creation only — the idempotent path
   * returns an existing certificate and is not an event, or the trail would
   * claim a credential was issued once per sync run forever.
   */
  CERTIFICATE_ISSUED: 'CERTIFICATE_ISSUED',

  // Profile (§4.12)
  /** An employee changed their own name and/or department. */
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  /**
   * The primary change already succeeded — a profile save, or a confirmed
   * email change (§4.12, D-038 addendum) — but propagating it to the LMS did
   * not. Recorded so the mismatch is discoverable rather than silent; the
   * primary change is never rolled back over this, and retrying is D-036's
   * reconciliation pattern to own, not this call site. `detail.field`
   * ('fullName' or 'email') distinguishes which propagation failed.
   */
  PROFILE_LMS_SYNC_FAILED: 'PROFILE_LMS_SYNC_FAILED',

  // Entity portal (Phase 4)
  /** An entity account changed its own name and/or its organisation's contact
   *  details (§4B.6). `detail.fields` names what changed, never the values. */
  ENTITY_PROFILE_UPDATED: 'ENTITY_PROFILE_UPDATED',
  /** An entity created a course shell — in the LMS and in our catalogue. */
  ENTITY_COURSE_CREATED: 'ENTITY_COURSE_CREATED',
  /** Product metadata changed: path membership, duration, objectives,
   *  prerequisites, language. Recorded because it changes what learners are
   *  offered without touching the LMS. */
  ENTITY_COURSE_METADATA_UPDATED: 'ENTITY_COURSE_METADATA_UPDATED',
  /** The course entered the learner catalogue. */
  ENTITY_COURSE_PUBLISHED: 'ENTITY_COURSE_PUBLISHED',
  /**
   * The course left it. Audited separately from publishing, and with the
   * resulting status, because §2/D-015 turns on what happened to the learners
   * who already held it — an unpublish that degraded to HIDDEN_BUT_COMPLETABLE
   * and one that retired the course outright are different events.
   */
  ENTITY_COURSE_UNPUBLISHED: 'ENTITY_COURSE_UNPUBLISHED',
  /**
   * A seamless-login handoff was minted for authoring (D-060). Audited for the
   * same reason the learner one is: it is a credential that signs someone in
   * somewhere else, and here it carries editing rights.
   */
  ENTITY_COURSE_AUTHOR_LAUNCHED: 'ENTITY_COURSE_AUTHOR_LAUNCHED',

  // Super-admin portal (Phase 5)
  /**
   * An administrator provisioned an account (§4C.2). The role is recorded in the
   * detail payload; the email and employee id are not — they are PII, and the
   * target id resolves to both for anyone entitled to see them.
   */
  ADMIN_USER_CREATED: 'ADMIN_USER_CREATED',
  /** An invitation was (re-)sent to an account that has not set a password. */
  ADMIN_USER_INVITED: 'ADMIN_USER_INVITED',
  /**
   * An account was suspended or reactivated. Audited separately from a role
   * change because they answer different questions in an incident review:
   * "who cut this person off, and when" against "who gave them this access".
   */
  ADMIN_USER_STATUS_CHANGED: 'ADMIN_USER_STATUS_CHANGED',
  /** An account's role changed, or an entity account moved organisation. */
  ADMIN_USER_ROLE_CHANGED: 'ADMIN_USER_ROLE_CHANGED',
  /** An organisation was created (§4C.2 fills Phase 4's provisioning seam). */
  ADMIN_ENTITY_CREATED: 'ADMIN_ENTITY_CREATED',
  /** An organisation's details or status changed. */
  ADMIN_ENTITY_UPDATED: 'ADMIN_ENTITY_UPDATED',
  /** An assessment edit was begun — a draft copied from the active version. */
  ADMIN_ASSESSMENT_DRAFT_OPENED: 'ADMIN_ASSESSMENT_DRAFT_OPENED',
  /** The draft was abandoned. Recorded because the work is gone. */
  ADMIN_ASSESSMENT_DRAFT_DISCARDED: 'ADMIN_ASSESSMENT_DRAFT_DISCARDED',
  /**
   * A new assessment version became the one new takers receive (D-069/D-070).
   *
   * The single most consequential change an administrator can make: every
   * Holland Code produced from this moment comes from a different instrument.
   * Recorded on refusal too, with the blockers, so a rejected publish is
   * explicable months later without reconstructing the bank as it stood.
   */
  ADMIN_ASSESSMENT_PUBLISHED: 'ADMIN_ASSESSMENT_PUBLISHED',
  /** A study path was created (§4C.4). Always inactive to begin with. */
  ADMIN_PATH_CREATED: 'ADMIN_PATH_CREATED',
  /** A path's content changed — name, description, duration, letter, order. */
  ADMIN_PATH_UPDATED: 'ADMIN_PATH_UPDATED',
  /**
   * A path became offerable to learners, or stopped being.
   *
   * Audited apart from an ordinary edit because these are the two moments that
   * change what the whole workforce is offered, and a retirement records how
   * many people were part way through choosing it when the decision was made.
   */
  ADMIN_PATH_ACTIVATED: 'ADMIN_PATH_ACTIVATED',
  ADMIN_PATH_RETIRED: 'ADMIN_PATH_RETIRED',
  /**
   * A path was removed permanently (§4C.4).
   *
   * Only ever recorded for a path nobody ever chose — the service refuses any
   * other, and the schema would refuse it after that. Kept distinct from a
   * retirement because the two are the opposite kind of decision: one is
   * reversible and leaves the record intact, the other leaves no row to point
   * an audit entry at afterwards, which is precisely why the entry has to name
   * the key and the letter rather than only the id.
   */
  ADMIN_PATH_DELETED: 'ADMIN_PATH_DELETED',
  /** A course joined or left a path's membership. */
  ADMIN_PATH_COURSE_ATTACHED: 'ADMIN_PATH_COURSE_ATTACHED',
  ADMIN_PATH_COURSE_DETACHED: 'ADMIN_PATH_COURSE_DETACHED',
  /**
   * An administrator intervened on a course (§4C.5) — hid it, restored it, or
   * placed it with an organisation.
   *
   * Recorded with the *resulting* status, because §2/D-015 turns on it: an
   * intervention that degraded to HIDDEN_BUT_COMPLETABLE and one that retired
   * the course outright are different events with different consequences for
   * the learners holding it.
   */
  ADMIN_COURSE_INTERVENED: 'ADMIN_COURSE_INTERVENED',
  /** §4C.5's permanent deletion (TAM-134) — recorded whichever way it goes. */
  ADMIN_COURSE_DELETED: 'ADMIN_COURSE_DELETED',
  /**
   * A product knob changed (§4C.6).
   *
   * The one audit action whose payload carries a *value*, and deliberately:
   * these are product configuration rather than anybody's data, and "who lowered
   * the pass threshold, to what, and when" is where an audit of a disputed
   * certificate begins. No secret is settable, which is what makes recording the
   * value safe at all (D-072).
   */
  ADMIN_SETTING_CHANGED: 'ADMIN_SETTING_CHANGED',
  /** A knob was returned to the environment's default. */
  ADMIN_SETTING_RESET: 'ADMIN_SETTING_RESET',
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

  // Phase 4 — the entity portal
  /** Publishing was refused; the specific blockers go in the detail payload. */
  COURSE_NOT_PUBLISHABLE: 'COURSE_NOT_PUBLISHABLE',
  /** The LMS refused or could not be reached while creating a course shell. */
  LMS_COURSE_CREATE_FAILED: 'LMS_COURSE_CREATE_FAILED',
  LMS_COURSE_DELETE_FAILED: 'LMS_COURSE_DELETE_FAILED',

  /* Phase 5 — refused administrative changes. Every one of these is a lockout
     or an integrity failure that was prevented, which makes them the entries a
     security review most wants to be able to find. */
  /** An administrator tried to change their own status or role. */
  SELF_MODIFICATION_REFUSED: 'SELF_MODIFICATION_REFUSED',
  /** The change would have left the system with no active administrator. */
  LAST_ACTIVE_ADMIN: 'LAST_ACTIVE_ADMIN',
  /** An ENTITY account was asked for without an organisation to act for. */
  ENTITY_REQUIRED: 'ENTITY_REQUIRED',
  /** An organisation was supplied for a role that cannot belong to one. */
  ENTITY_NOT_ALLOWED: 'ENTITY_NOT_ALLOWED',
  /** The role change would have stranded a learner's result, path or
   *  certificates behind a role that cannot reach them. */
  JOURNEY_WOULD_BE_ORPHANED: 'JOURNEY_WOULD_BE_ORPHANED',
  /** The requested role is the one the account already has. */
  ROLE_UNCHANGED: 'ROLE_UNCHANGED',
  /**
   * A publish was refused because the proposed bank cannot be published; the
   * specific blockers go in the detail payload (D-071).
   */
  BANK_NOT_PUBLISHABLE: 'BANK_NOT_PUBLISHABLE',
  /**
   * A path was refused activation, or an edit that would have left an active
   * path with fewer selectable courses than a learner needs to confirm (§2).
   */
  PATH_NOT_OFFERABLE: 'PATH_NOT_OFFERABLE',
  /** A course could not leave a path because learners hold it through it. */
  COURSE_HELD_BY_LEARNERS: 'COURSE_HELD_BY_LEARNERS',
  /**
   * A path could not be deleted because somebody has chosen it, or a
   * certificate names it. Retirement is what the administrator wants instead.
   */
  PATH_HELD_BY_LEARNERS: 'PATH_HELD_BY_LEARNERS',
  /** A published course cannot be returned to DRAFT — that state is reachable
   *  forward only, and going back would bypass the unpublish rules. */
  COURSE_CANNOT_RETURN_TO_DRAFT: 'COURSE_CANNOT_RETURN_TO_DRAFT',
} as const;

export type AuditReasonCode = (typeof AuditReason)[keyof typeof AuditReason];

/**
 * What area of the system an action belongs to (TAM-138).
 *
 * **The filter was fifty-three flat options and the rows carried no sense of
 * kind.** An administrator arriving at §4C.8 is almost never looking for one
 * named action — they are looking for "what happened to accounts this week" or
 * "did the LMS sync run". A category answers that question directly, groups the
 * filter into lists a person can scan, and lets a row say what area it concerns
 * without repeating the action name.
 *
 * Five, and the boundary is *who the entry is about*, not which module wrote it:
 * - `auth` — getting in, and being refused. Sessions, passwords, addresses.
 * - `learner` — one employee's own journey: assessment, path, courses, certificate.
 * - `content` — the catalogue everybody is offered: courses, paths, the instrument.
 * - `administration` — accounts, organisations and the product's own settings.
 * - `integration` — the LMS and the scheduled jobs; nobody performed these.
 */
export const AUDIT_ACTION_CATEGORIES = [
  'auth',
  'learner',
  'content',
  'administration',
  'integration',
] as const;

export type AuditActionCategory = (typeof AUDIT_ACTION_CATEGORIES)[number];

/**
 * Every action's category.
 *
 * Exhaustive by type — `Record<AuditActionCode, …>` means adding an action
 * without categorising it fails the build rather than quietly landing in a
 * group the screen has no heading for. A test asserts the reverse direction too.
 */
export const AUDIT_ACTION_CATEGORY: Record<AuditActionCode, AuditActionCategory> = {
  AUTH_REGISTERED: 'auth',
  AUTH_REGISTRATION_REJECTED: 'auth',
  AUTH_EMAIL_VERIFIED: 'auth',
  AUTH_LOGIN_SUCCEEDED: 'auth',
  AUTH_LOGIN_FAILED: 'auth',
  AUTH_ACCOUNT_LOCKED: 'auth',
  AUTH_LOGGED_OUT: 'auth',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth',
  AUTH_PASSWORD_RESET_COMPLETED: 'auth',
  AUTH_PASSWORD_CHANGED: 'auth',
  AUTH_EMAIL_CHANGE_REQUESTED: 'auth',
  AUTH_EMAIL_CHANGED: 'auth',
  AUTHZ_DENIED: 'auth',

  ASSESSMENT_SUBMITTED: 'learner',
  PATH_SELECTED: 'learner',
  PATH_COURSES_UPDATED: 'learner',
  PATH_CONFIRMED: 'learner',
  PATH_ENROLMENT_REQUESTED: 'learner',
  PATH_COMPLETED: 'learner',
  LMS_COURSE_PASSED: 'learner',
  LMS_COURSE_LAUNCHED: 'learner',
  CERTIFICATE_ISSUED: 'learner',
  PROFILE_UPDATED: 'learner',
  PROFILE_LMS_SYNC_FAILED: 'learner',

  ENTITY_COURSE_CREATED: 'content',
  ENTITY_COURSE_METADATA_UPDATED: 'content',
  ENTITY_COURSE_PUBLISHED: 'content',
  ENTITY_COURSE_UNPUBLISHED: 'content',
  ENTITY_COURSE_AUTHOR_LAUNCHED: 'content',
  ADMIN_ASSESSMENT_DRAFT_OPENED: 'content',
  ADMIN_ASSESSMENT_DRAFT_DISCARDED: 'content',
  ADMIN_ASSESSMENT_PUBLISHED: 'content',
  ADMIN_PATH_CREATED: 'content',
  ADMIN_PATH_UPDATED: 'content',
  ADMIN_PATH_ACTIVATED: 'content',
  ADMIN_PATH_RETIRED: 'content',
  ADMIN_PATH_DELETED: 'content',
  ADMIN_PATH_COURSE_ATTACHED: 'content',
  ADMIN_PATH_COURSE_DETACHED: 'content',
  ADMIN_COURSE_INTERVENED: 'content',
  ADMIN_COURSE_DELETED: 'content',

  ADMIN_USER_CREATED: 'administration',
  ADMIN_USER_INVITED: 'administration',
  ADMIN_USER_STATUS_CHANGED: 'administration',
  ADMIN_USER_ROLE_CHANGED: 'administration',
  ADMIN_ENTITY_CREATED: 'administration',
  ADMIN_ENTITY_UPDATED: 'administration',
  ADMIN_SETTING_CHANGED: 'administration',
  ADMIN_SETTING_RESET: 'administration',

  LMS_CATALOG_SYNCED: 'integration',
  LMS_COURSE_WITHDRAWN: 'integration',
  COURSE_AVAILABILITY_APPLIED: 'integration',
  LMS_COMPLETION_SYNCED: 'integration',
};
