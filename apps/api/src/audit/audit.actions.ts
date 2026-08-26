/**
 * The audit vocabulary, re-exported.
 *
 * **The definitions moved to `@tamkeen/types` (TAM-137)** so §4C.8's Arabic copy
 * can be asserted against them — three action codes and every reason code had
 * no translation and reached the ministry as raw `AUTH_PASSWORD_CHANGED`, and
 * nothing on the web side could enumerate the codes to notice. Re-exported from
 * here so the fifty-odd call sites that import from this path are unaffected;
 * the reasoning and the per-code comments travel with the constants.
 */
export {
  AUDIT_TARGET_TYPES,
  AuditAction,
  AuditReason,
  type AuditActionCode,
  type AuditReasonCode,
  type AuditTargetType,
} from '@tamkeen/types';
