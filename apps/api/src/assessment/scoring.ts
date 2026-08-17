import {
  RIASEC_LETTERS,
  buildRiasecProfile,
  emptyRiasecScores,
  type RiasecLetter,
  type RiasecProfile,
  type RiasecScores,
} from '@tamkeen/types';

/**
 * Scoring: answers → per-dimension tally → ranked profile → Holland Code.
 *
 * Pure functions over plain shapes, deliberately not a Nest service and with no
 * Prisma import. The engine is the piece §2B singles out as "core product
 * correctness", so it is testable without a database, a module, or a container.
 * The service layer loads rows and hands them here.
 *
 * The ranking and code derivation themselves live in `@tamkeen/types`, shared
 * with the web app so the two can never disagree about what a Holland Code is.
 * What is *here* is the part only the server may do: turning chosen options into
 * points, using weights the browser never sees.
 */

/** An option's contribution. Absent letters contribute nothing. */
export type OptionWeights = Partial<Record<RiasecLetter, number>>;

export interface ScorableOption {
  id: string;
  weights: OptionWeights;
}

export interface ScorableQuestion {
  id: string;
  options: ScorableOption[];
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

/**
 * Error codes for an invalid submission.
 *
 * Codes, not prose — the API never returns user-facing text (D-024). Each is a
 * distinct failure a client could genuinely hit or a tampered request could
 * attempt, so they are distinguishable in an audit rather than collapsed into
 * one "bad request".
 */
export const SCORING_ERROR = {
  INCOMPLETE: 'ASSESSMENT_INCOMPLETE',
  UNKNOWN_QUESTION: 'ASSESSMENT_UNKNOWN_QUESTION',
  UNKNOWN_OPTION: 'ASSESSMENT_UNKNOWN_OPTION',
  DUPLICATE_ANSWER: 'ASSESSMENT_DUPLICATE_ANSWER',
} as const;

export class ScoringError extends Error {
  constructor(readonly code: (typeof SCORING_ERROR)[keyof typeof SCORING_ERROR]) {
    super(code);
    this.name = 'ScoringError';
  }
}

/**
 * The most any single dimension could score, per dimension.
 *
 * Needed to express a result as a percentage for the six-dimension visual
 * (§4.4). Computed from the bank rather than assumed, so it stays correct if
 * Phase 5 edits the questions.
 */
export function maxAttainableByDimension(questions: readonly ScorableQuestion[]): RiasecScores {
  const maxima = emptyRiasecScores();

  for (const question of questions) {
    for (const letter of RIASEC_LETTERS) {
      /* The best this question could contribute to this dimension — options are
         mutually exclusive, so it is the maximum, not the sum. */
      const best = question.options.reduce(
        (highest, option) => Math.max(highest, option.weights[letter] ?? 0),
        0,
      );
      maxima[letter] += best;
    }
  }

  return maxima;
}

/**
 * True when every dimension can attain the same maximum.
 *
 * This matters because ranking compares **raw scores across dimensions**. If one
 * dimension had more items than another, it would rank higher on volume rather
 * than on the user's interests, and the resulting Holland Code would be an
 * artefact of the question bank. The seeded bank is balanced by construction and
 * a content test asserts it (D-032); this function is what that test calls, and
 * what Phase 5 must keep true when it lets an admin edit the bank.
 */
export function isBalancedBank(questions: readonly ScorableQuestion[]): boolean {
  const maxima = maxAttainableByDimension(questions);
  const values = RIASEC_LETTERS.map((letter) => maxima[letter]);

  return new Set(values).size === 1;
}

/**
 * Validates a submission against the bank and tallies it.
 *
 * Validation is not a formality here. The client sends option ids; without these
 * checks a caller could answer a subset, answer one question twice, or send an
 * option id belonging to a different question, and the tally would silently
 * produce a skewed but plausible-looking Holland Code.
 */
export function tallyAnswers(
  questions: readonly ScorableQuestion[],
  answers: readonly SubmittedAnswer[],
): RiasecScores {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const scores = emptyRiasecScores();
  const seen = new Set<string>();

  for (const answer of answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question) {
      throw new ScoringError(SCORING_ERROR.UNKNOWN_QUESTION);
    }

    if (seen.has(answer.questionId)) {
      throw new ScoringError(SCORING_ERROR.DUPLICATE_ANSWER);
    }
    seen.add(answer.questionId);

    /* The option must belong to *this* question — an option id from another
       question is a different failure from an id that does not exist at all,
       and both must be refused. */
    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    if (!option) {
      throw new ScoringError(SCORING_ERROR.UNKNOWN_OPTION);
    }

    for (const letter of RIASEC_LETTERS) {
      scores[letter] += option.weights[letter] ?? 0;
    }
  }

  /* Every question must be answered. A partial submission would score the
     unanswered dimensions at zero and present the result as a finished profile. */
  if (seen.size !== questions.length) {
    throw new ScoringError(SCORING_ERROR.INCOMPLETE);
  }

  return scores;
}

/** The whole engine: validate, tally, rank, derive the code. */
export function scoreAssessment(
  questions: readonly ScorableQuestion[],
  answers: readonly SubmittedAnswer[],
): RiasecProfile {
  const scores = tallyAnswers(questions, answers);
  const maxima = maxAttainableByDimension(questions);
  const maxScore = Math.max(...RIASEC_LETTERS.map((letter) => maxima[letter]));

  return buildRiasecProfile(scores, maxScore);
}
