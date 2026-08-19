/**
 * Phase 2 spike — prove the core Moodle loop before building anything.
 *
 *   provision a user  →  enrol them in a real course  →  they complete it +
 *   take the quiz in Moodle  →  we detect completion + grade
 *
 * Deliberately a throwaway script, not application code:
 *  - plain Node ESM, no build step, no Nest, no Prisma;
 *  - talks to Moodle's REST endpoint directly, so what it proves is a property
 *    of *Moodle*, not of our adapter;
 *  - everything it learns about payload shapes and failure modes is what the
 *    real `MoodleHttpService` gets written against.
 *
 * Usage:
 *   node spike/moodle-spike.mjs probe    # site info + courses + roles
 *   node spike/moodle-spike.mjs setup    # provision + enrol + read baseline
 *   node spike/moodle-spike.mjs check    # re-read completion/grade (idempotency)
 *
 * The WS token is read from .env and never printed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

// ── config ──────────────────────────────────────────────────────────────────

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv(envPath);
const BASE_URL = (env.MOODLE_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = env.MOODLE_WS_TOKEN || '';

if (!BASE_URL) throw new Error('MOODLE_BASE_URL is not set in .env');
if (!TOKEN) throw new Error('MOODLE_WS_TOKEN is not set in .env');

const argv = process.argv.slice(2);
const command = argv.find((a) => !a.startsWith('--')) ?? 'probe';
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/* Fixed so `setup` and `check` address the same learner across runs — which is
   also what makes the idempotency claim testable rather than assumed. */
const SPIKE_EMAIL = flag('email', 'spike.learner@ministry.gov.example');
const SPIKE_USERNAME = flag('username', 'spike.learner');
const COURSE_ID = Number(flag('course', '2'));
const STUDENT_ROLE_ID = Number(flag('role', '5'));

// ── the REST call ───────────────────────────────────────────────────────────

/**
 * Moodle's core REST protocol answers **HTTP 200 even for errors**, putting an
 * `exception` key in the JSON body instead (the Catalyst RESTful plugin is what
 * would give real status codes; it is not installed). So the status line proves
 * nothing and the body has to be inspected on every call — the single most
 * important thing this spike pins down for the real adapter.
 */
async function call(wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: TOKEN,
    wsfunction,
    moodlewsrestformat: 'json',
    ...flatten(params),
  });

  const started = Date.now();
  let response;
  try {
    response = await fetch(`${BASE_URL}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    throw new Error(`TRANSPORT ${wsfunction}: ${cause.message}`);
  }
  const ms = Date.now() - started;

  const text = await response.text();
  let json;
  try {
    json = text.length ? JSON.parse(text) : null;
  } catch {
    /* Never echo the body: a Moodle stack trace or debug dump can contain the
       token that was posted. */
    throw new Error(`NON_JSON ${wsfunction}: HTTP ${response.status}, ${text.length} bytes`);
  }

  if (json && typeof json === 'object' && !Array.isArray(json) && json.exception) {
    const error = new Error(`MOODLE ${wsfunction}: ${json.errorcode} — ${json.message}`);
    error.moodle = { httpStatus: response.status, errorcode: json.errorcode };
    throw error;
  }

  timings.push({ wsfunction, ms, httpStatus: response.status });
  return json;
}

const timings = [];

/** Moodle expects PHP-style nested form keys: `users[0][username]=x`. */
function flatten(value, prefix = '', out = {}) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, prefix ? `${prefix}[${index}]` : `${index}`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flatten(item, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out[prefix] = String(value);
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const log = (...args) => console.log(...args);
const head = (title) => log(`\n=== ${title} ${'='.repeat(Math.max(0, 60 - title.length))}`);

function randomPassword() {
  /* Must satisfy Moodle's default policy: 8+, upper, lower, digit, non-alnum. */
  const pick = (set, n) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3)}${pick('abcdefghijkmnpqrstuvwxyz', 4)}${pick('23456789', 3)}${pick('!@#$%^&*', 2)}`;
}

/**
 * The username we give a Moodle account, derived from the email.
 *
 * We are the identity owner (D-000), so the username is *ours* to choose. That
 * matters more than it looks: see `findUserByEmail` below — under a
 * least-privilege token Moodle will not let us search by email at all, so a
 * key we control is the only reliable way to make provisioning idempotent.
 */
function usernameFor(email) {
  return email
    .trim()
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '.');
}

