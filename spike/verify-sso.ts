/**
 * Verifies the seamless-login handoff against a real Moodle running
 * `local_tamkeensso` (D-044).
 *
 *   npx tsx spike/verify-sso.ts
 *
 * The unit tests prove our token is well-formed; this proves the plugin agrees,
 * which is the half that spans two languages and two runtimes. It asserts the
 * refusals as well as the happy path — a handoff that only proves it lets people
 * in has demonstrated nothing about who it keeps out.
 *
 * Requires MOODLE_SSO_SECRET in .env to match the plugin's configured secret.
 */

import { createHmac, randomBytes } from 'node:crypto';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { mintHandoffToken } from '../apps/api/src/moodle/real/moodle-handoff';

const baseUrl = (process.env.MOODLE_BASE_URL ?? '').replace(/\/+$/, '');
const secret = process.env.MOODLE_SSO_SECRET ?? '';
const LEARNER = Number(process.env.SSO_CHECK_USER ?? '4');
const COURSE = Number(process.env.SSO_CHECK_COURSE ?? '2');

if (!baseUrl || secret.length < 32) {
  throw new Error('MOODLE_BASE_URL and a 32+ character MOODLE_SSO_SECRET must be set in .env');
}

const endpoint = (token: string) =>
  `${baseUrl}/local/tamkeensso/login.php?token=${encodeURIComponent(token)}`;

async function spend(
  token: string,
): Promise<{ status: number; location: string | null; body: string }> {
  const response = await fetch(endpoint(token), { redirect: 'manual' });
  return {
    status: response.status,
    location: response.headers.get('location'),
    body: response.status >= 300 && response.status < 400 ? '' : await response.text(),
  };
}

/** A validly signed token with any claims we like — used to forge and to expire. */
function signClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

async function main(): Promise<void> {
  console.log(`Seamless-login verification -> ${baseUrl}\n`);

  const fresh = mintHandoffToken({ moodleUserId: LEARNER, moodleCourseId: COURSE }, secret, 60);
  const first = await spend(fresh);
  record(
    'a fresh token signs the learner in and lands them in the course',
    first.status === 303 && (first.location ?? '').includes(`/course/view.php?id=${COURSE}`),
    `HTTP ${first.status} -> ${first.location ?? '(no redirect)'}`,
  );

  const replay = await spend(fresh);
  record(
    'the same token cannot be spent twice',
    /already been used|استخدام/i.test(replay.body),
    replay.status === 303 ? 'REDIRECTED AGAIN - replay was accepted' : 'refused as already used',
  );

  const forged = signClaims({
    moodleUserId: 1,
    moodleCourseId: COURSE,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    nonce: randomBytes(16).toString('hex'),
  });
  const tampered = `${Buffer.from(
    JSON.stringify({
      moodleUserId: 1,
      moodleCourseId: COURSE,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      nonce: randomBytes(16).toString('hex'),
    }),
    'utf8',
  ).toString('base64url')}.${forged.split('.')[1] ?? ''}`;

  const forgedResult = await spend(tampered);
  record(
    'a tampered payload is refused',
    /not valid|غير صالح/i.test(forgedResult.body),
    forgedResult.status === 303 ? 'REDIRECTED - forgery was accepted' : 'refused as invalid',
  );

  const expired = signClaims({
    moodleUserId: LEARNER,
    moodleCourseId: COURSE,
    expiresAt: Math.floor(Date.now() / 1000) - 120,
    nonce: randomBytes(16).toString('hex'),
  });
  const expiredResult = await spend(expired);
  record(
    'an expired token is refused even though it is validly signed',
    /expired|انتهت/i.test(expiredResult.body),
    expiredResult.status === 303 ? 'REDIRECTED - expiry was ignored' : 'refused as expired',
  );

  const failures = results.filter((entry) => !entry.ok);
  console.log(
    `\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`,
  );

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
