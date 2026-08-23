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

/** One bar of the Holland-code distribution (§4C.1). */
export interface AdminCodeShare {
  code: string;
  count: number;
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
  /** Ordered by count, descending. Empty until somebody has been assessed. */
  codeDistribution: AdminCodeShare[];
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
 * One product knob (§4C.6, D-072).
 *
 * `value` is the effective one — the stored override, or the environment's
 * default when nothing is stored. `isOverridden` is what tells the two apart,
 * and it is what makes "reset to default" an honest offer rather than a button
 * that sometimes does nothing.
 */
export interface AdminSetting {
  key: string;
  value: string;
  isOverridden: boolean;
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
