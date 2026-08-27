/**
 * A registration-policy-conforming employee id: exactly 10 digits, the
 * default `EMPLOYEE_ID_PATTERN` (D-017). Deterministic per (run, label) so a
 * suite's cross-references agree, and derived from the random run id so
 * parallel runs and leftover dev data do not collide.
 */
export function numericEmployeeId(runId: string, label: string): string {
  let hash = 0;
  for (const ch of `${runId}:${label}`) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return String(hash).padStart(10, '0');
}
