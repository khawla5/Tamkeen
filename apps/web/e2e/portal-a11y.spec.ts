import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { signedInEmployee } from './account';
import { assignSeededPath } from './admin-fixtures';
import { completeAssessment } from './journey';
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

/** TAM-108's own acceptance line ("usable at 360px RTL") had no automated
 *  check anywhere — auth-a11y.spec.ts and profile-a11y.spec.ts both loop
 *  three widths, this page never did. Reuses the one signed-in session the
 *  journey below already built for each state, rather than registering a
 *  fresh account per width (the mistake that strained Mailpit in TAM-111's
 *  own e2e suite). */
const WIDTHS = [360, 768, 1280] as const;

async function expectNoHorizontalOverflow(page: Page, state: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${state} at ${width}px: horizontal overflow in px`).toBeLessThanOrEqual(0);
  }

  /* Restored so the interactions that follow (clicking a nav link, etc.)
     happen at a normal desktop size rather than leaving the page at 1280 —
     already the last width above, but explicit rather than incidental. */
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe('the shell, held to WCAG 2.1 A/AA (TAM-117)', () => {
  test.beforeAll(async () => {
    await assertMailpitReachable();
  });

  test('the dashboard passes axe in all three states', async ({ page }) => {
    const account = await signedInEmployee(page, 'a11y-shell');

    /* NO_PATH: two-item nav, the one informational card (D-134 — there is
       nothing to choose until the ministry assigns something). */
    await expect(page.getByRole('heading', { level: 1, name: 'الرئيسية' })).toBeVisible();
    await expectNoViolations(page, 'NO_PATH');
    await expectNoHorizontalOverflow(page, 'NO_PATH');

    /* AWAITING_PLACEMENT: a path is assigned, and the one action on it is the
       placement assessment. */
    await assignSeededPath(account.email);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'ابدأ التقييم' })).toBeVisible();
    await expectNoViolations(page, 'AWAITING_PLACEMENT');
    await expectNoHorizontalOverflow(page, 'AWAITING_PLACEMENT');

    /* ACTIVE_PATH: status strip, continue card, tiles — TAM-108's own
       acceptance line for this state ("usable at 360px RTL"). */
    await page.getByRole('link', { name: 'ابدأ التقييم' }).click();
    await completeAssessment(page);
    await page.goto('/');
    await expect(page.getByText('قيد التنفيذ').first()).toBeVisible();
    await expectNoViolations(page, 'ACTIVE_PATH');
    await expectNoHorizontalOverflow(page, 'ACTIVE_PATH');
  });
});
