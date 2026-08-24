import type { LmsPort } from '../moodle/lms.port';
import type { PrismaClient } from '../../generated/prisma';
import { ASSESSMENT_QUESTIONS, ASSESSMENT_SEED, LIKERT_LEVELS } from './assessment';
import { effectiveCourseStatus, fieldsForPublishedCourse } from '../catalog-sync/catalog-mapping';
import { COURSE_METADATA, SEED_PATHS } from './catalog';

/**
 * Turns the seed content into database rows.
 *
 * Plain functions over a `PrismaClient` and an `LmsPort`, not Nest providers,
 * because the seed runs as a standalone script (`npm run db:seed`) and booting
 * the whole application to insert rows would make seeding depend on the API's
 * configuration being complete.
 *
 * **Idempotent throughout.** Seeds get run twice — on a fresh clone, after a
 * reset, in CI — and the second run must be a no-op rather than a duplicate
 * catalogue or, worse, a wiped set of answers.
 *
 * A note on scope: this is *seeding*, not the Phase 2 catalogue sync. It reads
 * the course list through `LmsPort` (so Phase 2 changes the implementation, not
 * this call) but it also creates paths and path membership, which a sync job
 * must never do — those are our product metadata, not the LMS's.
 */

export interface SeedCounts {
  questions: number;
  options: number;
  courses: number;
  paths: number;
  pathCourses: number;
}

/**
 * Seeds version 1 of the assessment, its questions, options and weights.
 *
 * **It bootstraps; it does not maintain.** Rows are matched by their stable
 * `key` so revising the Arabic wording here updates version 1 in place — but
 * only while version 1 is still the only version there is. The moment an
 * administrator publishes an edit through §4C.3, the ministry owns the content
 * and this function stands back: re-running the seed after that would overwrite
 * their published bank with the draft wording that shipped with the code, which
 * in a government system is data loss dressed as a convenience.
 *
 * D-032 always said the bank is seeded data "precisely so Phase 5 can edit it
 * without a deploy". This is the other half of that sentence.
 */
/* Exported so a real-LMS run can seed the assessment without also seeding the
   mock catalogue: the two are independent, and against a real Moodle the
   catalogue comes from sync rather than from COURSE_METADATA. */
export async function seedAssessment(
  prisma: PrismaClient,
): Promise<Pick<SeedCounts, 'questions' | 'options'>> {
  const existing = await prisma.assessment.findMany({
    where: { key: ASSESSMENT_SEED.key },
    select: { id: true, version: true, status: true, effectiveFrom: true },
  });

  /* Any version beyond the first means an administrator has published, so the
     content is theirs now. Reported rather than silently skipped: a seed that
     appears to run and changes nothing is worse than one that says why. */
  const ministryOwned = existing.some((row) => row.version > ASSESSMENT_SEED.version);

  if (ministryOwned) {
    console.log(
      `Assessment "${ASSESSMENT_SEED.key}" has published versions beyond ${ASSESSMENT_SEED.version}; ` +
        'leaving it alone. Edit it from the admin portal (§4C.3).',
    );

    const active = existing.find((row) => row.status === 'ACTIVE');
    const counts = active
      ? await prisma.assessmentQuestion.findMany({
          where: { assessmentId: active.id },
          select: { _count: { select: { options: true } } },
        })
      : [];

    return {
      questions: counts.length,
      options: counts.reduce((sum, row) => sum + row._count.options, 0),
    };
  }

  const first = existing.find((row) => row.version === ASSESSMENT_SEED.version);

  const assessment = first
    ? await prisma.assessment.update({
        where: { id: first.id },
        data: {
          title: ASSESSMENT_SEED.title,
          description: ASSESSMENT_SEED.description,
          status: 'ACTIVE',
          /* Kept if it has one. Re-seeding is not a new effective date — the
             instrument has been in force since it was first published. */
          effectiveFrom: first.effectiveFrom ?? new Date(),
        },
        select: { id: true },
      })
    : await prisma.assessment.create({
        data: {
          key: ASSESSMENT_SEED.key,
          version: ASSESSMENT_SEED.version,
          title: ASSESSMENT_SEED.title,
          description: ASSESSMENT_SEED.description,
          status: 'ACTIVE',
          effectiveFrom: new Date(),
        },
        select: { id: true },
      });

  let optionCount = 0;

  for (const [index, question] of ASSESSMENT_QUESTIONS.entries()) {
    const row = await prisma.assessmentQuestion.upsert({
      where: { assessmentId_key: { assessmentId: assessment.id, key: question.key } },
      create: {
        assessmentId: assessment.id,
        key: question.key,
        displayOrder: index + 1,
        text: question.text,
      },
      update: { displayOrder: index + 1, text: question.text },
      select: { id: true },
    });

    for (const [levelIndex, level] of LIKERT_LEVELS.entries()) {
      const option = await prisma.assessmentOption.upsert({
        where: { questionId_key: { questionId: row.id, key: level.key } },
        create: {
          questionId: row.id,
          key: level.key,
          displayOrder: levelIndex + 1,
          label: level.label,
        },
        update: { displayOrder: levelIndex + 1, label: level.label },
        select: { id: true },
      });

      /* The weight is what scoring reads. Upserting by (option, dimension)
         means re-running the seed after a weighting change corrects it rather
         than adding a second row that would double the contribution. */
      await prisma.assessmentOptionWeight.upsert({
        where: {
          optionId_dimension: { optionId: option.id, dimension: question.letter },
        },
        create: { optionId: option.id, dimension: question.letter, points: level.weight },
        update: { points: level.weight },
      });

      optionCount += 1;
    }
  }

  /*
   * Remove questions dropped from the bank — but only those nobody has answered.
   * Deleting an answered question would take its responses with it and silently
   * change historical results; the foreign key is Restrict precisely so that
   * cannot happen by accident.
   */
  const seededKeys = ASSESSMENT_QUESTIONS.map((question) => question.key);
  await prisma.assessmentQuestion.deleteMany({
    where: {
      assessmentId: assessment.id,
      key: { notIn: seededKeys },
      responses: { none: {} },
    },
  });

  return { questions: ASSESSMENT_QUESTIONS.length, options: optionCount };
}

