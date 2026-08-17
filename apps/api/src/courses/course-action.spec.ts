import { PATH_MAX_COURSES } from '@tamkeen/types';

import { resolveCourseAction, type CourseActionContext } from './course-action';

/**
 * §3: "show only the one action that applies … never all three".
 *
 * The branches below *are* that rule, so each gets its own case. The integration
 * suite proves the wiring; this proves the decision.
 */

const COURSE = 'course-1';

function context(overrides: Partial<CourseActionContext> = {}): CourseActionContext {
  return {
    userPath: null,
    courseId: COURSE,
    courseStatus: 'AVAILABLE',
    completed: false,
    ...overrides,
  };
}

function withPath(
  overrides: Partial<NonNullable<CourseActionContext['userPath']>> = {},
  rest: Partial<CourseActionContext> = {},
): CourseActionContext {
  return context({
    userPath: { confirmed: false, courseInPath: true, selectedCourseIds: [], ...overrides },
    ...rest,
  });
}

describe('resolveCourseAction', () => {
  it('offers nothing when the user has no path', () => {
    /* The catalogue is browsable before and after the assessment (§4.6), but
       there is nothing to add a course to. */
    expect(resolveCourseAction(context())).toBe('NONE');
  });

  it('offers nothing for a course outside the user’s path', () => {
    expect(resolveCourseAction(withPath({ courseInPath: false }))).toBe('NONE');
  });

  it('offers ADD_TO_PATH for an unselected course in the path being built', () => {
    expect(resolveCourseAction(withPath())).toBe('ADD_TO_PATH');
  });

  it('offers IN_PATH for a selected course before commitment', () => {
    /* "Start" would be a button that cannot do what it says — nothing is
       enrolled until the path is confirmed. */
    expect(resolveCourseAction(withPath({ selectedCourseIds: [COURSE] }))).toBe('IN_PATH');
  });

  it('offers START_COURSE for a selected course after commitment', () => {
    expect(resolveCourseAction(withPath({ confirmed: true, selectedCourseIds: [COURSE] }))).toBe(
      'START_COURSE',
    );
  });

  it('offers COMPLETED once the course is done, whatever else is true', () => {
    expect(
      resolveCourseAction(
        withPath({ confirmed: true, selectedCourseIds: [COURSE] }, { completed: true }),
      ),
    ).toBe('COMPLETED');
  });

  it('still offers ADD_TO_PATH after commitment while under the maximum (§4.9)', () => {
    expect(resolveCourseAction(withPath({ confirmed: true, selectedCourseIds: ['other'] }))).toBe(
      'ADD_TO_PATH',
    );
  });

  it('stops offering an add at ten', () => {
    const full = Array.from({ length: PATH_MAX_COURSES }, (_unused, index) => `c${index}`);

    expect(resolveCourseAction(withPath({ selectedCourseIds: full }))).toBe('UNAVAILABLE');
    expect(resolveCourseAction(withPath({ confirmed: true, selectedCourseIds: full }))).toBe(
      'UNAVAILABLE',
    );
  });

  it('refuses to add a course that has left the catalogue (D-015)', () => {
    expect(resolveCourseAction(withPath({}, { courseStatus: 'HIDDEN_BUT_COMPLETABLE' }))).toBe(
      'UNAVAILABLE',
    );
    expect(resolveCourseAction(withPath({}, { courseStatus: 'RETIRED' }))).toBe('UNAVAILABLE');
  });

  it('keeps a withdrawn course completable for someone who already selected it', () => {
    /* The other half of D-015: content may leave the catalogue, but not out from
       under a learner who is mid-path. */
    expect(
      resolveCourseAction(
        withPath(
          { confirmed: true, selectedCourseIds: [COURSE] },
          { courseStatus: 'HIDDEN_BUT_COMPLETABLE' },
        ),
      ),
    ).toBe('START_COURSE');
  });

  it('returns a single value in every reachable combination', () => {
    /* Exhaustive sweep: whatever the state, exactly one action comes back and it
       is always a known one. This is the "never all three" rule as a property
       rather than a set of examples. */
    const statuses = ['AVAILABLE', 'HIDDEN_BUT_COMPLETABLE', 'RETIRED'] as const;
    const known = ['NONE', 'ADD_TO_PATH', 'IN_PATH', 'START_COURSE', 'COMPLETED', 'UNAVAILABLE'];

    for (const confirmed of [true, false]) {
      for (const courseInPath of [true, false]) {
        for (const selected of [[], [COURSE]]) {
          for (const courseStatus of statuses) {
            for (const completed of [true, false]) {
              const action = resolveCourseAction(
                withPath(
                  { confirmed, courseInPath, selectedCourseIds: selected },
                  {
                    courseStatus,
                    completed,
                  },
                ),
              );

              expect(known).toContain(action);
            }
          }
        }
      }
    }
  });
});
