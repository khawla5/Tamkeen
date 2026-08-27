import { expect, type Page } from '@playwright/test';

/**
 * The steps that get a learner from a fresh account to a confirmed path.
 *
 * Extracted so the Phase 3 suite can reach the state it needs — certificates
 * and the CV only exist for someone with a path — without a second copy of the
 * assessment loop drifting from the Phase 1 one.
 */

/** Answers every question at the strongest level and finishes. */
export async function completeAssessment(page: Page, from = 1): Promise<void> {
  await expect(page.getByText(`السؤال ${from} من 30`)).toBeVisible();

  for (let step = from; step <= 30; step += 1) {
    await expect(page.getByText(`السؤال ${step} من 30`)).toBeVisible();

    /* The last radio in the group is the strongest agreement level. Chosen by
       position rather than by label so the test does not break every time the
       wording of a Likert level is revised — the wording is content (D-032). */
    await page.getByRole('radio').last().check();

    const isLast = step === 30;
    await page.getByRole('button', { name: isLast ? 'إنهاء التقييم' : 'التالي' }).click();
  }
}

/**
 * Selects five courses on the build page, each by name.
 *
 * Not `.first()` in a loop: that locator re-resolves on every attempt, so a
 * click aimed at one card could land on another while the list re-rendered —
 * the counter flake recorded in progress.md. The five titles are read once,
 * up front, and each click then targets a single element that does not move.
 */
export async function selectFiveCourses(page: Page): Promise<void> {
  const titles = (
    await page
      .getByRole('button', { name: /^أضف:/ })
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))
  ).slice(0, 5);

  expect(titles).toHaveLength(5);

  for (const [index, label] of titles.entries()) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText(`اخترت ${index + 1} من 5–10`)).toBeVisible();
  }
}

/** Picks the first offered path, selects five courses, and commits. */
export async function confirmFirstPath(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'استعرض المسار' }).first().click();
  await expect(page).toHaveURL(/\/paths\//);

  await selectFiveCourses(page);

  await page.getByRole('button', { name: 'تأكيد المسار' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'نعم، أكّد المسار' }).click();
  await expect(page).toHaveURL(/\/my-path$/, { timeout: 15_000 });
}
