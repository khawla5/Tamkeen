import type { LmsCourse } from '../moodle/lms.types';
import {
  availabilityDay,
  availabilityWindowFrom,
  availabilityWindowUntil,
  effectiveCourseStatus,
  fieldsForPublishedCourse,
  isCalendarDay,
  isUsableCatalogue,
  isWithinAvailabilityWindow,
  type CoursePublicationValue,
  type CourseStatusValue,
  type CourseVisibilityInputs,
} from './catalog-mapping';

/**
 * The derivation with an open availability window, which is what every course
 * that has no window has (§4C.5, TAM-134).
 *
 * The table below predates the window and asserts the other four inputs; giving
 * it the open value here keeps it asserting exactly what it always did, and the
 * window gets its own block rather than four more columns of `true`.
 */
const status = (inputs: Omit<CourseVisibilityInputs, 'withinAvailabilityWindow'>) =>
  effectiveCourseStatus({ ...inputs, withinAvailabilityWindow: true });

const course = (overrides: Partial<LmsCourse> = {}): LmsCourse => ({
  lmsCourseId: 101,
  title: 'أساسيات الأمن السيبراني',
  summary: 'مقدمة',
  durationMinutes: null,
  visible: true,
  ...overrides,
});

describe('effectiveCourseStatus', () => {
  /**
   * The full derivation table from D-059, as data.
   *
   * Written exhaustively rather than as a handful of interesting cases because
   * the function's value is that it is *total* — every combination of the four
   * inputs has one defensible answer, and a table is the only way to assert
   * that none of them was decided by accident.
   */
  const table: ReadonlyArray<{
    publication: CoursePublicationValue;
    lmsPresent: boolean;
    lmsVisible: boolean;
    heldByAnyLearner: boolean;
    expected: CourseStatusValue;
  }> = [
    // A draft is out of the catalogue whatever the LMS says.
    {
      publication: 'DRAFT',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: false,
      expected: 'DRAFT',
    },
    {
      publication: 'DRAFT',
      lmsPresent: true,
      lmsVisible: false,
      heldByAnyLearner: false,
      expected: 'DRAFT',
    },
    {
      publication: 'DRAFT',
      lmsPresent: false,
      lmsVisible: false,
      heldByAnyLearner: true,
      expected: 'DRAFT',
    },

    // Withdrawn by the entity: retired only if nobody is working through it.
    {
      publication: 'UNPUBLISHED',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: false,
      expected: 'RETIRED',
    },
    {
      publication: 'UNPUBLISHED',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: true,
      expected: 'HIDDEN_BUT_COMPLETABLE',
    },
    {
      publication: 'UNPUBLISHED',
      lmsPresent: false,
      lmsVisible: false,
      heldByAnyLearner: true,
      expected: 'HIDDEN_BUT_COMPLETABLE',
    },

    // Published but gone from the LMS: same rule, different cause.
    {
      publication: 'PUBLISHED',
      lmsPresent: false,
      lmsVisible: true,
      heldByAnyLearner: false,
      expected: 'RETIRED',
    },
    {
      publication: 'PUBLISHED',
      lmsPresent: false,
      lmsVisible: true,
      heldByAnyLearner: true,
      expected: 'HIDDEN_BUT_COMPLETABLE',
    },

    // Published and present: the LMS's visibility flag decides, and a hidden
    // course is never retired — the LMS still holds it and may show it again.
    {
      publication: 'PUBLISHED',
      lmsPresent: true,
      lmsVisible: false,
      heldByAnyLearner: false,
      expected: 'HIDDEN_BUT_COMPLETABLE',
    },
    {
      publication: 'PUBLISHED',
      lmsPresent: true,
      lmsVisible: false,
      heldByAnyLearner: true,
      expected: 'HIDDEN_BUT_COMPLETABLE',
    },
    {
      publication: 'PUBLISHED',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: false,
      expected: 'AVAILABLE',
    },
    {
      publication: 'PUBLISHED',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: true,
      expected: 'AVAILABLE',
    },
  ];

  it.each(table)(
    'publication=$publication present=$lmsPresent visible=$lmsVisible held=$heldByAnyLearner → $expected',
    ({ expected, ...inputs }) => {
      expect(status(inputs)).toBe(expected);
    },
  );

  it('never hides a held course from the learner holding it', () => {
    /*
     * The §2/D-015 property, asserted over every input combination rather than
     * on the cases someone thought to write. RETIRED is invisible to *everyone*,
     * including a learner who already selected the course, so a held course
     * reaching it would be the product rule broken — and the point of deriving
     * status is that this is now impossible to express rather than merely
     * guarded against at each call site.
     */
    const publications: CoursePublicationValue[] = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'];

    for (const publication of publications) {
      for (const lmsPresent of [true, false]) {
        for (const lmsVisible of [true, false]) {
          for (const withinAvailabilityWindow of [true, false]) {
            /* DRAFT is unreachable for a held course in practice — nothing can
               be selected before it is published — but if it were reached it
               would still not be RETIRED, which is the property under test.
               The window is swept with the rest: a period that ends must not be
               able to take a course away from somebody mid-path either. */
            expect(
              effectiveCourseStatus({
                publication,
                lmsPresent,
                lmsVisible,
                heldByAnyLearner: true,
                withinAvailabilityWindow,
              }),
            ).not.toBe('RETIRED');
          }
        }
      }
    }
  });

  it('lets the LMS restore a published course it had stopped returning', () => {
    /*
     * A deliberate revision of D-040, recorded in D-059. The old rule made
     * RETIRED sticky so that an LMS visibility flag could not undo a human
     * decision — necessary only because `status` was the sole place such a
     * decision could live. The decision now lives in `publication`, where the
     * LMS cannot reach it, so stickiness here would instead freeze a stale LMS
     * fact and make a human clear something no human decided.
     */
    const vanished = status({
      publication: 'PUBLISHED',
      lmsPresent: false,
      lmsVisible: true,
      heldByAnyLearner: false,
    });

    const returned = status({
      publication: 'PUBLISHED',
      lmsPresent: true,
      lmsVisible: true,
      heldByAnyLearner: false,
    });

    expect(vanished).toBe('RETIRED');
    expect(returned).toBe('AVAILABLE');
  });

  it('does not let the LMS override an entity that unpublished a course', () => {
    /*
     * This is the defect D-059 exists to fix, stated as a test. Before the
     * split, sync recomputed `status` from the LMS's `visible` flag, so an
     * entity hiding a course had it flipped back to AVAILABLE on the next run.
     */
    expect(
      status({
        publication: 'UNPUBLISHED',
        lmsPresent: true,
        lmsVisible: true,
        heldByAnyLearner: false,
      }),
    ).not.toBe('AVAILABLE');
  });
});

