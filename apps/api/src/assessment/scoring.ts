import { placeScore, type PlacementBand } from '@tamkeen/types';

/**
 * Scoring a path's assessment: answers → marks for correct answers → one total
 * → the level its band names (§4.3, D-134).
 *
 * Pure functions over plain shapes, deliberately not a Nest service and with no
 * Prisma import: this is the piece §2B calls "core product correctness", so it
 * must be testable without a database, a module or a container. The service
 * layer loads rows and hands them here.
 *
 * **The band mapping itself lives in `@tamkeen/types`, the answer key does
 * not.** D-034's rule is that a shape crosses the boundary when both apps must
 * apply it and must not disagree — the administrator's band editor validates the
 * same partition the scorer places by, so `placeScore` and `checkBands` are
 * shared. `isCorrect` is the opposite kind of fact: a placement test whose
 * answer key is in a network response has no meaning at all, so everything that
 * reads it stays here, server-side.
 */

/** An option as the scorer sees it. `isCorrect` never reaches a browser. */
export interface ScorableOption {
  id: string;
  isCorrect: boolean;
}

export interface ScorableQuestion {
  id: string;
  /** What a correct answer is worth. A wrong answer is always worth nothing. */
  marks: number;
  options: ScorableOption[];
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

/**
 * Error codes for an invalid submission.
 *
 * Codes, not prose — the API never returns user-facing text (D-024). They match
 * `AuditReason` exactly, so `reason: error.code` typechecks without a cast, and
 * a test asserts they stay in step.
 */
export const SCORING_ERROR = {
  INCOMPLETE: 'ASSESSMENT_INCOMPLETE',
  UNKNOWN_QUESTION: 'ASSESSMENT_UNKNOWN_QUESTION',
  UNKNOWN_OPTION: 'ASSESSMENT_UNKNOWN_OPTION',
  DUPLICATE_ANSWER: 'ASSESSMENT_DUPLICATE_ANSWER',
  /**
   * The score fell outside every band.
   *
   * Unreachable through the product: the publish gate refuses a band table that
   * does not cover `0 … maxScore`. It exists because the alternative to raising
   * it would be defaulting to a level, and quietly starting somebody on the
   * bottom rung because a band table was malformed is worse than refusing to
   * place them at all.
   */
  NO_BAND: 'ASSESSMENT_NO_BAND',
} as const;

export class ScoringError extends Error {
  constructor(readonly code: (typeof SCORING_ERROR)[keyof typeof SCORING_ERROR]) {
    super(code);
    this.name = 'ScoringError';
  }
}

/**
 * The highest total the bank can produce: every question answered correctly.
 *
 * Computed from the bank rather than assumed, so it stays correct when an
 * administrator adds an item or changes what one is worth — and so the band
 * table's coverage can be checked against the same number the scorer uses.
 */
export function maxAttainableScore(questions: readonly ScorableQuestion[]): number {
  return questions.reduce((total, question) => total + question.marks, 0);
}

/**
 * Validates a submission against the bank and totals it.
 *
 * Validation is not a formality. The client sends option ids; without these
 * checks a caller could answer a subset, answer one question twice, or send an
 * option id belonging to a different question, and the total would silently come
 * out low — which for a placement test means a person starts a rung below where
 * they belong and repeats work they did not need.
 */
export function tallyAnswers(
  questions: readonly ScorableQuestion[],
  answers: readonly SubmittedAnswer[],
): number {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  let total = 0;

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

    if (option.isCorrect) {
      total += question.marks;
    }
  }

  /* Every question must be answered. A partial submission scores the unanswered
     items at zero and would present the result as a finished placement. */
  if (seen.size !== questions.length) {
    throw new ScoringError(SCORING_ERROR.INCOMPLETE);
  }

  return total;
}

export interface Score {
  totalScore: number;
  maxScore: number;
  /** 0-100. Zero when nothing is attainable, rather than NaN. */
  percent: number;
  /** The level the bands placed this total on. */
  levelId: string;
}

/** The whole engine: validate, total, place. */
export function scoreAssessment(
  questions: readonly ScorableQuestion[],
  bands: readonly PlacementBand[],
  answers: readonly SubmittedAnswer[],
): Score {
  const totalScore = tallyAnswers(questions, answers);
  const maxScore = maxAttainableScore(questions);
  const levelId = placeScore(totalScore, bands);

  if (!levelId) {
    throw new ScoringError(SCORING_ERROR.NO_BAND);
  }

  return {
    totalScore,
    maxScore,
    percent: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
    levelId,
  };
}
