import { CEFR_LEVELS, type CefrBand, type CefrLevel, type EnglishSkill } from '@tamkeen/types';

import { maxAttainableScore, sortBandsByLevel } from '../english-assessment/english-scoring';

/**
 * Whether a proposed English version may be published (§4C.9, D-124).
 *
 * **The sibling of `bank-readiness.ts`, and deliberately not a reuse of it.**
 * Holland's gate is dominated by one rule — the six dimensions must attain the
 * same maximum (D-032/D-074) — because its ranking compares raw scores *across*
 * dimensions, so an unbalanced bank makes every Holland Code an artefact of how
 * the bank was authored.
 *
 * **English has no dimensions and therefore nothing to balance.** Its score is a
 * single ascending total, and one item being "worth more" than another is not a
 * skew, it is difficulty weighting doing its job. Importing the balance guard
 * here would be applying a correctness rule to a model it says nothing about;
 * `isBalancedBank` and `assessBank` are not referenced by this file and are not
 * modified by it.
 *
 * What takes its place is the rule English actually has: **the band table must
 * be a partition of the attainable score range.** That is the configurable
 * scoring rule §4C.9 gives the administrator, and it is the one place a
 * plausible-looking edit can produce an instrument that is silently wrong —
 * a gap and a learner cannot be scored at all, an overlap and the level they are
 * told depends on which row was read first.
 *
 * Pure, and computed over the *proposed* bank rather than the stored one, so the
 * publish endpoint and the editor's live panel give the same answer without
 * either owning the rule.
 */

export const ENGLISH_BANK_BLOCKER = {
  /** A question with fewer than two options is not a multiple-choice question. */
  QUESTION_WITHOUT_OPTIONS: 'ENGLISH_BANK_QUESTION_WITHOUT_OPTIONS',
  /** A question nobody can score: no option is marked correct. */
  NO_CORRECT_OPTION: 'ENGLISH_BANK_NO_CORRECT_OPTION',
  /** Two correct options: what the item is worth stops being a single fact. */
  MULTIPLE_CORRECT_OPTIONS: 'ENGLISH_BANK_MULTIPLE_CORRECT_OPTIONS',
  /** A question worth nothing (or negative) cannot move the score. */
  NON_POSITIVE_MARKS: 'ENGLISH_BANK_NON_POSITIVE_MARKS',
  /** Fewer attainable marks than there are levels to tell apart. */
  TOO_FEW_MARKS: 'ENGLISH_BANK_TOO_FEW_MARKS',
  /** The band table does not name all six CEFR levels exactly once. */
  BANDS_INCOMPLETE: 'ENGLISH_BANK_BANDS_INCOMPLETE',
  /** A band whose floor is above its ceiling. */
  BAND_RANGE_INVALID: 'ENGLISH_BANK_BAND_RANGE_INVALID',
  /** A gap or an overlap between consecutive bands. */
  BANDS_NOT_CONTIGUOUS: 'ENGLISH_BANK_BANDS_NOT_CONTIGUOUS',
  /** The bands do not run from 0 to the highest attainable total. */
  BANDS_DO_NOT_COVER_RANGE: 'ENGLISH_BANK_BANDS_DO_NOT_COVER_RANGE',
} as const;

export const ENGLISH_BANK_WARNING = {
  /** Some CEFR level has no question targeting it. */
  LEVEL_WITHOUT_QUESTION: 'ENGLISH_BANK_LEVEL_WITHOUT_QUESTION',
} as const;

export type EnglishBankBlockerCode =
  (typeof ENGLISH_BANK_BLOCKER)[keyof typeof ENGLISH_BANK_BLOCKER];
export type EnglishBankWarningCode =
  (typeof ENGLISH_BANK_WARNING)[keyof typeof ENGLISH_BANK_WARNING];

/**
 * The fewest marks six bands can partition.
 *
 * Expressed over **attainable marks, not question count** — the same choice
 * D-074 made for Holland, and for the same reason: a count-based floor has no
 * opinion about a bank whose items are worth different amounts, and this rule
 * has to hold for one item worth thirty as well as for thirty worth one. Six
 * levels need six distinct integers, and the range `0 … maxScore` holds
 * `maxScore + 1` of them, so the floor is five.
 *
 * Whether thirty items is *enough of an instrument* is a content judgement the
 * ministry makes, not a rule this file can state. What it can state is when the
 * arithmetic makes a six-level placement impossible.
 */
export const MIN_ENGLISH_ATTAINABLE_MARKS = CEFR_LEVELS.length - 1;