/**
 * Enrol, then **verify before believing the error**.
 *
 * This instance throws "Message was not sent." from the course-welcome email
 * *after* the enrolment has already committed. A naive adapter would treat that
 * as a failure and audit a successful enrolment as failed — and under D-036,
 * where enrolment is best-effort and the audit log is the only trace, that is a
 * silently wrong operational record.
 *
 * So: on error, read the enrolments back. Only a genuine absence is a failure.
 * This is a property of the *call*, not of this instance's broken mail, and it
 * is how the real adapter must behave.
 */
async function enrolTolerant(userId, label) {
  try {
    const result = await call('enrol_manual_enrol_users', {
      enrolments: [{ roleid: STUDENT_ROLE_ID, userid: userId, courseid: COURSE_ID }],
    });
    log(`  ${label}: ✓ clean, returned ${JSON.stringify(result)}`);
    return;
  } catch (error) {
    log(`  ${label}: threw — ${error.moodle?.errorcode ?? error.message}`);
    const list = await call('core_enrol_get_users_courses', { userid: userId });
    const ok = Array.isArray(list) && list.some((c) => c.id === COURSE_ID);
    log(
      ok
        ? '           …but the enrolment IS present ⇒ treat as success'
        : '           …and the enrolment is ABSENT ⇒ genuine failure',
    );
    if (!ok) throw error;
  }
}

async function findUserByEmail(email) {
  /* Primary route — and it comes back EMPTY on this instance. The integration
     role has no `moodle/site:viewuseridentity`, so Moodle strips `email` from
     the response *and* silently matches nothing when searching on it. No
     exception, no warning: an adapter that trusted this would create a duplicate
     account on every retry. */
  const byEmail = await call('core_user_get_users_by_field', { field: 'email', values: [email] });
  if (Array.isArray(byEmail) && byEmail.length) return byEmail[0];

  /* Fallback that actually works under least privilege. */
  const byUsername = await call('core_user_get_users_by_field', {
    field: 'username',
    values: [usernameFor(email)],
  });
  return Array.isArray(byUsername) && byUsername.length ? byUsername[0] : null;
}

// ── commands ────────────────────────────────────────────────────────────────

async function probe() {
  head('core_webservice_get_site_info');
  const site = await call('core_webservice_get_site_info');
  log({
    sitename: site.sitename,
    release: site.release,
    version: site.version,
    username: site.username,
    userid: site.userid,
    lang: site.lang,
    functionCount: site.functions?.length,
  });

  head('functions authorised on this token');
  const names = (site.functions ?? []).map((f) => f.name).sort();
  const wanted = [
    'core_user_create_users',
    'core_user_get_users_by_field',
    'core_course_get_courses',
    'core_course_get_contents',
    'enrol_manual_enrol_users',
    'core_enrol_get_users_courses',
    'core_completion_get_course_completion_status',
    'gradereport_user_get_grade_items',
  ];
  for (const fn of wanted) log(`  ${names.includes(fn) ? '✓' : '✗ MISSING'}  ${fn}`);

  head('core_course_get_courses');
  const courses = await call('core_course_get_courses');
  for (const c of courses) {
    log(
      `  id=${String(c.id).padEnd(4)} visible=${c.visible} format=${String(c.format).padEnd(8)} ` +
        `enablecompletion=${c.enablecompletion} "${c.fullname}"`,
    );
  }

  /* What the catalogue sync will actually be able to fill in. */
  head('LmsCourse field availability (real Moodle vs our type)');
  const sample = courses.find((c) => c.id === COURSE_ID) ?? courses[1] ?? courses[0];
  if (sample) {
    log(`  sample course id=${sample.id}`);
    log(`  title        ← fullname:  ${JSON.stringify(sample.fullname)}`);
    log(`  summary      ← summary:   ${JSON.stringify((sample.summary ?? '').slice(0, 80))}`);
    log(`  visible      ← visible:   ${sample.visible}`);
    log(`  durationMinutes  → candidates present?`);
    log(`      startdate=${sample.startdate} enddate=${sample.enddate}`);
    log(`      customfields=${JSON.stringify(sample.customfields ?? null)}`);
    log(`  (all keys: ${Object.keys(sample).join(', ')})`);
  }
}

