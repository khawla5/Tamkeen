import { describe, expect, it } from 'vitest';

import { USER_ROLES } from '@tamkeen/types';

import { HOME_FOR_ROLE } from './portal-routes';

/**
 * Every role has a portal, and no two share one (D-065, D-075).
 *
 * This is a small file to have a test at all, and it exists because of a bug the
 * type system could not see. Before Phase 5 the routing lived as three separate
 * `role === 'EMPLOYEE'` checks written when only two portals existed. Each read
 * correctly on its own; together they sent a `SUPER_ADMIN` into `/entity`,
 * because "not an employee" was the same as "an entity" right up until it was
 * not. The assertions below are the property those branches were assuming.
 */
describe('HOME_FOR_ROLE', () => {
  it('covers every role the system defines', () => {
    /* A role added later without a home would fall through to `undefined`,
       and `router.replace(undefined)` is a blank screen, not an error. */
    for (const role of USER_ROLES) {
      expect(HOME_FOR_ROLE[role]).toMatch(/^\//);
    }
  });

  it('gives each role a distinct destination', () => {
    const homes = USER_ROLES.map((role) => HOME_FOR_ROLE[role]);

    /* Two roles sharing a home is the exact shape of the bug: it looks like
       routing and behaves like a permission error a moment later. */
    expect(new Set(homes).size).toBe(USER_ROLES.length);
  });

  it('sends a super-admin to the admin portal, not the entity one', () => {
    expect(HOME_FOR_ROLE.SUPER_ADMIN).toBe('/admin');
  });
});
