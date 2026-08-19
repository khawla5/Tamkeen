/**
 * Phase 2 test pass — verification, after the human has taken the quiz.
 *
 *   node spike/real-pass-verify.mjs          # state + a fresh handoff link
 *   node spike/real-pass-verify.mjs --check  # assert the loop closed
 *
 * The handoff expires in 60 seconds by design, so this mints a fresh one every
 * time rather than expecting anyone to hurry.
 *
 * `--check` is the actual test: it asserts what the app recorded, and asserts it
 * twice — the second pass is what proves polling is idempotent, which is the
 * property Phase 2's "done when" names explicitly.
 */

import { readFileSync } from 'node:fs';

const API = process.env.PASS_API_URL ?? 'http://localhost:4001';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const STATE_FILE = new URL('./.real-pass-state.json', import.meta.url).pathname.replace(/^\//, '');
const CHECK = process.argv.includes('--check');

const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const PASSWORD = 'a-sufficiently-long-password';

let csrfToken = '';
let cookies = [];

const log = (...args) => console.log(...args);
const head = (title) => log(`\n=== ${title} ${'='.repeat(Math.max(0, 56 - title.length))}`);

function mergeCookies(response) {
  for (const entry of response.headers.getSetCookie?.() ?? []) {
    const pair = entry.split(';')[0];
    const name = pair.split('=')[0];
    cookies = cookies.filter((existing) => existing.split('=')[0] !== name);
    cookies.push(pair);
  }
}

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  mergeCookies(response);
  const text = await response.text();
  const payload = text.length ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function coursePassedEmails() {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${state.email}`)}`,
  ).then((response) => response.json());

  return (search.messages ?? []).filter((message) => message.Subject.includes('اجتزت الدورة'));
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (detail) log(`        ${detail}`);
};

async function main() {
  csrfToken = (await call('GET', '/api/auth/csrf')).csrfToken;
  await call('POST', '/api/auth/login', { email: state.email, password: PASSWORD });

  const myPath = await call('GET', '/api/my-path');
  const player = await call('GET', `/api/courses/${state.courseId}/player`);

  head('what the app currently shows');
  log(`  path: ${myPath.completedCount} of ${myPath.totalCount} course(s) complete`);
  for (const course of myPath.courses) {
    const grade = course.gradePercent === null ? '—' : `${course.gradePercent}%`;
    log(
      `    moodle=${String(course.moodleCourseId).padEnd(4)} ${course.status.padEnd(12)} ${grade}`,
    );
  }

  if (!CHECK) {
    const launch = await call('POST', `/api/courses/${state.courseId}/launch`);

    /* Read the lifetime out of the token rather than printing a constant: the
       TTL is configuration, and a hardcoded "60 seconds" would quietly become a
       lie the moment it changed. */
    const token = new URL(launch.url).searchParams.get('token') ?? '';
    const claims = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'));
    const seconds = claims.expiresAt - Math.floor(Date.now() / 1000);

    head(`a fresh handoff link (valid for ${seconds} seconds)`);
    log(`\n  ${launch.url}\n`);
    log('  Take the quiz, then run:  node spike/real-pass-verify.mjs --check');
    return;
  }

  head('the loop closed');

  const quizCourse = myPath.courses.find(
    (course) => course.moodleCourseId === state.moodleCourseId,
  );

  check(
    'the app records the course as completed',
    quizCourse?.status === 'COMPLETED',
    `status = ${quizCourse?.status}`,
  );

  check(
    'the grade came back from Moodle',
    typeof quizCourse?.gradePercent === 'number',
    `gradePercent = ${quizCourse?.gradePercent}`,
  );

  check(
    'the player reports it as passed against the product threshold',
    player.passed === true,
    `passed=${player.passed} at threshold ${player.passThreshold}`,
  );

  const emails = await coursePassedEmails();
  check(
    'exactly one course-passed email was sent',
    emails.length === 1,
    `${emails.length} email(s)`,
  );

  head('idempotency — the property the polling model depends on');
  log('  waiting for another scheduled sync…');

  const before = { status: quizCourse?.status, grade: quizCourse?.gradePercent };
  await new Promise((resolve) => setTimeout(resolve, 70_000));

  const after = await call('GET', '/api/my-path');
  const again = after.courses.find((course) => course.moodleCourseId === state.moodleCourseId);

  check(
    'a second sync changes nothing',
    again?.status === before.status && again?.gradePercent === before.grade,
    `${before.status}/${before.grade} -> ${again?.status}/${again?.gradePercent}`,
  );

  const emailsAfter = await coursePassedEmails();
  check(
    'and does NOT send the email again',
    emailsAfter.length === emails.length,
    `${emailsAfter.length} email(s) after a second sync`,
  );

  const failures = results.filter((entry) => !entry.ok);
  log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