async function setup() {
  head('site');
  const site = await call('core_webservice_get_site_info');
  log(`  ${site.sitename} — ${site.release} (as ws user "${site.username}")`);

  head(`provision user  <${SPIKE_EMAIL}>`);
  let user = await findUserByEmail(SPIKE_EMAIL);

  if (user) {
    log(`  already exists → id=${user.id}  (this is the idempotent path)`);
  } else {
    const password = randomPassword();
    const created = await call('core_user_create_users', {
      users: [
        {
          username: SPIKE_USERNAME,
          password,
          firstname: 'متدرب',
          lastname: 'تجريبي',
          email: SPIKE_EMAIL,
          auth: 'manual',
          lang: 'en',
        },
      ],
    });
    user = created[0];
    log(`  created → id=${user.id}`);
    log(`  ┌─────────────────────────────────────────────────────────────┐`);
    log(`  │ SPIKE-ONLY credentials for the throwaway Moodle:            │`);
    log(`  │   username: ${SPIKE_USERNAME}`);
    log(`  │   password: ${password}`);
    log(`  └─────────────────────────────────────────────────────────────┘`);
  }

  head('provision again (idempotency check)');
  const again = await findUserByEmail(SPIKE_EMAIL);
  log(`  lookup by email → id=${again.id}  ${again.id === user.id ? '✓ same id' : '✗ DIFFERENT'}`);
  try {
    await call('core_user_create_users', {
      users: [
        {
          username: SPIKE_USERNAME,
          password: randomPassword(),
          firstname: 'متدرب',
          lastname: 'تجريبي',
          email: SPIKE_EMAIL,
          auth: 'manual',
        },
      ],
    });
    log('  ✗ blind re-create SUCCEEDED — adapter must look up first');
  } catch (error) {
    log(`  ✓ blind re-create rejected: ${error.moodle?.errorcode ?? error.message}`);
    log('    → provisionUser must be lookup-then-create, not create-then-catch');
  }

  head(`enrol user ${user.id} in course ${COURSE_ID} (role ${STUDENT_ROLE_ID})`);
  await enrolTolerant(user.id, 'first');

  log('\n  enrolling again (idempotency)…');
  await enrolTolerant(user.id, 'second');

  head('core_enrol_get_users_courses');
  const enrolled = await call('core_enrol_get_users_courses', { userid: user.id });
  for (const c of enrolled) log(`  id=${c.id} "${c.fullname}" progress=${c.progress}`);
  log(
    enrolled.some((c) => c.id === COURSE_ID)
      ? '  ✓ course present → isEnrolled() can be built on this'
      : '  ✗ course ABSENT',
  );

  await readProgress(user.id);
  printNextSteps(user.id);
}

async function check() {
  const user = await findUserByEmail(SPIKE_EMAIL);
  if (!user) throw new Error(`No spike user <${SPIKE_EMAIL}> — run "setup" first.`);
  log(`spike learner id=${user.id}`);
  await readProgress(user.id);
  log('\nRe-run this command freely: it only reads. Same input ⇒ same output.');
}

