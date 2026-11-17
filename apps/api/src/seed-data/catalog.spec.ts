import { MOCK_COURSES } from '../moodle/mock/mock-lms.data';
import { SEED_ASSESSMENTS } from './assessments';
import { COURSE_METADATA, SEED_PATHS } from './catalog';

/**
 * Content tests for the seeded catalogue (D-134).
 *
 * Most of these guard a rule that only *looks* satisfied until someone counts: a
 * published path whose assessment nobody wrote strands every learner assigned to
 * it, and a course placed on no rung is invisible however prominent it looks in
 * the seed file. Both are invisible in review and obvious in a test.
 */

/** Every course a path holds, placed or not. */
const coursesOf = (path: (typeof SEED_PATHS)[number]) => [
  ...path.levels.flatMap((level) => level.courses),
  ...path.unassignedCourses,
];

/** Only the ones on a rung — what a learner can actually reach. */
const placedOf = (path: (typeof SEED_PATHS)[number]) =>
  path.levels.flatMap((level) => level.courses);

const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]/;

/**
 * The one Latin token the seed is allowed to carry.
 *
 * A CEFR band is what a language learner, an HR file and every other language
 * school already mean by that level; rendering it as Arabic alone would throw
 * away the only label that is portable outside this platform, the same reason
 * §4C.6's settings hints print `restricted` rather than translating it.
 *
 * Two characters and nothing else, so the Arabic-first rule still holds for
 * every other word in the file: a string is checked with the bands removed,
 * and any remaining Latin letter still fails. Arabic must be present anyway.
 */
const CEFR_BAND = /[ABC][12]/g;

/** The text with any CEFR band removed, for the Latin-letter check. */
const withoutBands = (text: string) => text.replace(CEFR_BAND, '');

const mockCourseIds = new Set(MOCK_COURSES.map((course) => course.lmsCourseId));
const visibleCourseIds = new Set(
  MOCK_COURSES.filter((course) => course.visible).map((course) => course.lmsCourseId),
);

