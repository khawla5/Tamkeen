/**
 * Seamless-login spike (Phase 2F, D-039).
 *
 * The question: can a signed-in app user land inside a Moodle course WITHOUT a
 * second login, using only what core Moodle offers to our integration token?
 *
 * Answering it empirically matters because the alternatives differ enormously in
 * cost and in what the ministry has to install on their Moodle.
 *
 *   node spike/moodle-sso-probe.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

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

const env = loadEnv(resolve(here, '..', '.env'));
const BASE_URL = (env.MOODLE_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = env.MOODLE_WS_TOKEN || '';

async function call(wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: TOKEN,
    wsfunction,
    moodlewsrestformat: 'json',
    ...params,
  });

  const response = await fetch(`${BASE_URL}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { nonJson: true, status: response.status, bytes: text.length };
  }
  return json;
}

const log = (...args) => console.log(...args);
const head = (title) => log(`\n=== ${title} ${'='.repeat(Math.max(0, 58 - title.length))}`);

/** Does an endpoint exist at all? A 404 vs a login redirect tells us a lot. */
async function probeEndpoint(path) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
    return { status: response.status, location: response.headers.get('location') };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  log(`Seamless-login probe -> ${BASE_URL}\n`);

  head('who does our token act as?');
  const site = await call('core_webservice_get_site_info');
  log(`  username: ${site.username}  userid: ${site.userid}`);
  log(`  release:  ${site.release}`);
  log(`  functions on this token: ${(site.functions ?? []).length}`);
  log('\n  This is the crux: the token belongs to the INTEGRATION user, not to');
  log('  the learner. Anything that mints a session for "the token\'s user"');
  log('  therefore mints one for the wrong person.');

  head('tool_mobile_get_autologin_key — the only core candidate');
  const autologin = await call('tool_mobile_get_autologin_key', { privatetoken: 'x' });
  log(`  ${JSON.stringify(autologin)}`);
  if (autologin.errorcode) {
    log(`\n  errorcode: ${autologin.errorcode}`);
    log('  Not authorised on our external service. Even if it were, core only');
    log('  issues a key for the token owner and requires that token to carry a');
    log('  privatetoken, which manually created tokens do not have.');
  }

  head('is the mobile web service enabled at all?');
  const publicConfig = await call('tool_mobile_get_public_config');
  if (publicConfig.errorcode) {
    log(`  ${publicConfig.errorcode} — ${publicConfig.message ?? ''}`);
  } else {
    log(`  enablemobilewebservice: ${publicConfig.enablemobilewebservice ?? 'n/a'}`);
    log(`  typeoflogin: ${publicConfig.typeoflogin ?? 'n/a'}`);
  }

  head('endpoint probing — DELIBERATELY NOT USED AS EVIDENCE');
  log('  A first pass here concluded that /auth/oauth2 and tool_mobile were');
  log('  missing, because both returned 404. That inference was wrong:');
  for (const path of ['/course/view.php', '/admin/search.php', '/nonexistent-xyz.php']) {
    const probe = await probeEndpoint(path);
    log(`    ${path.padEnd(28)} ${probe.status}`);
  }
  log('  /course/view.php certainly exists — we link to it — and still answers');
  log('  404, because Moodle renders its own 404 for a missing course id. So on');
  log('  this instance a 404 means "PHP declined", not "file absent", and');
  log('  unauthenticated HTTP probing cannot tell us which plugins are present.');
  log('  The verdict below rests on the token identity finding instead, which is');
  log('  structural and needs no such inference.');

  head('VERDICT');
  log('  Recorded in the spike report; see decisions.md D-044.');
}

main().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