/** The detection half of the loop — exactly what the sync job will do. */
async function readProgress(userId) {
  head('core_completion_get_course_completion_status');
  let completion = null;
  try {
    completion = await call('core_completion_get_course_completion_status', {
      courseid: COURSE_ID,
      userid: userId,
    });
    log(JSON.stringify(completion, null, 2));
  } catch (error) {
    log(`  ERROR ${error.message}`);
    log('  → note the errorcode: the adapter must map this, not propagate it');
  }

  head('gradereport_user_get_grade_items');
  let grades = null;
  try {
    grades = await call('gradereport_user_get_grade_items', {
      courseid: COURSE_ID,
      userid: userId,
    });
    const report = grades?.usergrades?.[0];
    if (!report) {
      log('  no usergrades entry');
    } else {
      for (const item of report.gradeitems ?? []) {
        log(
          `  [${item.itemtype}/${item.itemmodule ?? '-'}] "${item.itemname ?? '(course total)'}"\n` +
            `      graderaw=${item.graderaw} grademin=${item.grademin} grademax=${item.grademax}\n` +
            `      percentageformatted=${JSON.stringify(item.percentageformatted)} ` +
            `gradeformatted=${JSON.stringify(item.gradeformatted)}`,
        );
      }
    }
  } catch (error) {
    log(`  ERROR ${error.message}`);
  }

  head('VERDICT — what our LmsCourseProgress would be');
  /*
   * `completedAt` is NOT at completionstatus.timecompleted — there is no such
   * field. The timestamps live on the individual criteria in
   * `completionstatus.completions[]`, so the course-level completion time has to
   * be derived as the latest satisfied criterion. Reading the obvious-looking
   * path yields `null` on a course that is demonstrably complete, which would
   * have written a null timestamp into `completions` for every learner.
   */
  const status = completion?.completionstatus;
  const completed = status?.completed ?? null;
  const criterionTimes = (status?.completions ?? [])
    .filter((c) => c.complete && c.timecompleted)
    .map((c) => Number(c.timecompleted));
  const completedAtEpoch = criterionTimes.length ? Math.max(...criterionTimes) : null;
  const courseTotal = grades?.usergrades?.[0]?.gradeitems?.find((i) => i.itemtype === 'course');
  const quizItem = grades?.usergrades?.[0]?.gradeitems?.find((i) => i.itemmodule === 'quiz');
  const source = quizItem ?? courseTotal;

  let gradePercent = null;
  if (source && source.graderaw !== null && source.graderaw !== undefined) {
    const min = Number(source.grademin ?? 0);
    const max = Number(source.grademax ?? 100);
    gradePercent = max > min ? ((Number(source.graderaw) - min) / (max - min)) * 100 : null;
  }

  log(
    JSON.stringify(
      {
        lmsUserId: userId,
        lmsCourseId: COURSE_ID,
        completed,
        completedAt: completedAtEpoch ? new Date(completedAtEpoch * 1000).toISOString() : null,
        gradePercent,
        _gradeSource: source ? `${source.itemtype}/${source.itemmodule ?? '-'}` : null,
      },
      null,
      2,
    ),
  );

  const threshold = Number(env.PASS_THRESHOLD ?? 70);
  log(
    `\n  PASS_THRESHOLD=${threshold} → ` +
      (gradePercent === null
        ? 'no grade yet, so no pass/fail decision (correct: null ≠ 0)'
        : `${gradePercent.toFixed(1)}% ⇒ ${gradePercent >= threshold ? 'PASS' : 'FAIL'}`),
  );

  head('call timings');
  for (const t of timings)
    log(`  ${String(t.ms).padStart(5)}ms  HTTP ${t.httpStatus}  ${t.wsfunction}`);
}

function printNextSteps(userId) {
  head('NEXT — human step in Moodle');
  log(`  1. Open ${BASE_URL} and sign in as the spike learner (or use admin's`);
  log(`     "Log in as" on user id=${userId}).`);
  log(`  2. Open course id=${COURSE_ID}, take the quiz, submit it.`);
  log(`  3. Run:  node spike/moodle-spike.mjs check`);
}

// ── run ─────────────────────────────────────────────────────────────────────

/**
 * `core_course_get_courses` came back **without `visible`** on this instance.
 * That field drives our `courses.status` → HIDDEN_BUT_COMPLETABLE rule
 * (D-015/D-035), so the catalogue sync cannot be built without it. This compares
 * the two candidate functions to find one that returns it under a least-privilege
 * token, rather than reflexively granting `moodle/course:update`.
 */
