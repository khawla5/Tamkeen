import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RIASEC_LETTERS } from '@tamkeen/types';

import { RIASEC_NAMES_AR } from './riasec-names';

/**
 * The drift guard for the one string table the API and the web app both hold.
 *
 * The API renders the CV PDF and cannot reach the Next.js message catalogue, so
 * it keeps its own copy of the six RIASEC names. Duplicated copy drifts — this
 * reads the catalogue off disk and fails the build the moment the two disagree,
 * which is the difference between a deliberate duplication and an accident
 * waiting to produce a CV that contradicts the results screen.
 *
 * It caught a real one immediately: the first version of the table had `C` as
 * "التقليدي" while the catalogue says "التنظيمي".
 */
const CATALOG = JSON.parse(
  readFileSync(join(__dirname, '../../../web/messages/ar.json'), 'utf8'),
) as { riasec: Record<string, { name: string }> };

describe('RIASEC_NAMES_AR', () => {
  it('matches the web message catalogue exactly', () => {
    const fromCatalog = Object.fromEntries(
      RIASEC_LETTERS.map((letter) => [letter, CATALOG.riasec[letter]?.name]),
    );

    expect(RIASEC_NAMES_AR).toEqual(fromCatalog);
  });

  it('covers every dimension, with nothing extra', () => {
    expect(Object.keys(RIASEC_NAMES_AR).sort()).toEqual([...RIASEC_LETTERS].sort());
  });

  it('is Arabic, since it prints untranslated on an English CV (D-050)', () => {
    for (const name of Object.values(RIASEC_NAMES_AR)) {
      expect(name).toMatch(/[؀-ۿ]/);
    }
  });
});
