import { expect, test, type Locator, type Page } from '@playwright/test';

import { DEPARTMENT, PASSWORD, RUN_ID, accountFor, signedInEmployee } from './account';
import { assertMailpitReachable, tokenFromEmail } from './mailpit';

/**
 * Registration is a two-step wizard (TAM-103): account, then employee. The
 * helper drives it in that order; the labels are the same ones the form has
 * always had, so getByLabel keeps doubling as the accessibility assertion.
 */
async function fillRegistration(
  page: Page,
  account: { fullName: string; email: string; employeeId: string; department: string },
  confirmPassword = PASSWORD,
) {
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تأكيد كلمة المرور').fill(confirmPassword);
  await page.getByRole('button', { name: 'التالي' }).click();
  await page.getByLabel('الاسم الكامل').fill(account.fullName);
  await page.getByLabel('الرقم الوظيفي').fill(account.employeeId);
  await page.getByLabel('الإدارة').selectOption(account.department);
}

/**
 * Finds the alert region carrying a given message.
 *
 * Next.js injects its own route announcer with `role="alert"`, so a bare
 * `getByRole('alert')` matches two elements and trips strict mode. Filtering by
 * text targets our alert and still asserts the message lives in an alert
 * region — which is the accessibility property worth checking.
 */
function alertWithText(page: Page, text: string): Locator {
  return page.getByRole('alert').filter({ hasText: text });
}

/**
 * The Phase 0 end-to-end happy path: **register → verify email → sign in**,
 * driven through a real browser against the built app, real PostgreSQL and a real
 * SMTP sink (§2B, and the Phase 0 "done when" criterion).
 *
 * Nothing is stubbed. The verification token is read out of the inbox because
 * that is the only way to obtain it — the database stores only its hash, and
 * there is no test-only endpoint to shortcut through. That is deliberate: a test
 * that bypasses the email has not proved the loop closes.
 */
test.beforeAll(async () => {
  await assertMailpitReachable();
});

test.describe('Authentication happy path', () => {
  test('a ministry employee can register, verify their email and sign in', async ({ page }) => {
    const account = accountFor('happy');

    // ── Register ──────────────────────────────────────────────────────────────
    await page.goto('/register');

    /* Labels, not CSS selectors: if getByLabel cannot find the field, the
       label/input association is broken and the form is inaccessible — so these
       locators double as an accessibility assertion. */
    await fillRegistration(page, account);

    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();

    /* A neutral confirmation — never "account created", which would confirm the
       address was previously unregistered. */
    await expect(page.getByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' })).toBeVisible();

    // ── Verify, using the token from the real email ───────────────────────────
    const token = await tokenFromEmail(account.email, 'verify-email');

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'تم تأكيد بريدك الإلكتروني' })).toBeVisible();

    // ── Sign in ───────────────────────────────────────────────────────────────
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    /* Signing in lands on the dashboard, and the session cookie is set. */
    await expect(page).toHaveURL('http://localhost:3000/');

    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === 'tamkeen_session');

    expect(session, 'a session cookie should be set').toBeDefined();
    /* Not readable by JavaScript, so an XSS bug cannot exfiltrate it. */
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Strict');
  });

  test('sign-in is refused before the email is verified', async ({ page }) => {
    const account = accountFor('unverified');

    await page.goto('/register');
    await fillRegistration(page, account);
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await expect(page.getByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' })).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    /* Announced as an alert, in Arabic, with the option to resend — the password
       was correct, so telling the user this reveals nothing they did not know. */
    await expect(alertWithText(page, 'لم يتم تأكيد بريدك الإلكتروني')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إرسال رابط جديد' })).toBeVisible();
  });

  test('a wrong password gives a generic Arabic error and no session', async ({ page }) => {
    const account = accountFor('wrongpw');

    await page.goto('/register');
    await fillRegistration(page, account);
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await expect(page.getByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' })).toBeVisible();

    const token = await tokenFromEmail(account.email, 'verify-email');
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'تم تأكيد بريدك الإلكتروني' })).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill('an-incorrect-password');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await expect(alertWithText(page, 'البريد الإلكتروني أو كلمة المرور غير صحيحة')).toBeVisible();

    /* Still on the sign-in page, with no session issued. */
    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'tamkeen_session')).toBeUndefined();
  });

  test('registration is refused for a non-ministry email domain (D-017)', async ({ page }) => {
    await page.goto('/register');

    /* A prefix of an allowed domain — the exact shape that slipped through when
       the allow-list was mis-typed as a string (D-029). */
    await fillRegistration(page, {
      fullName: 'شخص خارجي',
      email: `pw-${RUN_ID}-outsider@ministry.gov`,
      employeeId: `PW-${RUN_ID}-out`.slice(0, 20),
      department: DEPARTMENT,
    });

    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();

    /* The server refuses on the email, so the wizard returns to step 1. */
    await expect(alertWithText(page, 'غير مسجّل ضمن نطاقات الوزارة')).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  });

  test('mismatched passwords are caught in the browser, before any request', async ({ page }) => {
    const account = accountFor('mismatch');
    let registerCalled = false;

    page.on('request', (request) => {
      if (request.url().includes('/api/auth/register')) {
        registerCalled = true;
      }
    });

    await page.goto('/register');
    await page.getByLabel('البريد الإلكتروني').fill(account.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await page.getByLabel('تأكيد كلمة المرور').fill('something-else-entirely');

    /* The wizard refuses to advance — the employee step never appears. */
    await page.getByRole('button', { name: 'التالي' }).click();

    await expect(alertWithText(page, 'كلمتا المرور غير متطابقتين')).toBeVisible();
    await expect(page.getByLabel('الاسم الكامل')).toHaveCount(0);
    expect(registerCalled, 'no request should be sent for a client-side error').toBe(false);
  });
});