describe('the availability window (§4C.5, TAM-134)', () => {
  const open = { publication: 'PUBLISHED', lmsPresent: true, lmsVisible: true } as const;

  it('hides a course whose period has ended, even though nobody holds it', () => {
    /* The ministry's requirement in one line: the period ends, the course goes
       hidden, and nobody had to do anything. */
    expect(
      effectiveCourseStatus({
        ...open,
        heldByAnyLearner: false,
        withinAvailabilityWindow: false,
      }),
    ).toBe('HIDDEN_BUT_COMPLETABLE');
  });

  it('does not retire it — the dates are a decision that can be retyped', () => {
    /*
     * The difference from a withdrawal, and the reason the window has its own
     * branch rather than reusing that one. RETIRED is what a course reaches when
     * the LMS no longer holds it and nothing in the product brings it back; an
     * ended period is reversible by editing a date, so retiring the course would
     * dress a reversible decision as a permanent one.
     */
    expect(
      effectiveCourseStatus({
        ...open,
        heldByAnyLearner: false,
        withinAvailabilityWindow: false,
      }),
    ).not.toBe('RETIRED');
  });

  it('leaves a course that has not opened yet out of the catalogue', () => {
    expect(
      effectiveCourseStatus({
        ...open,
        heldByAnyLearner: false,
        withinAvailabilityWindow: false,
      }),
    ).not.toBe('AVAILABLE');
  });

  it('brings the course back when the window is open again', () => {
    /* Nothing has to undo the hiding: the derivation is re-run and answers
       differently, which is what makes a corrected date take effect. */
    expect(
      effectiveCourseStatus({ ...open, heldByAnyLearner: false, withinAvailabilityWindow: true }),
    ).toBe('AVAILABLE');
  });

  it('does not rescue a course the entity withdrew', () => {
    /* Publication is checked first and stays first: an open window must not put
       a withdrawn course back in the catalogue. */
    expect(
      effectiveCourseStatus({
        publication: 'UNPUBLISHED',
        lmsPresent: true,
        lmsVisible: true,
        heldByAnyLearner: false,
        withinAvailabilityWindow: true,
      }),
    ).toBe('RETIRED');
  });

  it('does not turn a draft into anything else', () => {
    expect(
      effectiveCourseStatus({
        publication: 'DRAFT',
        lmsPresent: true,
        lmsVisible: true,
        heldByAnyLearner: false,
        withinAvailabilityWindow: false,
      }),
    ).toBe('DRAFT');
  });
});

