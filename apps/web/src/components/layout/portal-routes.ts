import type { UserRole } from '@tamkeen/types';

/**
 * Where each role's portal begins (D-065, D-075).
 *
 * **One map, four readers**: the sign-in page routes to it, and each of the
 * three providers uses it to return a caller who does not belong to them. That
 * matters more than it looks. Before Phase 5 the same knowledge was spread
 * across three files as a pair of `role === 'EMPLOYEE'` branches, and every one
 * of them was written when only two portals existed — so a `SUPER_ADMIN` fell
 * through every "not an employee" test into `/entity`, a real destination
 * belonging to somebody else. A `Record<UserRole, …>` makes adding a fourth role
 * a typecheck failure at each site instead of a silent default.
 *
 * These redirects are courtesies, never controls. The API refuses every
 * cross-portal read on its own and audits the attempt (D-062); this only saves a
 * mis-routed person from a permission error they cannot act on.
 */
export const HOME_FOR_ROLE: Record<UserRole, string> = {
  EMPLOYEE: '/',
  ENTITY: '/entity',
  SUPER_ADMIN: '/admin',
};