test.describe('Arabic-first shell', () => {
  test('every page is served as Arabic and right-to-left', async ({ page }) => {
    for (const path of ['/', '/login', '/register', '/forgot-password']) {
      await page.goto(path);

      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    }
  });

  test('an unauthenticated visitor at "/" sees the public landing page, not an error', async ({
    page,
  }) => {
    /* `/` is the one portal path a signed-out visitor is allowed to land on
       (PortalProvider): it renders the same public LandingView as `/landing`
       instead of redirecting, so a first-time visitor gets the marketing
       page rather than a sign-in wall. */
    await page.goto('/');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('منصة تمكين');
  });

  test('an unauthenticated visitor at any other portal path is sent to sign in, not left on an error', async ({
    page,
  }) => {
    /* Every other portal path still bounces to /login on a 401 (PortalProvider)
       — the public root above is the one exception, not a loosening of auth
       anywhere else. The API is fail-closed and answers 401; the redirect is
       what turns that into something a user can act on rather than a
       permanent error state. */
    await page.goto('/my-path');

    await expect(page).toHaveURL(/\/login$/);
  });
});

/**
 * The shell's accessibility properties, verified where the shell now lives:
 * inside an authenticated session.
 */
test.describe('Authenticated shell', () => {
  test('the skip link is the first thing a keyboard user reaches', async ({ page }) => {
    /* WCAG 2.4.1 bypass blocks. Verified by keyboard, because a skip link that
       exists in the DOM but cannot be focused is not a skip link. */
    await signedInEmployee(page, 'skip');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveText('تجاوز إلى المحتوى الرئيسي');
    await expect(focused).toBeVisible();
  });

  test('the active navigation item is marked for assistive technology', async ({ page }) => {
    await signedInEmployee(page, 'navmark');

    await expect(
      page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', {
        name: 'الرئيسية',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('sign-out lives in the header user menu on any page, and ends the session (TAM-112, D-096)', async ({
    page,
  }) => {
    await signedInEmployee(page, 'signout');
    await page.goto('/profile');

    /* One sign-out: nothing on the page or in the sidebar offers it until the
       avatar menu opens (D-096 — the profile's own button was removed). */
    await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toHaveCount(0);

    await page.getByRole('banner').getByRole('button', { name: 'قائمة المستخدم' }).click();
    await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();

    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'tamkeen_session')).toBeUndefined();
  });

  test('numbers use Western Arabic digits by default (D-018)', async ({ page }) => {
    await signedInEmployee(page, 'digits');

    /* The catalogue's result count is the first Phase 1 number a signed-in user
       meets; the Phase 0 sample page it used to assert against is gone. */
    await page.goto('/courses');

    const count = page.getByText(/دورة$/).first();
    await expect(count).toContainText('47');
    await expect(count).not.toContainText('٤٧');
  });
});