describe('seeded paths', () => {
  it('provides three paths, each a three-rung ladder', () => {
    /* Three rungs rather than two so a placement can land *between* the ends: a
       two-level path only ever answers "beginner or not", and every off-by-one
       in the band arithmetic would be invisible in it. */
    expect(SEED_PATHS).toHaveLength(3);
    expect(SEED_PATHS.filter((path) => path.levels.length !== 3)).toEqual([]);
  });

  it('publishes exactly the paths that have an authored placement bank', () => {
    /* `pathBlockers` refuses a published path with no assessment, so the seed
       must not ship one — a learner assigned to it would wait forever. */
    const published = SEED_PATHS.filter((path) => path.status === 'PUBLISHED').map(
      (path) => path.key,
    );
    const authored = SEED_ASSESSMENTS.map((seed) => seed.pathKey);

    expect([...published].sort()).toEqual([...authored].sort());
  });

  it('leaves some courses unassigned, so §4C.4 has real work to show', () => {
    /* The unassigned group is the whole point of the admin's path editor, and a
       screen that is empty on a fresh database teaches nothing about what it is
       for. */
    expect(SEED_PATHS.every((path) => path.unassignedCourses.length > 0)).toBe(true);
  });

  it('names every rung in Arabic, allowing only a CEFR band as Latin', () => {
    const offenders = SEED_PATHS.flatMap((path) =>
      path.levels
        .filter(
          (level) =>
            !ARABIC_SCRIPT.test(level.name) || LATIN_LETTERS.test(withoutBands(level.name)),
        )
        .map((level) => `${path.key}:${level.name}`),
    );

    expect(offenders).toEqual([]);
  });

  it('uses unique path keys', () => {
    const keys = SEED_PATHS.map((path) => path.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('places something on every rung', () => {
    /* An empty rung is a level a learner can be placed on with nothing to do,
       and the path would look broken to exactly the people it placed there. */
    const empty = SEED_PATHS.flatMap((path) =>
      path.levels
        .filter((level) => level.courses.length === 0)
        .map((level) => `${path.key}:${level.name}`),
    );

    expect(empty).toEqual([]);
  });

  it('references only courses that exist in the LMS', () => {
    const dangling = SEED_PATHS.flatMap((path) =>
      coursesOf(path)
        .filter((id) => !mockCourseIds.has(id))
        .map((id) => `${path.key}:${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it('lists no course twice within one path', () => {
    /* Across rungs *and* the unassigned group: `(path_id, course_id)` is unique,
       so a duplicate would make the seed's second write silently move the first. */
    const duplicated = SEED_PATHS.filter(
      (path) => new Set(coursesOf(path)).size !== coursesOf(path).length,
    ).map((path) => path.key);

    expect(duplicated).toEqual([]);
  });

  it('shares at least one course across several paths (D-003)', () => {
    /* "One Moodle course can belong to multiple paths" is a modelling fact the
       join table exists for. Seed data where every course sat in exactly one
       path would leave it untested. */
    const appearances = new Map<number, number>();
    for (const path of SEED_PATHS) {
      for (const id of coursesOf(path)) {
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
      coursesOf(path).filter((id) => !visibleCourseIds.has(id)),
    );

    expect(hidden.length).toBeGreaterThan(0);
  });

  it('leaves no course out of every path', () => {
    /* A course in no path at all is content nobody can route a learner to, and
       nothing in the product would ever surface it. */
    const assigned = new Set(SEED_PATHS.flatMap(coursesOf));
    const orphans = [...mockCourseIds].filter((id) => !assigned.has(id));

    expect(orphans).toEqual([]);
  });

  it('places every course on a rung somewhere', () => {
    /* A course only ever unassigned is invisible to every learner. One or two
       in the admin's queue is a fair seed; a course every path left unplaced
       would be a catalogue with a hole in it. */
    const placed = new Set(SEED_PATHS.flatMap(placedOf));
    const nowhere = [...mockCourseIds].filter((id) => !placed.has(id));

    expect(nowhere).toEqual([]);
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
        /* A prerequisite may name the CEFR band it assumes: «المستوى المتقدم
           (C1)» is the sentence a learner can act on, and the band is the
           actionable half of it. */
        return texts.some(
          (text) => !ARABIC_SCRIPT.test(text) || LATIN_LETTERS.test(withoutBands(text)),
        );
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

describe('seeded placement banks', () => {
  it('names a path that exists', () => {
    const keys = new Set(SEED_PATHS.map((path) => path.key));

    expect(SEED_ASSESSMENTS.filter((seed) => !keys.has(seed.pathKey))).toEqual([]);
  });

  it('aims every item at a rung the path actually has', () => {
    /* A `levelName` the path does not hold would be seeded as null, which is
       legal but silently loses the authoring metadata the editor groups by. */
    const offenders = SEED_ASSESSMENTS.flatMap((seed) => {
      const path = SEED_PATHS.find((candidate) => candidate.key === seed.pathKey);
      const names = new Set(path?.levels.map((level) => level.name) ?? []);

      return seed.questions
        .filter((question) => !names.has(question.levelName))
        .map((question) => `${seed.pathKey}:${question.key}`);
    });

    expect(offenders).toEqual([]);
  });

  it('gives every item exactly one correct answer, and at least four options', () => {
    const offenders = SEED_ASSESSMENTS.flatMap((seed) =>
      seed.questions
        .filter(
          (question) =>
            question.options.length < 4 ||
            question.correctIndex < 0 ||
            question.correctIndex >= question.options.length,
        )
        .map((question) => `${seed.pathKey}:${question.key}`),
    );

    expect(offenders).toEqual([]);
  });

  it('uses unique question keys within a bank', () => {
    for (const seed of SEED_ASSESSMENTS) {
      const keys = seed.questions.map((question) => question.key);

      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('attains at least as many marks as the path has rungs', () => {
    /* `assessBank` refuses a bank that cannot separate the levels — three rungs
       need three distinct totals, and `0 … maxScore` holds `maxScore + 1`. */
    for (const seed of SEED_ASSESSMENTS) {
      const path = SEED_PATHS.find((candidate) => candidate.key === seed.pathKey);
      const maxScore = seed.questions.reduce((total, question) => total + question.marks, 0);

      expect(maxScore + 1).toBeGreaterThanOrEqual(path?.levels.length ?? 0);
    }
  });

  it('is written in Arabic', () => {
    const offenders = SEED_ASSESSMENTS.flatMap((seed) =>
      seed.questions
        .filter((question) => !ARABIC_SCRIPT.test(question.text))
        .map((question) => `${seed.pathKey}:${question.key}`),
    );

    expect(offenders).toEqual([]);
  });
});
