import { CEFR_LEVELS, type CefrBand, type CefrLevel } from '@tamkeen/types';

/**
 * English scoring: answers → marks for correct answers → one total → one CEFR
 * band (§4.13, D-123).
 *
 * Pure functions over plain shapes, deliberately not a Nest service and with no
 * Prisma import, on the same reasoning as `assessment/scoring.ts`: this is the
 * piece §2B calls "core product correctness", so it must be testable without a
 * database, a module or a container. The service layer loads rows and hands them
 * here.
 *
 * **This is a sibling of the RIASEC engine, sharing no code with it, and that is
 * the point.** Holland tallies six dimensions and ranks them; there is no
 * correct answer and no total. English sums marks and reads off a single
 * ascending scale. Generalising the two into one engine would mean an
 * abstraction whose only concrete instances disagree about what scoring *is* —
 * and would put the RIASEC tally, which is live and correct, at risk for the
 * benefit of code reuse nobody asked for.
 *
 * **The band mapping lives here rather than in `@tamkeen/types`**, unlike the
 * RIASEC ranking. D-034 shares a rule when *both* apps must apply it and must
 * not disagree; the web never maps a score to a level — the API returns the
 * level — and the correct-answer key this file reads must never cross the
 * boundary. Keeping the whole scoring path server-side keeps that guarantee in
 * one file rather than spread across two packages.
 */

/** An option as the scorer sees it. `isCorrect` never reaches a browser. */
export interface ScorableEnglishOption {
  id: string;
  isCorrect: boolean;
}

export interface ScorableEnglishQuestion {
  id: string;
  /** What a correct answer is worth. A wrong answer is always worth nothing. */
  marks: number;
  options: ScorableEnglishOption[];
}

export interface SubmittedEnglishAnswer {
  questionId: string;
  optionId: string;
}

/**
 * Error codes for an invalid submission.
 *
 * Codes, not prose — the API never returns user-facing text (D-024). The first
 * four mirror `SCORING_ERROR` because the failures are genuinely the same
 * failures; they are named separately rather than imported so that a change to
 * one instrument's refusals cannot silently alter the other's.
 */
export const ENGLISH_SCORING_ERROR = {
  INCOMPLETE: 'ENGLISH_ASSESSMENT_INCOMPLETE',
  UNKNOWN_QUESTION: 'ENGLISH_ASSESSMENT_UNKNOWN_QUESTION',
  UNKNOWN_OPTION: 'ENGLISH_ASSESSMENT_UNKNOWN_OPTION',
  DUPLICATE_ANSWER: 'ENGLISH_ASSESSMENT_DUPLICATE_ANSWER',
  /**
   * The score fell outside every band.
   *
   * Unreachable through the product: the publish gate refuses a band table that
   * does not cover `0 … maxScore`. It exists because the alternative to raising
   * it would be defaulting to a level, and quietly telling somebody they are A1
   * because a band table was malformed is worse than refusing to score them.
   */
  NO_BAND: 'ENGLISH_ASSESSMENT_NO_BAND',
} as const;

export class EnglishScoringError extends Error {
  constructor(readonly code: (typeof ENGLISH_SCORING_ERROR)[keyof typeof ENGLISH_SCORING_ERROR]) {
    super(code);
    this.name = 'EnglishScoringError';
  }
}

/**
 * The highest total the bank can produce: every question answered correctly.
 *
 * Computed from the bank rather than assumed, so it stays correct when an
 * administrator adds an item or changes what one is worth — and so the band
 * table's coverage can be checked against the same number the scorer uses.
 */
export function maxAttainableScore(questions: readonly ScorableEnglishQuestion[]): number {
  return questions.reduce((total, question) => total + question.marks, 0);
}

/**
 * Validates a submission against the bank and totals it.
 *
 * Validation is not a formality. The client sends option ids; without these
 * checks a caller could answer a subset, answer one question twice, or send an
 * option id belonging to a different question, and the total would silently come
 * out low — which for a placement test means a person is told they are a level
 * below where they are.
 */
export function tallyEnglishAnswers(
  questions: readonly ScorableEnglishQuestion[],
  answers: readonly SubmittedEnglishAnswer[],
): number {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  let total = 0;

  for (const answer of answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question) {
      throw new EnglishScoringError(ENGLISH_SCORING_ERROR.UNKNOWN_QUESTION);
    }

    if (seen.has(answer.questionId)) {
      throw new EnglishScoringError(ENGLISH_SCORING_ERROR.DUPLICATE_ANSWER);
    }
    seen.add(answer.questionId);

    /* The option must belong to *this* question — an option id from another
       question is a different failure from an id that does not exist at all,
       and both must be refused. */
    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    if (!option) {
      throw new EnglishScoringError(ENGLISH_SCORING_ERROR.UNKNOWN_OPTION);
    }

    if (option.isCorrect) {
      total += question.marks;
    }
  }

  /* Every question must be answered. A partial submission scores the unanswered
     items at zero and would present the result as a finished placement. */
  if (seen.size !== questions.length) {
    throw new EnglishScoringError(ENGLISH_SCORING_ERROR.INCOMPLETE);
  }

  return total;
}

/**
 * The band a score falls in, or null if none contains it.
 *
 * Both bounds are inclusive, so a score sitting exactly on a boundary belongs to
 * the band whose range names it — and because a valid table is contiguous, that
 * band is unique. Null is returned rather than guessed at; the caller decides
 * whether an uncovered score is a refusal or a configuration report.
 */
export function resolveCefrBand(bands: readonly CefrBand[], score: number): CefrBand | null {
  return bands.find((band) => score >= band.minScore && score <= band.maxScore) ?? null;
}

/** The bands in ascending CEFR order, which is the order they must partition in. */
export function sortBandsByLevel(bands: readonly CefrBand[]): CefrBand[] {
  return [...bands].sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
}

export interface EnglishScore {
  totalScore: number;
  maxScore: number;
  /** 0-100. Zero when nothing is attainable, rather than NaN. */
  percent: number;
  level: CefrLevel;
}

/** The whole engine: validate, total, map to a band. */
export function scoreEnglishAssessment(
  questions: readonly ScorableEnglishQuestion[],
  bands: readonly CefrBand[],
  answers: readonly SubmittedEnglishAnswer[],
): EnglishScore {
  const totalScore = tallyEnglishAnswers(questions, answers);
  const maxScore = maxAttainableScore(questions);
  const band = resolveCefrBand(bands, totalScore);

  if (!band) {
    throw new EnglishScoringError(ENGLISH_SCORING_ERROR.NO_BAND);
  }

  return {
    totalScore,
    maxScore,
    percent: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
    level: band.level,
  };
}
