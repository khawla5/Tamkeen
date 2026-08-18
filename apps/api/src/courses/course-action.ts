import { PATH_MAX_COURSES, type CourseAction, type CourseStatus } from '@tamkeen/types';

/**
 * Which single action a course offers this user (§3, §4.7).
 *
 * A pure function, deliberately. §3's rule — "show only the one action that
 * applies … never all three" — is a product rule, and the way to enforce it is
 * to make the server return exactly one value rather than to trust each screen
 * to pick correctly. Being pure also means every branch is testable without a
 * database, which matters because the branches are what the rule *is*.
 */

export interface CourseActionContext {
  /** Null when the user has not chosen a path at all. */
  userPath: {
    confirmed: boolean;
    /** Whether this course belongs to the path the user chose. */
    courseInPath: boolean;
    selectedCourseIds: string[];
  } | null;
  courseId: string;
  courseStatus: CourseStatus;
  /** Set once the course has been completed and passed (Phase 2 populates it). */
  completed: boolean;
}

export function resolveCourseAction(context: CourseActionContext): CourseAction {
  const { userPath } = context;

  /* No path chosen: the catalogue is browsable before and after the assessment
     (§4.6), but there is nothing to add a course to. */
  if (!userPath) {
    return 'NONE';
  }

  const selected = userPath.selectedCourseIds.includes(context.courseId);

  if (selected) {
    if (context.completed) {
      return 'COMPLETED';
    }

    /* Before the commitment gate nothing is enrolled, so "start" would be a
       button that cannot do what it says. */
    return userPath.confirmed ? 'START_COURSE' : 'IN_PATH';
  }

  if (!userPath.courseInPath) {
    return 'NONE';
  }

  /*
   * Addable only while the course is actually on offer. A course that has left
   * the catalogue stays completable for whoever already selected it — which is
   * the branch above — but must not be added to a new selection (D-015).
   */
  if (context.courseStatus !== 'AVAILABLE') {
    return 'UNAVAILABLE';
  }

  /* §4.9 permits a quiet add after commitment while under the maximum. The
     upper bound applies either way — before confirmation the build page also
     must not offer an eleventh course. */
  if (userPath.selectedCourseIds.length >= PATH_MAX_COURSES) {
    return 'UNAVAILABLE';
  }

  return 'ADD_TO_PATH';
}
