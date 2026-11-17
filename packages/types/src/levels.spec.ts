import { describe, expect, it } from 'vitest';

import {
  checkBands,
  defaultPlacementBands,
  placeScore,
  type LevelRef,
  type PlacementBand,
} from './levels';

/**
 * Placement is the most consequential calculation in the product — it decides
 * where a person's training starts — so every band edge is asserted, not
 * sampled. Acceptance criterion 9 of the D-134 spec is this file.
 */

const levels = (count: number): LevelRef[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `level-${index + 1}`,
    name: `المستوى ${index + 1}`,
    position: index + 1,
  }));

describe('defaultPlacementBands', () => {
  it('splits the range evenly when it divides', () => {
    /* 0…11 is twelve attainable totals across three levels: four each. */
    expect(defaultPlacementBands(levels(3), 11)).toEqual<PlacementBand[]>([
      { levelId: 'level-1', minScore: 0, maxScore: 3 },
      { levelId: 'level-2', minScore: 4, maxScore: 7 },
      { levelId: 'level-3', minScore: 8, maxScore: 11 },
    ]);
  });

  it('gives the remainder to the lower levels, so a boundary places conservatively', () => {
    /* 0…10 is eleven totals across three levels: 4, 4, 3. */
    expect(defaultPlacementBands(levels(3), 10)).toEqual<PlacementBand[]>([
      { levelId: 'level-1', minScore: 0, maxScore: 3 },
      { levelId: 'level-2', minScore: 4, maxScore: 7 },
      { levelId: 'level-3', minScore: 8, maxScore: 10 },
    ]);
  });

  it('covers the whole range with no gap and no overlap, for every size up to forty', () => {
    for (let levelCount = 1; levelCount <= 8; levelCount += 1) {
      /* Only where a partition exists at all: a ladder longer than the number of
         attainable scores has none, and that case is asserted separately. */
      for (let maxScore = levelCount - 1; maxScore <= 40; maxScore += 1) {
        const path = levels(levelCount);
        const bands = defaultPlacementBands(path, maxScore);

        expect(checkBands(bands, path, maxScore)).toEqual([]);

        for (let score = 0; score <= maxScore; score += 1) {
          expect(placeScore(score, bands)).not.toBeNull();
        }
      }
    }
  });

  it('is ordered by level position, whatever order the levels arrive in', () => {
    const shuffled = [levels(3)[2], levels(3)[0], levels(3)[1]];

    expect(defaultPlacementBands(shuffled, 11).map((band) => band.levelId)).toEqual([
      'level-1',
      'level-2',
      'level-3',
    ]);
  });

  it('returns nothing for a path with no levels, rather than inventing a band', () => {
    expect(defaultPlacementBands([], 30)).toEqual([]);
  });

  it('leaves a level unbanded rather than inverted when there are more levels than scores', () => {
    /* Three levels, one attainable total: no partition exists. The first level
       takes it and the other two are reported uncovered, which an administrator
       can act on — an inverted or shared range would place nobody and say
       nothing. */
    const path = levels(3);
    const bands = defaultPlacementBands(path, 0);

    expect(bands).toEqual([{ levelId: 'level-1', minScore: 0, maxScore: 0 }]);
    expect(checkBands(bands, path, 0)).toEqual([
      { kind: 'MISSING_LEVEL', levelId: 'level-2' },
      { kind: 'MISSING_LEVEL', levelId: 'level-3' },
    ]);
  });
});

describe('placeScore', () => {
  const path = levels(3);
  const bands = defaultPlacementBands(path, 11);

  it('places every boundary score on the band that owns it', () => {
    /* Both bounds are inclusive, so each edge is asserted from both sides. */
    expect(placeScore(0, bands)).toBe('level-1');
    expect(placeScore(3, bands)).toBe('level-1');
    expect(placeScore(4, bands)).toBe('level-2');
    expect(placeScore(7, bands)).toBe('level-2');
    expect(placeScore(8, bands)).toBe('level-3');
    expect(placeScore(11, bands)).toBe('level-3');
  });

  it('refuses to guess for a score no band covers', () => {
    expect(placeScore(12, bands)).toBeNull();
    expect(placeScore(-1, bands)).toBeNull();
  });

  it('honours an authored table that is not an even split', () => {
    const authored: PlacementBand[] = [
      { levelId: 'level-1', minScore: 0, maxScore: 20 },
      { levelId: 'level-2', minScore: 21, maxScore: 24 },
      { levelId: 'level-3', minScore: 25, maxScore: 30 },
    ];

    expect(placeScore(20, authored)).toBe('level-1');
    expect(placeScore(21, authored)).toBe('level-2');
    expect(placeScore(24, authored)).toBe('level-2');
    expect(placeScore(25, authored)).toBe('level-3');
  });
});

describe('checkBands', () => {
  const path = levels(3);

  it('accepts an exact partition', () => {
    expect(checkBands(defaultPlacementBands(path, 30), path, 30)).toEqual([]);
  });

  it('reports a gap between two bands', () => {
    const problems = checkBands(
      [
        { levelId: 'level-1', minScore: 0, maxScore: 9 },
        { levelId: 'level-2', minScore: 12, maxScore: 20 },
        { levelId: 'level-3', minScore: 21, maxScore: 30 },
      ],
      path,
      30,
    );

    expect(problems).toContainEqual({ kind: 'GAP', from: 10, to: 11 });
  });

  it('reports a gap at the top when the bands stop short of the maximum', () => {
    const problems = checkBands(
      [
        { levelId: 'level-1', minScore: 0, maxScore: 9 },
        { levelId: 'level-2', minScore: 10, maxScore: 19 },
        { levelId: 'level-3', minScore: 20, maxScore: 25 },
      ],
      path,
      30,
    );

    expect(problems).toContainEqual({ kind: 'GAP', from: 26, to: 30 });
  });

  it('reports an overlap', () => {
    const problems = checkBands(
      [
        { levelId: 'level-1', minScore: 0, maxScore: 15 },
        { levelId: 'level-2', minScore: 10, maxScore: 20 },
        { levelId: 'level-3', minScore: 21, maxScore: 30 },
      ],
      path,
      30,
    );

    expect(problems).toContainEqual({ kind: 'OVERLAP', at: 10 });
  });

  it('reports a level with no band, and a band naming no level', () => {
    const problems = checkBands(
      [
        { levelId: 'level-1', minScore: 0, maxScore: 15 },
        { levelId: 'level-9', minScore: 16, maxScore: 30 },
      ],
      path,
      30,
    );

    expect(problems).toContainEqual({ kind: 'MISSING_LEVEL', levelId: 'level-2' });
    expect(problems).toContainEqual({ kind: 'MISSING_LEVEL', levelId: 'level-3' });
    expect(problems).toContainEqual({ kind: 'UNKNOWN_LEVEL', levelId: 'level-9' });
  });

  it('reports an inverted band', () => {
    const problems = checkBands(
      [
        { levelId: 'level-1', minScore: 0, maxScore: 9 },
        { levelId: 'level-2', minScore: 20, maxScore: 10 },
        { levelId: 'level-3', minScore: 21, maxScore: 30 },
      ],
      path,
      30,
    );

    expect(problems).toContainEqual({ kind: 'INVERTED', levelId: 'level-2' });
  });

  it('says a path with no levels cannot band anything', () => {
    expect(checkBands([], [], 30)).toEqual([{ kind: 'NO_LEVELS' }]);
  });
});
