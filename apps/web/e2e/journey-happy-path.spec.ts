import { expect, test } from '@playwright/test';

import { signedInEmployee } from './account';
import { completeAssessment, selectFiveCourses } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * The Phase 1 end-to-end happy path (§2B, and the Phase 1 "done when"):
 *
 *   take the assessment → get a Holland Code → see gold-highlighted paths →
 *   pick one → build 5-10 courses → confirm → land on My Path
 *
 * Driven through a real browser against the built app, real PostgreSQL and the
 * mock LMS. Nothing is stubbed, including registration — this is the whole
 * journey a ministry employee actually makes.
 */

test.beforeAll(async () => {
  await assertMailpitReachable();
});

test.describe('Phase 1 journey', () => {
  test('assess → Holland Code → gold paths → build five → confirm → My Path', async ({ page }) => {
    await signedInEmployee(page, 'journey');

    // ── The dashboard starts near-empty, with one action ──────────────────────
    await expect(page.getByRole('heading', { name: 'ابدأ بتقييم ميولك المهنية' })).toBeVisible();

    /* §4.2 (D-071): before the assessment the nav is Dashboard and Profile —
       two items, nothing else to wander into. */
    const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'الدورات' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'مساري' })).toHaveCount(0);

    /* And the URL agrees with the nav: the catalogue bounces to the dashboard. */
    await page.goto('/courses');
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: 'ابدأ بتقييم ميولك المهنية' })).toBeVisible();

    await page.getByRole('link', { name: 'ابدأ التقييم' }).click();

    // ── The assessment ────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/assessment$/);

    /* D-073: the sidebar stays during the assessment, and leaving mid-way keeps
       the answers — answer two, visit the profile, come back, still on the
       third statement. */
    await expect(nav.getByRole('link')).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('radio').last().check();
      await page.getByRole('button', { name: 'التالي' }).click();
    }
    await expect(page.getByText('السؤال 3 من 30')).toBeVisible();
    await nav.getByRole('link', { name: 'الملف الشخصي' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.goto('/assessment');
    await expect(page.getByText('السؤال 3 من 30')).toBeVisible();

    await completeAssessment(page, 3);

    // ── Results: the code, then the ranked letter groups ──────────────────────
    await expect(page).toHaveURL(/\/results$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'ميولك المهنية' })).toBeVisible();

    /* Answering everything at the top level ties all six dimensions, so the
       canonical tie-break (D-031) applies and the code is RIA — deterministic,
       which is the whole point of that rule. */
    await expect(page.getByText('الواقعي').first()).toBeVisible();

    /* TAM-113: one group per letter of the code, in the user's rank order, and
       the heading is what says why these paths are recommended. */
    await expect(
      page.getByRole('heading', { name: 'الأقرب إلى ميلك الأول — الواقعي' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'مناسب أيضًا — البحثي' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'مناسب أيضًا — الفني' })).toBeVisible();
    await expect(page.getByText('ميلك الثاني')).toBeVisible();
    await expect(page.getByText('ميلك الثالث')).toBeVisible();

    /* Two paths per letter × three letters in the code. `exact` matters: without
       it the substring also matches "الموصى بها" in the explanatory sentence,
       which would quietly inflate the count. */
    await expect(page.getByText('موصى به', { exact: true })).toHaveCount(6);

    /* The description left the card — it lives on the page the card opens. */
    await expect(page.getByText('مسار للتعامل المباشر مع الجمهور')).toHaveCount(0);

    /* Collapsed, not hidden (§3A): the first screenful is the code and the six
       paths that fit, and the other six are one keystroke away. */
    await expect(page.getByRole('link', { name: 'استعرض المسار' })).toHaveCount(6);

    await page.getByText('عرض المسارات الأخرى (6)').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'استعرض المسار' })).toHaveCount(12);

    /* The retake entry point exists while nothing is committed (D-015). */
    await expect(page.getByRole('link', { name: 'إعادة التقييم' })).toBeVisible();

    /* Courses joined the nav the moment the assessment was done — no reload,
       the portal state refreshed on submit. Results is a bare flow page, so
       read the nav from the dashboard. */
    await page.goto('/');
    await expect(nav.getByRole('link', { name: 'الدورات' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'مساري' })).toHaveCount(0);
    await page.goto('/results');

    // ── Build the path ────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'استعرض المسار' }).first().click();
    await expect(page).toHaveURL(/\/paths\//);

    await expect(page.getByText('اخترت 0 من 5–10')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تأكيد المسار' })).toBeDisabled();

    await selectFiveCourses(page);

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
    await expect(page.getByText('تُفتح شهادة المسار بعد اجتياز جميع دوراتك.')).toBeVisible();

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

    await page.getByRole('link', { name: 'العودة إلى مساري' }).click();
    await expect(page).toHaveURL(/\/my-path$/, { timeout: 15_000 });

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

    await page.getByRole('link', { name: 'العودة إلى مساري' }).click();
    await expect(page).toHaveURL(/\/my-path$/, { timeout: 15_000 });

    // ── The commitment is visible everywhere afterwards ───────────────────────
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'تابع من حيث توقفت' })).toBeVisible();
    /* My Path joins the navigation only once there is a path (§4.2). */
    await expect(nav.getByRole('link', { name: 'مساري' })).toBeVisible();

    await page.goto('/results');
    await expect(page.getByRole('heading', { name: 'ميولك المهنية' })).toBeVisible();
    /* The retake option is gone — not disabled, gone (D-015). */
    await expect(page.getByRole('link', { name: 'إعادة التقييم' })).toHaveCount(0);

    /* TAM-114: switching is impossible, so exactly one card keeps an action —
       the user's own path, pointing at مساري — and every other card, in the
       groups and behind the toggle alike, has none. */
    await expect(page.getByText('مسارك', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'الانتقال إلى مساري' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'استعرض المسار' })).toHaveCount(0);

    await page.getByText('عرض المسارات الأخرى (6)').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'استعرض المسار' })).toHaveCount(0);
  });

  test('a confirmed path cannot be rebuilt or switched from the UI', async ({ page }) => {
    await signedInEmployee(page, 'locked');

    await page.goto('/assessment');
    await completeAssessment(page);
    await expect(page).toHaveURL(/\/results$/, { timeout: 15_000 });

    await page.getByRole('link', { name: 'استعرض المسار' }).first().click();
    /* Wait for the client-side navigation to land before reading the URL —
       `page.url()` straight after a click still returns the previous route. */
    await expect(page).toHaveURL(/\/paths\//);
    const pathUrl = page.url();

    await selectFiveCourses(page);

    await page.getByRole('button', { name: 'تأكيد المسار' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'نعم، أكّد المسار' }).click();
    await expect(page).toHaveURL(/\/my-path$/, { timeout: 15_000 });

    /* Returning to the build page shows the locked state rather than a form
       whose submissions the server would reject. */
    await page.goto(pathUrl);
    await expect(page.getByText('مسارك مؤكَّد')).toBeVisible();
    await expect(page.getByRole('button', { name: /^أضف:/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'تأكيد المسار' })).toHaveCount(0);
  });

  test('the catalogue is browsable once assessed, before any path, with no action offered', async ({
    page,
  }) => {
    await signedInEmployee(page, 'browse');

    /* D-071: the catalogue opens after the assessment, not before. */
    await page.goto('/assessment');
    await completeAssessment(page);
    await expect(page).toHaveURL(/\/results$/, { timeout: 15_000 });
    await page.goto('/');

    await page.getByRole('link', { name: 'الدورات' }).click();
    await expect(page).toHaveURL(/\/courses$/);

    /* 48 seeded courses, one of which the LMS no longer shows. */
    await expect(page.getByText('47 دورة')).toBeVisible();

    /* Grouped by path (TAM-127): a course in two paths has a card in each, so
       take the first — they are the same link. */
    await page.getByRole('link', { name: 'مقدمة في إدارة المشاريع' }).first().click();
    await expect(page.getByRole('heading', { name: 'أهداف الدورة' })).toBeVisible();

    /* §4.7: exactly one action applies, and before a path exists none does —
       so no "add", no "start", no "completed". */
    await expect(page.getByRole('button', { name: 'أضف إلى مساري' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ابدأ الدورة' })).toHaveCount(0);
    await expect(page.getByText('مكتملة')).toHaveCount(0);
  });

  test('search and filters narrow the catalogue', async ({ page }) => {
    await signedInEmployee(page, 'filter');

    await page.goto('/assessment');
    await completeAssessment(page);
    await expect(page).toHaveURL(/\/results$/, { timeout: 15_000 });

    await page.goto('/courses');
    await expect(page.getByText('47 دورة')).toBeVisible();

    await page.getByLabel('ابحث في الدورات').fill('البيانات');
    await expect(page.getByText('47 دورة')).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'تحليل البيانات للمبتدئين' }).first(),
    ).toBeVisible();

    await page.getByLabel('ابحث في الدورات').fill('لا-توجد-دورة-بهذا-الاسم');
    await expect(page.getByText('لا توجد دورات مطابقة')).toBeVisible();

    await page.getByRole('button', { name: 'إزالة عوامل التصفية' }).click();
    await expect(page.getByText('47 دورة')).toBeVisible();
  });
});
