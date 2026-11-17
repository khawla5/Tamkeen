import type { LevelRef, PlacementBand } from './levels';

/**
 * A path's assessment — the contract between the API and the web app (§4.3,
 * D-134).
 *
 * **One instrument shape, owned by a path.** The Holland instrument is gone with
 * the recommendation model it fed; what a path needs is a test that produces a
 * *score*, because a score is the only thing that can be banded into a level.
 * The English placement test already had exactly that shape (D-123), so this is
 * that contract generalised rather than a new one invented.
 *
 * **The absence rule is load-bearing.** No learner-facing view here carries
 * `isCorrect`, `marks`, or the level an item targets. Neither of the last two is
 * the answer key, but both let a taker triage — knowing an item is worth three
 * marks, or is aimed at the top rung, tells them where to spend effort and which
 * to guess — and a placement test is only useful if it measures what somebody
 * can do unaided across the whole range. An API test asserts the absence.
 */

/** No `isCorrect`. See the absence rule above. */
export interface AssessmentOptionView {
  id: string;
  /** Authored as content in the database, not UI chrome. */
  label: string;
  order: number;
}

/** No `marks`, and no level. See the absence rule above. */
export interface AssessmentQuestionView {
  id: string;
  order: number;
  text: string;
  options: AssessmentOptionView[];
}

export interface AssessmentView {
  id: string;
  pathId: string;
  pathName: string;
  /** Bumped on each published edit; results record the version that scored them. */
  version: number;
  title: string;
  description: string;
  questions: AssessmentQuestionView[];
}

/** One answer. The client never sends a score — only which option it chose. */
export interface AssessmentAnswerInput {
  questionId: string;
  optionId: string;
}

export interface AssessmentSubmission {
  assessmentId: string;
  answers: AssessmentAnswerInput[];
}

/**
 * A scored attempt, and where it placed the learner.
 *
 * `totalScore` and `maxScore` travel with the level because a level on its own
 * is an assertion; "38 من 60" is the evidence for it, and it is the form in
 * which somebody can tell a near-miss from a comfortable placement.
 */
export interface AssessmentResultView {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  pathId: string;
  pathName: string;
  /** ISO 8601. Formatted for display through the shared layer (D-018). */
  completedAt: string;

  totalScore: number;
  maxScore: number;
  /** `totalScore / maxScore` as 0-100, for the bar. Zero when nothing is attainable. */
  percent: number;

  /** The rung this score placed them on. */
  level: LevelRef;
  /** How many rungs the path has, so "3 من 5" can be said without a second call. */
  levelCount: number;

  /**
   * Whether the assessment may be taken again.
   *
   * Always `false` today: a placement stands until an administrator changes it
   * (D-134). It is on the contract anyway, rather than being a constant the
   * client knows, because the server owns the rule and the client renders what
   * it is told — a screen that hardcoded the answer would be a second
   * implementation, free to disagree if the ministry revises it.
   */
  canRetake: boolean;
}

/* ------------------------------------------------------------------ *
 * §4C.3 — the admin contract.
 *
 * These types **do** carry the answer key: `isCorrect`, `marks`, and the level
 * an item targets. That is the whole difference between this surface and the
 * learner's, and `@Roles('SUPER_ADMIN')` on the controller is the whole of what
 * keeps it there.
 * ------------------------------------------------------------------ */

export type AssessmentVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface AdminAssessmentOption {
  id: string;
  key: string;
  label: string;
  order: number;
  /** Exactly one option per question carries this in a publishable bank. */
  isCorrect: boolean;
}

export interface AdminAssessmentQuestion {
  id: string;
  key: string;
  text: string;
  order: number;
  /** What a correct answer is worth. */
  marks: number;
  /** Authoring metadata: the rung the item is aimed at, and a free grouping. */
  levelId: string | null;
  topic: string | null;
  options: AdminAssessmentOption[];
}

/** Why a proposed version cannot be published, or should not be without thought. */
export interface AdminAssessmentReadiness {
  /** Refusals. Publishing with any of these is impossible. */
  blockers: string[];
  /** Advisory. Publishing proceeds; the editor says so first. */
  warnings: string[];
  /** The highest attainable total — what the band table must cover. */
  maxScore: number;
  /** Levels with no question targeting them, in path order. */
  levelsWithoutQuestion: string[];
  /** True when the bands partition `0 … maxScore` exactly. */
  bandsCoverRange: boolean;
}

/** A version in the history list (§4C.3's "version + effective date"). */
export interface AdminAssessmentVersion {
  id: string;
  version: number;
  status: AssessmentVersionStatus;
  title: string;
  effectiveFrom: string | null;
  retiredAt: string | null;
  questionCount: number;
  /** How many people this version placed. Never mutated (D-049). */
  resultCount: number;
}

/** A path's assessment landing state: what is live, what is being edited, what came before. */
export interface AdminAssessmentOverview {
  pathId: string;
  pathName: string;
  levels: LevelRef[];
  active: AdminAssessmentVersion | null;
  draft: AdminAssessmentVersion | null;
  history: AdminAssessmentVersion[];
}

/** The draft bank, answer key included, as only an administrator may see it. */
export interface AdminAssessmentDraft {
  id: string;
  pathId: string;
  pathName: string;
  version: number;
  title: string;
  description: string;
  levels: LevelRef[];
  questions: AdminAssessmentQuestion[];
  /** The configurable placement rule. Ascending by score. */
  bands: PlacementBand[];
  /** True when `bands` is what `defaultPlacementBands` produced, not authored. */
  bandsAreDefault: boolean;
  readiness: AdminAssessmentReadiness;
  /** The version this draft was copied from, for "what am I changing". */
  basedOnVersion: number | null;
}
