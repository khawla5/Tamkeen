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
  'settings',
  'templates',
  'audit',
] as const;

export type NavIconName = (typeof NAV_ICONS)[number];

export interface NavItem {
  /** Key into the `nav` message namespace — labels are never hardcoded. */
  key: string;
  href: string;
  icon: NavIconName;
}

/**
 * The steady-state navigation (CLAUDE.md §4): six items, no more. The assessment
 * is a contextual flow page and deliberately absent — it is something a learner
 * does once per path, not a place they go.
 *
 * Which subset a learner sees depends on where they are; the shell renders
 * whatever list it is handed.
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
 * The navigation a learner actually sees, given where they are (§4.2, D-134).
 *
 * Two rules are at work. The first is D-071's, restated for the assigned model:
 * an employee with no path has exactly one thing to see, and a browsable
 * catalogue competes with it — so Dashboard and Profile are the whole nav until
 * the ministry assigns them something.
 *
 * The second is ours: **a nav item appears only once the page behind it has
 * something to show.** My Path and Courses both do the moment a path is
 * assigned, even before the assessment has placed them — the path page is where
 * they go to sit it. Certificates and the CV appear with them, deliberately:
 * the gallery has a real empty state that says how the first certificate
 * arrives, which is more useful than a menu item that materialises one day
 * without explanation.
 */
export function navForState(state: DashboardState): readonly NavItem[] {
  const keys: string[] =
    state === 'NO_PATH'
      ? ['dashboard', 'profile']
      : ['dashboard', 'courses', 'myPath', 'certificates', 'cv', 'profile'];

  return STEADY_STATE_NAV.filter((item) => keys.includes(item.key));
}

/**
 * Whether `href` is the page itself or a section the page is nested in —
 * segment-aware, so `/entity` covers `/entity/learners` but not `/entityx`.
 */
export function navPathMatches(pathname: string, href: string): boolean {
  const current = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const target = href.length > 1 ? href.replace(/\/+$/, '') : href;

  if (current === target) return true;
  if (target === '/') return false;

  return current.startsWith(`${target}/`);
}

/**
 * The one rail item that is active for `pathname` (TAM-140): the **longest**
 * matching href wins.
 *
 * A dashboard is the root of its portal (`/`, `/entity`, `/admin`), so by
 * plain prefix it matched every page — the bug — and an exact-match special
 * case for `/` alone had simply never learned about `/entity`. Longest match
 * needs no special case: the dashboard wins only on its own page, a nested page
 * (`/entity/courses/abc/content`) belongs to its section, and exactly one item
 * is ever active.
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;

  for (const href of hrefs) {
    if (navPathMatches(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }

  return best;
}
