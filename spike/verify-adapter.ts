/**
 * Manual verification harness: drives the **real adapter** against the live
 * Moodle, rather than the raw REST calls `moodle-spike.mjs` makes.
 *
 * The unit tests mock the HTTP layer, which proves our logic; the spike proved
 * Moodle's behaviour. This closes the gap between them — that `MoodleHttpService`
 * as actually wired produces the right results against a real server.
 *
 *   npx tsx spike/verify-adapter.ts
 *
 * Not part of CI: it needs a reachable Moodle and a token. The contract suite is
 * what runs automatically.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { MoodleHttpService } from '../apps/api/src/moodle/real/moodle-http.service';
import { MoodleWsClient } from '../apps/api/src/moodle/real/moodle-ws.client';
import { deriveMoodleUsername } from '../apps/api/src/moodle/real/moodle-identity';

const baseUrl = process.env.MOODLE_BASE_URL ?? '';
const token = process.env.MOODLE_WS_TOKEN ?? '';

if (!baseUrl || !token) {
  throw new Error('MOODLE_BASE_URL and MOODLE_WS_TOKEN must be set in .env');
}

const service = new MoodleHttpService(
  baseUrl,
  new MoodleWsClient({ baseUrl, token, timeoutMs: 10_000 }),
);

const EMAIL = 'adapter.check@ministry.gov.example';

async function main(): Promise<void> {
  console.log(`Adapter verification → ${baseUrl} (token loaded, not shown)\n`);

  console.log('checkHealth()');
  console.log(' ', JSON.stringify(await service.checkHealth()), '\n');

  console.log(`derived username for <${EMAIL}>`);
  console.log(' ', deriveMoodleUsername(EMAIL), '\n');

  console.log('findUserByEmail() before provisioning');
  console.log(' ', JSON.stringify(await service.findUserByEmail(EMAIL)), '\n');

  console.log('provisionUser() — first call');
  const first = await service.provisionUser({
    email: EMAIL,
    fullName: 'سارة عبد الله الحربي',
    externalUserId: 'ext-adapter-check',
  });
  console.log(' ', JSON.stringify(first), '\n');

  console.log('provisionUser() — second call (idempotency against a REAL Moodle)');
  const second = await service.provisionUser({
    email: EMAIL,
    fullName: 'سارة عبد الله الحربي',
    externalUserId: 'ext-adapter-check',
  });
  console.log(' ', JSON.stringify(second));
  console.log(
    '  →',
    second.lmsUserId === first.lmsUserId ? '✓ same id, no duplicate' : '✗ DUPLICATE CREATED',
    '\n',
  );

  console.log('provisionUser() — third call, UPPERCASED email (case-insensitivity)');
  const third = await service.provisionUser({
    email: EMAIL.toUpperCase(),
    fullName: 'سارة عبد الله الحربي',
    externalUserId: 'ext-adapter-check',
  });
  console.log(' ', JSON.stringify(third));
  console.log('  →', third.lmsUserId === first.lmsUserId ? '✓ same id' : '✗ DIFFERENT id', '\n');

  console.log('findUserByEmail() after provisioning');
  console.log(' ', JSON.stringify(await service.findUserByEmail(EMAIL)), '\n');

  console.log('courseUrl(2)');
  console.log(' ', service.courseUrl(2));
}

main().catch((error: unknown) => {
  console.error('\nFAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
