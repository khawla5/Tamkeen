import { refuseRoleChange, refuseStatusChange, type AccountChangeFacts } from './account-changes';

/**
 * The changes an administrator may not make (§4C.2).
 *
 * Every rule here prevents either a **lockout** or an **orphaned record**, and
 * both are cases an integration test reaches only by arranging the disaster
 * first. Over plain objects they can be enumerated exhaustively, which is the
 * point of the guards being pure.
 */

function facts(overrides: Partial<AccountChangeFacts> = {}): AccountChangeFacts {
  return {
    targetId: 'target',
    actorId: 'actor',
    currentRole: 'EMPLOYEE',
    isOnlyActiveAdmin: false,
    holdsJourneyData: false,
    ...overrides,
  };
}

describe('refuseStatusChange', () => {
  it('allows suspending an ordinary account', () => {
    expect(refuseStatusChange(facts(), 'SUSPENDED')).toBeNull();
  });

  it('refuses an administrator suspending themselves', () => {
    /* The session ends on the next request, so the screen that would undo it is
       the screen they just lost. */
    expect(refuseStatusChange(facts({ targetId: 'same', actorId: 'same' }), 'SUSPENDED')).toEqual({
      reason: 'SELF_MODIFICATION_REFUSED',
      code: 'CANNOT_MODIFY_SELF',
    });
  });

  it('refuses suspending the last active administrator', () => {
    /* Not the same failure as self-suspension: two administrators can each
       suspend the other, one after the other, and neither has done anything
       wrong — but the ministry has lost the portal. */
    expect(
      refuseStatusChange(
        facts({ currentRole: 'SUPER_ADMIN', isOnlyActiveAdmin: true }),
        'SUSPENDED',
      ),
    ).toEqual({ reason: 'LAST_ACTIVE_ADMIN', code: 'LAST_ACTIVE_ADMIN' });
  });

  it('allows suspending an administrator while another remains active', () => {
    expect(
      refuseStatusChange(
        facts({ currentRole: 'SUPER_ADMIN', isOnlyActiveAdmin: false }),
        'SUSPENDED',
      ),
    ).toBeNull();
  });

  it('never refuses a reactivation, even of oneself', () => {
    /* Restoring access is the corrective action for every mistake this file
       prevents, so it must not itself be preventable. */
    expect(
      refuseStatusChange(
        facts({ targetId: 'same', actorId: 'same', currentRole: 'SUPER_ADMIN' }),
        'ACTIVE',
      ),
    ).toBeNull();
  });
});

describe('refuseRoleChange', () => {
  it('allows promoting an employee who has no journey data', () => {
    expect(refuseRoleChange(facts(), 'SUPER_ADMIN', null)).toBeNull();
  });

  it('refuses an administrator changing their own role, even upward', () => {
    expect(
      refuseRoleChange(facts({ targetId: 'same', actorId: 'same' }), 'SUPER_ADMIN', null),
    ).toMatchObject({ code: 'CANNOT_MODIFY_SELF' });
  });

  it('refuses demoting the last active administrator', () => {
    expect(
      refuseRoleChange(
        facts({ currentRole: 'SUPER_ADMIN', isOnlyActiveAdmin: true }),
        'EMPLOYEE',
        null,
      ),
    ).toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
  });

  it('refuses an entity account with no organisation to act for', () => {
    /* EntityScopeService fails closed on this, so the account would sign in and
       see nothing, with no way to tell a permission bug from a provisioning one. */
    expect(refuseRoleChange(facts(), 'ENTITY', null)).toMatchObject({ code: 'ENTITY_REQUIRED' });
  });

  it('refuses an organisation on a role that cannot belong to one', () => {
    expect(refuseRoleChange(facts(), 'SUPER_ADMIN', 'entity-a')).toMatchObject({
      code: 'ENTITY_NOT_ALLOWED',
    });
  });

  it('allows moving an entity account between organisations', () => {
    /* Same role, different organisation — a real change, which is why ENTITY is
       excluded from the no-op refusal below. */
    expect(refuseRoleChange(facts({ currentRole: 'ENTITY' }), 'ENTITY', 'entity-b')).toBeNull();
  });

  it('refuses a role change that is not a change', () => {
    expect(refuseRoleChange(facts({ currentRole: 'EMPLOYEE' }), 'EMPLOYEE', null)).toMatchObject({
      code: 'ROLE_UNCHANGED',
    });
  });

  it('refuses converting a learner who holds a result, a path or a certificate', () => {
    /*
     * Their record survives — user_paths.pathId is Restrict and certificates are
     * immutable — but every screen that reads it is @Roles('EMPLOYEE'), so the
     * person could no longer reach their own training history while their
     * certificate stayed publicly verifiable in their name.
     */
    expect(refuseRoleChange(facts({ holdsJourneyData: true }), 'ENTITY', 'entity-a')).toMatchObject(
      { code: 'JOURNEY_WOULD_BE_ORPHANED' },
    );
  });

  it('allows converting a learner who never started', () => {
    expect(refuseRoleChange(facts({ holdsJourneyData: false }), 'ENTITY', 'entity-a')).toBeNull();
  });

  it('does not apply the journey rule to a non-employee', () => {
    /* An entity account cannot accumulate journey data — the learner endpoints
       refuse it — so the rule would only ever fire on stale rows from before a
       previous conversion, and refusing there would trap the account. */
    expect(
      refuseRoleChange(facts({ currentRole: 'ENTITY', holdsJourneyData: true }), 'EMPLOYEE', null),
    ).toBeNull();
  });

  it('checks self-modification before the last-admin rule', () => {
    /* Both apply when the only administrator demotes themselves. The message
       should name the thing they can actually change about their request. */
    expect(
      refuseRoleChange(
        facts({
          targetId: 'same',
          actorId: 'same',
          currentRole: 'SUPER_ADMIN',
          isOnlyActiveAdmin: true,
        }),
        'EMPLOYEE',
        null,
      ),
    ).toMatchObject({ code: 'CANNOT_MODIFY_SELF' });
  });
});
