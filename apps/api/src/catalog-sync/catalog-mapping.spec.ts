import type { LmsCourse } from '../moodle/lms.types';
import {
  effectiveCourseStatus,
  fieldsForPublishedCourse,
  isUsableCatalogue,
  type CoursePublicationValue,
  type CourseStatusValue,
} from './catalog-mapping';

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
      expect(effectiveCourseStatus(inputs)).toBe(expected);
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
          const status = effectiveCourseStatus({
            publication,
            lmsPresent,
            lmsVisible,
            heldByAnyLearner: true,
          });

          /* DRAFT is unreachable for a held course in practice — nothing can be
             selected before it is published — but if it were reached it would
             still not be RETIRED, which is the property under test. */
          expect(status).not.toBe('RETIRED');
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
    const vanished = effectiveCourseStatus({
      publication: 'PUBLISHED',
      lmsPresent: false,
      lmsVisible: true,
      heldByAnyLearner: false,
    });

    const returned = effectiveCourseStatus({
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
      effectiveCourseStatus({
        publication: 'UNPUBLISHED',
        lmsPresent: true,
        lmsVisible: true,
        heldByAnyLearner: false,
      }),
    ).not.toBe('AVAILABLE');
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
