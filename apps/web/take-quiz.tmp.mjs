/**
 * Automates the Phase 2 "human step": signs in as the spike's learner, mints a
 * fresh SSO handoff, lands in real Moodle, and takes the one-question quiz.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const state = JSON.parse(readFileSync('../../spike/.real-pass-state.json', 'utf8'));
const API = 'http://localhost:4000';
const PASSWORD = 'a-sufficiently-long-password';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Sign in through the API so the context carries the session cookie.
const csrf = await context.request.get(`${API}/api/auth/csrf`).then((r) => r.json());
const login = await context.request.post(`${API}/api/auth/login`, {
  headers: { 'x-csrf-token': csrf.csrfToken },
  data: { email: state.email, password: PASSWORD },
});
if (!login.ok()) throw new Error(`login ${login.status()}`);

// Mint the handoff (single-use, 60s) and follow it immediately.
const launch = await context.request
  .post(`${API}/api/courses/${state.courseId}/launch`, {
    headers: { 'x-csrf-token': csrf.csrfToken },
  })
  .then((r) => r.json());
console.log('handoff minted');

await page.goto(launch.url, { waitUntil: 'domcontentloaded' });
console.log('landed on:', page.url());
await page.screenshot({ path: 'landed.tmp.png' });
console.log('title:', await page.title());
console.log('links:', await page.locator('a').evaluateAll((as) => as.map((a) => a.textContent.trim() + ' -> ' + a.href).filter((t) => /quiz|اختبار/.test(t))));

// Into the quiz. Arabic UI with English fallbacks at every step.
const quizHref = await page.locator('a[href*="mod/quiz/view.php"]').first().getAttribute('href');
await page.goto(quizHref, { waitUntil: 'domcontentloaded' });
console.log('quiz page:', page.url());

const attempt = page.getByRole('button', {
  name: /بدء المحاولة|ابدأ المحاولة|Attempt quiz|إعادة المحاولة|Re-attempt/i,
});
await attempt.first().click();
await page.waitForLoadState('domcontentloaded');
console.log('attempt started:', page.url());

// Answer نعم.
await page
  .getByLabel(/نعم/)
  .first()
  .check()
  .catch(async () => {
    await page.locator('input[type="radio"]').first().check();
  });
console.log('answered');

// Finish attempt → summary page.
await page
  .getByRole('button', { name: /إنهاء المحاولة|Finish attempt/i })
  .first()
  .click();
await page.waitForLoadState('domcontentloaded');

// Submit all and finish, then its confirmation dialog.
await page
  .getByRole('button', { name: /سلّم الكل|تسليم الكل|Submit all/i })
  .first()
  .click();
const dialogButton = page
  .locator('.modal, [role="dialog"]')
  .getByRole('button', { name: /سلّم الكل|تسليم الكل|Submit all/i });
await dialogButton.first().click({ timeout: 10_000 }).catch(() => {});
await page.waitForLoadState('domcontentloaded');

// The review page shows the grade.
await page.waitForTimeout(1500);
const body = await page.locator('body').innerText();
const graded = /100[.,]?0?0?|درجتك|Grade/i.test(body);
console.log('review page reached:', page.url());
console.log('grade visible:', graded);

await page.screenshot({ path: 'quiz-review.tmp.png', fullPage: false });
await browser.close();
console.log('done — quiz submitted');
