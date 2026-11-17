import { expect, type Page } from '@playwright/test';

/**
 * The steps that get a learner from an assigned path to a placement (D-134).
 *
 * Extracted so the suites that only need a placed learner — certificates, the
 * entity bridge, accessibility — do not each carry their own copy of the
 * assessment loop, and so a change to its mechanics is made once.
 */

/**
 * Answers every question of the assessment currently on screen, at the
 * strongest level, and submits — ending on the path's own ladder page.
 *
 * The question count is read off the page rather than assumed: a path's
 * placement bank is a handful of items, not a fixed number, and a caller
 * resuming mid-way (`from`) still needs the real total to know when it is on
 * the last one.
 */
export async function completeAssessment(page: Page, from = 1): Promise<void> {
  const progress = page.getByText(/^السؤال \d+ من \d+$/);
  await expect(progress).toBeVisible();
  const total = Number((await progress.textContent())?.match(/من (\d+)/)?.[1]);

  for (let step = from; step <= total; step += 1) {
    await expect(page.getByText(`السؤال ${step} من ${total}`)).toBeVisible();

    /* The last radio in the group is the strongest agreement level. Chosen by
       position rather than by label so the test does not break every time the
       wording of an option is revised — the wording is content. */
    await page.getByRole('radio').last().check();

    const isLast = step === total;
    await page.getByRole('button', { name: isLast ? 'إنهاء التقييم' : 'التالي' }).click();
  }
}
