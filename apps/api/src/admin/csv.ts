/**
 * The CSV writer, re-exported.
 *
 * **The implementation moved to `@tamkeen/types` (TAM-138)** so the audit
 * export can be rendered in the browser — where §4C.8's Arabic copy lives —
 * without a second copy of the quoting rules. Those rules are not cosmetic:
 * they carry the BOM Excel needs to read Arabic at all, and the formula-injection
 * guard. Two implementations of that is one too many.
 *
 * Re-exported from here so the reports export and its tests are unaffected.
 */
export { CSV_CONTENT_TYPE, toCsv } from '@tamkeen/types';
