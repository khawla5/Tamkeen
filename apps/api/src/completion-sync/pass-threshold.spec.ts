import { evaluateCompletion, isGradedButNotComplete, toStoredGrade } from './pass-threshold';

/**
 * The pass threshold is core product correctness (§2B): it decides who earns a
 * certificate in Phase 3, and it is the one piece of certification policy that
 * must live in our system rather than in Moodle (D-007).
 */

const progress = (overrides: Partial<Parameters<typeof evaluateCompletion>[0]> = {}) => ({
  completed: true,
  completedAt: new Date('2026-08-18T13:57:59.000Z'),
  gradePercent: 80,
  ...overrides,
});

describe('toStoredGrade', () => {
  it('rounds to a whole percent', () => {
    expect(toStoredGrade(69.6)).toBe(70);
    expect(toStoredGrade(69.4)).toBe(69);
  });

  it('keeps null as null, never zero', () => {
    /* 0 would read as a failed attempt in the record, implying a quiz was taken
       when none was. */
    expect(toStoredGrade(null)).toBeNull();
  });

  it('rejects a non-finite value rather than storing NaN', () => {
    expect(toStoredGrade(Number.NaN)).toBeNull();
    expect(toStoredGrade(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('evaluateCompletion', () => {
  it('passes at exactly the threshold', () => {
    expect(evaluateCompletion(progress({ gradePercent: 70 }), 70).passed).toBe(true);
  });

  it('fails just below it', () => {
    expect(evaluateCompletion(progress({ gradePercent: 69 }), 70).passed).toBe(false);
  });

  it('decides on the same rounded value it stores', () => {
    /* The alternative — deciding on the precise grade while displaying a rounded
       one — produces a learner shown "70%" and told they failed. For a
       government system the grade on the screen must be the grade decided on. */
    const verdict = evaluateCompletion(progress({ gradePercent: 69.6 }), 70);

    expect(verdict.gradePercent).toBe(70);
    expect(verdict.passed).toBe(true);
  });

  it('does not pass a course the LMS does not call complete', () => {
    /* A high quiz score in an unfinished course is not a finished course, and a
       certificate saying otherwise would be false (§5.5). */
    expect(evaluateCompletion(progress({ completed: false, gradePercent: 95 }), 70).passed).toBe(
      false,
    );
  });

  it('does not pass a completed course with no grade at all', () => {
    expect(evaluateCompletion(progress({ gradePercent: null }), 70).passed).toBe(false);
  });

  it('never treats a missing grade as zero', () => {
    expect(evaluateCompletion(progress({ gradePercent: null }), 0).gradePercent).toBeNull();
  });

  it('honours a threshold of zero without inventing a grade', () => {
    /* A zero threshold means "any grade passes", not "no grade passes". */
    expect(evaluateCompletion(progress({ gradePercent: 0 }), 0).passed).toBe(true);
    expect(evaluateCompletion(progress({ gradePercent: null }), 0).passed).toBe(false);
  });

  it('carries the completion timestamp through unchanged', () => {
    const completedAt = new Date('2026-01-02T03:04:05.000Z');

    expect(evaluateCompletion(progress({ completedAt }), 70).completedAt).toBe(completedAt);
  });

  it('is a pure function of its inputs', () => {
    const input = progress();

    expect(evaluateCompletion(input, 70)).toEqual(evaluateCompletion(input, 70));
  });
});

describe('isGradedButNotComplete', () => {
  it('flags a course graded above the threshold that is not marked complete', () => {
    /* The usual cause is a Moodle course with no completion criteria, which
       reports completed:false forever — so nobody on it can ever pass, and the
       symptom is "certificates never arrive" with nothing to explain it. */
    const verdict = evaluateCompletion(progress({ completed: false, gradePercent: 95 }), 70);

    expect(isGradedButNotComplete(verdict, 70)).toBe(true);
  });

  it('does not flag an ordinary incomplete course', () => {
    const verdict = evaluateCompletion(progress({ completed: false, gradePercent: 30 }), 70);

    expect(isGradedButNotComplete(verdict, 70)).toBe(false);
  });

  it('does not flag a course that is complete', () => {
    expect(isGradedButNotComplete(evaluateCompletion(progress(), 70), 70)).toBe(false);
  });

  it('does not flag an unattempted course', () => {
    const verdict = evaluateCompletion(progress({ completed: false, gradePercent: null }), 70);

    expect(isGradedButNotComplete(verdict, 70)).toBe(false);
  });
});
