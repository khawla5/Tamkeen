import { expect, test, type Page } from '@playwright/test';

import { signedInEmployee } from './account';
import {
  ADMIN_PASSWORD,
  activePathAssessmentVersion,
  assignPathById,
  assignSeededPath,
  placementFor,
  releaseAdmin,
  seedAdmin,
  type SeededAdmin,
} from './admin-fixtures';
import { completeAssessment } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * §4C.3's end-to-end path, rebuilt for D-134's per-path instrument:
 *
 *   an employee is placed on version 1 → an admin opens a draft copy →
 *   a newly added question blocks publish for having no correct answer,
 *   named in Arabic → marking one clears it → publishing activates
 *   version 2 → a NEW taker is served the larger bank → and the first
 *   employee's placement is exactly what it was
 *
 * **The last assertion is the phase.** D-049 says a placement is frozen as
 * made, and every other test in this suite is scaffolding for the moment
 * that claim is checked against a real database after a real publish through
 * a real browser.
 *
 * Serial, with pages kept across tests: a completed assessment and a real
 * placement are expensive, and everything downstream depends on them
 * existing.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 5 — assessment management (D-134)', () => {
  let adminPage: Page;
  let learnerPage: Page;
  let admin: SeededAdmin;

  let pathId: string;
  let pathName: string;
  let learnerEmail: string;
  let before: Awaited<ReturnType<typeof placementFor>>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await assertMailpitReachable();

    admin = await seedAdmin();

    learnerPage = await browser.newPage();
    const learner = await signedInEmployee(learnerPage, 'assess-before');
    learnerEmail = learner.email;

    ({ pathId, pathName } = await assignSeededPath(learnerEmail));
    await learnerPage.goto('/');
    await learnerPage.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await completeAssessment(learnerPage);
    await expect(learnerPage).toHaveURL(`http://localhost:3000/paths/${pathId}`, {
      timeout: 20_000,
    });

    before = await placementFor(learnerEmail, pathId);
    expect(before.assessmentVersion).toBe(1);

    adminPage = await browser.newPage();
  });

  test.afterAll(async () => {
    await adminPage?.close();
    await learnerPage?.close();
    await releaseAdmin(admin);
  });

  test('an admin reaches the path’s assessment page and sees what is in force', async () => {
    await adminPage.goto('/login');
    await adminPage.getByLabel('البريد الإلكتروني').fill(admin.email);
    await adminPage.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });

    await adminPage.goto(`/admin/assessment/${pathId}`);

    await expect(adminPage.getByRole('heading', { name: pathName })).toBeVisible();
    await expect(adminPage.getByText('الإصدار 1', { exact: true })).toBeVisible();
  });

  test('the frozen-placements rule is stated before the edit begins', async () => {
    /* Not after. An administrator who does not know their edit is safe will
       leave the assessment alone forever, and the ministry never improves it. */
    await expect(adminPage.getByText(/نتائج من أكملوا التقييم لا تتغيّر/)).toBeVisible();
  });

  test('editing opens a draft copied from the active version', async () => {
    await adminPage.getByRole('button', { name: 'بدء التعديل' }).click();

    await expect(adminPage.getByText('مسودة الإصدار 2')).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText('9 سؤالًا')).toBeVisible();
    await expect(adminPage.getByText('البنك متوازن وجاهز للنشر.')).toBeVisible();
  });

  test('a newly added question blocks publish, in Arabic, until it has an answer', async () => {
    await adminPage.getByRole('button', { name: 'إضافة سؤال', exact: true }).click();

    const dialog = adminPage.locator('dialog');
    await dialog.getByLabel('نص السؤال').fill('ما هي الخطوة الأولى عند استلام شكوى من متعامل؟');
    await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();
    await expect(adminPage.locator('dialog')).toHaveCount(0);

    await expect(adminPage.getByText('10 سؤالًا')).toBeVisible();

    /* A freshly added question has four blank options, none of them correct
       (BE-134's own AddDraftQuestionDto shape) — so this is a real blocker,
       not a contrived one. Scoped to the readiness panel's own alert: adding
       a tenth question also moves the attainable range, so the band editor
       raises a second, independent alert of its own the moment this one
       does — both real, but this assertion is about the bank's. */
    const alert = adminPage.getByRole('alert').filter({ hasText: 'لا يمكن النشر' });
    await expect(alert).toContainText('لا يمكن النشر');
    await expect(alert).toContainText('يوجد سؤال بلا إجابة صحيحة محددة.');

    await expect(adminPage.getByRole('button', { name: 'نشر الإصدار' })).toBeDisabled();
  });

  test('marking an option correct clears the blocker', async () => {
    const lastQuestion = adminPage.locator('ol > li').last();
    await lastQuestion.getByRole('button', { name: 'عرض الخيارات' }).click();

    /* `check()` insists the box changes state the instant it is clicked; this
       radio is controlled by the saved draft, so it changes when the server has
       answered. Click, then wait for it. */
    const correct = lastQuestion.getByRole('radio', { name: 'الإجابة الصحيحة' }).first();
    await correct.click();
    await expect(correct).toBeChecked();

    await expect(adminPage.getByText('البنك متوازن وجاهز للنشر.')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'نشر الإصدار' })).toBeEnabled();
  });

  test('publishing states the rule once more, then activates version 2', async () => {
    await adminPage.getByRole('button', { name: 'نشر الإصدار' }).click();

    await expect(adminPage.getByText(/لا يُعاد احتسابها/)).toBeVisible();
    /* Scoped, and exact: 'نشر' also matches 'نشر الإصدار' behind the modal. */
    await adminPage.locator('dialog').getByRole('button', { name: 'نشر', exact: true }).click();

    /* Exact: while the dialog is closing, 'الإصدار 2' also appears inside
       'مسودة الإصدار 2' and 'سيصبح الإصدار 2 هو…'. Only the version card's own
       heading is exactly this. */
    await expect(adminPage.getByText('الإصدار 2', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(adminPage.getByText('الإصدارات السابقة')).toBeVisible();

    expect(await activePathAssessmentVersion(pathId)).toBe(2);
  });

  test('a NEW taker on the same path is served the larger bank', async ({ browser }) => {
    const page = await browser.newPage();

    const taker = await signedInEmployee(page, 'assess-after');
    /* The same path the admin just edited — assigned directly by id, rather
       than through {@link assignSeededPath}'s own pick, since this test's
       whole point is a second taker on *that* path. */
    await assignPathById(taker.email, pathId);

    await page.goto('/');
    await page.getByRole('link', { name: 'ابدأ التقييم' }).click();

    /* Ten now. The progress indicator is the taker-facing proof that the
       publish actually reached them. */
    await expect(page.getByText('السؤال 1 من 10')).toBeVisible({ timeout: 20_000 });

    await page.close();
  });

  test('and the first employee’s placement is exactly what it was', async () => {
    const after = await placementFor(learnerEmail, pathId);

    /*
     * The phase, in one assertion. Not "the level looks similar" — the same
     * level, the same score, still pointing at version 1, which still exists
     * because publishing retires a version rather than replacing it (D-049).
     */
    expect(after).toEqual(before);
  });

  test('their path page still renders, reading the retired version', async () => {
    await learnerPage.goto(`/paths/${pathId}`);

    await expect(learnerPage.getByText(/^مستواك في هذا المسار: /)).toBeVisible({
      timeout: 20_000,
    });
    await expect(learnerPage.locator('body')).not.toContainText('حدث خطأ');
  });
});
