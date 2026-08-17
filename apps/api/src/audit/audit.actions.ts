/**
 * Audit action codes (§2 security baseline).
 *
 * Stable string constants rather than a Prisma enum, so a later phase can append
 * an action without a schema migration. Naming is `DOMAIN_THING_PAST_TENSE`:
 * the log records what *happened*, not what was attempted.
 *
 * When adding an action in a later phase: add the constant here, and log it from
 * the service that performs the change — never from a controller, so the entry
 * cannot be bypassed by a second caller of the same logic.
 */
export const AuditAction = {
  // Authentication
  AUTH_REGISTERED: 'AUTH_REGISTERED',
  AUTH_REGISTRATION_REJECTED: 'AUTH_REGISTRATION_REJECTED',
  AUTH_EMAIL_VERIFIED: 'AUTH_EMAIL_VERIFIED',
  AUTH_LOGIN_SUCCEEDED: 'AUTH_LOGIN_SUCCEEDED',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_LOGGED_OUT: 'AUTH_LOGGED_OUT',
  AUTH_PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_COMPLETED: 'AUTH_PASSWORD_RESET_COMPLETED',

  // Authorization
  AUTHZ_DENIED: 'AUTHZ_DENIED',
} as const;

export type AuditActionCode = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Reason codes for failures. Kept as an enumeration so the audit trail is
 * queryable and so no free-text — which could carry PII — reaches the log.
 */
export const AuditReason = {
  UNKNOWN_EMAIL: 'UNKNOWN_EMAIL',
  BAD_PASSWORD: 'BAD_PASSWORD',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  DOMAIN_NOT_ALLOWED: 'DOMAIN_NOT_ALLOWED',
  EMPLOYEE_ID_INVALID: 'EMPLOYEE_ID_INVALID',
  SELF_REGISTRATION_DISABLED: 'SELF_REGISTRATION_DISABLED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMPLOYEE_ID_ALREADY_REGISTERED: 'EMPLOYEE_ID_ALREADY_REGISTERED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
} as const;

export type AuditReasonCode = (typeof AuditReason)[keyof typeof AuditReason];