/** A question as the editor holds it, before it is scorable. */
export interface DraftEnglishQuestion {
  id: string;
  displayOrder: number;
  marks: number;
  level: CefrLevel;
  skill: EnglishSkill;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface EnglishBankReadiness {
  /** Refusals. Publishing with any of these is impossible. */
  blockers: EnglishBankBlockerCode[];
  /** Advisory. Publishing proceeds; the editor says so first. */
  warnings: EnglishBankWarningCode[];
  /** The highest attainable total — what the band table must cover. */
  maxScore: number;
  /** Levels with no question targeting them, in CEFR order. */
  levelsWithoutQuestion: CefrLevel[];
  /** True when the bands partition `0 … maxScore` exactly. */
  bandsCoverRange: boolean;
}

export function assessEnglishBank(
  questions: readonly DraftEnglishQuestion[],
  bands: readonly CefrBand[],
): EnglishBankReadiness {
  const ordered = [...questions].sort((a, b) => a.displayOrder - b.displayOrder);
  const maxScore = maxAttainableScore(ordered);

  const blockers: EnglishBankBlockerCode[] = [];

  if (ordered.some((question) => question.options.length < 2)) {
    blockers.push(ENGLISH_BANK_BLOCKER.QUESTION_WITHOUT_OPTIONS);
  }

  const correctCounts = ordered.map(
    (question) => question.options.filter((option) => option.isCorrect).length,
  );

  if (correctCounts.some((count) => count === 0)) {
    blockers.push(ENGLISH_BANK_BLOCKER.NO_CORRECT_OPTION);
  }

  if (correctCounts.some((count) => count > 1)) {
    blockers.push(ENGLISH_BANK_BLOCKER.MULTIPLE_CORRECT_OPTIONS);
  }

  if (ordered.some((question) => question.marks < 1)) {
    blockers.push(ENGLISH_BANK_BLOCKER.NON_POSITIVE_MARKS);
  }

  if (maxScore < MIN_ENGLISH_ATTAINABLE_MARKS) {
    blockers.push(ENGLISH_BANK_BLOCKER.TOO_FEW_MARKS);
  }

  const bandsCoverRange = checkBands(bands, maxScore, blockers);

  /*
   * A level with no item targeting it is a warning, not a refusal — the same
   * severity call D-074 makes for Holland's adjacency rule, and for a
   * comparable reason. It is a real quality problem: a bank with no C1 or C2
   * item cannot distinguish a strong candidate from a very strong one, so it
   * systematically under-places the people the ministry most wants to identify.
   * But it is a judgement about *content coverage*, and an administrator may
   * have a defensible reason to accept it — a pilot aimed at one part of the
   * range, or a bank being grown one level at a time. Refusing it would make the
   * legal destination unreachable while the bank is under construction, which is
   * the rule people learn to route around.
   */
  const targeted = new Set(ordered.map((question) => question.level));
  const levelsWithoutQuestion = CEFR_LEVELS.filter((level) => !targeted.has(level));

  const warnings: EnglishBankWarningCode[] = [];
  if (levelsWithoutQuestion.length > 0) {
    warnings.push(ENGLISH_BANK_WARNING.LEVEL_WITHOUT_QUESTION);
  }

  return { blockers, warnings, maxScore, levelsWithoutQuestion, bandsCoverRange };
}

/**
 * Walks the band table once, in ascending CEFR order, and reports every way it
 * fails to partition `0 … maxScore`.
 *
 * One walk rather than four separate checks, because the properties are not
 * independent: "starts at 0", "no gaps", "no overlaps" and "ends at maxScore"
 * are the same traversal asking different questions, and computing them apart
 * would let them disagree about which band was at fault.
 *
 * Ordering is taken from the CEFR scale, not from the numbers — a table where B1
 * sits below A2 is not "sorted differently", it is wrong, and sorting by
 * `minScore` first would silently accept it.
 */
function checkBands(
  bands: readonly CefrBand[],
  maxScore: number,
  blockers: EnglishBankBlockerCode[],
): boolean {
  const levels = bands.map((band) => band.level);
  const complete =
    bands.length === CEFR_LEVELS.length &&
    CEFR_LEVELS.every((level) => levels.filter((candidate) => candidate === level).length === 1);

  if (!complete) {
    blockers.push(ENGLISH_BANK_BLOCKER.BANDS_INCOMPLETE);
    /* Contiguity and coverage are not meaningful over an incomplete table:
       reporting them too would name three faults for one mistake. */
    return false;
  }

  const ordered = sortBandsByLevel(bands);

  if (ordered.some((band) => band.minScore > band.maxScore)) {
    blockers.push(ENGLISH_BANK_BLOCKER.BAND_RANGE_INVALID);
    return false;
  }

  const contiguous = ordered.every(
    (band, index) => index === 0 || band.minScore === ordered[index - 1]!.maxScore + 1,
  );

  if (!contiguous) {
    blockers.push(ENGLISH_BANK_BLOCKER.BANDS_NOT_CONTIGUOUS);
  }

  const covers = ordered[0]!.minScore === 0 && ordered[ordered.length - 1]!.maxScore === maxScore;

  if (!covers) {
    blockers.push(ENGLISH_BANK_BLOCKER.BANDS_DO_NOT_COVER_RANGE);
  }

  return contiguous && covers;
}