/**
 * Mirrors the LMS catalogue into `courses`, then lays our paths and membership
 * on top.
 *
 * Seeded courses are **published**, unlike ones merely discovered in the LMS
 * (D-059). The seed is authoring a known catalogue with its metadata in hand —
 * paths, objectives, prerequisites, language — so there is nothing a draft would
 * be waiting for. Sync, which discovers courses no entity has claimed, enters
 * them as drafts for exactly the opposite reason.
 *
 * Status itself is derived, never assigned: `effectiveCourseStatus` combines
 * that publication decision with the LMS's flags, so a course the LMS is no
 * longer showing becomes HIDDEN_BUT_COMPLETABLE rather than disappearing —
 * the §2/D-015 rule.
 */
async function seedCatalog(
  prisma: PrismaClient,
  lms: LmsPort,
): Promise<Pick<SeedCounts, 'courses' | 'paths' | 'pathCourses'>> {
  const lmsCourses = await lms.listCourses();

  if (lmsCourses.length === 0) {
    throw new Error('The LMS returned no courses — refusing to seed an empty catalogue.');
  }

  const courseIdByLmsId = new Map<number, string>();
  const syncedAt = new Date();

  for (const lmsCourse of lmsCourses) {
    const metadata = COURSE_METADATA[lmsCourse.lmsCourseId];

    if (!metadata) {
      /* A course with no objectives would render an empty §4.7 section. Better
         to fail the seed than to ship a half-populated catalogue. */
      throw new Error(`No seeded metadata for LMS course ${lmsCourse.lmsCourseId}.`);
    }

    /* The same rules the catalogue sync applies, from the same functions — a
       seeded database and a synced one must not describe a course differently.
       Passing `null` as the existing row is right here: the seed authors the
       catalogue rather than reconciling with one. */
    const { lmsVisible, lmsPresent, durationMinutes, title, summary } = fieldsForPublishedCourse(
      lmsCourse,
      null,
    );

    /* `heldByAnyLearner: false` is safe despite re-seeding a live database. The
       seed only ever describes courses the LMS currently returns, so
       `lmsPresent` is true and the flag cannot affect the outcome — the held
       branches are reachable only for an absent or unpublished course. */
    const status = effectiveCourseStatus({
      publication: 'PUBLISHED',
      lmsPresent,
      lmsVisible,
      heldByAnyLearner: false,
    });

    const fields = {
      title,
      summary,
      durationMinutes,
      lmsVisible,
      lmsPresent,
      status,
      publication: 'PUBLISHED' as const,
      /* The seeded catalogue is Arabic, and the seed is the one place that
         genuinely knows so (D-047). Sync leaves it null rather than inferring a
         language from the characters in a title. */
      language: 'AR' as const,
      objectives: metadata.objectives,
      prerequisites: metadata.prerequisites,
      lastSyncedAt: syncedAt,
    };

    const course = await prisma.course.upsert({
      where: { moodleCourseId: lmsCourse.lmsCourseId },
      create: { moodleCourseId: lmsCourse.lmsCourseId, ...fields, publishedAt: syncedAt },
      update: fields,
      select: { id: true },
    });

    courseIdByLmsId.set(lmsCourse.lmsCourseId, course.id);
  }

  let membershipCount = 0;

  for (const seedPath of SEED_PATHS) {
    const path = await prisma.path.upsert({
      where: { key: seedPath.key },
      create: {
        key: seedPath.key,
        name: seedPath.name,
        description: seedPath.description,
        riasecLetter: seedPath.riasecLetter,
        typicalDurationMinutes: seedPath.typicalDurationMinutes,
        displayOrder: seedPath.displayOrder,
      },
      update: {
        name: seedPath.name,
        description: seedPath.description,
        riasecLetter: seedPath.riasecLetter,
        typicalDurationMinutes: seedPath.typicalDurationMinutes,
        displayOrder: seedPath.displayOrder,
        isActive: true,
      },
      select: { id: true },
    });

    const courseIds: string[] = [];

    for (const [index, lmsCourseId] of seedPath.courses.entries()) {
      const courseId = courseIdByLmsId.get(lmsCourseId);

      if (!courseId) {
        throw new Error(`Path "${seedPath.key}" references unknown LMS course ${lmsCourseId}.`);
      }

      await prisma.pathCourse.upsert({
        where: { pathId_courseId: { pathId: path.id, courseId } },
        create: { pathId: path.id, courseId, displayOrder: index + 1 },
        update: { displayOrder: index + 1 },
      });

      courseIds.push(courseId);
      membershipCount += 1;
    }

    /* Membership is declarative: a course removed from the seed leaves the path.
       Safe to delete because `user_path_courses` references the course directly,
       not this join row, so a learner mid-path is unaffected. */
    await prisma.pathCourse.deleteMany({
      where: { pathId: path.id, courseId: { notIn: courseIds } },
    });
  }

  return {
    courses: lmsCourses.length,
    paths: SEED_PATHS.length,
    pathCourses: membershipCount,
  };
}

/** Seeds everything Phase 1 needs. Safe to re-run. */
export async function seedProductData(prisma: PrismaClient, lms: LmsPort): Promise<SeedCounts> {
  const assessment = await seedAssessment(prisma);
  const catalog = await seedCatalog(prisma, lms);

  return { ...assessment, ...catalog };
}
