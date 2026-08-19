import type { LmsCourse } from '../moodle/lms.types';
import {
  fieldsForPublishedCourse,
  isUsableCatalogue,
  statusForVanishedCourse,
} from './catalog-mapping';

const course = (overrides: Partial<LmsCourse> = {}): LmsCourse => ({
  lmsCourseId: 101,
  title: 'أساسيات الأمن السيبراني',
  summary: 'مقدمة',
  durationMinutes: null,
  visible: true,
  ...overrides,
});

describe('fieldsForPublishedCourse', () => {
  it('maps a visible course to AVAILABLE', () => {
    expect(fieldsForPublishedCourse(course(), null).status).toBe('AVAILABLE');
  });

  it('maps a hidden course to HIDDEN_BUT_COMPLETABLE, not to gone', () => {
    /* D-015: a course leaving the catalogue must stay completable for whoever
       already selected it. */
    expect(fieldsForPublishedCourse(course({ visible: false }), null).status).toBe(
      'HIDDEN_BUT_COMPLETABLE',
    );
  });

  it('does not resurrect a RETIRED course because the LMS shows it again', () => {
    /* Retirement is our decision; an LMS visibility flag must not silently undo
       it. Reinstating is a human action. */
    const fields = fieldsForPublishedCourse(course({ visible: true }), {
      status: 'RETIRED',
      durationMinutes: null,
    });

    expect(fields.status).toBe('RETIRED');
  });

  it('keeps our authored duration and never lets the LMS null it out', () => {
    /* The failure this prevents is silent: `durationMinutes` is nullable, so
       overwriting 90 with the LMS's null would erase every duration in the
       catalogue on the first sync without erroring. */
    const fields = fieldsForPublishedCourse(course({ durationMinutes: null }), {
      status: 'AVAILABLE',
      durationMinutes: 90,
    });

    expect(fields.durationMinutes).toBe(90);
  });

  it('accepts a duration from the LMS only when we hold none', () => {
    expect(
      fieldsForPublishedCourse(course({ durationMinutes: 45 }), {
        status: 'AVAILABLE',
        durationMinutes: null,
      }).durationMinutes,
    ).toBe(45);

    expect(fieldsForPublishedCourse(course({ durationMinutes: 45 }), null).durationMinutes).toBe(
      45,
    );
  });

  it('takes title and summary from the LMS, which owns them', () => {
    const fields = fieldsForPublishedCourse(course({ title: 'عنوان جديد', summary: 'وصف جديد' }), {
      status: 'AVAILABLE',
      durationMinutes: 30,
    });

    expect(fields).toMatchObject({ title: 'عنوان جديد', summary: 'وصف جديد' });
  });
});

describe('statusForVanishedCourse', () => {
  it('retires a course no learner holds', () => {
    expect(statusForVanishedCourse(false)).toBe('RETIRED');
  });

  it('keeps a held course completable rather than retiring it', () => {
    /* RETIRED is invisible to everyone, including someone who already selected
       the course — so retiring an in-use course would do precisely what D-015
       forbids. */
    expect(statusForVanishedCourse(true)).toBe('HIDDEN_BUT_COMPLETABLE');
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
