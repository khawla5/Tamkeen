/**
 * @tamkeen/types — shared domain types between apps/web and apps/api.
 *
 * Keep this package free of runtime dependencies and of framework code. It
 * exists so the frontend and backend cannot drift on the shapes that cross the
 * API boundary (§2A).
 */

export * from './roles';
export * from './locale';
export * from './format';

/* Phase 1 — the RIASEC domain and the product contracts built on it. */
export * from './riasec';
export * from './assessment';
export * from './catalog';
export * from './journey';

/* The English (CEFR) placement test — a sibling instrument, sharing no type
   with the RIASEC one (§4.13, D-123). */
export * from './english-assessment';

/* Typed instruments and assignment — the framework RIASEC and CEFR both sit
   in now (TAM-147). */
export * from './assessment-assignment';

/* Phase 3 — certificates and the CV. */
export * from './certificates';
export * from './notifications';
export * from './cv';
export * from './cv-document';

/* Phase 4 — the entity / reviewer portal. */
export * from './entity';

/* Phase 5 — the super-admin portal. */
export * from './admin';

/* The audit vocabulary (§2, §4C.8) — shared so the Arabic copy can be
   asserted against it (TAM-137). */
export * from './audit';

/* CSV, shared so the audit export can be written in the browser — where the
   Arabic copy is — against the same quoting and BOM rules the reports export
   uses server-side (TAM-138). */
export * from './csv';
