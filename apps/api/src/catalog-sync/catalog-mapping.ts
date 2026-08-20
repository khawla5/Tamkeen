import type { LmsCourse } from '../moodle/lms.types';

/**
 * The rules that decide what a course's catalogue state is, and what a sync run
 * may write.
 *
 * Pure functions, deliberately. Four callers now mirror or mutate `courses` —
 * the sync job, the seed runner, and the entity portal's publish and metadata
 * paths — and if any two of them disagreed about what "hidden" means or about
 * who owns `durationMinutes`, the same course would be described differently
 * depending on which one touched it last. Keeping the rules here means there is
 * one answer, and it is testable without a database or an LMS.
 */

export type CourseStatusValue = 'DRAFT' | 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';

export type CoursePublicationValue = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

/**
 * Everything `effectiveCourseStatus` needs, and nothing else.
 *
 * Note the ownership of each field, because it is the whole point of D-059:
 * `publication` is **ours** and only an entity or admin writes it; `lmsPresent`
 * and `lmsVisible` are **the LMS's** and only sync writes them; `heldByAnyLearner`
 * is a fact about our own `user_path_courses`.
 */
export interface CourseVisibilityInputs {
  publication: CoursePublicationValue;
  /** Whether the LMS still returns this course at all. */
  lmsPresent: boolean;
  /** The LMS's own visibility flag. Distinct from our catalogue status. */
  lmsVisible: boolean;
  /** Whether any learner has this course among their selected path courses. */
  heldByAnyLearner: boolean;
}

/**
 * A course's effective visibility in our catalogue (D-059).
 *
 * **This is the only place `courses.status` is decided.** Nothing assigns that
 * column directly; every writer calls this. Before Phase 4 the status was
 * recomputed from the LMS's `visible` flag on every sync run, which meant an
 * entity that hid a course had it flipped back to AVAILABLE minutes later, with
 * their decision recorded nowhere. Splitting the LMS's facts from our decision
 * and deriving the result from both is what makes that impossible.
 *
 * **The property worth stating outright: there is no combination of inputs for
 * which a course a learner holds becomes invisible to that learner.** Read the
 * `heldByAnyLearner` branches — every one of them lands on
 * HIDDEN_BUT_COMPLETABLE rather than RETIRED. §2/D-015's course-edit protection
 * is therefore structural here, not a check somebody has to remember to write at
 * each call site.
 */
export function effectiveCourseStatus(inputs: CourseVisibilityInputs): CourseStatusValue {
  /* A draft is not in the catalogue whatever the LMS says about it. It is the
     state between a Moodle shell existing and its product metadata being
     finished, and it must be reversible — which RETIRED, an end state, is not. */
  if (inputs.publication === 'DRAFT') {
    return 'DRAFT';
  }

  /* Withdrawn by the entity, or gone from the LMS. Either way it leaves the
     catalogue — but only completely if nobody is working through it. */
  if (inputs.publication === 'UNPUBLISHED' || !inputs.lmsPresent) {
    return inputs.heldByAnyLearner ? 'HIDDEN_BUT_COMPLETABLE' : 'RETIRED';
  }

  /* Published and present, so the LMS's visibility flag decides. A hidden
     course is never RETIRED: the LMS still holds it and may show it again, so
     treating it as an end state would need a human to undo something no human
     did. */
  return inputs.lmsVisible ? 'AVAILABLE' : 'HIDDEN_BUT_COMPLETABLE';
}

/** What a course row already holds, or null when it is new to us. */
export interface ExistingCourseRow {
  /** Our authored value. Owned by us (D-039), not by the LMS. */
  durationMinutes: number | null;
}

/**
 * The LMS-owned fields to write for a course the LMS still publishes.
 *
 * **What is absent from this return type is the point.** It carries no
 * `status`, no `publication`, no `objectives`, no `prerequisites`, no
 * `language`, no owner and no path membership. Moodle is the source of truth for
 * a course existing, for its title and summary, and for whether it is shown;
 * everything else on the row is ours (D-040 rule 3, D-059). A sync that returned
 * a status here is exactly the defect Phase 4 removed.
 *
 * `durationMinutes` we already hold always wins. It is our product metadata
 * (D-039), and letting the LMS's `null` overwrite an authored value would erase
 * the catalogue's durations on the first sync — quietly, since nothing errors
 * when a nullable column becomes null.
 */
export interface SyncedCourseFields {
  title: string;
  summary: string;
  lmsVisible: boolean;
  lmsPresent: boolean;
  durationMinutes: number | null;
}

export function fieldsForPublishedCourse(
  lmsCourse: LmsCourse,
  existing: ExistingCourseRow | null,
): SyncedCourseFields {
  return {
    title: lmsCourse.title,
    summary: lmsCourse.summary,
    lmsVisible: lmsCourse.visible,
    lmsPresent: true,
    durationMinutes: existing?.durationMinutes ?? lmsCourse.durationMinutes ?? null,
  };
}

/**
 * Whether a sync result is safe to act on.
 *
 * An empty catalogue is treated as a fault, not as "every course was deleted".
 * The difference matters enormously: acting on it would mark the entire
 * catalogue vanished in one pass, and the most likely causes — a token that lost
 * a capability, a half-configured instance, a Moodle mid-upgrade — are all
 * transient. The seed runner already refuses an empty catalogue for the same
 * reason.
 */
export function isUsableCatalogue(lmsCourses: readonly LmsCourse[]): boolean {
  return lmsCourses.length > 0;
}
