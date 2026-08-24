import { RIASEC_LETTERS, type RiasecLetter } from '@tamkeen/types';

import { maxAttainableByDimension, type ScorableQuestion } from '../assessment/scoring';

/**
 * Whether a proposed assessment version may be published (§4C.3, D-071).
 *
 * **Two rules, deliberately of different severity.**
 *
 * `BANK_UNBALANCED` is a **blocker**. Ranking compares raw scores across
 * dimensions (D-032), so if one dimension can attain more than another it ranks
 * higher on volume rather than on the taker's interests, and every Holland Code
 * the version produces is an artefact of how the bank was authored. Nothing
 * downstream surfaces that — the recommendation still looks like a
 * recommendation — so the only place it can be caught is here.
 *
 * `BANK_ADJACENT_DIMENSIONS` is a **warning**. Five consecutive items on one
 * dimension read as a labelled section and invite a taker who has decided how
 * they wish to be categorised to answer the block uniformly. That is a real
 * effect on data quality and a weaker one, and an administrator may have a
 * defensible reason to accept it — a short bank, a themed pilot. Refusing both
 * would make the editor obstructive in the way that teaches people to route
 * around it; warning on both would let a skewed instrument ship.
 *
 * Pure, and computed over the *proposed* bank rather than the stored one, so the
 * publish endpoint and the editor's live preview give the same answer without
 * either of them owning the rule.
 */

export const BANK_BLOCKER = {
  /** The six dimensions cannot attain the same maximum. */
  UNBALANCED: 'BANK_UNBALANCED',
  /** Fewer questions than an instrument can meaningfully rank six dimensions on. */
  TOO_FEW_QUESTIONS: 'BANK_TOO_FEW_QUESTIONS',
  /** A question with fewer than two options is not a question. */
  QUESTION_WITHOUT_OPTIONS: 'BANK_QUESTION_WITHOUT_OPTIONS',
  /** An option that contributes to nothing cannot be chosen meaningfully. */
  DIMENSIONLESS_OPTION: 'BANK_DIMENSIONLESS_OPTION',
} as const;

export const BANK_WARNING = {
  /** Consecutive questions share a dimension. */
  ADJACENT_DIMENSIONS: 'BANK_ADJACENT_DIMENSIONS',
} as const;

export type BankBlockerCode = (typeof BANK_BLOCKER)[keyof typeof BANK_BLOCKER];
export type BankWarningCode = (typeof BANK_WARNING)[keyof typeof BANK_WARNING];

/**
 * The smallest bank that can rank six dimensions.
 *
 * One item per dimension. Not a judgement about instrument quality — thirty is
 * the seeded bank and D-032's reasoning stands — but below six, at least one
 * dimension can attain nothing at all, and a balanced bank of zeros ranks purely
 * on the D-031 tie-break. That is not an assessment.
 */
export const MIN_BANK_QUESTIONS = RIASEC_LETTERS.length;

/** A question as the editor holds it, before it is scorable. */
export interface DraftQuestion {
  id: string;
  displayOrder: number;
  options: Array<{ id: string; weights: Partial<Record<RiasecLetter, number>> }>;
}

export interface BankReadiness {
  blockers: BankBlockerCode[];
  warnings: BankWarningCode[];
  /** What each dimension could attain — what the editor shows when unbalanced. */
  attainable: Record<RiasecLetter, number>;
  balanced: boolean;
}

export function assessBank(questions: readonly DraftQuestion[]): BankReadiness {
  const ordered = [...questions].sort((a, b) => a.displayOrder - b.displayOrder);
  const scorable: ScorableQuestion[] = ordered.map((question) => ({
    id: question.id,
    options: question.options.map((option) => ({ id: option.id, weights: option.weights })),
  }));

  const attainable = maxAttainableByDimension(scorable);
  const values = RIASEC_LETTERS.map((letter) => attainable[letter]);
  const balanced = new Set(values).size === 1;

  const blockers: BankBlockerCode[] = [];

  if (ordered.length < MIN_BANK_QUESTIONS) {
    blockers.push(BANK_BLOCKER.TOO_FEW_QUESTIONS);
  }

  if (ordered.some((question) => question.options.length < 2)) {
    blockers.push(BANK_BLOCKER.QUESTION_WITHOUT_OPTIONS);
  }

  /*
   * An option weighted at nothing on every dimension is not the same as the
   * Likert floor. "Does not apply to me at all" contributes 0 to its question's
   * dimension and *has* that dimension (D-032) — the row exists with points 0.
   * An option with no weight rows at all contributes to nothing anywhere, which
   * means choosing it is indistinguishable from not answering, and `tallyAnswers`
   * would accept it as a complete submission.
   */
  if (
    ordered.some((question) =>
      question.options.some((option) => Object.keys(option.weights).length === 0),
    )
  ) {
    blockers.push(BANK_BLOCKER.DIMENSIONLESS_OPTION);
  }

  if (!balanced) {
    blockers.push(BANK_BLOCKER.UNBALANCED);
  }

  const warnings: BankWarningCode[] = [];

  if (hasAdjacentDimensions(ordered)) {
    warnings.push(BANK_WARNING.ADJACENT_DIMENSIONS);
  }

  return { blockers, warnings, attainable, balanced };
}

/**
 * True when two consecutive questions carry the same dimension.
 *
 * A question's dimension is taken as the set of letters any of its options
 * touches — the seeded bank gives each question exactly one, but the schema
 * permits several, and the presentation concern is the same either way: if two
 * neighbours draw on the same letters, they read as a themed pair.
 */
function hasAdjacentDimensions(questions: readonly DraftQuestion[]): boolean {
  const letters = questions.map((question) => {
    const set = new Set<RiasecLetter>();

    for (const option of question.options) {
      for (const letter of RIASEC_LETTERS) {
        if (option.weights[letter] !== undefined) {
          set.add(letter);
        }
      }
    }

    return [...set].sort().join('');
  });

  return letters.some(
    (letter, index) => index > 0 && letter.length > 0 && letter === letters[index - 1],
  );
}
