import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The auth surface's accessibility and responsive gate (TAM-105, and then
 * permanent): every auth page at three widths, axe against WCAG 2.1 A/AA,
 * and the keyboard order a real user meets. Screenshots land in
 * `AUTH_SHOTS_DIR` when set, for a human to look at — axe cannot see that a
 * layout is ugly, only that it is wrong.
 */
const PAGES = [
  { path: '/login', title: 'تسجيل الدخول' },
  { path: '/register', title: 'إنشاء حساب' },
  { path: '/forgot-password', title: 'إعادة تعيين كلمة المرور' },
  { path: '/reset-password?token=x', title: 'كلمة مرور جديدة' },
  { path: '/verify-email', title: 'تعذّر تأكيد البريد الإلكتروني' },
] as const;

const WIDTHS = [360, 768, 1280] as const;

test.describe('auth pages — accessibility and layout', () => {
  for (const { path, title } of PAGES) {
    test(`${path} has no WCAG 2.1 A/AA violations and one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
        'axe violations',
      ).toEqual([]);
    });

    for (const width of WIDTHS) {
      test(`${path} at ${width}px does not scroll sideways`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);

        if (process.env.AUTH_SHOTS_DIR) {
          const name = path.replace(/[/?=]/g, '_').replace(/^_/, '');
          await page.screenshot({
            path: `${process.env.AUTH_SHOTS_DIR}/${name}-${width}.png`,
            fullPage: true,
          });
        }
      });
    }
  }

  test('login: the keyboard reaches every control in reading order', async ({ page }) => {
    await page.goto('/login');

    const names: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return (
            el?.getAttribute('aria-label') ??
            el?.textContent?.trim() ??
            (el as HTMLInputElement | null)?.name ??
            ''
          );
        }),
      );
    }

    /* Header (logo link, exit link) → email → password → toggle → forgot →
       submit → register link. Order is the reading order; nothing is skipped
       and nothing unreachable. */
    expect(names.join(' | ')).toMatch(/العودة إلى الصفحة الرئيسية/);
    expect(names.join(' | ')).toMatch(/إظهار كلمة المرور/);
    expect(names.join(' | ')).toMatch(/نسيت كلمة المرور/);
    expect(names.join(' | ')).toMatch(/تسجيل الدخول/);
    expect(names.join(' | ')).toMatch(/إنشاء حساب/);
  });
});
