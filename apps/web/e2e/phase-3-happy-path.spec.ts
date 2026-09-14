import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { DEPARTMENT, signedInEmployee } from './account';
import { assignSeededPath } from './admin-fixtures';
import { seedPassedCourseCertificate, type SeededCertificate } from './certificate-fixtures';
import { completeAssessment } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * The Phase 3 end-to-end happy path (§2B, and the Phase 3 "done when"):
 *
 *   a passed course yields a certificate → it appears in the gallery →
 *   it downloads as a PDF → its verification URL resolves for a stranger
 *
 *   and: open the CV builder → the certifications are already there →
 *   add an experience entry → export an English PDF with the Arabic intact
 *
 * Driven through a real browser against the built app, real PostgreSQL and the
 * mock LMS. The **CV export is a real render** — it goes through the running
 * API's own Chromium, so this run proves the PDF pipeline in the shape it is
 * actually deployed in, not just in a spike.
 *
 * Serial, with one page across the tests: getting to a certificate means
 * registering, being assigned a path and sitting its placement assessment, and
 * paying for that four times over would buy nothing.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 3 journey', () => {
  let page: Page;
  let certificate: SeededCertificate;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await assertMailpitReachable();

    page = await browser.newPage();

    const account = await signedInEmployee(page, 'phase3');
    await assignSeededPath(account.email);
    await page.goto('/');
    await page.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await completeAssessment(page);
    await expect(page).toHaveURL(/\/paths\/[0-9a-f-]+$/, { timeout: 15_000 });

    certificate = await seedPassedCourseCertificate(account.email);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the certificate reaches the gallery, and the nav says so', async () => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' });

    /*
     * Asserted through the link's accessible *name*, which is what a screen
     * reader announces — §2 allows a light indicator, and WCAG 1.4.1 forbids
     * colour being its only carrier, so the dot is paired with hidden text.
     * Matching on that text directly would also catch the shell's second,
     * CSS-hidden nav render; a role query sees only the visible one.
     */
    await expect(nav.getByRole('link', { name: 'شهاداتي لديك شهادات جديدة' })).toBeVisible();

    await nav.getByRole('link', { name: /شهاداتي/ }).click();
    await expect(page).toHaveURL(/\/certificates$/);

    await expect(page.getByRole('heading', { name: certificate.subjectTitle })).toBeVisible();
    await expect(page.getByText('شهادة دورة')).toBeVisible();

    /* Opening the gallery is the acknowledgement, so the indicator goes and the
       link goes back to being named plainly. */
    await page.goto('/');
    await expect(nav.getByRole('link', { name: 'شهاداتي', exact: true })).toBeVisible();
  });

  test('the certificate downloads as a PDF', async () => {
    await page.goto('/certificates');

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: `تنزيل شهادة ${certificate.subjectTitle}` }).click();

    const file = await download;
    const path = await file.path();

    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('a stranger can verify it without signing in, and learns nothing else', async ({
    browser,
  }) => {
    /* A fresh context: no cookies, no session — a third party holding the
       printed certificate and scanning its QR code. */
    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();

    await visitor.goto(`/verify/${certificate.verificationId}`);

    await expect(visitor.getByText('شهادة صحيحة')).toBeVisible();
    await expect(visitor.getByText(certificate.holderName)).toBeVisible();
    await expect(visitor.getByText(certificate.subjectTitle)).toBeVisible();

    /* Everything absent here is absent by design (§2, D-016). */
    const text = (await visitor.locator('body').textContent()) ?? '';
    expect(text).not.toContain('@ministry.gov.example');
    expect(text).not.toContain(DEPARTMENT);
    expect(text).not.toMatch(/\d{2,3}%/);

    await visitor.goto('/verify/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(visitor.getByText('لم يتم العثور على هذه الشهادة')).toBeVisible();

    await anonymous.close();
  });

  test('the CV builder arrives pre-filled with the earned certificate', async () => {
    await page.goto('/cv');

    await expect(page.getByLabel('الاسم الكامل')).toHaveValue(certificate.holderName);
    await expect(page.getByText('شهادات المنصة')).toBeVisible();
    /* The section that is not self-reported — §4.11's core value. */
    await expect(page.getByText(certificate.subjectTitle).first()).toBeVisible();
  });

  test('an English PDF exports, with the Arabic proper nouns intact', async () => {
    test.setTimeout(120_000);
    await page.goto('/cv');

    await page.getByLabel('المسمّى الوظيفي').fill('Training & Development Officer');
    await page.getByRole('button', { name: 'أضف خبرة' }).click();
    await page.getByLabel('الدور الوظيفي').fill('Learning Coordinator');
    await page.getByLabel('جهة العمل').fill('وزارة الداخلية');
    await page.getByLabel('تاريخ البداية').fill('2021-03');

    /* The preview is the same renderer the PDF uses, so what it shows here is
       what the file will contain. */
    const preview = page.locator('.cv-document');
    await expect(preview).toContainText('Training & Development Officer');
    await expect(preview).toContainText('Certifications');

    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('تم الحفظ')).toBeVisible({ timeout: 15_000 });

    /* Export is unavailable while there are unsaved edits, so it appears only
       now — and this render goes through the running API's real Chromium. */
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: /تصدير/ }).click();

    const file = await download;
    const bytes = readFileSync(await file.path());

    expect(file.suggestedFilename()).toMatch(/^cv[a-z0-9-]*\.pdf$/);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    /* A container has no Arabic system font; the face must travel with the
       document or the Arabic renders as tofu. */
    expect(bytes.toString('latin1')).toMatch(/IBMPlexSansArabic/);
    /* A real document, not an empty page. */
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
