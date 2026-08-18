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
 * The second is ours: **Certificates and CV are omitted entirely until Phase 3
 * builds them.** A nav item leading to a 404, or to a page explaining that the
 * feature does not exist, is worse than its absence — it advertises something
 * the product cannot do and costs the user a click to find out.
 */
export function navForState(state: DashboardState): readonly NavItem[] {
  const keys: string[] =
    state === 'ACTIVE_PATH'
      ? ['dashboard', 'courses', 'myPath', 'profile']
      : ['dashboard', 'courses', 'profile'];

  return STEADY_STATE_NAV.filter((item) => keys.includes(item.key));
}
