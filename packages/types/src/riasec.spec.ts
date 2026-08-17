import { describe, expect, it } from 'vitest';

import {
  HOLLAND_CODE_LENGTH,
  RIASEC_LETTERS,
  buildRiasecProfile,
  deriveHollandCode,
  emptyRiasecScores,
  isRecommended,
  isRiasecLetter,
  rankDimensions,
  rankPathsByRecommendation,
  recommendationRankOf,
  type RiasecLetter,
  type RiasecScores,
} from './riasec';

/**
 * §2B: "RIASEC scoring must have explicit test cases covering ties, a clear
 * top-three, and the gold-matching + ranking logic — this is core product
 * correctness."
 *
 * These are the tests that clause is asking for. They are deliberately literal
 * about the tie rule, because a tie is the one case where a plausible-looking
 * implementation can be non-deterministic and still pass a casual test.
 */

const scores = (partial: Partial<RiasecScores>): RiasecScores => ({
  ...emptyRiasecScores(),
  ...partial,
});

const path = (id: string, riasecLetter: RiasecLetter, displayOrder: number) => ({
  id,
  riasecLetter,
  displayOrder,
});

describe('RIASEC vocabulary', () => {
  it('has the six dimensions in canonical Holland order', () => {
    expect(RIASEC_LETTERS).toEqual(['R', 'I', 'A', 'S', 'E', 'C']);
  });

  it('recognises only the six letters', () => {
    for (const letter of RIASEC_LETTERS) {
      expect(isRiasecLetter(letter)).toBe(true);
    }

    for (const value of ['r', 'X', '', 'RI', 3, null, undefined]) {
      expect(isRiasecLetter(value)).toBe(false);
    }
  });

  it('starts every dimension at zero, with none missing', () => {
    expect(Object.keys(emptyRiasecScores()).sort()).toEqual([...RIASEC_LETTERS].sort());
    expect(Object.values(emptyRiasecScores())).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('rankDimensions — a clear top-three', () => {
  const profile = buildRiasecProfile(scores({ S: 18, I: 15, A: 12, E: 9, C: 6, R: 3 }), 20);

  it('orders all six dimensions, highest first', () => {
    expect(profile.ranked.map((entry) => entry.letter)).toEqual(['S', 'I', 'A', 'E', 'C', 'R']);
  });

  it('ranks 1…6 with no shared or skipped ranks', () => {
    expect(profile.ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('derives the Holland Code from the top three, in rank order', () => {
    expect(profile.code).toEqual(['S', 'I', 'A']);
    expect(profile.codeString).toBe('SIA');
    expect(profile.code).toHaveLength(HOLLAND_CODE_LENGTH);
  });

  it('keeps all six scores, not just the code (§3A)', () => {
    /* The full profile is what orders gold recommendations and what lets the
       result be re-explained later; storing only the code would lose both. */
    expect(profile.scores).toEqual(scores({ S: 18, I: 15, A: 12, E: 9, C: 6, R: 3 }));
  });

  it('expresses each dimension as a percentage of the attainable maximum', () => {
    expect(profile.ranked[0]).toMatchObject({ letter: 'S', score: 18, percent: 90 });
    expect(profile.ranked[5]).toMatchObject({ letter: 'R', score: 3, percent: 15 });
  });

  it('reports 0% rather than NaN when nothing is attainable', () => {
    const degenerate = buildRiasecProfile(emptyRiasecScores(), 0);

    expect(degenerate.ranked.every((entry) => entry.percent === 0)).toBe(true);
  });
});

describe('rankDimensions — ties', () => {
  it('breaks a tie by canonical R-I-A-S-E-C order', () => {
    /* C and R are tied at 10. Canonical order puts R before C, regardless of
       which was seen first. */
    const ranked = rankDimensions(scores({ C: 10, R: 10, S: 4 }), 20);

    expect(ranked.map((entry) => entry.letter)).toEqual(['R', 'C', 'S', 'I', 'A', 'E']);
  });

  it('produces the same code no matter what order the scores are built in', () => {
    /*
     * The regression this guards: if ties fell through to Array.sort's handling
     * of equal elements, the code would depend on the order rows came back from
     * the database — so the same answers could yield a different career
     * recommendation on a different day.
     */
    const forward: RiasecScores = { R: 12, I: 12, A: 12, S: 12, E: 12, C: 12 };
    const reversed: RiasecScores = { C: 12, E: 12, S: 12, A: 12, I: 12, R: 12 };

    expect(buildRiasecProfile(forward, 20).codeString).toBe('RIA');
    expect(buildRiasecProfile(reversed, 20).codeString).toBe('RIA');
  });

  it('resolves a tie that straddles the third and fourth positions', () => {
    /* A, S and E all sit at 9; only two of them can enter the code. Canonical
       order decides which, deterministically. */
    const profile = buildRiasecProfile(scores({ I: 16, A: 9, S: 9, E: 9, R: 2, C: 1 }), 20);

    expect(profile.codeString).toBe('IAS');
    expect(profile.ranked[3]!.letter).toBe('E');
  });

  it('still produces a three-letter code when every score is zero', () => {
    /* An unanswerable edge case in practice, but it must not produce an empty
       or partial code that downstream recommendation logic would misread. */
    const profile = buildRiasecProfile(emptyRiasecScores(), 20);

    expect(profile.code).toHaveLength(3);
    expect(profile.codeString).toBe('RIA');
  });

  it('derives the code from an already-ranked profile without re-sorting', () => {
    const ranked = rankDimensions(scores({ E: 20, C: 14, R: 7 }), 20);

    expect(deriveHollandCode(ranked)).toEqual(['E', 'C', 'R']);
  });
});

describe('gold matching (§3A recommendation rule)', () => {
  const code: RiasecLetter[] = ['S', 'I', 'A'];

  it('marks a path gold when its letter is anywhere in the top three', () => {
    expect(isRecommended('S', code)).toBe(true);
    expect(isRecommended('I', code)).toBe(true);
    expect(isRecommended('A', code)).toBe(true);
  });

  it('does not mark a path gold when its letter is outside the code', () => {
    expect(isRecommended('R', code)).toBe(false);
    expect(isRecommended('E', code)).toBe(false);
    expect(isRecommended('C', code)).toBe(false);
  });

  it('reports the position of the letter, so gold paths can be ordered', () => {
    expect(recommendationRankOf('S', code)).toBe(0);
    expect(recommendationRankOf('I', code)).toBe(1);
    expect(recommendationRankOf('A', code)).toBe(2);
    expect(recommendationRankOf('E', code)).toBeNull();
  });

  it('marks nothing gold before the assessment has been taken', () => {
    for (const letter of RIASEC_LETTERS) {
      expect(isRecommended(letter, [])).toBe(false);
    }
  });
});

describe('rankPathsByRecommendation', () => {
  const code: RiasecLetter[] = ['S', 'I', 'A'];

  const paths = [
    path('p-e', 'E', 1),
    path('p-a', 'A', 2),
    path('p-s2', 'S', 4),
    path('p-r', 'R', 3),
    path('p-i', 'I', 5),
    path('p-s1', 'S', 0),
    path('p-c', 'C', 6),
  ];

  const ranked = rankPathsByRecommendation(paths, code);

  it('sorts gold paths by the user’s letter order, #1 letter first', () => {
    expect(ranked.slice(0, 4).map((entry) => entry.path.id)).toEqual([
      'p-s1', // S — user's #1 letter, lower displayOrder
      'p-s2', // S — user's #1 letter
      'p-i', //  I — user's #2 letter
      'p-a', //  A — user's #3 letter
    ]);
  });

  it('places every non-recommended path after every recommended one', () => {
    const firstNonGold = ranked.findIndex((entry) => !entry.recommended);

    expect(ranked.slice(0, firstNonGold).every((entry) => entry.recommended)).toBe(true);
    expect(ranked.slice(firstNonGold).some((entry) => entry.recommended)).toBe(false);
  });

  it('keeps non-recommended paths in curated order', () => {
    expect(ranked.filter((entry) => !entry.recommended).map((entry) => entry.path.id)).toEqual([
      'p-e',
      'p-r',
      'p-c',
    ]);
  });

  it('returns every path — gold is a highlight, never a filter (§3A)', () => {
    /* "Gold = recommendation, not restriction." Dropping a non-matching path
       here would turn the recommendation into a gate without anyone deciding to. */
    expect(ranked).toHaveLength(paths.length);
    expect(new Set(ranked.map((entry) => entry.path.id))).toEqual(
      new Set(paths.map((entry) => entry.id)),
    );
  });

  it('exposes the rank alongside the flag, for both styling and ordering', () => {
    const byId = new Map(ranked.map((entry) => [entry.path.id, entry]));

    expect(byId.get('p-s1')).toMatchObject({ recommended: true, recommendationRank: 0 });
    expect(byId.get('p-i')).toMatchObject({ recommended: true, recommendationRank: 1 });
    expect(byId.get('p-c')).toMatchObject({ recommended: false, recommendationRank: null });
  });

  it('falls back to curated order for everything when there is no code', () => {
    const unassessed = rankPathsByRecommendation(paths, []);

    expect(unassessed.map((entry) => entry.path.id)).toEqual([
      'p-s1',
      'p-e',
      'p-a',
      'p-r',
      'p-s2',
      'p-i',
      'p-c',
    ]);
    expect(unassessed.every((entry) => !entry.recommended)).toBe(true);
  });

  it('is a total order — identical input in any sequence gives identical output', () => {
    const shuffled = [...paths].reverse();

    expect(rankPathsByRecommendation(shuffled, code).map((entry) => entry.path.id)).toEqual(
      ranked.map((entry) => entry.path.id),
    );
  });

  it('does not mutate the array it was given', () => {
    const original = paths.map((entry) => entry.id);
    rankPathsByRecommendation(paths, code);

    expect(paths.map((entry) => entry.id)).toEqual(original);
  });
});
