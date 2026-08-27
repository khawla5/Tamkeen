const API = 'http://localhost:4000';
const MAILPIT = 'http://localhost:8025';

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
  const email = process.env.DEMO_EMAIL ?? 'demo-student@ministry.gov.example';
  const password = process.env.DEMO_PASSWORD ?? 'Student_Demo_2026!';
  const demoMoodleCourseId = Number(process.env.DEMO_COURSE_ID ?? 85);

  const health = await call('GET', '/api/health');
  if (health.moodleMode !== 'real' || health.lms !== 'up') throw new Error('API not in real mode / LMS down');

  const csrf = await call('GET', '/api/auth/csrf');
  csrfToken = csrf.csrfToken;

  let registered = true;
  try { await call('POST', '/api/auth/register', {
    email,
    password,
    fullName: 'متدرب تجريبي',
    employeeId: `DEMO-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    department: 'تقنية المعلومات',
  }); } catch { registered = false; log('already registered — signing in'); }
  if (registered) { log(`registered ${email}`); try { await call('POST', '/api/auth/verify-email', { token: await verificationToken(email) }); } catch { log('verify skipped (already verified)'); } }
  await call('POST', '/api/auth/login', { email, password });
  log('verified + signed in');

  const existing = await call('GET', '/api/my-path').catch(() => null);
  if (existing && existing.courses && existing.courses.length > 0) {
    log(`path already confirmed with ${existing.courses.length} courses — launching`);
    const first = existing.courses.find((c) => c.moodleCourseId === demoMoodleCourseId) ?? existing.courses[0];
    const launch = await call('POST', `/api/courses/${first.courseId ?? first.id}/launch`);
    log(`launch minted (enrolled in Moodle): ${launch.url.replace(/token=[^&]+/, 'token=…')}`);
    log(`
STUDENT  ${email}  /  ${password}`);
    return;
  }
  const assessment = await call('GET', '/api/assessment');
  const answers = assessment.questions.map((q) => ({ questionId: q.id, optionId: q.options[0].id }));
  const result = await call('POST', '/api/assessment/submit', { assessmentId: assessment.id, answers });
  log(`Holland Code: ${result.codeString}`);

  const { paths } = await call('GET', '/api/paths');
  let chosen = null;
  let demoCourse = null;
  let detail = null;
  for (const path of paths) {
    detail = await call('GET', `/api/paths/${path.id}`);
    demoCourse = detail.courses.find((c) => c.moodleCourseId === demoMoodleCourseId);
    if (demoCourse) { chosen = path; break; }
  }
  if (!chosen) throw new Error(`no path offers Moodle course ${demoMoodleCourseId} — is it published and in a path?`);
  log(`path: ${chosen.name}`);

  await call('POST', '/api/my-path/select', { pathId: chosen.id });
  const others = detail.courses.filter((c) => c.id !== demoCourse.id && (c.status ?? 'AVAILABLE') === 'AVAILABLE').slice(0, 4);
  log(`available others: ${others.length}`);
  const courseIds = [demoCourse.id, ...others.map((c) => c.id)];
  await call('PUT', '/api/my-path/courses', { courseIds });
  const myPath = await call('POST', '/api/my-path/confirm');
  log(`confirmed: ${myPath.totalCount} courses`);

  const launch = await call('POST', `/api/courses/${demoCourse.id}/launch`);
  log(`launch minted (enrolled in Moodle): ${launch.url.replace(/token=[^&]+/, 'token=…')}`);
  log(`\nSTUDENT  ${email}  /  ${password}`);
}

main().catch((error) => {
  console.error('FAILED:', error.message ?? error);
  process.exit(1);
});
