import type { RiasecLetter } from './riasec';

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
