import { expect, test, type Page } from '@playwright/test';

import { ADMIN_PASSWORD, releaseAdmin, seedAdmin, type SeededAdmin } from './admin-fixtures';
import { assertMailpitReachable, tokenFromEmail } from './mailpit';

/**
 * Sub-phase 5.2's end-to-end path (§4C.2, and part of the Phase 5 "done when"):
 *
 *   sign in as a super-admin and land in the admin portal, not the entity one →
 *   create an organisation → provision an account for it without ever seeing a
 *   password → redeem the invitation from a real mailbox → sign in as that
 *   account and land in the *entity* portal
 *
 * **This is the seam Phase 4 left open**, and it is only closed if the last step
 * works: an entity account that the ministry can create for itself, through a
 * screen, with no developer and no database access.
 *
 * Driven through a real browser against the built app, real PostgreSQL and real
 * Mailpit. The invitation token is read out of the mail sink the way the
 * recipient would read their inbox — there is no test-only endpoint that hands
 * one out, for the same reason the auth suite has never had one.
 *
 * Serial, with the page kept across tests: each step depends on the last.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 5 — user management', () => {
  let adminPage: Page;
  let invitedPage: Page;
  let admin: SeededAdmin;

  const stamp = Date.now().toString(36);
  const entityName = `معهد الاختبار ${stamp}`;
  let entityKey: string;
  let invitedEmail: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await assertMailpitReachable();

    admin = await seedAdmin();
    /* Both keyed on the same prefix as the admin accounts, so cleanup catches
       everything this run creates through the UI as well as through the seed. */
    entityKey = `${admin.prefix}-inst`;
    invitedEmail = `${admin.prefix}-coord@authority.example`;

    adminPage = await browser.newPage();
    invitedPage = await browser.newPage();
  });

  test.afterAll(async () => {
    await adminPage?.close();
    await invitedPage?.close();
    await releaseAdmin(admin);
  });

  test('signing in as an admin lands in the admin portal, not the entity one', async () => {
    await adminPage.goto('/login');
    await adminPage.getByLabel('البريد الإلكتروني').fill(admin.email);
    await adminPage.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'تسجيل الدخول' }).click();

    /*
     * The defect this asserts against shipped in Phase 4: three separate
     * `role === 'EMPLOYEE'` checks each treated "not an employee" as "an
     * entity", so the account with the most authority in the system was handed
     * somebody else's portal.
     */
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });
    await expect(adminPage.getByRole('heading', { name: 'لوحة الإشراف' })).toBeVisible();
  });

  test('the dashboard reports integration health in words, not only in colour', async () => {
    /* WCAG 1.4.1: the dot beside this is decorative. */
    await expect(
      adminPage.getByText(/منصة التعلم (متصلة|غير متصلة)|تعذّر الوصول/).first(),
    ).toBeVisible();
  });

  test('an organisation can be created from a screen', async () => {
    await adminPage.getByRole('link', { name: 'الحسابات' }).click();
    await expect(adminPage.getByRole('heading', { name: 'إدارة الحسابات' })).toBeVisible();

    /* The organisations appear under the entity-role filter — there is no tab
       to switch to any more (TAM-131). */
    await adminPage.getByLabel('الدور').selectOption('ENTITY');
    await adminPage.getByRole('button', { name: 'إضافة جهة' }).click();

    /* Labels, not CSS selectors: a label that getByLabel cannot find is a field
       no screen reader can announce, so these locators double as an
       accessibility assertion. */
    await adminPage.getByLabel('اسم الجهة').fill(entityName);
    await adminPage.getByLabel('المعرّف').fill(entityKey);
    await adminPage.getByLabel('بريد التواصل').fill(`${admin.prefix}-contact@authority.example`);

    await adminPage.getByRole('button', { name: 'إنشاء الجهة' }).click();

    /* Scoped to this run's card: a development database accumulates
       organisations, and "0 حساب · 0 دورة" is true of every unstaffed one. */
    const card = adminPage.getByRole('listitem').filter({ hasText: entityName });

    await expect(card).toBeVisible({ timeout: 15_000 });
    /* A shell nobody has staffed yet, and the counts say so rather than leaving
       it to be discovered later. */
    await expect(card.getByText('0 حساب · 0 دورة')).toBeVisible();
  });

  test('provisioning an account never shows the administrator a password', async () => {
    await adminPage.getByRole('button', { name: 'إنشاء حساب' }).click();

    /* Scoped to the dialog: the accounts filters stay on the page behind it and
       one of them is also labelled «الدور» (TAM-131 removed the tab that used
       to unmount them). */
    const dialog = adminPage.getByRole('dialog', { name: 'إنشاء حساب' });

    await dialog.getByLabel('البريد الإلكتروني').fill(invitedEmail);
    await dialog.getByLabel('الاسم').fill('منسّق الجهة');
    await dialog.getByLabel('الرقم الوظيفي').fill(`ENT-${stamp}`);
    await dialog.getByLabel('الإدارة').fill('التدريب');
    await dialog.getByLabel('الدور').selectOption('ENTITY');

    /* The organisation selector appears only for this role — a control that can
       never apply to an employee should not be on the screen at all (§3). */
    await dialog.getByLabel('الجهة').selectOption({ label: entityName });

    await dialog.getByRole('button', { name: 'إرسال الدعوة' }).click();

    await expect(adminPage.getByText('أُرسلت الدعوة')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByText(invitedEmail)).toBeVisible();

    /*
     * The property, asserted against the rendered page rather than a named
     * field: an implementation that started displaying a generated password
     * would satisfy every other assertion in this file.
     *
     * Two checks, because a leak could take either shape — a masked input the
     * administrator types into, or a plaintext credential printed for them to
     * relay. Neither may exist anywhere in this flow.
     */
    await expect(adminPage.locator('input[type="password"]')).toHaveCount(0);
    expect(await adminPage.locator('body').innerText()).not.toMatch(/password/i);
  });

  test('the new account is listed as awaiting activation, not as active', async () => {
    await adminPage.getByRole('button', { name: 'إلغاء' }).click();

    /* No tab to come back from (TAM-131): the accounts table was on screen the
       whole time, under the entity-role filter the previous step was working
       in — which is exactly where an account just created for an organisation
       belongs. Closing the dialog leaves the administrator where they were. */
    await adminPage.getByLabel('بحث').fill(invitedEmail);

    const row = adminPage.getByRole('row').filter({ hasText: invitedEmail });

    /* "Invited" is a state the database has no column for, and it is the answer
       to the question this screen most often gets asked: why can this person
       not sign in. */
    await expect(row.getByText('بانتظار التفعيل')).toBeVisible({ timeout: 15_000 });
  });

  test('the invited person sets their own password from their mailbox', async () => {
    const token = await tokenFromEmail(invitedEmail, 'reset-password');

    await invitedPage.goto(`/reset-password?token=${token}`);
    await invitedPage.getByLabel('كلمة المرور الجديدة').fill(ADMIN_PASSWORD);
    await invitedPage.getByLabel('تأكيد كلمة المرور').fill(ADMIN_PASSWORD);
    await invitedPage.getByRole('button', { name: 'حفظ كلمة المرور' }).click();

    /* The page offers a link onward rather than redirecting: the person has just
       finished one task and is choosing to start another. */
    await expect(invitedPage.getByRole('link', { name: 'تسجيل الدخول' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('and signs in to the entity portal, closing Phase 4’s seam', async () => {
    await invitedPage.goto('/login');
    await invitedPage.getByLabel('البريد الإلكتروني').fill(invitedEmail);
    await invitedPage.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await invitedPage.getByRole('button', { name: 'تسجيل الدخول' }).click();

    /*
     * Redeeming the invitation also verified the address — the account has never
     * seen a verification email, and without that step it would set a password
     * and still be refused here with EMAIL_NOT_VERIFIED, having just proved the
     * mailbox is theirs.
     */
    await expect(invitedPage).toHaveURL(/\/entity$/, { timeout: 15_000 });
    await expect(invitedPage.getByText(entityName)).toBeVisible();
  });

  test('an administrator cannot suspend their own account', async () => {
    /* The role filter is still on «جهة» from the organisation work above, and
       an administrator's own account is not an entity account. Clearing it is
       what the removed tab used to do by remounting the view (TAM-131). */
    await adminPage.getByLabel('الدور').selectOption('');
    await adminPage.getByLabel('بحث').fill(admin.email);

    const row = adminPage.getByRole('row').filter({ hasText: admin.email });
    await row.getByRole('button', { name: 'إدارة' }).click();

    await adminPage.getByRole('button', { name: 'إيقاف الحساب' }).click();

    /*
     * Scoped to the dialog: Next.js renders its own `role="alert"` route
     * announcer at the document root, so an unscoped alert query is ambiguous —
     * and the ambiguity is the framework's, not something to solve by weakening
     * the assertion.
     *
     * The session ends on the next request, so the screen that would undo a
     * self-suspension is the screen the administrator just lost.
     */
    await expect(adminPage.locator('dialog').getByRole('alert')).toContainText(
      'لا يمكنك تغيير دور حسابك',
      { timeout: 15_000 },
    );
  });

  test('suspending an entity account ends its session immediately', async () => {
    await adminPage.getByRole('button', { name: 'إلغاء' }).click();
    await adminPage.getByLabel('بحث').fill(invitedEmail);

    const row = adminPage.getByRole('row').filter({ hasText: invitedEmail });
    await row.getByRole('button', { name: 'إدارة' }).click();
    await adminPage.getByRole('button', { name: 'إيقاف الحساب' }).click();

    await expect(adminPage.locator('dialog').getByRole('status')).toContainText('أُوقف الحساب', {
      timeout: 15_000,
    });

    /* Not merely refused on the next sign-in: the live session is gone, so the
       person is out of the portal now rather than in twelve hours. */
    await invitedPage.reload();
    await expect(invitedPage).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
