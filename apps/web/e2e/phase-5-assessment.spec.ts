import { expect, test, type Page } from '@playwright/test';

import { signedInEmployee } from './account';
import {
  ADMIN_PASSWORD,
  activeAssessmentVersion,
  releaseAdmin,
  resetAssessmentVersions,
  resultFor,
  seedAdmin,
  type SeededAdmin,
} from './admin-fixtures';
import { completeAssessment } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * Sub-phase 5.3's end-to-end path (§4C.3, and the heart of the Phase 5
 * "done when"):
 *
 *   an employee completes the assessment on version 1 → an admin edits the bank
 *   → an unbalanced publish is refused, in Arabic, naming the dimensions →
 *   the bank is evened up → publishing succeeds → a NEW taker is served the new
 *   bank → and the first employee's result is byte-identical to what it was
 *
 * **The last assertion is the phase.** D-049 says results are frozen as taken,
 * and every other test in this suite is scaffolding for the moment that claim is
 * checked against a real database after a real publish through a real browser.
 *
 * Serial, with pages kept across tests: a completed thirty-question assessment
 * is expensive and everything downstream depends on it existing.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 5 — assessment management', () => {
  let adminPage: Page;
  let learnerPage: Page;
  let admin: SeededAdmin;

  /** The result recorded on version 1, before anything was edited. */
  let before: Awaited<ReturnType<typeof resultFor>>;
  let learnerEmail: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await assertMailpitReachable();

    admin = await seedAdmin();

    learnerPage = await browser.newPage();
    const learner = await signedInEmployee(learnerPage, 'assess-before');
    learnerEmail = learner.email;

    await learnerPage.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await completeAssessment(learnerPage);
    await expect(learnerPage).toHaveURL(/\/results$/, { timeout: 20_000 });

    before = await resultFor(learnerEmail);
    expect(before.assessmentVersion).toBe(1);

    adminPage = await browser.newPage();
  });

  test.afterAll(async () => {
    /* Put the instrument back to a single active version 1 before the admin's
       own rows go, so the next suite — and the next run — starts where it
       expects to. */
    await resetAssessmentVersions();
    await adminPage?.close();
    await learnerPage?.close();
    await releaseAdmin(admin);
  });

  test('an admin reaches the assessment page and sees what is in force', async () => {
    await adminPage.goto('/login');
    await adminPage.getByLabel('البريد الإلكتروني').fill(admin.email);
    await adminPage.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });

    await adminPage.getByRole('link', { name: 'التقييم' }).click();

    await expect(adminPage.getByRole('heading', { name: 'إدارة التقييم' })).toBeVisible();
    await expect(adminPage.getByText('الإصدار 1', { exact: true })).toBeVisible();
    await expect(adminPage.getByText('المعمول به')).toBeVisible();
  });

  test('the frozen-results rule is stated before the edit begins', async () => {
    /* Not after. An administrator who does not know their edit is safe will
       leave the assessment alone forever, and the ministry never improves it. */
    await expect(adminPage.getByText(/نتائج من أكملوا التقييم لا تتغيّر/)).toBeVisible();
  });

  test('editing opens a draft copied from the active version', async () => {
    await adminPage.getByRole('button', { name: 'بدء التعديل' }).click();

    await expect(adminPage.getByText('مسودة الإصدار 2')).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText('30 سؤالًا')).toBeVisible();
    await expect(adminPage.getByText(/البنك متوازن وجاهز للنشر/)).toBeVisible();
  });

  /**
   * Fills in the add-question dialog.
   *
   * Scoped to the modal because every question on the page carries the same
   * field label — which is correct: they are all "نص السؤال". The ambiguity is
   * a property of the screen, not a defect, and renaming one to disambiguate a
   * test would make the Arabic worse.
   */
  async function addQuestion(text: string, letter: string) {
    await adminPage.getByRole('button', { name: 'إضافة سؤال' }).click();

    const dialog = adminPage.locator('dialog');
    await dialog.getByLabel('نص السؤال').fill(text);
    await dialog.getByLabel('البُعد').selectOption(letter);
    await dialog.getByRole('button', { name: 'إضافة', exact: true }).click();

    await expect(adminPage.locator('dialog')).toHaveCount(0);
  }

  test('adding a question to one dimension blocks the publish, in Arabic', async () => {
    await addQuestion('أستمتع بتنظيم ورش عمل تدريبية لزملائي في الإدارة.', 'S');

    /* Scoped to `main`: Next.js renders its own `role="alert"` route announcer
       at the document root, so an unscoped alert query is ambiguous — the
       ambiguity is the framework's, not a reason to weaken the assertion. */
    const alert = adminPage.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('الأبعاد الستة غير متساوية', { timeout: 20_000 });
    /* Naming what each dimension can attain is the difference between "fix the
       imbalance" and "count thirty-one questions by hand". */
    await expect(alert).toContainText('24');

    await expect(adminPage.getByRole('button', { name: 'نشر الإصدار' })).toBeDisabled();
  });

  test('evening the bank up across the other five dimensions clears it', async () => {
    for (const [letter, text] of [
      ['R', 'أفضّل معاينة المواقع ميدانيًا قبل إعداد التقرير.'],
      ['I', 'أراجع البيانات بنفسي قبل قبول أي استنتاج.'],
      ['A', 'أحب إعادة تصميم النماذج لتكون أوضح للمتعاملين.'],
      ['E', 'أبادر بعرض مقترحات التطوير على الإدارة العليا.'],
      ['C', 'أتأكد من مطابقة كل مستند للنموذج المعتمد.'],
    ] as const) {
      await addQuestion(text, letter);
    }

    await expect(adminPage.getByText('36 سؤالًا')).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(/البنك متوازن وجاهز للنشر/)).toBeVisible();
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

    expect(await activeAssessmentVersion()).toBe(2);
  });

  test('a NEW taker is served the new bank', async ({ browser }) => {
    const page = await browser.newPage();

    try {
      await signedInEmployee(page, 'assess-after');
      await page.getByRole('link', { name: 'ابدأ التقييم' }).click();

      /* Thirty-six now. The progress indicator is the taker-facing proof that
         the publish actually reached them. */
      await expect(page.getByText('السؤال 1 من 36')).toBeVisible({ timeout: 20_000 });
    } finally {
      await page.close();
    }
  });

  test('and the first employee’s result is exactly what it was', async () => {
    const after = await resultFor(learnerEmail);

    /*
     * The phase, in one assertion. Not "the numbers look similar" — the same
     * row, the same six scores, the same code, still pointing at version 1,
     * which still exists because publishing retires a version rather than
     * replacing it (D-069).
     */
    expect(after).toEqual(before);
  });

  test('their result page still renders, reading the retired version', async () => {
    await learnerPage.goto('/results');

    /* The screen a learner would open the day after an edit. It resolves through
       the retired version's rows, which is the half of D-049 that a
       scores-only guarantee misses. */
    await expect(learnerPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(learnerPage.locator('body')).not.toContainText('حدث خطأ');
  });
});
