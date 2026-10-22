import { expect, test, type Locator, type Page } from '@playwright/test';

import { signedInEmployee } from './account';
import {
  ADMIN_PASSWORD,
  releaseAdmin,
  releasePathsByPrefix,
  seedAdmin,
  type SeededAdmin,
} from './admin-fixtures';
import { assertMailpitReachable } from './mailpit';

/**
 * Sub-phases 5.4-5.8 in a real browser (§4C.4-§4C.8).
 *
 * The assessment editor and user management have suites of their own; this one
 * covers the five screens that had none — paths, course oversight, settings,
 * certificate templates, and the audit trail with its reports.
 *
 * **It is aimed at the rules, not the rendering.** A screen that lists rows is
 * easy to get right and easy to test. The things that would actually hurt the
 * ministry are narrower, and each is asserted here:
 *
 *   - the 5-10 bounds and the auth rate limits appear as *fixed*, with no
 *     control to write them, because a product rule that can be typed over on a
 *     Wednesday afternoon is not a rule (D-074);
 *   - a certificate-template edit says it reaches future issuances only, since
 *     an administrator who believes a correction propagates is one who will not
 *     make the correction (D-052);
 *   - the audit trail offers no way to write, edit or delete an entry — on the
 *     screen and behind it, because a hidden button and a live route are the
 *     same vulnerability;
 *   - the exports carry the byte-order mark that decides whether the ministry
 *     opens a report or a page of mojibake (D-076);
 *   - a setting saved here is the one the API serves back, which is the whole
 *     reason 5.6 existed;
 *   - and an employee reaches none of it, by URL or by API.
 *
 * Serial, sharing one signed-in page: each step depends on the last, and
 * signing in fourteen times would prove one thing fourteen times.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Phase 5 — the administered surface', () => {
  let page: Page;
  let admin: SeededAdmin;

  const stamp = Date.now().toString(36);
  const pathName = `مسار الاختبار ${stamp}`;
  let pathKey: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);

    admin = await seedAdmin();
    pathKey = `${admin.prefix}-path`;

    page = await browser.newPage();

    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(admin.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    /*
     * The defect this asserts against shipped in Phase 4: three separate
     * `role === 'EMPLOYEE'` checks each read "not an employee" as "an entity",
     * so the account with the most authority in the system was handed somebody
     * else's portal.
     */
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
  });

  test.afterAll(async () => {
    await page?.close();
    /* The path was created through the UI, so it is not covered by the account
       cleanup and would otherwise be offered to every later run. */
    await releasePathsByPrefix(admin.prefix);
    await releaseAdmin(admin);
  });

  /**
   * The card holding one setting: its value field, its save and reset buttons,
   * and the badge saying which value it is showing.
   *
   * Located by the two things only that card contains together — the input its
   * `Field` owns, and the setting's own name. The field wrapper holds the input
   * without the name; the page holds both but also every other setting. The
   * innermost element holding both is the card, and `last()` finds it because
   * ancestors precede descendants in document order.
   */
  function settingRow(key: string, name: string): Locator {
    return page
      .locator('div')
      .filter({ has: page.locator(`#setting-${key}`) })
      .filter({ hasText: name })
      .last();
  }

  test('the navigation is the eight destinations the ministry keeps, «قياس الأثر» right under الرئيسية', async () => {
    const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' }).first();

    for (const label of [
      'الرئيسية',
      'قياس الأثر',
      'الحسابات',
      'التقييم',
      'المسارات',
      'الدورات',
      'الإعدادات',
      'الشهادات',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }

    /* Order, not just presence: the new item sits directly after the dashboard. */
    const labels = await nav.getByRole('link').allInnerTexts();
    expect(labels.map((label) => label.trim()).slice(0, 2)).toEqual(['الرئيسية', 'قياس الأثر']);

    /* The audit-and-reports screen is not a destination any more. */
    await expect(nav.getByRole('link', { name: 'السجل والتقارير' })).toHaveCount(0);

    /* No learner or entity destinations leaked into the admin rail. */
    await expect(nav.getByRole('link', { name: 'مساري' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'المتدربون' })).toHaveCount(0);
  });

  test('§4C.4 — a path is created empty, and is not offered to anyone yet', async () => {
    await page.getByRole('link', { name: 'المسارات' }).click();
    await expect(page.getByRole('heading', { name: 'إدارة المسارات' })).toBeVisible();

    await page.getByRole('button', { name: 'إنشاء مسار' }).click();

    const dialog = page.getByRole('dialog');
    /* Labels, not CSS selectors: a label `getByLabel` cannot find is a field no
       screen reader can announce, so these locators double as an accessibility
       assertion. */
    await dialog.getByLabel('اسم المسار').fill(pathName);
    await dialog.getByLabel('المعرّف').fill(pathKey);
    await dialog.getByLabel('وصف المسار').fill('مسار أُنشئ من اختبار المتصفح.');
    await dialog.getByLabel('النمط المهني').selectOption('S');
    await dialog.getByRole('button', { name: 'إنشاء', exact: true }).click();

    /* Straight into the detail panel, because a path created empty cannot be
       offered until it has courses and the next step is always the same one. */
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: 'إدارة المسار' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.getByLabel('اسم المسار')).toHaveValue(pathName);

    /* And the panel says why it cannot be offered yet, rather than only
       refusing: an empty path is below the five-course floor a learner needs to
       confirm anything at all (D-081). */
    await expect(panel.getByText(/أقل من الحد الأدنى/)).toBeVisible();

    await page.keyboard.press('Escape');

    /*
     * And it arrives *not offered*. Publishing a path the moment it exists
     * would put a dead end in front of a learner making the one irreversible
     * choice the product asks of them (D-081).
     */
    const card = page.getByRole('listitem').filter({ hasText: pathName });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('غير معروض');
  });

  test('§4C.4 — hiding and deleting are different words, and the empty path can be deleted', async () => {
    const card = page.getByRole('listitem').filter({ hasText: pathName });
    await card.getByRole('button', { name: 'إدارة' }).click();

    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('heading', { name: 'إدارة المسار' })).toBeVisible({
      timeout: 15_000,
    });

    /* Two removals, two sections, two words — and the estimate field and the
       add-course button are gone from the form (TAM-133). */
    await expect(panel.getByRole('heading', { name: 'عرض المسار على الموظفين' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'حذف المسار' })).toBeVisible();
    await expect(panel.getByLabel(/المدة/)).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'إضافة دورة' })).toHaveCount(0);

    /* Nobody has ever chosen this one, so the irreversible option is available
       — and it asks once more, naming the path and offering the reversible
       alternative, before it goes. */
    await panel.getByRole('button', { name: 'حذف نهائي' }).click();

    const confirm = page.getByRole('dialog').last();
    await expect(confirm.getByText(new RegExp(pathName))).toBeVisible();
    await expect(confirm.getByText(/إن أردت إخفاءه مع الاحتفاظ به/)).toBeVisible();
    await confirm.getByRole('button', { name: 'حذف نهائي' }).click();

    await expect(page.getByText('حُذف المسار نهائيًا.')).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveCount(0);
  });

  test('§4C.4 — the 5-10 bounds are stated on the screen that builds paths', async () => {
    /* Shown where the rule bites, not only in Settings: somebody adding a sixth
       course needs the bound in front of them (D-074). */
    await expect(page.getByText(/5[^0-9]{0,3}10|٥[^٠-٩]{0,3}١٠/)).toBeVisible();
  });

  test('§4C.5 — oversight names why nobody can see a course, not only that they cannot', async () => {
    await page.getByRole('link', { name: 'الدورات' }).click();
    await expect(page.getByRole('heading', { name: 'الإشراف على الدورات' })).toBeVisible();

    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15_000 });

    /*
     * One column and two words since TAM-134: the screen asks whether an
     * employee can choose this course, and «قرار النشر» beside «الحالة»
     * answered a question nobody was asking. Collapsing the vocabulary must not
     * collapse the *explanation*, so the reason a course is hidden still prints
     * under the badge — that is what makes "nobody can see it" answerable, and
     * it is what this test now guards.
     */
    await expect(table.getByRole('columnheader', { name: 'الحالة' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'فترة الإتاحة' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'الجهة' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'قرار النشر' })).toHaveCount(0);

    /* Exactly two words across the whole table, whatever the four underlying
       states are doing. */
    const badges = await table.locator('tbody tr td:nth-child(3)').allInnerTexts();
    for (const badge of badges) {
      expect(badge.startsWith('متاحة') || badge.startsWith('مخفية')).toBe(true);
    }
  });

  test('§4C.5 — the unowned seeded catalogue is reachable here and nowhere else', async () => {
    /* Roughly forty courses the seed supplies that no entity owns. No entity
       portal can show them by construction, so if this screen cannot either,
       nobody in the ministry can ever place them. */
    await page.getByLabel('الجهة الموردة').selectOption('unowned');

    const table = page.getByRole('table');
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/دورة بلا جهة موردة/)).toBeVisible();
  });

  test('§4C.6 — the 5-10 bounds and the rate limits are shown, and cannot be written', async () => {
    await page.getByRole('link', { name: 'الإعدادات' }).click();
    await expect(page.getByRole('heading', { name: 'إعدادات النظام' })).toBeVisible();

    const fixed = page.getByRole('region', { name: 'قواعد ثابتة' });
    await expect(fixed).toBeVisible({ timeout: 15_000 });

    for (const label of [
      'الحد الأدنى لعدد دورات المسار',
      'الحد الأقصى لعدد دورات المسار',
      'الحد الأقصى للطلبات',
    ]) {
      await expect(fixed.getByText(label)).toBeVisible();
    }

    /*
     * The assertion is the *absence* of a control, because that is what the
     * rule actually is. §2 makes 5-10 non-negotiable and the rate limits are a
     * security floor; both are shown because an administrator asked to explain
     * either needs the number, and neither is editable here or anywhere.
     */
    await expect(fixed.getByRole('textbox')).toHaveCount(0);
    await expect(fixed.getByRole('button')).toHaveCount(0);
  });

  test('§4C.6 — a setting saved here is the one the API serves back', async () => {
    const interval = settingRow(
      'COMPLETION_SYNC_INTERVAL_MINUTES',
      'فترة المزامنة مع منصة التعلم (بالدقائق)',
    );

    await interval.getByLabel('القيمة').fill('12');
    await interval.getByRole('button', { name: 'حفظ' }).click();
    await expect(interval.getByRole('status')).toContainText('حُفظ', { timeout: 15_000 });

    /*
     * Read back through the API rather than off the screen. 5.6 exists because
     * one knob had four independent readers; a page showing what it just typed
     * proves nothing about what the sync job will use.
     */
    const response = await page.request.get('http://localhost:4000/api/admin/settings');
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { settings: { key: string; value: string }[] };
    expect(body.settings.find((row) => row.key === 'COMPLETION_SYNC_INTERVAL_MINUTES')?.value).toBe(
      '12',
    );
  });

  test('§4C.6 — and reset puts the deployment default back', async () => {
    const interval = settingRow(
      'COMPLETION_SYNC_INTERVAL_MINUTES',
      'فترة المزامنة مع منصة التعلم (بالدقائق)',
    );

    /* "Reset" is only an honest offer if the row says which value it is
       holding, so the badge is part of the assertion. */
    await expect(interval.getByText('قيمة الوزارة')).toBeVisible();

    await interval.getByRole('button', { name: 'إرجاع إلى الافتراضي' }).click();
    await expect(interval.getByText('القيمة الافتراضية')).toBeVisible({ timeout: 15_000 });

    const response = await page.request.get('http://localhost:4000/api/admin/settings');
    const body = (await response.json()) as { settings: { key: string; isOverridden: boolean }[] };
    expect(
      body.settings.find((row) => row.key === 'COMPLETION_SYNC_INTERVAL_MINUTES')?.isOverridden,
    ).toBe(false);
  });

  test('§4C.6 — no secret is a setting, and the screen says so', async () => {
    /* Said out loud beside the Moodle URL, because "why can I set the address
       but not the token" is the first question an administrator has, and an
       unanswered one invites somebody to go looking for the field. */
    await expect(page.getByText(/رمز التكامل ليس إعدادًا/)).toBeVisible();

    /*
     * And nothing carries one. A secret readable by the screen that edits it is
     * a secret that appears in a network response (D-072), so the assertion is
     * against the payload rather than the rendering — the page can only show
     * what the API hands it.
     */
    const response = await page.request.get('http://localhost:4000/api/admin/settings');
    const body = (await response.json()) as {
      settings: { key: string }[];
      readOnly: { key: string }[];
    };

    const keys = [...body.settings, ...body.readOnly].map((row) => row.key);
    expect(keys.filter((key) => /TOKEN|SECRET|PASSWORD|DATABASE|SMTP/i.test(key))).toEqual([]);

    /* Nor can one be written into existence under a key nobody validates. */
    const write = await page.request.patch(
      'http://localhost:4000/api/admin/settings/MOODLE_TOKEN',
      { data: { value: 'x' }, failOnStatusCode: false },
    );
    expect(write.status()).toBeGreaterThanOrEqual(400);
  });

  test('§4C.7 — the template says an edit reaches future certificates only, and why', async () => {
    await page.getByRole('link', { name: 'الشهادات' }).click();
    await expect(page.getByRole('heading', { name: 'قالب الشهادة' })).toBeVisible();

    await expect(page.getByText('التعديل يسري على الشهادات القادمة فقط')).toBeVisible({
      timeout: 15_000,
    });
    /* The reason, not only the fact — so it reads as the property that makes a
       credential a credential rather than a limitation of the software. */
    await expect(
      page.getByText(/شهادة يمكن تعديل شكلها بعد إصدارها ليست وثيقة يُعتمد عليها/),
    ).toBeVisible();
  });

  test('§4C.7 — the preview is the real template, sandboxed, and it renders', async () => {
    const frame = page.getByTitle('معاينة');

    await expect(frame).toBeVisible();
    /* A whole document assembled partly from text an administrator typed into a
       form. `sandbox=""` is the most restrictive value there is. */
    await expect(frame).toHaveAttribute('sandbox', '');

    /* And it draws something — a srcDoc producing a blank frame would still
       satisfy an attribute check. */
    await expect(page.frameLocator('iframe[title="معاينة"]').locator('body')).not.toBeEmpty();
  });

  test('§4C.7 — the preview carries the ministry emblem, and says nothing is missing', async () => {
    /* TAM-136 supplied the emblem, so the notice that named it as missing is
       gone — asserted, because a blocker notice that outlives its blocker is
       how a screen starts lying. The seal and the signature are still owed
       (D-051) and are not what this notice was about. */
    await expect(page.getByText(/لم يُزوَّد النظام بشعار الوزارة/)).toHaveCount(0);

    /* And it is really on the face rather than merely not disclaimed. */
    await expect(page.frameLocator('iframe[title="معاينة"]').locator('.emblem svg')).toBeVisible();
  });

  test('§4C.8 — «قياس الأثر» answers by period and department', async () => {
    await page.getByRole('link', { name: 'قياس الأثر' }).click();

    /*
     * TAM-149. Its own page, answering the question the ministry arrives with —
     * how many of our people took part, and is it growing — rather than the
     * system-health reports. Every tile carries its comparison, and the one
     * rate on the tab says what its denominator is, because it is accounts and
     * not the ministry's headcount.
     */
    await expect(page.getByRole('heading', { name: 'المشاركة' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('كل رقم مقارن بالفترة السابقة المماثلة في الطول.')).toBeVisible();
    await expect(page.getByText(/لا من عدد موظفي الوزارة/)).toBeVisible();
    await expect(page.getByRole('table', { name: 'المشاركة حسب الإدارة' })).toBeVisible();

    /* The level test has not shipped (TAM-148), and the block says so rather
       than rendering as an empty card. */
    await expect(page.getByText('لم يُفعَّل اختبار المستوى بعد.')).toBeVisible();

    /* Narrowing to one directorate reaches the API rather than filtering a
       page's worth of rows in the browser. */
    await page.getByLabel('الإدارة').selectOption('المديرية العامة للجوازات');
    await expect(page.getByRole('heading', { name: 'المشاركة' })).toBeVisible();
  });

  test('§4C.8 — the impact export carries every table on the tab', async () => {
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'تصدير البيانات' }).click();
    const download = await downloading;

    /* The period is in the name: two exports of the same tab are different
       reports (D-112's pattern). */
    expect(download.suggestedFilename()).toMatch(/^tamkeen-impact-\d{4}-\d{2}-\d{2}_/);
  });

  test('§4C.8 — there is no way to write, edit or delete an audit entry', async () => {
    await expect(page.getByRole('button', { name: /حذف|تعديل/ })).toHaveCount(0);

    /* And nothing behind the screen either. Nest has no route for these, so
       they 404 — which is what "there is no write path" looks like from
       outside. */
    for (const method of ['post', 'delete', 'patch'] as const) {
      const response = await page.request[method]('http://localhost:4000/api/admin/audit', {
        data: {},
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(404);
    }
  });

  test('an employee reaches none of it, by URL or by API', async ({ browser }) => {
    /*
     * Every admin route has server-side coverage in admin-rbac.e2e-spec.ts.
     * This is the browser half: a signed-in learner typing the URL is sent to
     * their own portal rather than shown a shell they cannot use, and the API
     * refuses them even with a valid session cookie.
     */
    await assertMailpitReachable();

    const learner = await browser.newPage();

    try {
      await signedInEmployee(learner, 'admin-guard');

      await learner.goto('/admin/settings');
      await expect(learner).toHaveURL(/localhost:3000\/$/, { timeout: 15_000 });

      const response = await learner.request.get('http://localhost:4000/api/admin/settings', {
        failOnStatusCode: false,
      });
      expect(response.status()).toBe(403);
    } finally {
      await learner.close();
    }
  });
});
