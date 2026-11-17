import {
  checkBands,
  defaultPlacementBands,
  type LevelRef,
  type PlacementBand,
} from '@tamkeen/types';

import { maxAttainableScore } from '../assessment/scoring';

/**
 * Whether a proposed version of a path's assessment may be published (§4C.3,
 * D-134).
 *
 * The rule that dominates it is the one a plausible-looking edit can get
 * silently wrong: **the band table must be a partition of the attainable score
 * range.** That is the configurable placement rule §4C.3 gives the
 * administrator, and both failure modes are invisible from the editor — a gap
 * and a learner cannot be placed at all, an overlap and the rung they land on
 * depends on which row was read first.
 *
 * **A path with no bands is not broken.** With none configured, placement falls
 * back to the even split (`defaultPlacementBands`), which is the spec's stated
 * default. So an empty table is checked against that split rather than reported
 * as missing — otherwise every new path would be unpublishable until somebody
 * typed a table by hand.
 *
 * Pure, and computed over the *proposed* bank rather than the stored one, so the
 * publish endpoint and the editor's live panel give the same answer without
 * either owning the rule.
 */

export const BANK_BLOCKER = {
  /** No questions at all: nothing to score. */
  NO_QUESTIONS: 'BANK_NO_QUESTIONS',
  /** A question with fewer than two options is not a multiple-choice question. */
  QUESTION_WITHOUT_OPTIONS: 'BANK_QUESTION_WITHOUT_OPTIONS',
  /** A question nobody can score: no option is marked correct. */
  NO_CORRECT_OPTION: 'BANK_NO_CORRECT_OPTION',
  /** Two correct options: what the item is worth stops being a single fact. */
  MULTIPLE_CORRECT_OPTIONS: 'BANK_MULTIPLE_CORRECT_OPTIONS',
  /** A question worth nothing (or negative) cannot move the score. */
  NON_POSITIVE_MARKS: 'BANK_NON_POSITIVE_MARKS',
  /** Fewer attainable marks than there are rungs to tell apart. */
  TOO_FEW_MARKS: 'BANK_TOO_FEW_MARKS',
  /** The path has no levels, so there is nothing to place anybody on. */
  NO_LEVELS: 'BANK_NO_LEVELS',
  /** A band whose floor is above its ceiling. */
  BAND_RANGE_INVALID: 'BANK_BAND_RANGE_INVALID',
  /** A gap or an overlap, or a rung no band names. */
  BANDS_NOT_A_PARTITION: 'BANK_BANDS_NOT_A_PARTITION',
} as const;

export const BANK_WARNING = {
  /** Some rung has no question aimed at it. */
  LEVEL_WITHOUT_QUESTION: 'BANK_LEVEL_WITHOUT_QUESTION',
} as const;

export type BankBlockerCode = (typeof BANK_BLOCKER)[keyof typeof BANK_BLOCKER];
export type BankWarningCode = (typeof BANK_WARNING)[keyof typeof BANK_WARNING];

/** A question as the editor holds it, before it is scorable. */
export interface DraftQuestion {
  id: string;
  displayOrder: number;
  marks: number;
  levelId: string | null;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface BankReadiness {
  blockers: BankBlockerCode[];
  warnings: BankWarningCode[];
  /** The highest attainable total — what the band table must cover. */
  maxScore: number;
  /** Level ids with no question aimed at them, in path order. */
  levelsWithoutQuestion: string[];
  /** True when the bands partition `0 … maxScore` exactly. */
  bandsCoverRange: boolean;
}

export function assessBank(
  questions: readonly DraftQuestion[],
  bands: readonly PlacementBand[],
  levels: readonly LevelRef[],
): BankReadiness {
  const ordered = [...questions].sort((a, b) => a.displayOrder - b.displayOrder);
  const maxScore = maxAttainableScore(ordered);

  const blockers: BankBlockerCode[] = [];

  if (ordered.length === 0) {
    blockers.push(BANK_BLOCKER.NO_QUESTIONS);
  }

  if (ordered.some((question) => question.options.length < 2)) {
    blockers.push(BANK_BLOCKER.QUESTION_WITHOUT_OPTIONS);
  }

  const correctCounts = ordered.map(
    (question) => question.options.filter((option) => option.isCorrect).length,
  );

  if (correctCounts.some((count) => count === 0)) {
    blockers.push(BANK_BLOCKER.NO_CORRECT_OPTION);
  }
  if (correctCounts.some((count) => count > 1)) {
    blockers.push(BANK_BLOCKER.MULTIPLE_CORRECT_OPTIONS);
  }
  if (ordered.some((question) => question.marks < 1)) {
    blockers.push(BANK_BLOCKER.NON_POSITIVE_MARKS);
  }

  if (levels.length === 0) {
    blockers.push(BANK_BLOCKER.NO_LEVELS);
  } else if (maxScore + 1 < levels.length) {
    /*
     * Expressed over **attainable marks, not question count**: a count-based
     * floor has no opinion about a bank whose items are worth different amounts,
     * and this rule has to hold for one item worth thirty as well as for thirty
     * worth one. `n` rungs need `n` distinct integers, and `0 … maxScore` holds
     * `maxScore + 1` of them.
     *
     * Whether the bank is *enough of an instrument* is a content judgement the
     * ministry makes, not a rule this file can state. What it can state is when
     * the arithmetic makes the placement impossible.
     */
    blockers.push(BANK_BLOCKER.TOO_FEW_MARKS);
  }

  if (bands.some((band) => band.minScore > band.maxScore)) {
    blockers.push(BANK_BLOCKER.BAND_RANGE_INVALID);
  }

  /* An empty table means the even split, which is what placement will actually
     use — so that is what is checked, rather than reporting a table that is
     deliberately absent as missing. */
  const effective = bands.length > 0 ? bands : defaultPlacementBands(levels, maxScore);
  const problems = levels.length === 0 ? [] : checkBands(effective, levels, maxScore);
  const bandsCoverRange = problems.length === 0;

  if (levels.length > 0 && !bandsCoverRange) {
    blockers.push(BANK_BLOCKER.BANDS_NOT_A_PARTITION);
  }

  const aimedAt = new Set(ordered.map((question) => question.levelId).filter(Boolean));
  const levelsWithoutQuestion = levels
    .filter((level) => !aimedAt.has(level.id))
    .map((level) => level.id);

  return {
    blockers,
    warnings: levelsWithoutQuestion.length > 0 ? [BANK_WARNING.LEVEL_WITHOUT_QUESTION] : [],
    maxScore,
    levelsWithoutQuestion,
    bandsCoverRange,
  };
}
