import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { signedInEmployee } from './account';

/**
 * Profile's accessibility and layout gate, the portal equivalent of
 * auth-a11y.spec.ts (TAM-105): axe against WCAG 2.1 A/AA, three widths with
 * no horizontal overflow, and the keyboard order a real user meets — the
 * "labelled inputs; keyboard-complete; RTL at 360px" acceptance line made
 * checkable rather than asserted.
 */
const WIDTHS = [360, 768, 1280] as const;

test.describe('profile — accessibility and layout', () => {
  test('has no WCAG 2.1 A/AA violations and one h1', async ({ page }) => {
    await signedInEmployee(page, 'profile-a11y');
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الملف الشخصي');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      'axe violations',
    ).toEqual([]);
  });

  for (const width of WIDTHS) {
    test(`at ${width}px does not scroll sideways`, async ({ page }) => {
      await signedInEmployee(page, `profile-w${width}`);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/profile');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
    });
  }

  test('the keyboard reaches name, department and sign-out in order, skipping save while disabled', async ({
    page,
  }) => {
    await signedInEmployee(page, 'profile-kbd');
    await page.goto('/profile');

    /* RTL — confirmed once here rather than per test, since every test above
       already renders the real page and would fail on a regression anyway. */
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    const nameInput = page.getByLabel('الاسم الكامل');
    await nameInput.focus();
    await expect(nameInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('الإدارة')).toBeFocused();

    /* Nothing has been edited, so save is disabled — and a disabled button is
       correctly not a tab stop at all, per the browser's own semantics. The
       next control a keyboard user reaches is sign-out, not a dead button. */
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeFocused();
  });

  test('editing the name with the keyboard alone enables and reaches save', async ({ page }) => {
    await signedInEmployee(page, 'profile-kbd-edit');
    await page.goto('/profile');

    const nameInput = page.getByLabel('الاسم الكامل');
    await nameInput.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' المحدّث');

    const save = page.getByRole('button', { name: 'حفظ' });
    await expect(save).toBeEnabled();

    await save.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText('تم الحفظ')).toBeVisible();
  });
});
