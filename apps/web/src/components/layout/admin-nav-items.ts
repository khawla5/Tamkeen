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
  { key: 'adminUsers', href: '/admin/users', icon: 'learners' },
  { key: 'adminAssessment', href: '/admin/assessment', icon: 'assessment' },
  /* §4C.9 — the English placement test, beside the career assessment rather
     than inside it. They are two instruments an administrator edits separately
     (D-124), and folding one into the other's page would hide it. Nine items
     now; §3's six-item rule governs the *learner's* nav, and §4C's own note
     already explains why an administrator's surface is the whole product. */
  { key: 'adminEnglish', href: '/admin/english', icon: 'assessment' },
  /* §4C.3's Assignments tab (TAM-147) — who is handed which instrument or
     named group, and whether it is required. Its own destination rather than
     a tab inside Assessment or English: it assigns across both instruments,
     so nesting it in either page would misname what it does. */
  { key: 'adminAssignments', href: '/admin/assignments', icon: 'assessment' },
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
