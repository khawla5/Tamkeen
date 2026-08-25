import { expect, test, type Page } from '@playwright/test';

import { PASSWORD, signedInEmployee, type Account } from './account';
import { assertMailpitReachable, tokenFromEmail } from './mailpit';

/**
 * Sub-phase 5.9 in a real browser — §4.12's two deferred items.
 *
 * **The password change is the half that carries security, and the assertion
 * that matters is about the *other* browser.** A session cookie is enough to be
 * the user, so the reason to change a password is almost always that somebody
 * else may hold it. A change that leaves their session alive has not done the
 * thing it was done for — and nothing on the screen would say so. That is why
 * this suite runs two real browser contexts and checks the second one is put
 * out, rather than trusting a success message in the first.
 *
 * **The digits preference is the half that has to actually reach the page.**
 * D-018 built a single switch point precisely so a preference could not be
 * stored somewhere that nothing reads; the proof is a number rendering in the
 * chosen glyphs several screens away from the control that set it — which is
 * also how the `'arabic'` / `'arabic-indic'` drift would have been caught had it
 * survived the integration tests.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 5 — the profile (§4.12)', () => {
  let here: Page;
  let elsewhere: Page;
  let account: Account;

  const NEXT_PASSWORD = 'a-different-sufficiently-long-password';
  let movedEmail: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await assertMailpitReachable();

    here = await browser.newPage();
    account = await signedInEmployee(here, 'profile');
    movedEmail = account.email.replace('@', '-moved@');

    /* A second context, not a second tab: separate cookie jars are what make
       this two sessions rather than one. */
    elsewhere = await browser.newPage();
    await elsewhere.goto('/login');
    await elsewhere.getByLabel('البريد الإلكتروني').fill(account.email);
    await elsewhere.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await elsewhere.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(elsewhere.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
  });

  test.afterAll(async () => {
    await here?.close();
    await elsewhere?.close();
  });

  test('the profile offers exactly what §4.12 asks for, and no language selector', async () => {
    await here.goto('/profile');
    await expect(here.getByRole('heading', { name: 'الملف الشخصي' })).toBeVisible();

    /* The signed-in identity lives in the header's user menu, not printed on
       the page itself (TAM-117/D-096). */
    await here.getByRole('banner').getByRole('button', { name: 'قائمة المستخدم' }).click();
    await expect(here.getByRole('menu').getByText(account.fullName)).toBeVisible();
    await here.keyboard.press('Escape');

    await expect(here.getByLabel('كلمة المرور الحالية')).toBeVisible();
    await expect(here.getByLabel('الأرقام المعروضة')).toBeVisible();

    /*
     * No language control, and that is a decision rather than an omission
     * (D-086): the interface is Arabic-only, so a selector offering English
     * would be a promise the product cannot keep. The digits preference is what
     * genuinely differs between readers, and it is here instead.
     */
    await expect(here.getByLabel(/اللغة/)).toHaveCount(0);
  });

  test('a wrong current password is refused, and the old one still works', async () => {
    await here.getByLabel('كلمة المرور الحالية').fill('not-the-current-password');
    await here.getByLabel('كلمة المرور الجديدة').fill(NEXT_PASSWORD);
    await here.getByLabel('تأكيد كلمة المرور').fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'تغيير كلمة المرور' }).click();

    await expect(here.getByRole('alert')).toBeVisible({ timeout: 15_000 });

    /* A refused change must not have half-happened: the other session is the
       cheapest way to prove nothing moved. */
    await elsewhere.reload();
    await expect(elsewhere.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
  });

  test('a mismatched confirmation is caught before anything is sent', async () => {
    await here.getByLabel('كلمة المرور الجديدة').fill(NEXT_PASSWORD);
    await here.getByLabel('تأكيد كلمة المرور').fill(`${NEXT_PASSWORD}-typo`);

    await expect(here.getByText('كلمتا المرور غير متطابقتين.')).toBeVisible();
    await expect(here.getByRole('button', { name: 'تغيير كلمة المرور' })).toBeDisabled();
  });

  test('changing it ends the other session and keeps this one', async () => {
    await here.getByLabel('كلمة المرور الحالية').fill(PASSWORD);
    await here.getByLabel('كلمة المرور الجديدة').fill(NEXT_PASSWORD);
    await here.getByLabel('تأكيد كلمة المرور').fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'تغيير كلمة المرور' }).click();

    /* Named by its words, not just by the role: D-072's navigation progress
       renders an app-wide sr-only role="status", so a bare match is ambiguous
       — and D-089 is the reminder that a loose status assertion hides the very
       bug it should catch. */
    await expect(here.getByRole('status').filter({ hasText: 'جلساتك الأخرى' })).toBeVisible({
      timeout: 15_000,
    });

    /*
     * The point of the whole thing. Whoever knew the old password is signed
     * out — asserted in a second browser, because a success message is not
     * evidence that anything happened anywhere else.
     *
     * `/profile` rather than `/`: the root is deliberately also the public
     * landing page, so a signed-out visitor renders it instead of being
     * bounced. Every other portal path still redirects, and that is what a
     * revoked session has to hit.
     */
    await elsewhere.goto('/profile');
    await expect(elsewhere).toHaveURL(/\/login/, { timeout: 15_000 });

    /* And this session survives: being signed out of the page you are standing
       on reads as a failure and invites a second change. */
    await here.reload();
    await expect(here.getByRole('heading', { name: 'الملف الشخصي' })).toBeVisible();
  });

  test('the new password is the one that signs in, and the old one is dead', async () => {
    await elsewhere.getByLabel('البريد الإلكتروني').fill(account.email);
    await elsewhere.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    await elsewhere.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(elsewhere.getByRole('alert')).toBeVisible({ timeout: 15_000 });

    await elsewhere.getByLabel('كلمة المرور', { exact: true }).fill(NEXT_PASSWORD);
    await elsewhere.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(elsewhere.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the digits options show the glyphs they name', async () => {
    await here.goto('/profile');

    /*
     * The one place literal digits in Arabic copy are correct: these are
     * specimens of what the reader is choosing between, which is exactly what
     * the formatting layer cannot supply — routing them through it would render
     * both options identically and make the choice meaningless (D-087).
     */
    const digits = here.getByLabel('الأرقام المعروضة');
    await expect(digits.getByRole('option', { name: /0123/ })).toHaveCount(1);
    await expect(digits.getByRole('option', { name: /٠١٢٣/ })).toHaveCount(1);
  });

  test('choosing Arabic-Indic changes the digits on a page several screens away', async () => {
    await here.getByLabel('الأرقام المعروضة').selectOption('arabic-indic');
    await here.getByRole('button', { name: 'حفظ شكل الأرقام' }).click();

    /* The confirmation's own words, not a bare `role="status"` — the loading
       state carries that role too, so the loose query passed while the page was
       merely busy and would have kept passing if the save never confirmed. */
    await expect(here.getByText('حُفظ اختيارك.')).toBeVisible({ timeout: 15_000 });

    /*
     * The proof that the preference reaches rendering rather than merely being
     * stored. The assessment counter is a long way from the control that set
     * it, and it goes through D-018's switch point like every other number.
     *
     * This is also the assertion that would have caught the `'arabic'` /
     * `'arabic-indic'` drift from a browser: the save returned 400 and the page
     * would have kept rendering Western digits.
     */
    await here.goto('/assessment');
    await expect(here.getByText('السؤال ١ من ٣٠')).toBeVisible({ timeout: 15_000 });
  });

  test('and going back to the system default restores them', async () => {
    await here.goto('/profile');
    await here.getByLabel('الأرقام المعروضة').selectOption('system');
    await here.getByRole('button', { name: 'حفظ شكل الأرقام' }).click();
    await expect(here.getByText('حُفظ اختيارك.')).toBeVisible({ timeout: 15_000 });

    /* "Follow the system" is a real third option, not a null dressed up: it
       means whatever §4C.6 has set applies, so somebody who never expressed a
       preference is not pinned to the default of the day they registered. */
    await here.goto('/assessment');
    await expect(here.getByText('السؤال 1 من 30')).toBeVisible({ timeout: 15_000 });
  });

  test('§4.12 — asking to change the address changes nothing yet', async () => {
    await here.goto('/profile');

    await here.getByLabel('البريد الإلكتروني الجديد').fill(movedEmail);
    await here.getByLabel('كلمة المرور للتأكيد').fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'إرسال رابط التأكيد' }).click();

    /* Names the address it went to. "A link has been sent" without saying where
       is unhelpful exactly when it matters — when the address was mistyped. */
    await expect(here.getByRole('status').filter({ hasText: movedEmail })).toBeVisible({
      timeout: 15_000,
    });

    /* And the account has not moved. The old address still signs in, which is
       the property that makes this safe: nothing depends on an inbox nobody
       has proved they can read. */
    await here.reload();
    await expect(here.getByText(account.email)).toBeVisible();
  });

  test('§4.12 — a personal inbox is refused, and says why', async () => {
    await here.getByLabel('البريد الإلكتروني الجديد').fill('someone@gmail.example');
    await here.getByLabel('كلمة المرور للتأكيد').fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'إرسال رابط التأكيد' }).click();

    /* D-017 through the back door: an employee able to walk a ministry account
       to a personal inbox would defeat restricted registration one profile edit
       at a time. */
    /* Scoped to the page: Next.js mounts a route announcer with `role="alert"`
       at the document root, so an unscoped query is ambiguous. */
    await expect(here.locator('main').getByRole('alert')).toContainText(/نطاقات الوزارة/, {
      timeout: 15_000,
    });
  });

  test('§4.12 — the link in the new inbox completes the move', async () => {
    /* Read out of the mail sink the way the recipient would read their inbox.
       There is no test-only endpoint handing out tokens, for the same reason
       the auth suite has never had one. */
    const token = await tokenFromEmail(movedEmail, 'verify-email-change');

    /* A third context: the link very often opens in whichever browser that
       mailbox is signed into, which is not the one that asked. */
    const inbox = await here.context().browser()!.newPage();

    try {
      await inbox.goto(`/verify-email-change?token=${token}`);
      await expect(inbox.getByRole('heading', { name: 'تم تغيير بريدك الإلكتروني' })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await inbox.close();
    }
  });

  test('§4.12 — every session ends, because the identifier changed', async () => {
    /* Including the one that asked. Leaving it authenticated against an address
       that no longer exists is the confusing outcome — and if the request was
       not the owner's, this ends the attacker's session too. */
    await here.goto('/profile');
    await expect(here).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('§4.12 — the new address is the one that signs in now', async () => {
    await here.getByLabel('البريد الإلكتروني').fill(account.email);
    await here.getByLabel('كلمة المرور', { exact: true }).fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(here.getByRole('alert')).toBeVisible({ timeout: 15_000 });

    await here.getByLabel('البريد الإلكتروني').fill(movedEmail);
    await here.getByLabel('كلمة المرور', { exact: true }).fill(NEXT_PASSWORD);
    await here.getByRole('button', { name: 'تسجيل الدخول' }).click();

    await expect(here.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible({
      timeout: 15_000,
    });
    await here.goto('/profile');
    await expect(here.getByText(movedEmail)).toBeVisible();
  });

  test('§4.12 — and the link cannot be spent twice', async () => {
    const token = await tokenFromEmail(movedEmail, 'verify-email-change');
    const inbox = await here.context().browser()!.newPage();

    try {
      await inbox.goto(`/verify-email-change?token=${token}`);
      /* Single-use, like every other token in the product: a forwarded link
         must not still be able to move an account. */
      await expect(inbox.getByRole('heading', { name: 'تعذّر تأكيد البريد الجديد' })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await inbox.close();
    }
  });
});
