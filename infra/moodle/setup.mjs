/**
 * Drives the one-time configuration of the local Moodle (docker-compose.moodle.yml):
 *
 *   npm run moodle:setup
 *
 * Installs the local_tamkeensso plugin, runs the in-container setup script
 * (web services, role, token, framing — see moodle-setup.php), and prints the
 * .env lines to copy. Safe to re-run: every step repairs rather than duplicates.
 *
 * Honours MOODLE_SSO_SECRET and APP_URL from the environment so a re-run keeps
 * an existing .env valid:  MOODLE_SSO_SECRET=… APP_URL=… npm run moodle:setup
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const CONTAINER = 'tamkeen-moodle';

function docker(args, opts = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...opts });
}

// ── wait for the install to finish ──────────────────────────────────────────
process.stdout.write('waiting for Moodle to be healthy');
for (let attempt = 0; ; attempt += 1) {
  const status = docker(['inspect', '--format', '{{.State.Health.Status}}', CONTAINER]).trim();
  if (status === 'healthy') break;
  if (attempt > 120) throw new Error(`Moodle never became healthy (${status})`);
  process.stdout.write('.');
  await new Promise((done) => setTimeout(done, 10_000));
}
console.log(' healthy');

// ── plugin + setup script into the container ────────────────────────────────
// `/.` copies the directory's CONTENTS: a bare directory copy into an existing
// target nests it one level down, and Moodle then never sees the new version.
docker(['exec', CONTAINER, 'mkdir', '-p', '/opt/bitnami/moodle/local/tamkeensso']);
docker([
  'cp',
  resolve(root, 'moodle-plugin', 'local_tamkeensso') + '/.',
  `${CONTAINER}:/opt/bitnami/moodle/local/tamkeensso`,
]);
docker(['cp', resolve(here, 'moodle-setup.php'), `${CONTAINER}:/tmp/moodle-setup.php`]);
console.log('plugin + setup script copied');

console.log('running the Moodle upgrade (installs the plugin)…');
console.log(
  docker([
    'exec',
    '-u',
    'daemon',
    CONTAINER,
    'php',
    '/opt/bitnami/moodle/admin/cli/upgrade.php',
    '--non-interactive',
  ])
    .split('\n')
    .slice(-3)
    .join('\n'),
);

// ── configure ───────────────────────────────────────────────────────────────
const ssoSecret = process.env.MOODLE_SSO_SECRET || randomBytes(32).toString('hex');
// The origin allowed to frame Moodle (TAM-129) — the portal's own URL.
const appUrl = process.env.APP_URL || 'http://localhost:3000';
const output = docker([
  // As the web-server user: PHP run as root leaves cache directories the web
  // server cannot write, and every page then dies with a permissions error.
  'exec',
  '-u',
  'daemon',
  CONTAINER,
  'php',
  '/tmp/moodle-setup.php',
  `--secret=${ssoSecret}`,
  `--appurl=${appUrl}`,
]);
console.log(output);

const token = /MOODLE_WS_TOKEN=(\w+)/.exec(output)?.[1];
if (!token) throw new Error('no token in setup output — read the log above');

console.log('──────────────────────────────────────────────────────');
console.log('Copy into .env, then restart the API:');
console.log('');
console.log('MOODLE_MODE=real');
console.log('MOODLE_BASE_URL=http://localhost:8080');
console.log(`MOODLE_WS_TOKEN=${token}`);
console.log(`MOODLE_SSO_SECRET=${ssoSecret}`);
console.log('──────────────────────────────────────────────────────');
