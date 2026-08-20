/**
 * Phase 2 test pass — the journey, over HTTP, against the real API in real mode.
 *
 *   node spike/real-pass-journey.mjs
 *
 * Speaks only HTTP, deliberately: anything it proves is something a browser
 * could do, and no rule it exercises can be one that lives solely in a React
 * component. Every LMS effect it triggers lands in a real Moodle.
 *
 * It stops at the point a human is genuinely needed — taking the quiz — and
 * prints the handoff link to do it with. `real-pass-verify.mjs` picks up after.
 */

import { writeFileSync } from 'node:fs';

const API = process.env.PASS_API_URL ?? 'http://localhost:4001';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
/** The course that actually has a quiz and completion criteria. */
const QUIZ_MOODLE_COURSE_ID = 2;
const STATE_FILE = new URL('./.real-pass-state.json', import.meta.url).pathname.replace(/^\//, '');

let csrfToken = '';
let cookies = [];

const log = (...args) => console.log(...args);
const head = (title) => log(`\n=== ${title} ${'='.repeat(Math.max(0, 56 - title.length))}`);

function mergeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const entry of raw) {
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
  let payload = null;
  try {
    payload = text.length ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function verificationToken(email) {
  /* The database stores only the hash of this token, so it genuinely has to be
     read out of the delivered mail — the same route a person would take. */
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    ).then((response) => response.json());

    const message = search.messages?.[0];

    if (message) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then((response) =>
        response.json(),
      );
      const match = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(`${full.Text}${full.HTML}`);
      if (match) return match[1];
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('No verification email arrived in Mailpit');
}

async function main() {
  const stamp = Date.now().toString(36);
  const email = `phase2-${stamp}@ministry.gov.example`;
  const password = 'a-sufficiently-long-password';

  log(`Phase 2 real pass — journey against ${API}\n`);

  head('health');
  const health = await call('GET', '/api/health');
  log(`  ${JSON.stringify(health)}`);
  if (health.moodleMode !== 'real') throw new Error('API is not in real mode');
  if (health.lms !== 'up') throw new Error('API cannot reach the LMS');

  const csrf = await call('GET', '/api/auth/csrf');
  csrfToken = csrf.csrfToken;

  head('register, verify, sign in');
  await call('POST', '/api/auth/register', {
    email,
    password,
    fullName: 'موظف اختبار التكامل',
    employeeId: `P2-${stamp}`.slice(0, 20),
    department: 'تقنية المعلومات',
  });
  log(`  registered ${email}`);

  await call('POST', '/api/auth/verify-email', { token: await verificationToken(email) });
  log('  email verified (token read from the delivered mail)');

  await call('POST', '/api/auth/login', { email, password });
  log('  signed in');

  head('assessment');
  const assessment = await call('GET', '/api/assessment');
  const answers = assessment.questions.map((question) => ({
    questionId: question.id,
    optionId: question.options[question.options.length - 1].id,
  }));
  const result = await call('POST', '/api/assessment/submit', {
    assessmentId: assessment.id,
    answers,
  });
  log(`  Holland Code: ${result.codeString}`);

  head('choose the path and build it');
  const recommendations = await call('GET', '/api/paths');
  const path = recommendations.paths.find((entry) => entry.name === 'مسار اختبار التكامل');
  if (!path) throw new Error('The integration path is missing — run real-pass-setup first');
  log(`  path: ${path.name} (${path.courseCount} courses offered)`);

  await call('POST', '/api/my-path/select', { pathId: path.id });

  const detail = await call('GET', `/api/paths/${path.id}`);
  const quizCourse = detail.courses.find(
    (course) => course.moodleCourseId === QUIZ_MOODLE_COURSE_ID,
  );
  if (!quizCourse) throw new Error(`Course ${QUIZ_MOODLE_COURSE_ID} is not in the path`);

  /* The quiz course first, so the human step below is the first course. */
  const others = detail.courses.filter((course) => course.id !== quizCourse.id).slice(0, 4);
  const courseIds = [quizCourse.id, ...others.map((course) => course.id)];

  await call('PUT', '/api/my-path/courses', { courseIds });
  log(`  selected ${courseIds.length} courses`);

  head('confirm — the hard commitment gate');
  const myPath = await call('POST', '/api/my-path/confirm');
  log(`  confirmed: ${myPath.completedCount} of ${myPath.totalCount} complete`);

  head('did enrolment reach the real Moodle?');
  const enrolled = await call('GET', '/api/my-path');
  for (const course of enrolled.courses) {
    log(`  moodle=${String(course.moodleCourseId).padEnd(4)} ${course.status}  ${course.title}`);
  }

  head('launch — the seamless handoff');
  const launch = await call('POST', `/api/courses/${quizCourse.id}/launch`);
  log(`  ${launch.url.slice(0, 72)}…`);
  if (/wstoken/i.test(launch.url)) throw new Error('The web-services token leaked into the URL');

  const second = await call('POST', `/api/courses/${quizCourse.id}/launch`);
  log(`  a second launch mints a different URL: ${second.url !== launch.url}`);

  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { email, courseId: quizCourse.id, moodleCourseId: QUIZ_MOODLE_COURSE_ID },
      null,
      2,
    ),
  );

  head('HUMAN STEP');
  log('  Open this link, take the quiz, and submit it:\n');
  log(`  ${second.url}\n`);
  log('  Then run:  node spike/real-pass-verify.mjs');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
