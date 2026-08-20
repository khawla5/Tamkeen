import type { LmsCourseProgress } from '../moodle/lms.types';

/**
 * Turning what the LMS reports into our verdict (D-007).
 *
 * The threshold is a **product setting**, evaluated here rather than in Moodle,
 * so changing certification policy never means editing quizzes in the LMS. The
 * LMS reports a grade; deciding what that grade is worth is ours.
 */

export interface CompletionVerdict {
  completed: boolean;
  completedAt: Date | null;
  /** Rounded, and the value both stored and shown. */
  gradePercent: number | null;
  passed: boolean;
}

/**
 * The grade we store and display.
 *
 * **Rounded once, here, and the pass decision uses this same rounded value.**
 * The alternative — deciding on the precise grade while displaying a rounded one
 * — produces the indefensible case of a learner shown "70%" and told they
 * failed, because the true figure was 69.6. For a government system, the grade
 * on the screen must be the grade the decision was made on. The cost is that the
 * effective boundary is half a percentage point below the nominal one, which is
 * a deliberate and explainable choice rather than a hidden one.
 */
export function toStoredGrade(precise: number | null): number | null {
  if (precise === null || !Number.isFinite(precise)) {
    return null;
  }

  return Math.round(precise);
}

/**
 * Whether this course counts as passed.
 *
 * Requires **both** the LMS's completion signal and a grade at or above the
 * threshold (§5.5). A grade alone is not enough: a learner who scored well on a
 * quiz but has not finished the course has not finished the course, and a
 * certificate saying otherwise would be false.
 *
 * A null grade is never a pass. It means nothing was attempted, and treating it
 * as 0 would be equally wrong in the other direction — it would look like a
 * failed attempt in the record.
 */
export function evaluateCompletion(
  progress: Pick<LmsCourseProgress, 'completed' | 'completedAt' | 'gradePercent'>,
  passThreshold: number,
): CompletionVerdict {
  const gradePercent = toStoredGrade(progress.gradePercent);

  return {
    completed: progress.completed,
    completedAt: progress.completedAt,
    gradePercent,
    passed: progress.completed && gradePercent !== null && gradePercent >= passThreshold,
  };
}

/**
 * A course graded above the threshold that the LMS still does not call complete.
 *
 * Worth naming because it is a **silent blocker**: the usual cause is a Moodle
 * course with no completion criteria configured, which reports `completed:false`
 * forever, so nobody on that course can ever pass no matter how well they do.
 * Without this the symptom is "certificates never arrive" with nothing in any
 * log to explain it.
 */
export function isGradedButNotComplete(verdict: CompletionVerdict, passThreshold: number): boolean {
  return (
    !verdict.completed && verdict.gradePercent !== null && verdict.gradePercent >= passThreshold
  );
}
