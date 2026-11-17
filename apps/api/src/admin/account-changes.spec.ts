import { refuseDeletion, refuseStatusChange, type AccountChangeFacts } from './account-changes';

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

describe('refuseDeletion', () => {
  it('allows deleting an ordinary account that holds no certificate', () => {
    expect(refuseDeletion(facts(), 0)).toBeNull();
  });

  it('refuses an administrator deleting themselves', () => {
    expect(refuseDeletion(facts({ targetId: 'same', actorId: 'same' }), 0)?.code).toBe(
      'CANNOT_MODIFY_SELF',
    );
  });

  it('refuses deleting the last active administrator', () => {
    expect(
      refuseDeletion(facts({ currentRole: 'SUPER_ADMIN', isOnlyActiveAdmin: true }), 0)?.code,
    ).toBe('LAST_ACTIVE_ADMIN');
  });

  it('allows deleting an administrator while another stays active', () => {
    expect(
      refuseDeletion(facts({ currentRole: 'SUPER_ADMIN', isOnlyActiveAdmin: false }), 0),
    ).toBeNull();
  });

  it('refuses an account that holds certificates — deleting would erase them', () => {
    /* A certificate cascades with its holder, and a third party can still verify
       it: suspending is the operation that fits. */
    expect(refuseDeletion(facts(), 2)?.code).toBe('ACCOUNT_HOLDS_CERTIFICATES');
  });

  it('puts the lockouts ahead of the certificate rule', () => {
    expect(refuseDeletion(facts({ targetId: 'same', actorId: 'same' }), 3)?.code).toBe(
      'CANNOT_MODIFY_SELF',
    );
  });
});