describe('isWithinAvailabilityWindow', () => {
  const at = (iso: string) => new Date(iso);

  it('is open when there is no window at all', () => {
    /* Every course that predates the field, and every course the ministry never
       gives a period to. */
    expect(
      isWithinAvailabilityWindow(
        { availableFrom: null, availableUntil: null },
        at('2026-08-25T09:00:00Z'),
      ),
    ).toBe(true);
  });

  it('includes the last day of the period', () => {
    /*
     * «متاحة حتى ٣٠ سبتمبر» means the thirtieth is a day the course is
     * available. Taking the bound as midnight would close it a day early —
     * every time, for every course, which is why the bound is built as the last
     * instant of the day rather than the first.
     */
    const window = {
      availableFrom: null,
      availableUntil: availabilityWindowUntil('2026-09-30'),
    };

    /* 23:00 in Riyadh on the thirtieth. */
    expect(isWithinAvailabilityWindow(window, at('2026-09-30T20:00:00Z'))).toBe(true);
    /* 00:30 in Riyadh on the first of October. */
    expect(isWithinAvailabilityWindow(window, at('2026-09-30T21:30:00Z'))).toBe(false);
  });

  it('includes the first day of the period', () => {
    const window = {
      availableFrom: availabilityWindowFrom('2026-09-01'),
      availableUntil: null,
    };

    /* 00:30 in Riyadh on the first. */
    expect(isWithinAvailabilityWindow(window, at('2026-08-31T21:30:00Z'))).toBe(true);
    /* 23:00 in Riyadh on the thirty-first of August. */
    expect(isWithinAvailabilityWindow(window, at('2026-08-31T20:00:00Z'))).toBe(false);
  });

  it("reads the bounds in ministry time, not the server's", () => {
    /*
     * The failure this prevents is silent. Read as UTC, «من الأول من سبتمبر»
     * would open the course at 03:00 local — nobody would report that as a bug,
     * and everybody would experience it as one.
     */
    expect(availabilityWindowFrom('2026-09-01')?.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(availabilityWindowUntil('2026-09-30')?.toISOString()).toBe('2026-09-30T20:59:59.999Z');
  });

  it('round-trips a day through the stored instant and back', () => {
    /* What the administrator typed is what the form shows them next time. */
    expect(availabilityDay(availabilityWindowFrom('2026-09-01'))).toBe('2026-09-01');
    expect(availabilityDay(availabilityWindowUntil('2026-09-30'))).toBe('2026-09-30');
  });

  it('has no bound for a null day', () => {
    expect(availabilityWindowFrom(null)).toBeNull();
    expect(availabilityWindowUntil(null)).toBeNull();
    expect(availabilityDay(null)).toBeNull();
  });
});

describe('isCalendarDay', () => {
  it('accepts a real date', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true);
  });

  it('rejects a date the calendar does not have', () => {
    /* The DTO's pattern accepts this shape; without the calendar check it would
       become an Invalid Date and be reported by the database instead. */
    expect(isCalendarDay('2026-02-31')).toBe(false);
  });

  it('rejects anything that is not a plain day', () => {
    expect(isCalendarDay('2026-9-1')).toBe(false);
    expect(isCalendarDay('2026-09-01T00:00:00Z')).toBe(false);
    expect(isCalendarDay('')).toBe(false);
  });
});

describe('fieldsForPublishedCourse', () => {
  it('carries no status, publication, ownership or product metadata', () => {
    /*
     * What is absent is the contract. Moodle owns a course existing, its title,
     * its summary and whether it is shown; everything else on the row is ours
     * (D-040 rule 3, D-059). A `status` key reappearing here is the exact defect
     * Phase 4 removed, so its absence is asserted rather than assumed.
     */
    expect(Object.keys(fieldsForPublishedCourse(course(), null)).sort()).toEqual([
      'durationMinutes',
      'lmsPresent',
      'lmsVisible',
      'summary',
      'title',
    ]);
  });

  it('mirrors the LMS visibility flag without interpreting it', () => {
    expect(fieldsForPublishedCourse(course({ visible: true }), null).lmsVisible).toBe(true);
    expect(fieldsForPublishedCourse(course({ visible: false }), null).lmsVisible).toBe(false);
  });

  it('marks a course the LMS still returns as present', () => {
    expect(fieldsForPublishedCourse(course(), null).lmsPresent).toBe(true);
  });

  it('keeps our authored duration and never lets the LMS null it out', () => {
    /* The failure this prevents is silent: `durationMinutes` is nullable, so
       overwriting 90 with the LMS's null would erase every duration in the
       catalogue on the first sync without erroring. */
    const fields = fieldsForPublishedCourse(course({ durationMinutes: null }), {
      durationMinutes: 90,
    });

    expect(fields.durationMinutes).toBe(90);
  });

  it('accepts a duration from the LMS only when we hold none', () => {
    expect(
      fieldsForPublishedCourse(course({ durationMinutes: 45 }), { durationMinutes: null })
        .durationMinutes,
    ).toBe(45);

    expect(fieldsForPublishedCourse(course({ durationMinutes: 45 }), null).durationMinutes).toBe(
      45,
    );
  });

  it('takes title and summary from the LMS, which owns them', () => {
    const fields = fieldsForPublishedCourse(course({ title: 'عنوان جديد', summary: 'وصف جديد' }), {
      durationMinutes: 30,
    });

    expect(fields).toMatchObject({ title: 'عنوان جديد', summary: 'وصف جديد' });
  });
});

describe('isUsableCatalogue', () => {
  it('rejects an empty result rather than reading it as “all courses deleted”', () => {
    expect(isUsableCatalogue([])).toBe(false);
  });

  it('accepts any non-empty result', () => {
    expect(isUsableCatalogue([course()])).toBe(true);
  });
});
