/**
 * Levels, and the rule that decides which one a score places a learner at
 * (D-134).
 *
 * The whole file is pure. Placement is the single most consequential
 * calculation in the product — it decides where a person's training starts —
 * and §2B requires it enforced identically on both sides of the API, so it
 * lives here rather than in a service where only one of them could reach it.
 */

/** A level as every surface refers to it: which rung, and what it is called. */
export interface LevelRef {
  id: string;
  name: string;
  /** 1-based and contiguous within its path. */
  position: number;
}

/**
 * One band of a path's assessment: the score range that lands on a level.
 *
 * **Both bounds are inclusive.** These are typed and read by a human — "45 to
 * 56" is what an administrator means — and a half-open range in the editor
 * would put an off-by-one between what they entered and where a learner landed.
 */
export interface PlacementBand {
  levelId: string;
  minScore: number;
  maxScore: number;
}

/**
 * The default rule for a path whose bands nobody has configured: split
 * `0 … maxScore` as evenly as the integers allow, in level order.
 *
 * Stated as a function rather than left to the reader because "evenly" has an
 * off-by-one in it. With a remainder, the **lower** levels take the extra mark
 * each, which is the conservative direction: a learner on a boundary is placed
 * lower and covers ground they may not need, rather than placed higher and sent
 * past material they do.
 *
 * **A level with no room gets no band, deliberately.** A path with more levels
 * than attainable scores has no partition — an eleven-mark test cannot separate
 * twelve rungs — and the only alternatives are an inverted range or two levels
 * sharing a score. Emitting nothing lets `checkBands` report the level as
 * uncovered, which is the truth and is something an administrator can fix by
 * lengthening the bank or shortening the ladder.
 *
 * Returns an empty list for a path with no levels — there is nothing to place
 * anyone at, and inventing a band would hide that from the administrator.
 */
export function defaultPlacementBands(
  levels: readonly LevelRef[],
  maxScore: number,
): PlacementBand[] {
  const ordered = [...levels].sort((a, b) => a.position - b.position);

  if (ordered.length === 0) {
    return [];
  }

  /* `maxScore + 1` because both bounds are inclusive: a test out of 10 has
     eleven attainable totals, 0 through 10, and splitting 10 would lose one. */
  const slots = Math.max(maxScore, 0) + 1;
  const base = Math.floor(slots / ordered.length);
  const remainder = slots % ordered.length;

  const bands: PlacementBand[] = [];
  let cursor = 0;

  ordered.forEach((level, index) => {
    const size = base + (index < remainder ? 1 : 0);

    if (size === 0) {
      return;
    }

    bands.push({ levelId: level.id, minScore: cursor, maxScore: cursor + size - 1 });
    cursor += size;
  });

  return bands;
}

/**
 * Which level a score falls in, or null when the bands cannot answer.
 *
 * Null rather than a guess. A score outside every band means the band table and
 * the bank disagree about what is attainable, and placing somebody anyway would
 * turn a configuration error into a person starting in the wrong place.
 */
export function placeScore(score: number, bands: readonly PlacementBand[]): string | null {
  const hit = bands.find((band) => score >= band.minScore && score <= band.maxScore);

  return hit?.levelId ?? null;
}

/** Why a band table is not usable, in the order an administrator should fix them. */
export type BandProblem =
  | { kind: 'NO_LEVELS' }
  | { kind: 'MISSING_LEVEL'; levelId: string }
  | { kind: 'UNKNOWN_LEVEL'; levelId: string }
  | { kind: 'INVERTED'; levelId: string }
  | { kind: 'GAP'; from: number; to: number }
  | { kind: 'OVERLAP'; at: number };

/**
 * Whether a band table partitions `0 … maxScore` across exactly the path's
 * levels, with no gap and no overlap.
 *
 * The partition is the point. A gap is a score that places nobody; an overlap is
 * a score that places somebody in two levels and lets the order of a database
 * read decide which. Both are silent in production and obvious here.
 */
export function checkBands(
  bands: readonly PlacementBand[],
  levels: readonly LevelRef[],
  maxScore: number,
): BandProblem[] {
  if (levels.length === 0) {
    return [{ kind: 'NO_LEVELS' }];
  }

  const problems: BandProblem[] = [];
  const known = new Set(levels.map((level) => level.id));
  const covered = new Set(bands.map((band) => band.levelId));

  for (const level of levels) {
    if (!covered.has(level.id)) {
      problems.push({ kind: 'MISSING_LEVEL', levelId: level.id });
    }
  }

  for (const band of bands) {
    if (!known.has(band.levelId)) {
      problems.push({ kind: 'UNKNOWN_LEVEL', levelId: band.levelId });
    }
    if (band.minScore > band.maxScore) {
      problems.push({ kind: 'INVERTED', levelId: band.levelId });
    }
  }

  const ordered = [...bands].sort((a, b) => a.minScore - b.minScore);
  let expected = 0;

  for (const band of ordered) {
    if (band.minScore > expected) {
      problems.push({ kind: 'GAP', from: expected, to: band.minScore - 1 });
    } else if (band.minScore < expected) {
      problems.push({ kind: 'OVERLAP', at: band.minScore });
    }

    expected = Math.max(expected, band.maxScore + 1);
  }

  if (expected <= maxScore) {
    problems.push({ kind: 'GAP', from: expected, to: maxScore });
  }

  return problems;
}
