/**
 * The English (CEFR) placement test — vocabulary and API contract (§4.13, D-123).
 *
 * A **sibling** of `assessment.ts`, not an extension of it. The two instruments
 * share a shape and nothing else: Holland tallies six dimensions into a ranked
 * code and has no right answer; English sums marks for correct answers into one
 * ascending score and has no dimension. Nothing in this file imports from
 * `riasec.ts`, and nothing in `riasec.ts` learns that this file exists.
 *
 * **The absence rule carries over intact.** No view type here exposes which
 * option is correct, or what a question is worth. D-034's reasoning applies with
 * more force than it does to Holland: a career-interest instrument can be
 * steered by someone who sees the weights, but a *proficiency* test whose answer
 * key is in a network response has no meaning at all. An API test asserts the
 * absence, exactly as it does for the RIASEC weights.
 *
 * Deliberately free of Arabic copy: the levels are domain facts, their Arabic
 * names ("مبتدئ", "فوق المتوسط" …) are user-facing text and belong in the
 * message catalogue keyed by level (D-024).
 */

/**
 * The six CEFR levels in **ascending order of proficiency**.
 *
 * The order is load-bearing, not cosmetic. A band table is validated as a
 * partition of the score range in this order — B1's floor must be A2's ceiling
 * plus one — so reordering this array silently changes what a valid band table
 * is. It matches the Postgres enum's declaration order for the same reason.
 */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** Where a level sits on the scale, 0 (A1) to 5 (C2). */
export function cefrRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/**
 * What an English item is testing. Authoring metadata: it groups a thirty-item
 * bank for whoever is revising it, and no scoring rule reads it.
 */
export const ENGLISH_SKILLS = ['GRAMMAR', 'VOCABULARY', 'READING', 'PRACTICAL'] as const;

export type EnglishSkill = (typeof ENGLISH_SKILLS)[number];

/**
 * One CEFR band: the score range that maps to a level.
 *
 * **Both bounds are inclusive.** These are typed and read by a human — "45 to
 * 56" is what an administrator means — and a half-open range in the editor would
 * put an off-by-one between what they entered and what a learner was told.
 */
export interface CefrBand {
  level: CefrLevel;
  minScore: number;
  maxScore: number;
}

/* ------------------------------------------------------------------ *
 * The learner-facing contract (§4.13).
 * ------------------------------------------------------------------ */

/** No `isCorrect`. See the absence rule above. */
export interface EnglishAssessmentOptionView {
  id: string;
  label: string;
  order: number;
}

/**
 * No `marks`, and no `level`, for a reason worth stating: neither is the answer
 * key, but both let a taker triage. Knowing an item is worth three marks, or is
 * a C1 item, tells them where to spend effort and which questions to guess —
 * and a placement test is only useful if it measures what somebody can do
 * unaided across the whole range.
 */
export interface EnglishAssessmentQuestionView {
  id: string;
  order: number;
  text: string;
  options: EnglishAssessmentOptionView[];
}

export interface EnglishAssessmentView {
  id: string;
  /** Bumped on each published edit; results record the version that scored them. */
  version: number;
  title: string;
  description: string;
  questions: EnglishAssessmentQuestionView[];
}

/** One answer. The client never sends a score — only which option it chose. */
export interface EnglishAssessmentAnswerInput {
  questionId: string;
  optionId: string;
}

export interface EnglishAssessmentSubmission {
  assessmentId: string;
  answers: EnglishAssessmentAnswerInput[];
}

/**
 * A scored attempt.
 *
 * `totalScore` and `maxScore` are shown alongside the level because a level on
 * its own is an assertion; "38 من 60" is the evidence for it, and it is the
 * form in which somebody can tell a near-miss from a comfortable pass.
 */
export interface EnglishAssessmentResultView {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  /** ISO 8601. Formatted for display through the shared layer (D-018). */
  completedAt: string;

  totalScore: number;
  maxScore: number;
  /** `totalScore / maxScore` as 0-100, for the bar. Zero when nothing is attainable. */
  percent: number;
  level: CefrLevel;

  /**
   * Always `false` (D-123): the placement test is taken once and never retaken.
   *
   * It is on the contract anyway, rather than being a constant the client knows,
   * for the same reason `AssessmentResultView.canRetake` is: the server owns the
   * rule and the client renders what it is told. A screen that hardcoded the
   * answer would be a second implementation of the rule, free to disagree if the
   * ministry ever revises it.
   */
  canRetake: boolean;
}
