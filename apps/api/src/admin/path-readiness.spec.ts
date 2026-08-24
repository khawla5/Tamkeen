import { PATH_MAX_COURSES, PATH_MIN_COURSES } from '@tamkeen/types';

import { PATH_BLOCKER, PATH_COURSE_BOUNDS, pathBlockers } from './path-readiness';

/**
 * Whether a path may be offered to learners (§4C.4).
 *
 * Small, and worth having because the failure it prevents is invisible from
 * every screen. A path with four selectable courses looks exactly like a path
 * with fifty: it appears in Results & Path Selection, a learner picks it,
 * selects everything there is, and the confirm button stays disabled with no
 * explanation. Nothing logs it, nothing alerts, and the learner concludes the
 * product is broken — which, for them, it is.
 */
describe('pathBlockers', () => {
  it('permits a path offering exactly the minimum', () => {
    expect(pathBlockers({ selectableCourses: PATH_MIN_COURSES })).toEqual([]);
  });

  it('refuses a path offering one fewer than a learner needs', () => {
    expect(pathBlockers({ selectableCourses: PATH_MIN_COURSES - 1 })).toEqual([
      PATH_BLOCKER.TOO_FEW_COURSES,
    ]);
  });

  it('refuses an empty path', () => {
    /* Which every path is at the moment it is created — hence creation always
       leaving it inactive. */
    expect(pathBlockers({ selectableCourses: 0 })).toEqual([PATH_BLOCKER.TOO_FEW_COURSES]);
  });

  it('does not cap how many courses a path may offer', () => {
    /*
     * Ten is the most a learner may *select*, not the most a path may *offer*.
     * A path of thirty from which five are chosen is exactly what §4.5
     * describes, and treating the ceiling as a membership limit would forbid it.
     */
    expect(pathBlockers({ selectableCourses: PATH_MAX_COURSES * 3 })).toEqual([]);
  });

  it('reports the bounds the admin screens display', () => {
    /* Read-only everywhere (D-074). If these ever diverge from the constants the
       enrolment service enforces, an administrator would be shown a rule the
       product does not apply. */
    expect(PATH_COURSE_BOUNDS).toEqual({ min: PATH_MIN_COURSES, max: PATH_MAX_COURSES });
  });
});
