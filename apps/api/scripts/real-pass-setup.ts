/**
 * Phase 2 test pass — setup, against a REAL Moodle.
 *
 *   cd apps/api
 *   MOODLE_MODE=real DATABASE_URL=…tamkeen_phase2 npx tsx scripts/real-pass-setup.ts
 *
 * What it does:
 *   1. seeds the assessment (no LMS involvement),
 *   2. mirrors the live Moodle catalogue into `courses`,
 *   3. creates one path over those courses, because the seeded twelve are built
 *      on mock course ids that do not exist in a real Moodle.
 *
 * Step 3 is test-pass scaffolding rather than product code; Phase 7 owns real
 * catalogue and path data.
 *
 * **Why this does not boot the Nest container.** It originally did, which would
 * have exercised the real DI wiring — but `tsx` compiles with esbuild, and
 * esbuild cannot emit `emitDecoratorMetadata`, which is exactly what Nest reads
 * to resolve constructor parameters. The container fails at boot with a
 * misleading "dependency at index [0] is undefined". So this script uses Prisma
 * and the adapter directly, and the DI wiring is exercised where it actually
 * matters: by the compiled API server the journey then runs against.
 *
 * It still shares `fieldsForPublishedCourse` with the sync service, so the two
 * cannot disagree about what a synced course row should say (D-040).
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma';
import { fieldsForPublishedCourse } from '../src/catalog-sync/catalog-mapping';
import { MoodleHttpService } from '../src/moodle/real/moodle-http.service';
import { MoodleWsClient } from '../src/moodle/real/moodle-ws.client';
import { seedAssessment } from '../src/seed-data/seed-runner';

const PATH_KEY = 'phase2-real-pass';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.MOODLE_BASE_URL ?? '';
  const token = process.env.MOODLE_WS_TOKEN ?? '';

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (process.env.MOODLE_MODE !== 'real') {
    throw new Error('This run is meaningless against the mock. Set MOODLE_MODE=real.');
  }

  console.log(`Phase 2 real pass — setup against ${baseUrl}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const lms = new MoodleHttpService(
    baseUrl,
    new MoodleWsClient({ baseUrl, token, timeoutMs: 10_000 }),
    Number(process.env.MOODLE_STUDENT_ROLE_ID ?? '5'),
    process.env.MOODLE_SSO_SECRET ?? '',
    Number(process.env.MOODLE_SSO_TTL_SECONDS ?? '60'),
  );

  try {
    const health = await lms.checkHealth();
    console.log(`LMS: ${JSON.stringify(health)}`);

    if (!health.reachable) {
      throw new Error('The LMS is not reachable; setup would produce a hollow database.');
    }

    const assessment = await seedAssessment(prisma);
    console.log(`assessment: ${assessment.questions} questions, ${assessment.options} options`);

    const lmsCourses = await lms.listCourses();

    if (lmsCourses.length === 0) {
      throw new Error('The LMS returned no courses — refusing to seed an empty catalogue.');
    }

    for (const lmsCourse of lmsCourses) {
      const existing = await prisma.course.findUnique({
        where: { moodleCourseId: lmsCourse.lmsCourseId },
        select: { status: true, durationMinutes: true },
      });

      const fields = fieldsForPublishedCourse(lmsCourse, existing);

      await prisma.course.upsert({
        where: { moodleCourseId: lmsCourse.lmsCourseId },
        create: {
          moodleCourseId: lmsCourse.lmsCourseId,
          ...fields,
          objectives: [],
          prerequisites: null,
          lastSyncedAt: new Date(),
        },
        update: { ...fields, lastSyncedAt: new Date() },
      });
    }

    console.log(`catalogue: ${lmsCourses.length} course(s) mirrored`);

    /* Only what the LMS is actually offering can enter a new selection (D-015). */
    const available = await prisma.course.findMany({
      where: { status: 'AVAILABLE' },
      orderBy: { moodleCourseId: 'asc' },
      select: { id: true, moodleCourseId: true, title: true },
    });

    console.log(`\n${available.length} selectable course(s):`);
    for (const course of available) {
      console.log(`  moodle=${String(course.moodleCourseId).padEnd(4)} ${course.title}`);
    }

    if (available.length < 5) {
      throw new Error(
        `Only ${available.length} selectable course(s); the 5-10 rule needs at least five.`,
      );
    }

    const path = await prisma.path.upsert({
      where: { key: PATH_KEY },
      create: {
        key: PATH_KEY,
        name: 'مسار اختبار التكامل',
        description: 'مسار أُنشئ للتحقق من التكامل مع منصة التعلّم من طرف إلى طرف.',
        riasecLetter: 'I',
        typicalDurationMinutes: 600,
        displayOrder: 1,
      },
      update: { isActive: true },
      select: { id: true },
    });

    for (const [index, course] of available.entries()) {
      await prisma.pathCourse.upsert({
        where: { pathId_courseId: { pathId: path.id, courseId: course.id } },
        create: { pathId: path.id, courseId: course.id, displayOrder: index + 1 },
        update: { displayOrder: index + 1 },
      });
    }

    console.log(`\npath "${PATH_KEY}" offers ${available.length} course(s). Setup complete.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('\nFAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
