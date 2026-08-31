import type { AuditTargetType } from './audit';
import type { CourseLanguage, CoursePublication, CourseStatus } from './catalog';
import type { RiasecLetter } from './riasec';
import type { UserRole } from './roles';

/**
 * The super-admin portal (CLAUDE.md §4C).
 *
 * **Nothing here is scoped.** Every other portal's contracts are filtered before
 * they reach a client — an entity is shown its own organisation's rows and has
 * no vocabulary for asking about another's (D-062). The admin is the one caller
 * for whom the unfiltered view is the point, so these shapes carry the fields
 * the entity ones deliberately omit: which organisation owns a course, how many
 * accounts exist in each state, what the LMS said when we last asked it.
 *
 * That makes the guard the only thing standing between these shapes and a
 * caller who should not see them, which is why `@Roles('SUPER_ADMIN')` is
 * declared at class level on every admin controller and why the integration
 * suite asserts a 403 for both other roles on every route.
 */

/** How many accounts exist, by role and state (§4C.1, §4C.2). */
export interface AdminUserCounts {
  employees: number;
  /** Accounts with the ENTITY role — not the number of organisations. */
  entityAccounts: number;
  admins: number;
  /** Suspended accounts across every role. */
  suspended: number;
  /** Registered but never verified — the population that cannot sign in yet. */
  unverified: number;
}

/**
 * The learner journey in aggregate (§4C.1).
 *
 * Counts of people at each stage rather than percentages, because a percentage
 * hides its denominator and the denominator is the interesting part early on.
 * The one rate that is offered is `pathCompletionRate`, and it is null over an
 * empty denominator for the reason used everywhere else: 0% of nobody reads as
 * failure rather than as "nobody has finished yet".
 */
export interface AdminJourneyCounts {
  assessed: number;
  building: number;
  active: number;
  completed: number;
  pathCompletionRate: number | null;
  coursesPassed: number;
  certificatesIssued: number;
}

/** One bar of the Holland-code distribution (§4C.8's reports). */
export interface AdminCodeShare {
  code: string;
  count: number;
}

/**
 * One row of the dashboard's career-type distribution (§4C.1).
 *
 * **A letter, not a code.** The full Holland Code has thirty-odd values and
 * spells nothing an administrator can act on; the *dominant* letter has six,
 * each with an Arabic name the ministry already uses, and it is the same letter
 * `paths.riasec_letter` is tagged with (§3A). Putting the two counts on one row
 * is the whole point of the section: it answers "are we offering paths where
 * our people's interests actually are", which is a decision the admin owns.
 * The exhaustive code breakdown stays in §4C.8's reports, where the detail
 * belongs.
 */
export interface AdminLetterShare {
  letter: RiasecLetter;
  /** Employees whose dominant letter this is — one per person, newest result
   *  only (D-033), so a retake corrects rather than double-counts. */
  employees: number;
  /** Paths currently offered to learners with this letter. */
  activePaths: number;
}

/**
 * What the LMS said when we last asked (§4C.1, §5.2's health function).
 *
 * `reachable` is a live call made while rendering the dashboard; the two sync
 * timestamps come from the audit trail, which is the only place that records
 * whether a scheduled run actually happened. The distinction matters: an LMS
 * that answers `core_webservice_get_site_info` while the sync job has not run
 * for a day is a healthy Moodle behind a broken scheduler, and a single "ok"
 * would hide that.
 */
export interface AdminLmsHealth {
  reachable: boolean;
  mode: string;
  siteName: string | null;
  baseUrl: string;
  /** Why it is unreachable, when it is. A bad token and a down server need
   *  different fixes, so collapsing them into one red tick would waste the
   *  operator's first hour. Null whenever `reachable` is true. */
  failureCode: 'UNREACHABLE' | 'UNAUTHORISED' | 'UNEXPECTED_RESPONSE' | null;
  lastCatalogSyncAt: string | null;
  lastCompletionSyncAt: string | null;
}

/** One line of the recent-activity list (§4C.1), read from the audit log. */
export interface AdminActivityRow {
  /** `audit_log.id` is a bigint; it crosses the wire as a string because JSON
   *  numbers cannot carry one safely. */
  id: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  /** The actor's name, or null for an anonymous or deleted actor. */
  actorName: string | null;
  targetType: string | null;
  occurredAt: string;
}

