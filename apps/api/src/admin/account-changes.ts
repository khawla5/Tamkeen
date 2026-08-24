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
  /**
   * Whether the target holds learner data — an assessment result, a path, or a
   * certificate. Only meaningful for an EMPLOYEE.
   */
  holdsJourneyData: boolean;
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

/** Whether the role change is allowed. */
export function refuseRoleChange(
  facts: AccountChangeFacts,
  next: UserRole,
  entityId: string | null,
): AccountChangeRefusal | null {
  if (next === facts.currentRole && facts.currentRole !== 'ENTITY') {
    /* A no-op, and worth refusing rather than silently accepting: an audit entry
       claiming a role changed when it did not is worse than an error. ENTITY is
       excluded because re-issuing the same role with a different organisation is
       a real change — moving an account between suppliers. */
    return { reason: AuditReason.ROLE_UNCHANGED, code: 'ROLE_UNCHANGED' };
  }

  if (facts.targetId === facts.actorId) {
    /* Including a promotion. There is no legitimate reason to change your own
       role, and allowing it upward makes every downward guard optional. */
    return { reason: AuditReason.SELF_MODIFICATION_REFUSED, code: 'CANNOT_MODIFY_SELF' };
  }

  if (facts.currentRole === 'SUPER_ADMIN' && facts.isOnlyActiveAdmin) {
    return { reason: AuditReason.LAST_ACTIVE_ADMIN, code: 'LAST_ACTIVE_ADMIN' };
  }

  if (next === 'ENTITY' && !entityId) {
    /* `EntityScopeService` fails closed on an ENTITY with no organisation, so
       this would create an account that can sign in and then see nothing, with
       no way to tell whether that is a permission bug or a provisioning one. */
    return { reason: AuditReason.ENTITY_REQUIRED, code: 'ENTITY_REQUIRED' };
  }

  if (next !== 'ENTITY' && entityId) {
    return { reason: AuditReason.ENTITY_NOT_ALLOWED, code: 'ENTITY_NOT_ALLOWED' };
  }

  if (facts.currentRole === 'EMPLOYEE' && next !== 'EMPLOYEE' && facts.holdsJourneyData) {
    /*
     * Converting a learner strands what they earned. Their path, result and
     * certificates all survive — `user_paths.pathId` is Restrict and
     * certificates are immutable — but every screen that reads them is
     * `@Roles('EMPLOYEE')`, so the person can no longer reach their own record
     * while their certificate stays publicly verifiable in their name.
     *
     * The ministry case this looks like — an employee seconded to run a
     * supplier's account — is properly served by a second account, not by
     * converting the one that holds their training history.
     */
    return { reason: AuditReason.JOURNEY_WOULD_BE_ORPHANED, code: 'JOURNEY_WOULD_BE_ORPHANED' };
  }

  return null;
}