async function courses() {
  head('core_course_get_courses — field set');
  const viaGet = await call('core_course_get_courses');
  log(`  ${viaGet.length} courses; keys on first: ${Object.keys(viaGet[0] ?? {}).join(', ')}`);
  log(`  has "visible"? ${viaGet.every((c) => 'visible' in c) ? 'yes' : 'NO'}`);

  head('core_course_get_courses_by_field — field set');
  try {
    const viaField = await call('core_course_get_courses_by_field', {});
    const list = viaField.courses ?? [];
    log(`  ${list.length} courses; warnings=${JSON.stringify(viaField.warnings ?? [])}`);
    log(`  keys on first: ${Object.keys(list[0] ?? {}).join(', ')}`);
    log(`  has "visible"? ${list.every((c) => 'visible' in c) ? 'yes' : 'NO'}`);
    for (const c of list) {
      log(
        `    id=${String(c.id).padEnd(4)} visible=${c.visible} ` +
          `enablecompletion=${c.enablecompletion} "${c.fullname}"`,
      );
      if (c.customfields?.length) {
        for (const f of c.customfields) {
          log(`        customfield ${f.shortname} (${f.type}) = ${JSON.stringify(f.value)}`);
        }
      }
    }
  } catch (error) {
    log(`  ERROR ${error.message}`);
  }
}

/**
 * `core_user_get_users_by_field` returned an EMPTY LIST for an address that
 * definitely exists — no exception, just nothing. `provisionUser`'s idempotency
 * is built on this lookup, so "which field can this token actually search on"
 * has to be answered before the adapter is written.
 */
async function user() {
  const attempts = [
    ['id', [4]],
    ['email', [SPIKE_EMAIL]],
    ['username', [SPIKE_USERNAME]],
  ];

  for (const [field, values] of attempts) {
    head(`core_user_get_users_by_field  field=${field}`);
    try {
      const found = await call('core_user_get_users_by_field', { field, values });
      log(`  raw: ${JSON.stringify(found)}`);
      log(`  → ${Array.isArray(found) ? found.length : '?'} result(s)`);
    } catch (error) {
      log(`  EXCEPTION ${error.moodle?.errorcode ?? '-'} — ${error.message}`);
    }
  }
}

/**
 * Enrolment still fails with `wsusercannotassign` after the role changes. That
 * error covers two very different causes, and they need different fixes:
 *
 *   - `moodle/role:assign` missing        → NO role is assignable  → all fail
 *   - "Allow role assignments" not ticked → SOME role is assignable → one works
 *
 * Sweeping the role ids separates them. Safe here because the instance is
 * throwaway; it stops at the first success so at most one extra enrolment is
 * created, and it reports exactly which.
 */
async function roleprobe() {
  const learner = await findUserByEmail(SPIKE_EMAIL);
  if (!learner) throw new Error('spike user missing — run "setup" first');

  head(`assignable-role sweep — user ${learner.id}, course ${COURSE_ID}`);
  for (const roleid of [5, 4, 3, 1, 2, 6, 7, 8, 9, 10]) {
    try {
      await call('enrol_manual_enrol_users', {
        enrolments: [{ roleid, userid: learner.id, courseid: COURSE_ID }],
      });
      log(`  roleid=${String(roleid).padEnd(3)} ✓ SUCCEEDED`);
      log(`\n  → "moodle/role:assign" IS effective; the Allow-role-assignments`);
      log(`    matrix permits roleid ${roleid} but not the ones tried before it.`);
      return;
    } catch (error) {
      log(`  roleid=${String(roleid).padEnd(3)} ✗ ${error.moodle?.errorcode ?? error.message}`);
    }
  }
  log(`\n  → NO roleid was assignable.`);
  log(`    This does NOT single out one cause: get_assignable_roles() returns`);
  log(`    empty both when "moodle/role:assign" is missing AND when the`);
  log(`    Allow-role-assignments row for this role is empty. Both are needed.`);
  log(`\n    What it DOES prove: "enrol/manual:enrol" is effective in course`);
  log(`    context — Moodle's require_capability() for it runs *before* the role`);
  log(`    check we are failing, so the role is being applied. The gap is`);
  log(`    specific to role assignment, not to the role assignment as a whole.`);
}

