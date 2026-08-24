import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AuditReason, type AuditReasonCode } from '../audit/audit.actions';

export interface RegistrationPolicyConfig {
  mode: 'restricted' | 'admin-only';
  allowedDomains: readonly string[];
  employeeIdPattern: string;
  passwordMinLength: number;
}

export interface RegistrationCandidate {
  email: string;
  employeeId: string;
  password: string;
}

export type PolicyRejection = { reason: AuditReasonCode; message: string };

/**
 * The ministry-domain half of the gate, on its own.
 *
 * Extracted because changing an existing account's address has to clear the
 * same bar (§4.12) and must not clear a *different* one: an employee who could
 * move a ministry account to a personal inbox would defeat D-017 one profile
 * edit at a time. Two copies of this rule would drift, and the drift would be
 * silent — the registration form would still refuse what the profile allowed.
 *
 * The rest of the gate deliberately does not carry over. `admin-only` governs
 * whether somebody may create an account, not whether an employee who already
 * has one may correct a typo in their address; and the employee number is not
 * being changed.
 */
export function checkEmailDomain(
  email: string,
  allowedDomains: readonly string[],
): PolicyRejection | null {
  const domain = email.split('@')[1]?.toLowerCase();

  /* An empty allow-list would silently turn restricted mode into open sign-up,
     which is precisely what D-017 forbids — so treat it as closed, not open. */
  if (!domain || allowedDomains.length === 0 || !allowedDomains.includes(domain)) {
    return { reason: AuditReason.DOMAIN_NOT_ALLOWED, message: 'EMAIL_DOMAIN_NOT_ALLOWED' };
  }

  return null;
}

/**
 * The restricted-registration gate (D-017).
 *
 * Pure logic, deliberately separated from the service so the policy can be
 * exhaustively tested without a database. **This is not open sign-up:** in
 * `admin-only` mode self-registration is refused outright, and in `restricted`
 * mode an applicant must present both a ministry email domain and a
 * well-formed employee number.
 *
 * What this cannot do is verify that an employee number is *real* — only that it
 * is plausibly shaped. Genuine verification requires either a ministry roster to
 * check against or `admin-only` provisioning; that choice is the ministry's, and
 * the mode switch exists for it.
 */
export function checkRegistrationPolicy(
  candidate: RegistrationCandidate,
  config: RegistrationPolicyConfig,
): PolicyRejection | null {
  if (config.mode === 'admin-only') {
    return {
      reason: AuditReason.SELF_REGISTRATION_DISABLED,
      message: 'SELF_REGISTRATION_DISABLED',
    };
  }

  const domainRejection = checkEmailDomain(candidate.email, config.allowedDomains);
  if (domainRejection) {
    return domainRejection;
  }

  let employeeIdMatches: boolean;
  try {
    employeeIdMatches = new RegExp(config.employeeIdPattern).test(candidate.employeeId);
  } catch {
    /* A misconfigured pattern must fail closed. Letting everyone through
       because an operator typed a bad regex is the wrong direction to fail. */
    employeeIdMatches = false;
  }

  if (!employeeIdMatches) {
    return { reason: AuditReason.EMPLOYEE_ID_INVALID, message: 'EMPLOYEE_ID_INVALID' };
  }

  if (candidate.password.length < config.passwordMinLength) {
    return { reason: AuditReason.EMPLOYEE_ID_INVALID, message: 'PASSWORD_TOO_SHORT' };
  }

  return null;
}

/**
 * Maps a rejection to the HTTP error the client sees.
 *
 * Note these messages are *codes*, not prose: the Arabic wording lives in the
 * frontend message catalogue (D-024), so the API never returns user-facing text.
 */
export function rejectionToException(rejection: PolicyRejection): Error {
  if (rejection.reason === AuditReason.SELF_REGISTRATION_DISABLED) {
    return new ForbiddenException(rejection.message);
  }
  return new BadRequestException(rejection.message);
}
