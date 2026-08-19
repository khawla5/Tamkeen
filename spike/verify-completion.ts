/**
 * Reads the real learner's completion through the real adapter, and shows what
 * the sync would record.
 *
 *   npx tsx spike/verify-completion.ts
 *
 * The spike learner (user 4, course 2) actually took the quiz in Moodle, so this
 * is the genuine end of the loop rather than a simulated one.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { MoodleHttpService } from '../apps/api/src/moodle/real/moodle-http.service';
import { MoodleWsClient } from '../apps/api/src/moodle/real/moodle-ws.client';
import { evaluateCompletion } from '../apps/api/src/completion-sync/pass-threshold';

const baseUrl = process.env.MOODLE_BASE_URL ?? '';
const token = process.env.MOODLE_WS_TOKEN ?? '';
const threshold = Number(process.env.PASS_THRESHOLD ?? '70');

const service = new MoodleHttpService(
  baseUrl,
  new MoodleWsClient({ baseUrl, token, timeoutMs: 10_000 }),
  Number(process.env.MOODLE_STUDENT_ROLE_ID ?? '5'),
);

const SPIKE_LEARNER = 4;

async function main(): Promise<void> {
  console.log(`Completion via the real adapter -> ${baseUrl}\n`);

  console.log('getCourseProgress(4, 2) — the learner who took the quiz');
  const progress = await service.getCourseProgress(SPIKE_LEARNER, 2);
  console.log(' ', JSON.stringify(progress));

  if (progress) {
    const verdict = evaluateCompletion(progress, threshold);
    console.log(`\n  our verdict at PASS_THRESHOLD=${threshold}:`);
    console.log('   ', JSON.stringify(verdict));
  }

  console.log('\ngetCourseProgress for a course they are not enrolled in');
  console.log(' ', JSON.stringify(await service.getCourseProgress(SPIKE_LEARNER, 3)));

  console.log('\nlistProgressForUser(4)');
  const all = await service.listProgressForUser(SPIKE_LEARNER);
  for (const entry of all) console.log(' ', JSON.stringify(entry));

  console.log('\nlistProgressForUser for a learner with no enrolments');
  console.log(' ', JSON.stringify(await service.listProgressForUser(999_999)));

  console.log('\ndeterminism — three consecutive reads:');
  const reads = [];
  for (let i = 0; i < 3; i += 1) {
    reads.push(JSON.stringify(await service.getCourseProgress(SPIKE_LEARNER, 2)));
  }
  console.log('  identical:', new Set(reads).size === 1);
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