/** §4C.1 — the admin dashboard. */
export interface AdminDashboardView {
  users: AdminUserCounts;
  /** Organisations, as distinct from the accounts that act for them. */
  entities: { total: number; active: number; suspended: number };
  paths: { total: number; active: number };
  courses: { total: number; published: number; draft: number; unowned: number };
  journey: AdminJourneyCounts;
  /** All six letters, always — a dimension nobody scored is itself the
   *  finding. Ordered by employee count, descending. */
  letterDistribution: AdminLetterShare[];
  lms: AdminLmsHealth;
  recentActivity: AdminActivityRow[];
  /** Assessment version currently served to new takers, and since when. */
  assessment: { version: number; effectiveFrom: string; hasDraft: boolean } | null;
}

/** The eight destinations of §4C's admin navigation. */
export const ADMIN_NAV_KEYS = [
  'adminDashboard',
  'adminUsers',
  'adminAssessment',
  'adminPaths',
  'adminCourses',
  'adminSettings',
  'adminTemplates',
  'adminAudit',
] as const;

export type AdminNavKey = (typeof ADMIN_NAV_KEYS)[number];

/**
 * A path as the admin manages it (§4C.4).
 *
 * Carries `riasecLetter` because the admin is the one who sets it, and
 * `courseCount` because a path with no courses cannot be built into a valid
 * 5-10 selection and the admin needs to see that before a learner does.
 */
export interface AdminPathRow {
  id: string;
  key: string;
  name: string;
  riasecLetter: RiasecLetter;
  courseCount: number;
  /** Learners who have confirmed this path — why it may not be retired. */
  committedLearners: number;
  isActive: boolean;
  displayOrder: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.2 — user management
// ─────────────────────────────────────────────────────────────────────────────

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * One row of the user list.
 *
 * Carries the email and employee id, which no other portal's contract does.
 * That is the point of this screen and also its risk: §2 treats both as PII, so
 * they appear here, behind `@Roles('SUPER_ADMIN')`, and nowhere else — not in a
 * URL, not in an audit payload, not in a log line.
 */
export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  role: UserRole;
  status: AdminUserStatus;
  /** Null until they follow the invitation or verification link. */
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  /** The organisation an ENTITY account acts for; null for every other role. */
  entity: { id: string; name: string } | null;
}

