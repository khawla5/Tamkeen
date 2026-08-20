import type { NavItem } from './nav-items';

/**
 * The entity portal's navigation (CLAUDE.md §4B): four items, no more.
 *
 * Deliberately a separate list from `STEADY_STATE_NAV` rather than a filtered
 * view of it. The two portals share no destination — an entity has no
 * dashboard-with-a-path, no certificates, no CV — so expressing this as a subset
 * would imply a relationship that does not exist and would break the moment
 * either list changed.
 *
 * There is no "add a course" nav item: creating one is the single primary action
 * on the dashboard and on My Courses (§3), not a fifth destination.
 */
export const ENTITY_NAV: readonly NavItem[] = [
  { key: 'entityDashboard', href: '/entity', icon: 'dashboard' },
  { key: 'entityCourses', href: '/entity/courses', icon: 'courses' },
  { key: 'entityLearners', href: '/entity/learners', icon: 'learners' },
  { key: 'entityProfile', href: '/entity/profile', icon: 'profile' },
];
