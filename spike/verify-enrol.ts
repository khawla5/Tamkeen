/**
 * Drives the real adapter's enrolment against the live Moodle.
 *
 *   npx tsx spike/verify-enrol.ts
 *
 * Complements the unit tests, which mock the HTTP layer: this is the half that
 * only a real server can tell us.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { MoodleHttpService } from '../apps/api/src/moodle/real/moodle-http.service';
import { MoodleWsClient } from '../apps/api/src/moodle/real/moodle-ws.client';

const baseUrl = process.env.MOODLE_BASE_URL ?? '';
const token = process.env.MOODLE_WS_TOKEN ?? '';
const roleId = Number(process.env.MOODLE_STUDENT_ROLE_ID ?? '5');
const COURSE_ID = 2;

const service = new MoodleHttpService(
  baseUrl,
  new MoodleWsClient({ baseUrl, token, timeoutMs: 10_000 }),
  roleId,
);

async function main(): Promise<void> {
  console.log(`Enrolment via the real adapter -> ${baseUrl} (role ${roleId})\n`);

  const learner = await service.provisionUser({
    email: 'enrol.check@ministry.gov.example',
    fullName: 'خالد سالم',
    externalUserId: 'ext-enrol-check',
  });
  console.log('provisionUser()  ', JSON.stringify(learner));

  const before = await service.isEnrolled(learner.lmsUserId, COURSE_ID);
  console.log('isEnrolled before', before);

  await service.enrol({ lmsUserId: learner.lmsUserId, lmsCourseId: COURSE_ID });
  console.log('enrol()           ok');

  const after = await service.isEnrolled(learner.lmsUserId, COURSE_ID);
  console.log('isEnrolled after ', after);

  await service.enrol({ lmsUserId: learner.lmsUserId, lmsCourseId: COURSE_ID });
  console.log('enrol() again     ok (idempotent)');

  console.log(
    '\nisEnrolled for a course they do not hold:',
    await service.isEnrolled(learner.lmsUserId, 3),
  );

  console.log(
    '\nVERDICT:',
    before === false && after === true ? 'enrolment loop works end to end' : 'UNEXPECTED',
  );
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