/** A page of users, with the total so the UI can say how many matched. */
export interface AdminUserPage {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * What an administrator sees about one person (§4C.2's "path/assessment/
 * certificate status").
 *
 * A summary, not a second copy of the learner's own screens: the Holland Code
 * without the six scores, the path with its progress but not its course list,
 * and a certificate count rather than the certificates. An administrator asks
 * "where is this person up to and is anything stuck", and that is answerable
 * without reproducing the journey in the admin portal.
 */
export interface AdminUserDetail extends AdminUserRow {
  createdAt: string;
  /** Whether an LMS account has been provisioned yet (lazy, per D-036). */
  hasLmsAccount: boolean;
  assessment: { code: string; completedAt: string; attempts: number } | null;
  path: {
    name: string;
    status: 'BUILDING' | 'ACTIVE' | 'COMPLETED';
    confirmedAt: string | null;
    coursesChosen: number;
    coursesPassed: number;
  } | null;
  certificateCount: number;
  /** Live sessions right now — the answer to "is this suspension effective?" */
  activeSessions: number;
}

/** An organisation and the two counts that say whether it can be removed. */
export interface AdminEntityRow {
  id: string;
  key: string;
  name: string;
  contactName: string;
  contactEmail: string;
  status: 'ACTIVE' | 'SUSPENDED';
  accountCount: number;
  courseCount: number;
  createdAt: string;
}

/**
 * The result of provisioning an account.
 *
 * **No password, ever** (§4C.2: "no raw password access"). The account is
 * created with a hash of random bytes that nothing keeps, and an invitation is
 * emailed; the person sets their own password from the link. So what comes back
 * is confirmation that the invitation went out, not a credential to relay.
 */
export interface AdminInviteResult {
  user: AdminUserRow;
  invitationSentTo: string;
  invitationExpiresAt: string;
}

/**
 * The restricted-registration rules in force (D-017), read-only here.
 *
 * §4C.6 makes them editable in sub-phase 5.6; this exists in 5.2 because an
 * administrator looking at "why can this person not register" needs the answer
 * on the screen where they are asking the question.
 */
export interface AdminRegistrationPolicyView {
  mode: 'restricted' | 'admin-only';
  allowedEmailDomains: string[];
  employeeIdPattern: string;
  passwordMinLength: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.3 — assessment management
// ─────────────────────────────────────────────────────────────────────────────

export type AssessmentVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

/**
 * One option as the *editor* sees it — weights included.
 *
 * This is the one shape in the whole product that carries a RIASEC weighting
 * across the wire, and it exists only behind `@Roles('SUPER_ADMIN')`. D-034 is
 * explicit that no weight may reach a taker: an assessment whose scoring key is
 * visible in a network response is one a person can steer toward whichever
 * result they already wanted, which would make every gold recommendation
 * downstream theatre. An integration test greps the *learner* endpoint for these
 * field names precisely because this type now exists.
 */
export interface AdminAssessmentOption {
  id: string;
  key: string;
  label: string;
  order: number;
  /** Points per dimension. An absent letter contributes nothing. */
  weights: Partial<Record<RiasecLetter, number>>;
}

export interface AdminAssessmentQuestion {
  id: string;
  key: string;
  text: string;
  order: number;
  options: AdminAssessmentOption[];
}

/** Why a proposed version cannot be published, or should not be without thought. */
export interface AdminBankReadiness {
  /** Refusals. Publishing with any of these is impossible (D-071). */
  blockers: string[];
  /** Advisory. Publishing proceeds; the editor says so first. */
  warnings: string[];
  /** What each dimension could attain — how the editor names the imbalance. */
  attainable: Record<RiasecLetter, number>;
  balanced: boolean;
}

/** A version in the history list (§4C.3's "version + effective date"). */
export interface AdminAssessmentVersion {
  id: string;
  version: number;
  status: AssessmentVersionStatus;
  title: string;
  effectiveFrom: string | null;
  retiredAt: string | null;
  questionCount: number;
  /** How many people were scored against this version. Never mutated (D-049). */
  resultCount: number;
}

/** §4C.3's landing state: what is live, what is being edited, what came before. */
export interface AdminAssessmentOverview {
  active: AdminAssessmentVersion | null;
  draft: AdminAssessmentVersion | null;
  history: AdminAssessmentVersion[];
}

/** The draft bank, with weights, as only an administrator may see it. */
export interface AdminAssessmentDraft {
  id: string;
  key: string;
  version: number;
  title: string;
  description: string;
  questions: AdminAssessmentQuestion[];
  readiness: AdminBankReadiness;
  /** The version this draft was copied from, for "what am I changing". */
  basedOnVersion: number | null;
}

/**
 * The six dimensions, as the editor's question-creation shortcut offers them.
 *
 * Adding a question one dimension at a time is what keeps a balanced bank
 * balanced: going from five items per dimension to six means adding six
 * questions, one per letter, and the editor should make that the easy path
 * rather than something to reconstruct from the imbalance report.
 */
export interface AdminAddQuestionInput {
  text: string;
  letter: RiasecLetter;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.4 — path management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many learners a path is carrying, by stage.
 *
 * The three numbers answer different questions and are never summed on screen.
 * `building` are people who have chosen the path but not committed — the only
 * group a retirement inconveniences. `active` and `completed` hold it under
 * D-002 and are unaffected by anything an administrator does here: My Path,
 * their courses and their certificates all read through `user_paths` and never
 * consult `paths.is_active`.
 */
export interface AdminPathLearners {
  building: number;
  active: number;
  completed: number;
}

/** A course attached to a path, as the admin manages it. */
export interface AdminPathCourseRow {
  id: string;
  moodleCourseId: number;
  title: string;
  status: CourseStatus;
  displayOrder: number;
  /** Which organisation supplies it; null for the seeded catalogue (D-063). */
  ownerEntityName: string | null;
  /**
   * How many learners hold this course *through this path*.
   *
   * Non-zero means detaching it would leave those learners with a selection the
   * build rules no longer recognise, so the server refuses. Shown so the refusal
   * is predictable rather than discovered.
   */
  heldByLearners: number;
}

export interface AdminPathDetail extends AdminPathRow {
  description: string;
  typicalDurationMinutes: number | null;
  courses: AdminPathCourseRow[];
  learners: AdminPathLearners;
  /** Why this path may not be offered to learners, if it may not (§4C.4). */
  blockers: string[];
  /** How many of its courses a learner could select right now. */
  selectableCourses: number;
  /**
   * Whether a permanent delete is possible: true only while nobody has ever
   * chosen this path and no certificate names it.
   *
   * Reported so §4C.4 can say which of the two removals is available *before*
   * the administrator picks one — the server refuses the other either way, but
   * being refused after choosing "delete permanently" teaches the rule the
   * expensive way.
   */
  canDelete: boolean;
  /** Certificates naming this path. Non-zero makes deletion a falsification of
   *  a document somebody holds, which is why it is counted separately from the
   *  learners still on it. */
  certificateCount: number;
}

/**
 * The 5-10 rule, reported so the admin screens can explain themselves.
 *
 * Read-only everywhere (D-074): §2 lists it among the non-negotiable product
 * rules, and a knob here is how a floor of five quietly becomes a floor of
 * three under delivery pressure.
 */
export interface AdminPathBounds {
  min: number;
  max: number;
}

/**
 * A course an administrator could attach to a path (§4C.4).
 *
 * Deliberately not the learner catalogue's `CourseSummary`: attaching is an
 * administrative act, so the list includes drafts and hidden courses — which a
 * learner must never see — and names the supplying organisation, which no
 * learner-facing shape carries.
 */
export interface AdminAttachableCourse {
  id: string;
  moodleCourseId: number;
  title: string;
  status: CourseStatus;
  ownerEntityName: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.5 — course oversight
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A course as the administrator sees it — every entity's, and the unowned.
 *
 * The one catalogue view with no scope at all (D-075). An entity sees its own
 * courses and has no vocabulary for asking about another's; this carries the
 * owning organisation, the publication decision *and* the derived status, and
 * the two LMS facts underneath them — because the question an administrator is
 * usually asked is "why can nobody see this course", and the answer is always
 * one of those three disagreeing.
 */
export interface AdminCourseRow {
  id: string;
  moodleCourseId: number;
  title: string;
  /** The entity's decision (D-059). Ours; sync may read it, never write it. */
  publication: CoursePublication;
  /** What that decision plus the LMS's state actually produces for a learner. */
  status: CourseStatus;
  /** The LMS's own facts, shown because they are half of the derivation. */
  lmsPresent: boolean;
  lmsVisible: boolean;
  language: CourseLanguage | null;
  durationMinutes: number | null;
  /** Null for the seeded catalogue and anything the LMS holds unclaimed. */
  ownerEntityId: string | null;
  ownerEntityName: string | null;
  paths: Array<{ id: string; name: string }>;
  /** How many learners hold it — why it may not be retired outright. */
  heldByLearners: number;
  /** How many issued certificates name it. Part of why it may not be deleted. */
  certificatesIssued: number;
  /**
   * Whether this course may be deleted outright (§4C.5, TAM-134).
   *
   * Reported in advance so the destructive control is simply absent for a course
   * that cannot be deleted, with the reason in its place — rather than offered,
   * clicked, and refused. The server enforces the same rule regardless; this is
   * how the administrator learns it without being refused by it.
   */
  canDelete: boolean;
  /**
   * The availability window, as calendar days (`YYYY-MM-DD`) or null for "no
   * bound" (§4C.5, TAM-134).
   *
   * Days rather than instants, and resolved server-side: the bounds are stored
   * as the first and last moment of a day in the ministry's own time zone, and
   * sending instants would leave the browser to reconstruct which day that was —
   * getting it wrong by one for anybody whose machine is set elsewhere.
   */
  availableFrom: string | null;
  availableUntil: string | null;
  /** When it first entered the catalogue. Written since Phase 4, read here. */
  publishedAt: string | null;
  lastSyncedAt: string | null;
}

export interface AdminCoursePage {
  rows: AdminCourseRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Courses no organisation supplies — the admin's to place (D-063). */
  unownedTotal: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.6 — system settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which knobs an administrator may change without a deployment (§4C.6, D-072).
 *
 * **Shared rather than API-only, and that is the point of moving it here
 * (TAM-135).** The screen renders one row per key and looks up Arabic copy by
 * key, so a key with no copy reached the ministry as the raw
 * `admin.setting.CERT_SIGNATORY_NAME` — invisible to every test, because
 * nothing could enumerate the keys on the web side. With the list shared, the
 * message catalogue is asserted against it and the same defect fails CI.
 *
 * **The list is short on purpose, and what is missing from it is the point.**
 * Secrets are absent — the Moodle web-services token, the database URL, the SMTP
 * credentials — because a setting readable by the screen that edits it is a
 * setting that appears in a network response. So are the auth rate limits, which
 * §2 makes security floors rather than knobs an operator may loosen; the 5-10
 * path bounds, which §2 makes a product rule and D-074 keeps in code; and, since
 * the ministry's 2026-08-25 direction, the pass threshold, which is deployment
 * configuration rather than a screen (D-102).
 */
export const SETTING_KEYS = [
  /** How often the LMS is polled (D-042). Re-registers the scheduler on change. */
  'COMPLETION_SYNC_INTERVAL_MINUTES',
  /**
   * Path membership rules for a course (TAM-141): how many paths one course
   * may belong to, how many distinct RIASEC letters those paths may span, and
   * whether an entity's membership needs admin approval before learners see it
   * ('off' auto-approves — the state until Phase 5's queue exists).
   */
  'COURSE_MAX_PATHS',
  'COURSE_MAX_RIASEC_LETTERS',
  'PATH_MEMBERSHIP_APPROVAL',
  /** D-017's registration gate: the mode, the domains, the employee-id shape. */
  'REGISTRATION_MODE',
  'ALLOWED_EMAIL_DOMAINS',
  'EMPLOYEE_ID_PATTERN',
  /** D-018's single switch point between Western and Arabic-Indic digits. */
  'NUMBER_FORMAT',
  /** Which Moodle we talk to. Not a secret; the token is, and is not here. */
  'MOODLE_BASE_URL',
  /**
   * §4C.7's signature block (D-073).
   *
   * Settings rather than template code, so the ministry can name its signatory
   * without a deployment — and settings rather than a `certificate_templates`
   * table, because three strings do not need a table and issued certificates
   * store their rendered bytes regardless (D-052).
   */
  'CERT_SIGNATORY_NAME',
  'CERT_SIGNATORY_TITLE',
  'CERT_ISSUING_BODY',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * How a setting is edited (TAM-135).
 *
 * **Derived on the server from the very Zod field that validates the value**,
 * never declared a second time: a `select` is a setting whose schema is an enum,
 * and its `options` are that enum's members. A hand-written list would be a
 * second source of truth for the allowed values, and the day the two disagreed
 * the screen would offer an option the server refuses.
 *
 * `number` likewise comes from the schema, so the field that only accepts digits
 * is exactly the field that would reject anything else on save.
 */
export const SETTING_EDITORS = ['text', 'number', 'select'] as const;

export type SettingEditor = (typeof SETTING_EDITORS)[number];

/**
 * One product knob (§4C.6, D-072).
 *
 * `value` is the effective one — the stored override, or the environment's
 * default when nothing is stored. `isOverridden` is what tells the two apart,
 * and it is what makes "reset to default" an honest offer rather than a button
 * that sometimes does nothing.
 */
export interface AdminSetting {
  key: SettingKey;
  value: string;
  isOverridden: boolean;
  /** How to render the field — see `SETTING_EDITORS`. */
  editor: SettingEditor;
  /** The allowed values, for `select`; empty for everything else. */
  options: string[];
}

/**
 * §4C.6's screen.
 *
 * **`readOnly` is not a lesser section; it is the point of half the page.** The
 * 5-10 path bounds and the auth rate limits are shown and cannot be changed —
 * §2 makes the first a product rule (D-074) and the second a security floor, and
 * an administrator asked to explain either needs the number in front of them
 * without being offered a way to move it.
 */
export interface AdminSettingsView {
  settings: AdminSetting[];
  readOnly: Array<{ key: string; value: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.7 — the certificate face
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §4C.7's screen.
 *
 * The signature block is three *settings* — §4C.6 writes them, and this screen
 * shows them beside a rendered preview so the effect is visible before anybody
 * earns a certificate.
 *
 * `hasLogo` is false and will stay false until the ministry supplies its seal
 * (D-073, and the first open blocker since Phase 3). The slot holds its position
 * meanwhile, so dropping the artwork in later is not a layout change (D-051).
 */
export interface AdminCertificateTemplateView {
  signatory: { name: string; title: string; issuingBody: string };
  /** The real template with sample content — not a mock-up of it. */
  previewHtml: string;
  hasLogo: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.8 — audit and reports
// ─────────────────────────────────────────────────────────────────────────────

/** One audit entry, as the read-only trail shows it. */
export interface AdminAuditRow {
  /** `audit_log.id` is a bigint; it crosses the wire as a string. */
  id: string;
  occurredAt: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  actorName: string | null;
  /** From the one shared vocabulary (`AUDIT_TARGET_TYPES`, TAM-137). */
  targetType: AuditTargetType | null;
  targetId: string | null;
  /**
   * What the target is called — the person's name, the path's, the course's
   * (TAM-137).
   *
   * Resolved server-side per page, because an administrator reading a trail
   * needs to know *which* path was retired, and a uuid answers that for nobody.
   * Null when the row names no target, or when the target has since been
   * deleted — the id is still carried, so the entry stays traceable.
   */
  targetLabel: string | null;
  /**
   * Why a refusal happened, as an enumerated code (`AuditReason`).
   *
   * Lifted out of the detail payload and given its own field because it is the
   * one piece of detail almost every failure carries, and the one §4C.8 renders
   * as a sentence rather than as a labelled value.
   */
  reason: string | null;
  /**
   * The remaining structured detail, non-PII by construction (`AuditService`
   * accepts only enumerated reason codes and scalar values).
   *
   * **Opaque identifiers are stripped before it leaves the server** (TAM-137).
   * A uuid tells an administrator nothing the resolved `targetLabel` does not
   * tell them better, and a screen that prints `pathId=fa9f3562-…` is exposing
   * internals in place of information. What is left is counts, statuses,
   * changed-field names and the like — things that mean something read aloud.
   */
  detail: Record<string, string | number | boolean> | null;
}

export interface AdminAuditPage {
  rows: AdminAuditRow[];
  /** Cursor for the next page — the id to read before. Null at the end. */
  nextBefore: string | null;
  /** Every action that appears in the log, for the filter. */
  actions: string[];
}

/** System-wide reporting (§4C.8). Read-only, and exportable as CSV. */
export interface AdminReports {
  /** Learners at each stage, and the rate over those who committed. */
  journey: AdminJourneyCounts;
  /** Paths by how many learners chose them — "popular paths" in §4C.8. */
  pathPopularity: Array<{
    pathId: string;
    name: string;
    riasecLetter: RiasecLetter;
    chosen: number;
    completed: number;
  }>;
  /** Holland codes across the assessed population, newest result per person. */
  codeDistribution: AdminCodeShare[];
  /** Certificates issued, split by kind. */
  certificates: { course: number; path: number; total: number };
  /** Courses by pass rate, worst first — where learners are actually stuck. */
  courseOutcomes: Array<{
    courseId: string;
    title: string;
    enrolled: number;
    passed: number;
    passRate: number | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4C.8 — «الأثر»: participation and learning, by period and department
// (TAM-149)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A figure and the same figure over the previous period of equal length.
 *
 * **Growth is the impact question, so every count carries its comparison.**
 * A quarter's participation with nothing beside it is a number nobody can act
 * on: "four hundred employees assessed" is either the programme working or the
 * programme stalling depending entirely on what the previous quarter was.
 * Putting the delta in the contract rather than leaving the screen to subtract
 * two responses is what keeps the CSV, the printed sheet and the tiles agreeing.
 *
 * `delta` is `value - previous` — a real zero, never null: "no change" is an
 * answer, and the screen says it in words rather than as «٠».
 */
export interface AdminImpactCount {
  value: number;
  previous: number;
  delta: number;
}

/** The half-open range a figure was counted over, as ISO instants. */
export interface AdminImpactRange {
  from: string;
  to: string;
}

/**
 * Who took part (§4C.8's «المشاركة»).
 *
 * Every count is **people, de-duplicated** — one row per employee per figure,
 * whatever they did more than once. A retake is a correction, not a second
 * participant (D-033), and someone who passed six courses is one active learner.
 */
export interface AdminImpactParticipation {
  /** Accounts created *and verified*: an unverified account cannot sign in, so
   *  counting it as participation would overstate the programme's reach. */
  registered: AdminImpactCount;
  /** Employees who completed the assessment in the period. */
  assessed: AdminImpactCount;
  /** Employees who confirmed a path in the period (the commitment gate, §2). */
  committed: AdminImpactCount;
  /** Employees with a completion or any course progress written in the period. */
  active: AdminImpactCount;
  /**
   * Committed ÷ registered, as a percentage, **cumulative to the end of the
   * period** rather than over the period's own counts.
   *
   * A rate of "confirmed this quarter" over "registered this quarter" can
   * exceed 100% — someone who registered last year and committed this one is in
   * the numerator and not the denominator — which makes it not a rate at all.
   * The honest question is what share of the accounts that exist have committed
   * to a path, so both halves are counted to the same instant.
   *
   * Null over an empty denominator, as everywhere else: 0% of nobody reads as
   * failure rather than as "nobody has registered yet".
   *
   * **The denominator is accounts, not headcount.** The platform does not know
   * the ministry's workforce size; the screen says so on the tile. A
   * `MINISTRY_HEADCOUNT` setting could replace it later.
   */
  participationRate: number | null;
  /** The same rate at the end of the previous period, for the comparison. */
  previousParticipationRate: number | null;
  /** The rate's denominator — verified accounts to the end of the period. */
  accountsToDate: number;
}

/** One department's four participation counts, for the period. */
export interface AdminImpactDepartmentRow {
  department: string;
  registered: number;
  assessed: number;
  committed: number;
  active: number;
}

/**
 * What was actually completed (§4C.8's «التعلّم المُنجز»).
 *
 * Certificates are counted from `certificates.issued_at` rather than inferred:
 * issuance is idempotent (§2), so the row *is* the durable record that a course
 * or a whole path was finished, and a path certificate is one completed path.
 */
export interface AdminImpactLearning {
  coursesPassed: AdminImpactCount;
  /**
   * Minutes summed over the passed courses' `duration_minutes` (D-035).
   *
   * The duration is a product field an entity may leave unset, in which case
   * that pass contributes nothing — which would silently understate the total,
   * so the count of such passes travels beside it and the screen states it.
   */
  learningMinutes: AdminImpactCount;
  /** Passes in the period whose course carries no duration. */
  passesWithoutDuration: number;
  certificatesCourse: AdminImpactCount;
  /** Path certificates — one per completed path, so also "paths completed". */
  certificatesPath: AdminImpactCount;
}

/** One month of the trailing-twelve trend. `month` is `YYYY-MM`. */
export interface AdminImpactTrendPoint {
  month: string;
  coursesPassed: number;
  certificates: number;
}

/** A course by how many passed it in the period. */
export interface AdminImpactCourseRow {
  courseId: string;
  title: string;
  passes: number;
  /** Mean stored grade over those passes; null when none carried a grade. */
  averageGrade: number | null;
}

/** A path by how many finished it in the period. */
export interface AdminImpactPathRow {
  pathId: string;
  name: string;
  riasecLetter: RiasecLetter;
  completions: number;
}

/**
 * The career types of the people assessed *in the period*.
 *
 * The dominant letter, as §4C.1 reads it — six values each with an Arabic name
 * — and not the thirty-odd Holland codes §4C.8's other tab keeps for the
 * analyst. The catalogue half of `AdminLetterShare` is deliberately absent:
 * paths offered is a fact about now, and every other figure on this tab is a
 * fact about the period.
 */
export interface AdminImpactLetterShare {
  letter: RiasecLetter;
  employees: number;
}

/**
 * The language-level picture (TAM-148).
 *
 * Null until the level test ships — and null rather than an empty object so the
 * screen can tell "not enabled yet" from "enabled, nobody took it", which are
 * different findings and would otherwise render the same.
 */
export interface AdminImpactCefr {
  levels: Array<{ level: string; employees: number }>;
  /** Of employees who retook in the period: whose level rose, held, fell. */
  movement: { rose: number; held: number; fell: number };
}

/**
 * §4C.8's first tab — the ministry's view of what its employees enrolled in,
 * completed and learnt (TAM-149).
 *
 * The reports beside it answer "how is the system doing" with no time and no
 * department axis. This answers the question management actually asks: how many
 * of our people took part this quarter, in which directorates, what did they
 * complete, and is it growing.
 */
export interface AdminImpactView {
  period: AdminImpactRange;
  previousPeriod: AdminImpactRange;
  /** The department every figure is narrowed to, or null for all of them. */
  department: string | null;
  participation: AdminImpactParticipation;
  /** Every department with an account, whatever they did — a directorate that
   *  took no part is the finding, and a row that vanishes cannot be read. */
  byDepartment: AdminImpactDepartmentRow[];
  learning: AdminImpactLearning;
  /** The twelve months ending with the period's last month, oldest first. */
  trend: AdminImpactTrendPoint[];
  topCourses: AdminImpactCourseRow[];
  topPaths: AdminImpactPathRow[];
  letterDistribution: AdminImpactLetterShare[];
  cefr: AdminImpactCefr | null;
}
