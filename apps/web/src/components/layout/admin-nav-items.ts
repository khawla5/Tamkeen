import type { NavItem } from './nav-items';

/**
 * The super-admin portal's navigation (CLAUDE.md §4C): eight items.
 *
 * More than the six §3 recommends for a steady state, and deliberately so —
 * §4C names eight destinations and each is a distinct thing the ministry
 * administers, not a view of another. §3's rule exists to stop a *learner* being
 * shown places they cannot act on; an administrator's job is the whole surface,
 * and folding Settings into Assessment or Templates into Certificates would hide
 * the control rather than simplify it.
 *
 * A third separate list rather than a filtered union of the other two, on the
 * same reasoning as `ENTITY_NAV`: the three portals share no destination, so a
 * shared list would imply a relationship that does not exist.
 *
 * Every item lands on a page that exists. Sub-phases 5.2-5.8 add them in order,
 * and an item is added here in the sub-phase that builds its page — never
 * earlier, because a nav item leading to a 404 advertises what the product
 * cannot do (the rule `navForState` follows for the learner portal).
 */
export const ADMIN_NAV: readonly NavItem[] = [
  { key: 'adminDashboard', href: '/admin', icon: 'dashboard' },
  /* Directly under the dashboard: «how many of our people took part, and is it
     growing» is the question the ministry opens the portal with, so it sits
     beside the overview rather than inside the audit page (§4C.8). */
  { key: 'adminImpact', href: '/admin/impact', icon: 'impact' },
  { key: 'adminUsers', href: '/admin/users', icon: 'learners' },
  /* One item for every instrument (D-133): /admin/assessment lists the
     assessments, and each opens its own editor beneath it. The editors stay
     separate pages (D-124's two-instrument discipline); only the shelf is
     shared. Assignment lives in «الحسابات» (the manage-account panel), not
     here — who may take is an account decision, what is asked is content. */
  { key: 'adminAssessment', href: '/admin/assessment', icon: 'assessment' },
  { key: 'adminPaths', href: '/admin/paths', icon: 'myPath' },
  { key: 'adminCourses', href: '/admin/courses', icon: 'courses' },
  { key: 'adminTemplates', href: '/admin/templates', icon: 'templates' },
  { key: 'adminAudit', href: '/admin/audit', icon: 'audit' },
  /* Last, at the ministry's direction (TAM-135). It is also where it belongs:
     the items above are the ministry's day-to-day work, and settings is the
     configuration behind them — a destination you go to deliberately, not one
     you pass through. */
  { key: 'adminSettings', href: '/admin/settings', icon: 'settings' },
];
