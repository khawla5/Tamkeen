import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const state = JSON.parse(readFileSync('../../spike/.real-pass-state.json', 'utf8'));
const API = 'http://localhost:4000';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const csrf = await context.request.get(`${API}/api/auth/csrf`).then((r) => r.json());
await context.request.post(`${API}/api/auth/login`, {
  headers: { 'x-csrf-token': csrf.csrfToken },
  data: { email: state.email, password: 'a-sufficiently-long-password' },
});
const launch = await context.request
  .post(`${API}/api/courses/${state.courseId}/launch`, {
    headers: { 'x-csrf-token': csrf.csrfToken },
  })
  .then((r) => r.json());
await page.goto(launch.url, { waitUntil: 'domcontentloaded' });

await page.goto('http://localhost:8080/mod/quiz/summary.php?attempt=1&cmid=8', {
  waitUntil: 'domcontentloaded',
});
console.log('on:', page.url());

console.log('forms:', await page.locator('form').evaluateAll((fs) => fs.map((f) => f.action)));
console.log(
  'buttons:',
  await page
    .locator('button, input[type=submit]')
    .evaluateAll((bs) => bs.map((b) => b.textContent?.trim() || b.value)),
);
// Submit the processattempt form directly — the confirm modal is UI, not contract.
await page.evaluate(() => {
  const form = [...document.querySelectorAll('form')].find((f) =>
    f.action.includes('processattempt'),
  );
  if (!form) throw new Error('no processattempt form');
  form.submit();
});
console.log('form submitted');

// The confirmation modal.
const confirm = page
  .locator('.modal-dialog, .moodle-dialogue-confirm, [role="dialog"]')
  .getByRole('button', { name: /Submit all|سلّم|تسليم/i })
  .first();
await confirm.click({ timeout: 10_000 }).catch(() => console.log('no modal (direct submit)'));
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1500);

console.log('final url:', page.url());
const body = await page.locator('body').innerText();
const gradeLine = body
  .split('\n')
  .filter((line) => /Grade|درجة|Marks|100/i.test(line))
  .slice(0, 6);
console.log(gradeLine);
await browser.close();
