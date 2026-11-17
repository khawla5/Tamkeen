import { expect, test } from '@playwright/test';

import { signedInEmployee } from './account';
import { ADMIN_PASSWORD, releaseAdmin, seedAdmin, type SeededAdmin } from './admin-fixtures';
import { completeAssessment } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * The Phase 1 end-to-end happy path, rebuilt for D-130/D-134:
 *
 *   nothing to do until the ministry assigns a path → an administrator
 *   assigns one → the learner sits its placement assessment → the ladder
 *   shows where they landed → into a course, through the player
 *
 * Driven through a real browser against the built app, real PostgreSQL and the
 * mock LMS. Nothing is stubbed, including registration and the admin's own
 * assignment screen — the two halves of the journey a real employee and a real
 * administrator actually make.
 */

test.beforeAll(async () => {
  await assertMailpitReachable();
});

test.describe('Phase 1 journey (D-134)', () => {
  let admin: SeededAdmin;

  test.afterAll(async () => {
    if (admin) await releaseAdmin(admin);
  });

  test('assign → placement assessment → ladder → course', async ({ browser }) => {
    test.setTimeout(120_000);

    const learnerPage = await browser.newPage();
    const account = await signedInEmployee(learnerPage, 'journey');

    // ── Nothing assigned yet: one thing to see, and it is not a button ────────
    await expect(
      learnerPage.getByRole('heading', { name: 'لم يُسند إليك مسار بعد' }),
    ).toBeVisible();

    /* §4.2 (D-071, restated for D-134): before a path exists the nav is
       Dashboard and Profile — two items, nothing else to wander into. */
    const nav = learnerPage.getByRole('navigation', { name: 'التنقل الرئيسي' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'الدورات' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'مساري' })).toHaveCount(0);
    await page.goto('/results');

    // ── Build the path ────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'استعرض المسار' }).first().click();
    await expect(page).toHaveURL(/\/paths\//);

    await expect(page.getByText('اخترت 0 من 5–10')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تأكيد المسار' })).toBeDisabled();

    for (let selected = 1; selected <= 5; selected += 1) {
      await page.getByRole('button', { name: 'أضف' }).first().click();
      await expect(page.getByText(`اخترت ${selected} من 5–10`)).toBeVisible();
    }

    await expect(page.getByRole('button', { name: 'تأكيد المسار' })).toBeEnabled();

    // ── The hard commitment gate ──────────────────────────────────────────────
    await page.getByRole('button', { name: 'تأكيد المسار' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('لا يمكنك تغيير المسار بعد ذلك');
    await expect(dialog).toContainText('عدد الدورات: 5');

    await dialog.getByRole('button', { name: 'نعم، أكّد المسار' }).click();

    // ── My Path ───────────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/my-path$/, { timeout: 15_000 });

    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');
    await expect(page.getByText('0 من 5 دورات مكتملة')).toBeVisible();
    /* Exactly one course is next up — §4.9's "must not compete with continue". */
    await expect(page.getByText('التالية', { exact: true })).toHaveCount(1);
    /* Passed, not merely finished — the gate Phase 3 corrected. */
    await expect(page.getByText('تُفتح عند اجتياز دوراتك الـ5 — بقيت 5.')).toBeVisible();
    /* TAM-126: the next-up course holds the page's only action. */
    await expect(page.getByRole('link', { name: 'ابدأ الدورة' })).toHaveCount(1);

    // ── Into a course, through the player (§4.8, Phase 2) ─────────────────────
    /* The Phase 2 user-visible flow: My Path no longer links at the LMS
       directly, because that deep link carries no session. Entry goes through
       the player, which mints a signed single-use handoff on click (D-044). */
    await page.getByRole('link', { name: 'ابدأ الدورة' }).first().click();
    await expect(page).toHaveURL(/\/courses\/[0-9a-f-]+\/player$/, { timeout: 15_000 });

    await expect(page.getByText('الدورة 1 من 5')).toBeVisible();
    await expect(page.getByText(/منصة التعلّم/)).toBeVisible();

    /* Nothing has been attempted, so no outcome is claimed either way. */
    await expect(page.getByText('اجتزت هذه الدورة')).toHaveCount(0);
    await expect(page.getByText('لم تجتز هذه الدورة بعد')).toHaveCount(0);

    /* One action, and the handoff URL is NOT in the page — it is minted when
       the learner clicks, so a credential never sits in the rendered markup. */
    await expect(page.getByRole('button', { name: 'ابدأ الدورة' })).toBeVisible();
    expect(await page.content()).not.toContain('tamkeensso');

    /* The catalogue itself opens only once a path is assigned — the URL
       bounces to the dashboard exactly as the nav says it would. */
    await learnerPage.goto('/courses');
    await expect(learnerPage).toHaveURL('http://localhost:3000/');

    // ── An administrator assigns a path (§4C.2, D-133) ────────────────────────
    admin = await seedAdmin();
    const adminPage = await browser.newPage();

    await adminPage.goto('/login');
    await adminPage.getByLabel('البريد الإلكتروني').fill(admin.email);
    await adminPage.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });

    await adminPage.getByRole('link', { name: 'الحسابات' }).click();
    await adminPage.getByLabel('بحث').fill(account.email);
    /* The search narrows asynchronously (no debounce, but a real API round
       trip) — scoped to the account's own row rather than the bare "إدارة"
       button, so this waits for that row specifically instead of racing
       whichever page of unfiltered rows loaded first. */
    const row = adminPage.getByRole('row', { name: account.email });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'إدارة' }).click();

    const assignFieldset = adminPage.getByRole('group', { name: 'إسناد مسارات' });
    const firstPath = assignFieldset.locator('label').first();
    const pathName = (await firstPath.textContent())!.trim();
    await firstPath.locator('input[type="checkbox"]').check();
    await assignFieldset.getByRole('button', { name: 'إسناد' }).click();
    await expect(adminPage.getByText('أُسند المسار.')).toBeVisible();

    // ── The dashboard now offers the placement assessment ─────────────────────
    await learnerPage.goto('/');
    await expect(learnerPage.getByRole('heading', { name: pathName })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'الدورات' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'مساري' })).toBeVisible();

    await learnerPage.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await expect(learnerPage).toHaveURL(/\/paths\/[0-9a-f-]+\/assessment$/);
    const assessmentUrl = learnerPage.url();
    const pathId = assessmentUrl.match(/\/paths\/([0-9a-f-]+)\/assessment$/)![1]!;

    // ── The assessment itself ──────────────────────────────────────────────
    /* D-073's rule, restated: the sidebar stays during the assessment, and
       leaving mid-way keeps the answers. The nav is already the full six —
       courses and My Path both appear the moment a path is assigned, even
       before the assessment has placed the learner on it. */
    await expect(nav.getByRole('link')).toHaveCount(6);
    for (let i = 0; i < 2; i += 1) {
      await learnerPage.getByRole('radio').first().check();
      await learnerPage.getByRole('button', { name: 'التالي' }).click();
    }
    await expect(learnerPage.getByText(/^السؤال 3 من \d+$/)).toBeVisible();
    await nav.getByRole('link', { name: 'الملف الشخصي' }).click();
    await expect(learnerPage).toHaveURL(/\/profile$/);
    await learnerPage.goto(assessmentUrl);
    await expect(learnerPage.getByText(/^السؤال 3 من \d+$/)).toBeVisible();

    await completeAssessment(learnerPage, 3);

    // ── The ladder: placed ──────────────────────────────────────────────────
    await expect(learnerPage).toHaveURL(`http://localhost:3000/paths/${pathId}`, {
      timeout: 15_000,
    });
    await expect(learnerPage.getByText(/^مستواك في هذا المسار: /)).toBeVisible();

    // ── The commitment is visible everywhere afterwards ────────────────────
    await learnerPage.goto('/');
    await expect(learnerPage.getByText(/^مستواك في هذا المسار: /)).toBeVisible();

    // ── Into a course, through the player (§4.8) ───────────────────────────
    await learnerPage.goto(`/my-path?pathId=${pathId}`);
    await learnerPage.getByRole('link', { name: 'ابدأ الدورة' }).first().click();
    await expect(learnerPage).toHaveURL(/\/courses\/[0-9a-f-]+\/player$/, { timeout: 15_000 });

    /* The frame itself is the one action — it mounts on its own once the mock
       LMS answers the launch request. */
    const frame = learnerPage.locator('iframe').first();
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveAttribute('src', /tamkeensso/);

    await learnerPage.getByRole('link', { name: 'العودة إلى مساري' }).click();
    await expect(learnerPage).toHaveURL(/\/my-path/, { timeout: 15_000 });
  });
});
