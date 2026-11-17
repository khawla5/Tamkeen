import { resolveCourseAction, type CourseActionContext } from './course-action';

/**
 * §3's "one action, never three" rule, branch by branch (D-134).
 *
 * Pure, so every case is a table row rather than a fixture. What is being
 * asserted is a product rule: a learner is offered exactly one thing to do with
 * a course, and which one depends on whether the course is in a path they hold,
 * whether the assessment has placed them yet, and where the course sits relative
 * to that placement.
 */
const context = (overrides: Partial<CourseActionContext> = {}): CourseActionContext => ({
  inPath: { placed: true, standing: 'PLACED' },
  courseStatus: 'AVAILABLE',
  completed: false,
  ...overrides,
});

describe('resolveCourseAction', () => {
  it('offers nothing for a course in no path this learner holds', () => {
    /* The catalogue is browsable (§4.6); acting on somebody else's curriculum
       is not. */
    expect(resolveCourseAction(context({ inPath: null }))).toBe('NONE');
  });

  it('offers nothing before the assessment has placed them', () => {
    /* The path is theirs, but which part of it they owe is undecided — a start
       button here could not do what it says. */
    expect(resolveCourseAction(context({ inPath: { placed: false, standing: 'PLACED' } }))).toBe(
      'NONE',
    );
  });

  it('starts a course on the rung they were placed on', () => {
    expect(resolveCourseAction(context())).toBe('START_COURSE');
  });

  it('starts a course above their rung', () => {
    /* Everything at or above the placement is theirs to work through. */
    expect(resolveCourseAction(context({ inPath: { placed: true, standing: 'ABOVE' } }))).toBe(
      'START_COURSE',
    );
  });

  it('marks a course below their rung as already covered, not as work', () => {
    expect(resolveCourseAction(context({ inPath: { placed: true, standing: 'BELOW' } }))).toBe(
      'BELOW_LEVEL',
    );
  });

  it('reports a pass before anything else', () => {
    /* Including for a course that has since left the catalogue: the certificate
       is earned, and the link to it is the one useful thing left to offer. */
    expect(resolveCourseAction(context({ completed: true }))).toBe('COMPLETED');
    expect(
      resolveCourseAction(context({ completed: true, courseStatus: 'HIDDEN_BUT_COMPLETABLE' })),
    ).toBe('COMPLETED');
  });

  it('refuses to start a course the catalogue no longer offers', () => {
    /* D-015: hidden means no new starts, while whoever is enrolled finishes. */
    expect(resolveCourseAction(context({ courseStatus: 'HIDDEN_BUT_COMPLETABLE' }))).toBe(
      'UNAVAILABLE',
    );
    expect(resolveCourseAction(context({ courseStatus: 'DRAFT' }))).toBe('UNAVAILABLE');
    expect(resolveCourseAction(context({ courseStatus: 'RETIRED' }))).toBe('UNAVAILABLE');
  });

  it('puts "below my level" ahead of "unavailable"', () => {
    /* A course they do not owe and could not start either way is described by
       the reason that is about them, not by the catalogue's bookkeeping. */
    expect(
      resolveCourseAction(
        context({ inPath: { placed: true, standing: 'BELOW' }, courseStatus: 'RETIRED' }),
      ),
    ).toBe('BELOW_LEVEL');
  });
});
