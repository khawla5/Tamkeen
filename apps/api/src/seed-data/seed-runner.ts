import type { LmsPort } from '../moodle/lms.port';
import type { PrismaClient } from '../../generated/prisma';
import { ASSESSMENT_QUESTIONS, ASSESSMENT_SEED, LIKERT_LEVELS } from './assessment';
import { ENGLISH_ASSESSMENT_SEED, ENGLISH_BANDS, ENGLISH_QUESTIONS } from './english-assessment';
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
  /** §4.13's placement bank, counted separately: two instruments, two numbers. */
  englishQuestions: number;
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
 * Seeds version 1 of the English placement test: its questions, options, the
 * correct answers, and the band table (§4.13, D-123, D-125).
 *
 * **It bootstraps; it does not maintain** — the D-083 rule, applied to the
 * second instrument for the same reason. Rows are matched by their stable `key`
 * so revising the wording here updates version 1 in place, but only while
 * version 1 is still the only version there is. The moment an administrator
 * publishes an edit through §4C.9 the content is the ministry's, and re-running
 * the seed must not overwrite their bank with whatever shipped in the
 * repository. In a government system that is data loss dressed as a
 * convenience, and here the loss would include the band boundaries that decide
 * what every future placement *means*.
 *
 * **The bands are written with the questions, in the same pass**, because they
 * are only meaningful together: a table covering 0-60 is correct for this bank
 * and wrong for a bank of twenty items. Seeding them apart would leave a window
 * in which the instrument existed and could not score anybody.
 */
export async function seedEnglishAssessment(
  prisma: PrismaClient,
): Promise<Pick<SeedCounts, 'englishQuestions'>> {
  const existing = await prisma.assessment.findMany({
    where: { key: ENGLISH_ASSESSMENT_SEED.key, kind: 'CEFR' },
    select: { id: true, version: true, status: true, effectiveFrom: true },
  });

  const ministryOwned = existing.some((row) => row.version > ENGLISH_ASSESSMENT_SEED.version);

  if (ministryOwned) {
    /* Reported rather than silently skipped: a seed that appears to run and
       changes nothing is how somebody spends an afternoon wondering why their
       edit did not take. */
    console.log(
      `English assessment "${ENGLISH_ASSESSMENT_SEED.key}" has published versions beyond ` +
        `${ENGLISH_ASSESSMENT_SEED.version}; leaving it alone. Edit it from the admin portal (§4C.9).`,
    );

    const active = existing.find((row) => row.status === 'ACTIVE');
    const count = active
      ? await prisma.englishAssessmentQuestion.count({ where: { assessmentId: active.id } })
      : 0;

    return { englishQuestions: count };
  }

  const first = existing.find((row) => row.version === ENGLISH_ASSESSMENT_SEED.version);

  const assessment = first
    ? await prisma.assessment.update({
        where: { id: first.id },
        data: {
          title: ENGLISH_ASSESSMENT_SEED.title,
          description: ENGLISH_ASSESSMENT_SEED.description,
          status: 'ACTIVE',
          /* Kept if it has one. Re-seeding is not a new effective date — the
             instrument has been in force since it was first published. */
          effectiveFrom: first.effectiveFrom ?? new Date(),
        },
        select: { id: true },
      })
    : await prisma.assessment.create({
        data: {
          key: ENGLISH_ASSESSMENT_SEED.key,
          kind: 'CEFR',
          version: ENGLISH_ASSESSMENT_SEED.version,
          title: ENGLISH_ASSESSMENT_SEED.title,
          description: ENGLISH_ASSESSMENT_SEED.description,
          status: 'ACTIVE',
          effectiveFrom: new Date(),
        },
        select: { id: true },
      });

  for (const [index, question] of ENGLISH_QUESTIONS.entries()) {
    const row = await prisma.englishAssessmentQuestion.upsert({
      where: { assessmentId_key: { assessmentId: assessment.id, key: question.key } },
      create: {
        assessmentId: assessment.id,
        key: question.key,
        displayOrder: index + 1,
        text: question.text,
        marks: question.marks,
        level: question.level,
        skill: question.skill,
      },
      update: {
        displayOrder: index + 1,
        text: question.text,
        marks: question.marks,
        level: question.level,
        skill: question.skill,
      },
      select: { id: true },
    });

    for (const [optionIndex, label] of question.options.entries()) {
      /* `isCorrect` is upserted with the label, not set once on create: a
         corrected answer key in this file has to reach an existing row, or a
         wrong answer would survive every re-seed. */
      await prisma.englishAssessmentOption.upsert({
        where: { questionId_key: { questionId: row.id, key: `o${optionIndex + 1}` } },
        create: {
          questionId: row.id,
          key: `o${optionIndex + 1}`,
          displayOrder: optionIndex + 1,
          label,
          isCorrect: optionIndex === question.correctIndex,
        },
        update: {
          displayOrder: optionIndex + 1,
          label,
          isCorrect: optionIndex === question.correctIndex,
        },
      });
    }

    /* Options dropped from an item — but only where nobody has answered them.
       Deleting an answered option would take its responses with it and silently
       change a historical placement; the foreign key is Restrict precisely so
       that cannot happen by accident. */
    await prisma.englishAssessmentOption.deleteMany({
      where: {
        questionId: row.id,
        key: { notIn: question.options.map((_unused, i) => `o${i + 1}`) },
        responses: { none: {} },
      },
    });
  }

  for (const band of ENGLISH_BANDS) {
    await prisma.englishAssessmentBand.upsert({
      where: { assessmentId_level: { assessmentId: assessment.id, level: band.level } },
      create: {
        assessmentId: assessment.id,
        level: band.level,
        minScore: band.minScore,
        maxScore: band.maxScore,
      },
      update: { minScore: band.minScore, maxScore: band.maxScore },
    });
  }

  /* Questions dropped from the bank, on the same "only if unanswered" rule. */
  await prisma.englishAssessmentQuestion.deleteMany({
    where: {
      assessmentId: assessment.id,
      key: { notIn: ENGLISH_QUESTIONS.map((question) => question.key) },
      responses: { none: {} },
    },
  });

  return { englishQuestions: ENGLISH_QUESTIONS.length };
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
      /* The seed authors no availability window, and re-seeding does not clear
         one an administrator set — the update below names its fields and this is
         not among them. */
      withinAvailabilityWindow: true,
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
  /* Independent of the RIASEC bank and of the catalogue (D-123): nothing it
     writes is referenced by either, so the order here is presentational. */
  const english = await seedEnglishAssessment(prisma);
  const catalog = await seedCatalog(prisma, lms);

  return { ...assessment, ...english, ...catalog };
}
