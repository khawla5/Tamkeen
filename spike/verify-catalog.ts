import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { MoodleHttpService } from '../apps/api/src/moodle/real/moodle-http.service';
import { MoodleWsClient } from '../apps/api/src/moodle/real/moodle-ws.client';

const baseUrl = process.env.MOODLE_BASE_URL ?? '';
const token = process.env.MOODLE_WS_TOKEN ?? '';

const service = new MoodleHttpService(
  baseUrl,
  new MoodleWsClient({ baseUrl, token, timeoutMs: 10_000 }),
);

async function main(): Promise<void> {
  console.log(`Catalogue read via the real adapter -> ${baseUrl}\n`);

  const courses = await service.listCourses();
  console.log(`listCourses() returned ${courses.length}:`);
  for (const course of courses) console.log(' ', JSON.stringify(course));

  console.log(
    '\n  site course (id 1) present?',
    courses.some((c) => c.lmsCourseId === 1),
  );
  console.log(
    '  hidden course visible to sync?',
    courses.some((c) => !c.visible),
  );

  console.log('\ngetCourse(2)  ', JSON.stringify(await service.getCourse(2)));
  console.log('getCourse(9999)', JSON.stringify(await service.getCourse(9999)));
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
