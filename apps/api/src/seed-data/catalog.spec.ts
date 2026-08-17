import { PATH_MAX_COURSES, PATH_MIN_COURSES, RIASEC_LETTERS } from '@tamkeen/types';

import { MOCK_COURSES } from '../moodle/mock/mock-lms.data';
import { COURSE_METADATA, SEED_PATHS } from './catalog';

/**
 * Content tests for the seeded catalogue.
 *
 * Most of these guard a product rule that only *looks* satisfied until someone
 * counts: a path offering fewer than ten courses quietly caps the 5-10 choice,
 * and a course belonging to no path can never be added to one however visible it
 * is in the catalogue. Both are invisible in review and obvious in a test.
 */

const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]/;

const mockCourseIds = new Set(MOCK_COURSES.map((course) => course.lmsCourseId));
const visibleCourseIds = new Set(
  MOCK_COURSES.filter((course) => course.visible).map((course) => course.lmsCourseId),
);

describe('seeded paths', () => {
  it('provides two paths per RIASEC dimension', () => {
    /*
     * Two rather than one because the gold rule sorts *within* a letter as well
     * as between letters. With a single path per letter that ordering would
     * never run, in the product or in a test.
     */
    const counts = Object.fromEntries(
      RIASEC_LETTERS.map((letter) => [
        letter,
        SEED_PATHS.filter((path) => path.riasecLetter === letter).length,
      ]),
    );

    expect(counts).toEqual({ R: 2, I: 2, A: 2, S: 2, E: 2, C: 2 });
    expect(SEED_PATHS).toHaveLength(12);
  });

  it('uses unique path keys', () => {
    const keys = SEED_PATHS.map((path) => path.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each dimension a distinct curated order', () => {
    for (const letter of RIASEC_LETTERS) {
      const orders = SEED_PATHS.filter((path) => path.riasecLetter === letter).map(
        (path) => path.displayOrder,
      );

      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('offers enough courses for the 5-10 rule to be a real choice', () => {
    /* A path offering exactly five would make the minimum a formality and the
       "اخترت X من 5–10" counter meaningless. Only courses the LMS is actually
       showing count — a hidden one cannot be added to a new selection. */
    const tooFew = SEED_PATHS.filter(
      (path) => path.courses.filter((id) => visibleCourseIds.has(id)).length < PATH_MAX_COURSES,
    ).map((path) => path.key);

    expect(tooFew).toEqual([]);
    expect(PATH_MIN_COURSES).toBeLessThan(PATH_MAX_COURSES);
  });

  it('references only courses that exist in the LMS', () => {
    const dangling = SEED_PATHS.flatMap((path) =>
      path.courses.filter((id) => !mockCourseIds.has(id)).map((id) => `${path.key}:${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it('lists no course twice within one path', () => {
    const duplicated = SEED_PATHS.filter(
      (path) => new Set(path.courses).size !== path.courses.length,
    ).map((path) => path.key);

    expect(duplicated).toEqual([]);
  });

  it('shares at least one course across several paths (D-003)', () => {
    /* "One Moodle course can belong to multiple paths" is a modelling fact the
       join table exists for. Seed data where every course sat in exactly one
       path would leave it untested. */
    const appearances = new Map<number, number>();
    for (const path of SEED_PATHS) {
      for (const id of path.courses) {
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      }
    }

    expect([...appearances.values()].some((count) => count > 1)).toBe(true);
  });

  it('includes a course the LMS is no longer showing, so D-015 is exercised', () => {
    /* A course inside a path but hidden in the LMS is what "available to add"
       versus "still completable if already enrolled" is about. Without one in
       the seed, that branch never runs outside a unit test. */
    const hidden = SEED_PATHS.flatMap((path) =>
      path.courses.filter((id) => !visibleCourseIds.has(id)),
    );

    expect(hidden.length).toBeGreaterThan(0);
  });

  it('leaves no course unreachable from every path', () => {
    /* A course in no path shows in the catalogue but can never be added to one,
       so its only action would be a dead end. */
    const assigned = new Set(SEED_PATHS.flatMap((path) => path.courses));
    const orphans = [...mockCourseIds].filter((id) => !assigned.has(id));

    expect(orphans).toEqual([]);
  });

  it('is written in Arabic throughout (§2 Arabic-first)', () => {
    const offenders = SEED_PATHS.filter(
      (path) =>
        !ARABIC_SCRIPT.test(path.name) ||
        LATIN_LETTERS.test(path.name) ||
        !ARABIC_SCRIPT.test(path.description) ||
        LATIN_LETTERS.test(path.description),
    ).map((path) => path.key);

    expect(offenders).toEqual([]);
  });

  it('states a typical duration on every path (§4.4 card content)', () => {
    const missing = SEED_PATHS.filter((path) => !(path.typicalDurationMinutes > 0)).map(
      (path) => path.key,
    );

    expect(missing).toEqual([]);
  });
});

describe('seeded course metadata', () => {
  it('covers every course the LMS offers', () => {
    /* §4.7 requires objectives on the course detail page; a course missing them
       would render an empty section rather than a page. */
    const missing = [...mockCourseIds].filter((id) => !COURSE_METADATA[id]);

    expect(missing).toEqual([]);
  });

  it('describes no course the LMS does not have', () => {
    const extra = Object.keys(COURSE_METADATA)
      .map(Number)
      .filter((id) => !mockCourseIds.has(id));

    expect(extra).toEqual([]);
  });

  it('gives every course at least three objectives', () => {
    const thin = Object.entries(COURSE_METADATA)
      .filter(([, metadata]) => metadata.objectives.length < 3)
      .map(([id]) => id);

    expect(thin).toEqual([]);
  });

  it('writes objectives and prerequisites in Arabic', () => {
    const offenders = Object.entries(COURSE_METADATA)
      .filter(([, metadata]) => {
        const texts = [...metadata.objectives, metadata.prerequisites ?? 'ـ'];
        return texts.some((text) => !ARABIC_SCRIPT.test(text) || LATIN_LETTERS.test(text));
      })
      .map(([id]) => id);

    expect(offenders).toEqual([]);
  });

  it('leaves prerequisites null rather than empty when there are none', () => {
    /* An empty string would render as a blank "المتطلبات" section; null lets the
       page omit the section entirely. */
    const blank = Object.entries(COURSE_METADATA)
      .filter(([, metadata]) => metadata.prerequisites !== null && !metadata.prerequisites.trim())
      .map(([id]) => id);

    expect(blank).toEqual([]);
  });

  it('states a real prerequisite on at least one course', () => {
    const withPrerequisite = Object.values(COURSE_METADATA).filter(
      (metadata) => metadata.prerequisites !== null,
    );

    expect(withPrerequisite.length).toBeGreaterThan(0);
  });
});
