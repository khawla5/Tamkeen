import type { CourseAction, CourseStatus } from '@tamkeen/types';

/**
 * Which single action a course offers this learner (§3, §4.7).
 *
 * A pure function, deliberately. §3's rule — "show only the one action that
 * applies … never all three" — is a product rule, and the way to enforce it is
 * to make the server return exactly one value rather than to trust each screen
 * to pick correctly. Being pure also means every branch is testable without a
 * database, which matters because the branches are what the rule *is*.
 *
 * `ADD_TO_PATH` is gone with the build flow (D-134). A learner no longer decides
 * what their path contains, so the only questions left are: is this course in a
 * path they hold, is it at or above the rung they were placed on, and have they
 * passed it.
 */

export interface CourseActionContext {
  /**
   * How this course sits in the learner's own paths. Null when it is in none of
   * them — or in none at all — which is the browsing case.
   */
  inPath: {
    /** False until the path's assessment has placed them (D-134). */
    placed: boolean;
    /**
     * Where the course's level sits relative to theirs. `BELOW` is ground the
     * placement says they have already covered.
     */
    standing: 'BELOW' | 'PLACED' | 'ABOVE';
  } | null;
  courseStatus: CourseStatus;
  /** Passed against the product threshold (D-007), not merely finished. */
  completed: boolean;
}

export function resolveCourseAction(context: CourseActionContext): CourseAction {
  const { inPath } = context;

  /* Not in a path this learner holds: the catalogue is browsable (§4.6), but
     there is nothing here for them to do. */
  if (!inPath) {
    return 'NONE';
  }

  /* Passing outranks everything, including a course that has since left the
     catalogue: the certificate is earned and the link to it is the one useful
     thing left to offer. */
  if (context.completed) {
    return 'COMPLETED';
  }

  /* Not yet placed: the path is theirs, but which part of it they owe is not
     decided until they sit the assessment. Offering "start" would be a button
     that cannot do what it says. */
  if (!inPath.placed) {
    return 'NONE';
  }

  if (inPath.standing === 'BELOW') {
    return 'BELOW_LEVEL';
  }

  /*
   * Startable only while the catalogue still offers it. A course that has left
   * stays completable for whoever is enrolled — which is the `completed` branch
   * above and the enrolled exception in `visibleCourseWhere` — but must not be
   * started fresh (D-015).
   */
  if (context.courseStatus !== 'AVAILABLE') {
    return 'UNAVAILABLE';
  }

  return 'START_COURSE';
}
