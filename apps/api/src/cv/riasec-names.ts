import type { RiasecLetter } from '@tamkeen/types';

/**
 * The Arabic RIASEC type names, for documents the API renders.
 *
 * **Why the API has its own copy.** `riasec.ts` in `@tamkeen/types` is
 * deliberately free of Arabic copy — the letters and their canonical order are
 * domain facts, the names are user-facing text, and D-024 puts user-facing text
 * in the message catalogue. But the catalogue is a Next.js concern: the API
 * renders the CV PDF and has no access to it, exactly as it has no access to it
 * for the certificate template or the transactional emails, both of which carry
 * their Arabic inline for the same reason.
 *
 * **The duplication is guarded rather than tolerated.** A test asserts these
 * six strings match `apps/web/messages/ar.json` character for character, so the
 * copy cannot drift into a CV that disagrees with the results screen that
 * announced it.
 *
 * They appear on an English CV untranslated, per D-050: RIASEC type names are
 * among the proper nouns that pass through as authored.
 */
export const RIASEC_NAMES_AR: Record<RiasecLetter, string> = {
  R: 'الواقعي',
  I: 'البحثي',
  A: 'الفني',
  S: 'الاجتماعي',
  E: 'المبادِر',
  C: 'التنظيمي',
};
