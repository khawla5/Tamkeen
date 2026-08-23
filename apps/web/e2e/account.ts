import { randomBytes } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { tokenFromEmail } from './mailpit';

/**
 * Creates a real, signed-in ministry employee.
 *
 * Shared by the Phase 0 and Phase 1 suites. Nothing is stubbed: the account is
 * registered through the form, verified with the token read out of the mail
 * sink, and signed in — because from Phase 1 onward every portal page requires a
 * session, and a test that faked one would not be exercising the app users get.
 */
export const PASSWORD = 'a-sufficiently-long-password';

/** Unique per process, so a run never collides with dev data or another run. */
export const RUN_ID = randomBytes(4).toString('hex');

export interface Account {
  email: string;
  employeeId: string;
  fullName: string;
  department: string;
}

/** A department from the registration dropdown (DEPARTMENTS in auth-constants). */
export const DEPARTMENT = 'تقنية المعلومات';

export function accountFor(label: string): Account {
  return {
    email: `pw-${RUN_ID}-${label}@ministry.gov.example`,
    employeeId: `PW-${RUN_ID}-${label}`.slice(0, 20),
    fullName: 'أحمد الموظف',
    department: DEPARTMENT,
  };
}

export async function register(page: Page, account: Account): Promise<void> {
  await page.goto('/register');

  /* Labels, not CSS selectors: if getByLabel cannot find a field, the
     label/input association is broken and the form is inaccessible — so these
     locators double as an accessibility assertion. */
  /* Two-step wizard (TAM-103): account, then employee. */
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تأكيد كلمة المرور').fill(PASSWORD);
  await page.getByRole('button', { name: 'التالي' }).click();
  await page.getByLabel('الاسم الكامل').fill(account.fullName);
  await page.getByLabel('الرقم الوظيفي').fill(account.employeeId);
  await page.getByLabel('الإدارة').selectOption(account.department);

  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByRole('heading', { name: 'تحقّق من بريدك الإلكتروني' })).toBeVisible();
}

export async function verify(page: Page, account: Account): Promise<void> {
  const token = await tokenFromEmail(account.email, 'verify-email');

  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'تم تأكيد بريدك الإلكتروني' })).toBeVisible();
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

  await expect(page).toHaveURL('http://localhost:3000/');

  /*
   * Wait for the shell, not just the URL.
   *
   * `PortalProvider` loads the session and dashboard state before rendering
   * anything but a loading state, so for a moment after the redirect there is no
   * navigation and no skip link. A test that acted on the URL alone would
   * sometimes tab into an empty page — which is exactly how the skip-link test
   * flaked: it passed alone and failed under full-suite load.
   */
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
}

/** Register → verify → sign in, landing on the dashboard. */
export async function signedInEmployee(page: Page, label: string): Promise<Account> {
  const account = accountFor(label);

  await register(page, account);
  await verify(page, account);
  await signIn(page, account);

  return account;
}
