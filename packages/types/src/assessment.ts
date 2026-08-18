import type { RiasecLetter, RiasecRankedDimension, RiasecScores } from './riasec';

/**
 * The assessment contract between the API and the web app (CLAUDE.md §4.3).
 *
 * One property is load-bearing and worth stating up front: **no view type here
 * carries a dimension weighting.** The API knows which letter each option feeds
 * and by how much; the browser must not. A career-interest assessment whose
 * scoring key is visible in a network response is one a user can steer toward
 * whichever result they already wanted, which would make every downstream
 * recommendation meaningless. An API test asserts the absence.
 */

export interface AssessmentOptionView {
  id: string;
  /** Arabic label, authored as content in the database (not UI chrome). */
  label: string;
  order: number;
}

export interface AssessmentQuestionView {
  id: string;
  order: number;
  /** The Arabic statement the user responds to. */
  text: string;
  options: AssessmentOptionView[];
}

export interface AssessmentView {
  id: string;
  /** Bumped by Phase 5 when the bank is edited; results record the version they
   *  were scored against, so an old result stays interpretable. */
  version: number;
  title: string;
  questions: AssessmentQuestionView[];
}

/** One answer. The client never sends a score — only which option was chosen. */
export interface AssessmentAnswerInput {
  questionId: string;
  optionId: string;
}

export interface AssessmentSubmission {
  assessmentId: string;
  answers: AssessmentAnswerInput[];
}

/**
 * A scored result (§6 `assessment_results`): all six dimensions, not just the
 * code.
 */
export interface AssessmentResultView {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  /** ISO 8601. Formatted for display through the shared layer (D-018). */
  completedAt: string;

  scores: RiasecScores;
  ranked: RiasecRankedDimension[];
  code: RiasecLetter[];
  codeString: string;
  maxScore: number;

  /**
   * Retaking is permitted only while no path has been confirmed (D-015). The
   * server decides; the client uses this to show or hide the retake entry point
   * rather than deriving the rule a second time.
   */
  canRetake: boolean;
}
