import type { DashboardState } from '@tamkeen/types';

/**
 * Navigation descriptors.
 *
 * `icon` is a *name*, not a component. The shell is a Server Component and the
 * nav is a Client Component, so anything crossing that boundary must be
 * serializable — passing a Lucide component directly fails the build with
 * "Functions cannot be passed directly to Client Components". The client side
 * maps these names onto real icons.
 */
export const NAV_ICONS = [
  'dashboard',
  'courses',
  'myPath',
  'certificates',
  'cv',
  'profile',
  /* Phase 4 — the entity portal's Learners/Review destination (§4B.5). */
  'learners',
  /* Phase 5 — the super-admin portal's own destinations (§4C). */
  'assessment',
] as const;

export type NavIconName = (typeof NAV_ICONS)[number];

export interface NavItem {
  /** Key into the `nav` message namespace — labels are never hardcoded. */
  key: string;
  href: string;
  icon: NavIconName;
}

/**
 * The steady-state navigation (CLAUDE.md §4): six items, no more. Assessment and
 * Results are contextual flow pages and deliberately absent — they are not
 * permanent destinations.
 *
 * Which subset a user actually sees depends on their progress (§4.2 shows only
 * Dashboard, Courses and Profile before the assessment). That gating is Phase 1
 * work; the shell here renders whatever list it is handed.
 */
export const STEADY_STATE_NAV: readonly NavItem[] = [
  { key: 'dashboard', href: '/', icon: 'dashboard' },
  { key: 'courses', href: '/courses', icon: 'courses' },
  { key: 'myPath', href: '/my-path', icon: 'myPath' },
  { key: 'certificates', href: '/certificates', icon: 'certificates' },
  { key: 'cv', href: '/cv', icon: 'cv' },
  { key: 'profile', href: '/profile', icon: 'profile' },
];

/**
 * The navigation a user actually sees, given where they are (§4.2).
 *
 * Two rules are at work. §4.2 states the first outright: before the assessment
 * the nav is Dashboard, Courses and Profile only — My Path is not a destination
 * when there is no path.
 *
 * The second is ours: **a nav item appears only once the page behind it
 * exists.** An item leading to a 404, or to a page explaining that the feature
 * is not built, is worse than its absence — it advertises something the product
 * cannot do and costs a click to find out. Certificates and the CV both have
 * pages behind them now that Phase 3 has built them, which closes D-037.
 *
 * Certificates is shown to a learner with an active path even before they have
 * earned one, deliberately. The gallery has a real empty state that says how
 * the first certificate arrives, which is more useful than a menu item that
 * materialises one day without explanation.
 */
export function navForState(state: DashboardState): readonly NavItem[] {
  const keys: string[] =
    state === 'ACTIVE_PATH'
      ? ['dashboard', 'courses', 'myPath', 'certificates', 'cv', 'profile']
      : ['dashboard', 'courses', 'profile'];

  return STEADY_STATE_NAV.filter((item) => keys.includes(item.key));
}
