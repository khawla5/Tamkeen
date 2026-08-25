import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { signedInEmployee } from './account';
import { completeAssessment, confirmFirstPath } from './journey';
import { assertMailpitReachable } from './mailpit';

/**
 * TAM-117: the rebuilt shell (header bar, light rail, page frame, footer) is
 * gated by axe on the dashboard in all three states — the full portal-wide
 * gate arrives with TAM-121; this holds the shell itself to WCAG 2.1 A/AA.
 */
async function expectNoViolations(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    results.violations.map((violation) => `${state}: ${violation.id} — ${violation.description}`),
  ).toEqual([]);
}

test.describe('the shell, held to WCAG 2.1 A/AA (TAM-117)', () => {
  test.beforeAll(async () => {
    await assertMailpitReachable();
  });

  test('the dashboard passes axe in all three states', async ({ page }) => {
    await signedInEmployee(page, 'a11y-shell');

    /* PRE_ASSESSMENT: two-item nav, the one card. */
    await expect(page.getByRole('heading', { level: 1, name: 'الرئيسية' })).toBeVisible();
    await expectNoViolations(page, 'PRE_ASSESSMENT');

    /* ASSESSED_NO_PATH: chips, recommendations. */
    await page.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await completeAssessment(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'اختر مسارك' })).toBeVisible();
    await expectNoViolations(page, 'ASSESSED_NO_PATH');

    /* ACTIVE_PATH: status strip, continue card, tiles. */
    await page.goto('/results');
    await confirmFirstPath(page);
    await page.goto('/');
    await expect(page.getByText('قيد التنفيذ').first()).toBeVisible();
    await expectNoViolations(page, 'ACTIVE_PATH');
  });
});