/**
 * `enrol_manual_enrol_users` now gets past the role check and dies on
 * "Message was not sent." — Moodle trying to send the course welcome email with
 * no working mail transport in the container.
 *
 * The question that matters is whether the enrolment survived. Moodle wraps the
 * whole function in a delegated transaction, so a throw *after* the insert still
 * rolls it back. Guessing is not good enough: read it back.
 */
async function enrolled() {
  const learner = await findUserByEmail(SPIKE_EMAIL);
  if (!learner) throw new Error('spike user missing — run "setup" first');

  head(`core_enrol_get_users_courses — user ${learner.id}`);
  const list = await call('core_enrol_get_users_courses', { userid: learner.id });

  if (!Array.isArray(list) || list.length === 0) {
    log('  (none)');
    log('\n  → the enrolment did NOT persist: the exception rolled the');
    log('    transaction back. This is a live blocker, not a cosmetic warning.');
    return;
  }

  for (const c of list) log(`  id=${c.id} "${c.fullname}" progress=${c.progress}`);
  log(
    list.some((c) => c.id === COURSE_ID)
      ? '\n  → enrolment DID persist despite the error: the send failure happens\n' +
          '    after commit, so it is noise the adapter should tolerate, not a blocker.'
      : '\n  → enrolled, but not in the target course.',
  );
}

/**
 * Completion reports `nocriteriaset`, and the grade report shows only a course
 * total with no quiz item. Both point at the course itself rather than at our
 * calls, so look at what is actually in it.
 */
async function contents() {
  head(`core_course_get_contents — course ${COURSE_ID}`);
  const sections = await call('core_course_get_contents', { courseid: COURSE_ID });

  for (const section of sections) {
    log(`  § "${section.name}" (${section.modules?.length ?? 0} modules)`);
    for (const m of section.modules ?? []) {
      log(
        `      [${m.modname}] "${m.name}"  id=${m.id} instance=${m.instance}\n` +
          `          completion=${m.completion} completiondata=${JSON.stringify(m.completiondata ?? null)}`,
      );
    }
  }

  const modules = sections.flatMap((s) => s.modules ?? []);
  const quizzes = modules.filter((m) => m.modname === 'quiz');
  log(`\n  → ${modules.length} module(s), ${quizzes.length} quiz(zes)`);
  log(
    quizzes.length
      ? '  → a quiz exists; the gap is course-completion CRITERIA, not the quiz'
      : '  → NO QUIZ in this course — that explains both the missing grade item\n' +
          '    and the absent completion criteria',
  );
  log('\n  completion field key: 0=none, 1=manual/self, 2=automatic');
}

/**
 * The grade report returned ONLY a course total — no `mod/quiz` item — even
 * though the grade came from a quiz. Worth dumping raw, because the adapter's
 * choice of grade source must not silently differ between this instance and the
 * ministry's.
 */
async function grades() {
  const learner = await findUserByEmail(SPIKE_EMAIL);
  head(`gradereport_user_get_grade_items — raw, course ${COURSE_ID}`);
  const raw = await call('gradereport_user_get_grade_items', {
    courseid: COURSE_ID,
    userid: learner.id,
  });
  log(JSON.stringify(raw, null, 2));

  const items = raw?.usergrades?.[0]?.gradeitems ?? [];
  head('summary');
  log(`  ${raw?.usergrades?.length ?? 0} usergrade block(s), ${items.length} grade item(s)`);
  for (const i of items) log(`    itemtype=${i.itemtype} itemmodule=${i.itemmodule ?? '-'}`);
}

const commands = { probe, setup, check, courses, user, roleprobe, enrolled, contents, grades };

if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: probe | setup | check`);
  process.exit(1);
}

try {
  log(`Moodle spike → ${BASE_URL}  (token loaded, not shown)\n`);
  await commands[command]();
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  if (error.moodle) console.error(`  moodle: ${JSON.stringify(error.moodle)}`);
  process.exit(1);
}
