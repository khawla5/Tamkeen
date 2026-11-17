import type { UserRole } from '@tamkeen/types';

import { AuditReason, type AuditReasonCode } from '../audit/audit.actions';

/**
 * The changes an administrator may not make to an account (§4C.2).
 *
 * Pure logic over facts the service gathers first, deliberately separated from
 * the database in the same shape as `checkRegistrationPolicy` and
 * `publishBlockers`. Two reasons, and neither is tidiness:
 *
 *  1. Every refusal here is a **lockout or an integrity failure**, which are
 *     precisely the cases that are hard to reach from an integration test and
 *     catastrophic in production. Being able to enumerate them exhaustively over
 *     plain objects is what makes them provable.
 *  2. The rules must hold for *any* caller of the service, including a script or
 *     a future screen, so they cannot live in a controller.
 *
 * **The two lockouts are not the same failure.** Refusing self-modification
 * stops an administrator suspending themselves mid-session; refusing to remove
 * the last active administrator stops the ministry losing the portal entirely,
 * which no amount of care by an individual prevents — two admins can each
 * legitimately demote the other, one after the other, and nobody has done
 * anything wrong.
 */

export interface AccountChangeFacts {
  /** The account being changed. */
  targetId: string;
  /** The administrator making the change. */
  actorId: string;
  currentRole: UserRole;
  /** True when the target is the only ACTIVE SUPER_ADMIN in the system. */
  isOnlyActiveAdmin: boolean;
}

export interface AccountChangeRefusal {
  reason: AuditReasonCode;
  /** The error code returned to the client; the Arabic copy is the web's. */
  code: string;
}

/**
 * Whether the status change is allowed.
 *
 * Reactivating is never refused: an account that is already suspended cannot be
 * the last *active* administrator, and restoring access is the corrective action
 * for every mistake this file prevents.
 */
export function refuseStatusChange(
  facts: AccountChangeFacts,
  next: 'ACTIVE' | 'SUSPENDED',
): AccountChangeRefusal | null {
  if (next === 'ACTIVE') {
    return null;
  }

  if (facts.targetId === facts.actorId) {
    /* Suspending yourself ends your own session on the next request, so the
       screen you would use to undo it is the screen you just lost. */
    return { reason: AuditReason.SELF_MODIFICATION_REFUSED, code: 'CANNOT_MODIFY_SELF' };
  }

  if (facts.isOnlyActiveAdmin) {
    return { reason: AuditReason.LAST_ACTIVE_ADMIN, code: 'LAST_ACTIVE_ADMIN' };
  }

  return null;
}

/**
 * Whether the account may be deleted outright.
 *
 * Three refusals, and each is a different kind of harm. **Yourself**: the session
 * that is deleting it dies with it, and the screen you would undo it from goes
 * too. **The last active administrator**: the ministry loses the portal, which is
 * unrecoverable without database access. **A holder of certificates**: they
 * cascade with the account, so deleting would silently erase a credential somebody
 * can still present and a third party can still verify — suspending is the
 * operation that fits an account that must stop working but whose record must
 * stand.
 */
export function refuseDeletion(
  facts: AccountChangeFacts,
  certificateCount: number,
): AccountChangeRefusal | null {
  if (facts.targetId === facts.actorId) {
    return { reason: AuditReason.SELF_MODIFICATION_REFUSED, code: 'CANNOT_MODIFY_SELF' };
  }

  if (facts.isOnlyActiveAdmin) {
    return { reason: AuditReason.LAST_ACTIVE_ADMIN, code: 'LAST_ACTIVE_ADMIN' };
  }

  if (certificateCount > 0) {
    return { reason: AuditReason.ACCOUNT_HOLDS_CERTIFICATES, code: 'ACCOUNT_HOLDS_CERTIFICATES' };
  }

  return null;
}
