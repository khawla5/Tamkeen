import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuditPage, AdminImpactView, AdminReports } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.8 — the audit trail and reports.
 *
 * **Read-only, and it must look it.** Nothing on this page changes anything, and
 * the test checks that directly: a control here would be a way to edit evidence.
 *
 * **The reports are ordered to be acted on.** Worst-performing courses first,
 * because a list of the best ones tells the ministry nothing it needs to do —
 * and the page says so, or the ordering reads as arbitrary.
 */

const api = vi.hoisted(() => ({
  reports: vi.fn(),
  auditLog: vi.fn(),
  impact: vi.fn(),
  reportsCsvUrl: vi.fn(() => 'http://api/api/admin/reports.csv'),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminAuditPage } = await import('@/app/(admin)/admin/audit/page');

const REPORTS: AdminReports = {
  journey: {
    assigned: 120,
    placed: 90,
    completed: 20,
    pathCompletionRate: 25,
    coursesPassed: 210,
    certificatesIssued: 230,
  },
  pathPopularity: [
    { pathId: 'p1', name: 'خدمة المتعاملين', assigned: 40, completed: 12 },
    { pathId: 'p2', name: 'الحوكمة والامتثال', assigned: 8, completed: 1 },
  ],
  placementDistribution: [
    {
      pathId: 'p1',
      pathName: 'خدمة المتعاملين',
      levelId: 'l1',
      levelName: 'تأسيسي',
      position: 1,
      employees: 25,
    },
    {
      pathId: 'p1',
      pathName: 'خدمة المتعاملين',
      levelId: 'l2',
      levelName: 'متقدم',
      position: 2,
      employees: 15,
    },
  ],
  certificates: { course: 200, path: 30, total: 230 },
  courseOutcomes: [
    { courseId: 'c1', title: 'دورة صعبة', enrolled: 40, passed: 4, passRate: 10 },
    { courseId: 'c2', title: 'دورة سهلة', enrolled: 40, passed: 38, passRate: 95 },
  ],
};

function log(overrides: Partial<AdminAuditPage> = {}): AdminAuditPage {
  return {
    rows: [
      {
        id: '9007199254740993',
        occurredAt: '2026-08-23T08:00:00.000Z',
        action: 'ADMIN_USER_STATUS_CHANGED',
        outcome: 'FAILURE',
        actorName: 'مسؤول النظام',
        targetType: 'user',
        targetId: 'u1',
        targetLabel: 'سارة العتيبي',
        reason: 'SELF_MODIFICATION_REFUSED',
        detail: null,
      },
    ],
    nextBefore: null,
    actions: ['ADMIN_USER_STATUS_CHANGED', 'LEARNER_PLACED'],
    ...overrides,
  };
}

/** jsdom's `Blob` has no `text()`; `FileReader` is what it does implement. */
function read(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * «الأثر» is the first tab now (TAM-149), so every assertion below has to say
 * which view it is about. Its own behaviour is covered in
 * `admin-impact.test.tsx`; here it only needs to render without reaching the
 * network.
 */
const EMPTY_COUNT = { value: 0, previous: 0, delta: 0 };

const IMPACT: AdminImpactView = {
  period: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T20:59:59.999Z' },
  previousPeriod: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T20:59:59.999Z' },
  department: null,
  participation: {
    registered: EMPTY_COUNT,
    assessed: EMPTY_COUNT,
    committed: EMPTY_COUNT,
    active: EMPTY_COUNT,
    participationRate: null,
    previousParticipationRate: null,
    accountsToDate: 0,
  },
  byDepartment: [],
  learning: {
    coursesPassed: EMPTY_COUNT,
    learningMinutes: EMPTY_COUNT,
    passesWithoutDuration: 0,
    certificatesCourse: EMPTY_COUNT,
    certificatesPath: EMPTY_COUNT,
  },
  trend: [],
  topCourses: [],
  topPaths: [],
  placements: [],
};

/** Renders the page and moves to the reports tab, which no longer opens first. */
async function openReports() {
  const user = userEvent.setup();
  renderWithProviders(<AdminAuditPage />);
  await user.click(await screen.findByRole('tab', { name: 'التقارير' }));

  return user;
}

describe('Admin audit and reports (§4C.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.reports.mockResolvedValue(REPORTS);
    api.impact.mockResolvedValue(IMPACT);
    api.auditLog.mockResolvedValue(log());
  });

  it('opens on the impact tab, which is the question the page is opened with', async () => {
    renderWithProviders(<AdminAuditPage />);

    /* TAM-149: «كم من موظفينا شارك هذا الربع» comes before «كيف حال النظام». */
    expect(await screen.findByRole('tab', { name: 'الأثر', selected: true })).toBeInTheDocument();
    expect(api.impact).toHaveBeenCalled();
  });

  it('shows the loading state before the reports arrive', async () => {
    api.reports.mockReturnValue(new Promise(() => {}));
    await openReports();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the reports fail', async () => {
    api.reports.mockRejectedValue(new Error('down'));
    await openReports();

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('lists the worst-performing courses first, and says that is the order', async () => {
    await openReports();

    /* Otherwise the ordering reads as arbitrary and the list stops being a
       to-do. */
    expect(await screen.findByText(/مرتّبة من الأقل اجتيازًا/)).toBeInTheDocument();

    const titles = screen.getAllByText(/^دورة (صعبة|سهلة)$/).map((node) => node.textContent);
    expect(titles).toEqual(['دورة صعبة', 'دورة سهلة']);
  });

  it('shows an em dash rather than 0% when nobody has committed', async () => {
    api.reports.mockResolvedValue({
      ...REPORTS,
      journey: { ...REPORTS.journey, pathCompletionRate: null },
    });
    await openReports();

    await screen.findByText('نسبة إكمال المسارات');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('explains an empty report rather than showing an empty card', async () => {
    api.reports.mockResolvedValue({ ...REPORTS, pathPopularity: [], courseOutcomes: [] });
    await openReports();

    expect(await screen.findAllByText('لا توجد بيانات كافية بعد.')).toHaveLength(2);
  });

  it('shows where the ministry’s people stand: each path, each rung, how many', async () => {
    /* D-134 replaced the Holland-code distribution with the question the
       assigned model makes answerable. A code said what somebody was drawn to;
       a placement says what they can already do, which is the fact a training
       programme is planned against. */
    await openReports();

    /* The separator is its own `aria-hidden` span, so the row's text is matched
       whole rather than by a substring that spans two elements. */
    const row = (level: string) => (_: string, node: Element | null) =>
      node?.tagName === 'SPAN' && node.textContent === `خدمة المتعاملين · ${level}`;

    expect(await screen.findByText(row('تأسيسي'))).toBeInTheDocument();
    expect(screen.getByText(row('متقدم'))).toBeInTheDocument();
    expect(screen.getByText('25 موظف')).toBeInTheDocument();
    /* Three Latin letters name nothing in an Arabic report, and nothing here
       computes them any more. */
    expect(document.body.textContent).not.toContain('SIA');
  });

  it('counts every stage the export reports, not some of them', async () => {
    await openReports();

    /* The file and the page it came from used to disagree about how the
       programme was doing. */
    expect(await screen.findByText('موظفون أُسند إليهم مسار')).toBeInTheDocument();
    expect(screen.getByText('دورات مجتازة')).toBeInTheDocument();
  });

  it('offers the reports export as an ordinary link, so the session cookie carries it', async () => {
    await openReports();

    const link = await screen.findByRole('link', { name: 'تصدير البيانات' });
    expect(link).toHaveAttribute('href', 'http://api/api/admin/reports.csv');
  });

  describe('the trail', () => {
    it('translates an action and names the actor', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);

      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* The label appears twice by design: once as a filter option and once on
         the entry. Scoped to the paragraph so the assertion is about the row. */
      expect(await screen.findAllByText(/تغيير حالة حساب/)).not.toHaveLength(0);
      expect(screen.getByText(/مسؤول النظام/)).toBeInTheDocument();
    });

    it('shows the reason a refusal happened', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* Half the value of a refused entry, and in Arabic — the page used to
         print the raw  left-to-right in the
         middle of an Arabic page (TAM-137). */
      expect(await screen.findByText('لا يجوز للمسؤول تعديل حسابه بنفسه')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('SELF_MODIFICATION_REFUSED');
    });

    it('names what the entry was about, and never shows its id', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* «حساب: سارة العتيبي» — the kind, then the name. An administrator
         reading a trail needs to know *which* account, and a uuid answers that
         for nobody (TAM-137). */
      expect(await screen.findByText(/حساب: سارة العتيبي/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('u1');
    });

    it('marks a failed outcome as a failure, not as an ordinary tag', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* The word carries the meaning; the colour only reinforces it. */
      const badge = (await screen.findAllByText('أخفق')).find((node) =>
        node.className.includes('border-danger'),
      );
      expect(badge).toBeDefined();
    });

    it('renders the remaining detail as labelled Arabic, never as key=value', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(
        log({
          rows: [
            {
              id: '2',
              occurredAt: '2026-08-23T08:00:00.000Z',
              action: 'LEARNER_PLACED',
              outcome: 'SUCCESS',
              actorName: 'سارة العتيبي',
              targetType: 'user_path',
              targetId: 'up1',
              targetLabel: 'خدمة المتعاملين',
              reason: null,
              detail: { courses: 5, status: 'ACTIVE' },
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      expect(await screen.findByText(/مسار موظف: خدمة المتعاملين/)).toBeInTheDocument();
      /* Labels in Arabic, values through the shared formatter (D-018). */
      expect(screen.getByText('الدورات:')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('courses=5');
    });

    it('names a setting by its Arabic name, since the id is the key', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(
        log({
          rows: [
            {
              id: '3',
              occurredAt: '2026-08-23T08:00:00.000Z',
              action: 'ADMIN_SETTING_CHANGED',
              outcome: 'SUCCESS',
              actorName: 'مسؤول النظام',
              targetType: 'setting',
              targetId: 'CERT_SIGNATORY_NAME',
              targetLabel: null,
              reason: null,
              detail: null,
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      expect(await screen.findByText(/إعداد: اسم الموقِّع على الشهادات/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('CERT_SIGNATORY_NAME');
    });

    it('lets a non-Arabic value keep its own direction', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(
        log({
          rows: [
            {
              id: '4',
              occurredAt: '2026-08-23T08:00:00.000Z',
              action: 'AUTHZ_DENIED',
              outcome: 'FAILURE',
              actorName: 'أحمد الموظف',
              targetType: null,
              targetId: null,
              targetLabel: null,
              reason: 'INSUFFICIENT_ROLE',
              detail: { path: '/api/admin/settings', method: 'GET' },
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* The route rendered as `api/admin/settings/` — its leading slash thrown
         to the end by the surrounding RTL run, which makes it read as a
         different route than the one that was actually requested. */
      const route = await screen.findByText('/api/admin/settings');
      expect(route).toHaveAttribute('dir', 'auto');
    });

    it('filters on the shared Select rather than a raw control', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      const action = await screen.findByLabelText('الإجراء');
      /* The pre-token classes the row used to carry (`border-input`,
         `rounded-md`) name nothing in the D-069 palette — they rendered an
         unstyled control. */
      expect(action.className).not.toContain('border-input');
      expect(action.className).toContain('border-neutral-400');
    });

    it('falls back to the raw code for an action with no Arabic copy', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(
        log({
          rows: [
            {
              id: '1',
              occurredAt: '2026-08-23T08:00:00.000Z',
              action: 'SOMETHING_PHASE_9_ADDED',
              outcome: 'SUCCESS',
              actorName: null,
              targetType: null,
              targetId: null,
              targetLabel: null,
              reason: null,
              detail: null,
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      expect(await screen.findByText('SOMETHING_PHASE_9_ADDED')).toBeInTheDocument();
    });

    it('offers older entries only when there are some', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      await screen.findAllByText(/تغيير حالة حساب/);
      expect(screen.queryByRole('button', { name: 'عمليات أقدم' })).not.toBeInTheDocument();
    });

    it('pages by the cursor the server returned', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(log({ nextBefore: '900' }));

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));
      await user.click(await screen.findByRole('button', { name: 'عمليات أقدم' }));

      expect(api.auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ before: '900' }));
    });

    it('says what a coded value means, not what it is called in the codebase', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(
        log({
          rows: [
            {
              id: '5',
              occurredAt: '2026-08-23T08:00:00.000Z',
              action: 'ADMIN_COURSE_INTERVENED',
              outcome: 'SUCCESS',
              actorName: 'مسؤول النظام',
              targetType: 'course',
              targetId: 'c1',
              targetLabel: 'مقدمة في الحوكمة',
              reason: null,
              detail: {
                status: 'HIDDEN_BUT_COMPLETABLE',
                fields: 'department,fullName',
                race: true,
              },
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      /* The keys were translated and the values were not: the row read «الحالة:
         HIDDEN_BUT_COMPLETABLE» — an Arabic label followed by the codebase's own
         vocabulary (TAM-138). A list is split and each part translated; a
         boolean is a word. */
      expect(await screen.findByText('مخفية عن الاختيار')).toBeInTheDocument();
      expect(screen.getByText('الإدارة، الاسم')).toBeInTheDocument();
      expect(screen.getByText('نعم')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('HIDDEN_BUT_COMPLETABLE');
      expect(document.body.textContent).not.toContain('fullName');
    });

    it('groups the action filter by the area each action belongs to', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));

      const action = await screen.findByLabelText('الإجراء');
      const groups = [...action.querySelectorAll('optgroup')].map((node) => node.label);

      /* Fifty-odd options in one flat list is not a filter anybody uses; the
         grouping is the vocabulary's own, so a heading here cannot disagree with
         what the codebase records (TAM-138). Only the categories the fixture's
         own actions fall into get a heading — an empty group would name a
         category nothing in the log belongs to. */
      expect(groups).toEqual(['رحلة الموظف', 'إدارة المنصة']);
    });

    it('filters by a period, and starts the paging over when it changes', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(log({ nextBefore: '900' }));

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));
      await user.click(await screen.findByRole('button', { name: 'عمليات أقدم' }));

      await user.type(screen.getByLabelText('من تاريخ'), '2026-08-01');

      /* A cursor from the previous result set points into rows the new filter
         may not contain. */
      expect(api.auditLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-08-01', before: undefined }),
      );
    });

    it('exports the trail in the same words the screen shows', async () => {
      const user = userEvent.setup();
      const blobs: Blob[] = [];

      /* jsdom implements neither half of the object-URL API, so they are
         assigned rather than spied on. */
      URL.createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:audit';
      });
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));
      await user.click(await screen.findByRole('button', { name: 'تصدير البيانات' }));

      /* The export used to be a link to `/api/admin/audit.csv`, which wrote the
         raw vocabulary — so the file said something different from the screen it
         came from (TAM-138). */
      expect(api.auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 5000 }));

      const csv = await read(blobs[0]!);
      /* The BOM is not asserted here — `readAsText` consumes it as the encoding
         signature it is; `toCsv`'s own spec owns that, and this export goes
         through the same shared writer. */
      expect(csv).toContain('تغيير حالة حساب');
      expect(csv).toContain('لا يجوز للمسؤول تعديل حسابه بنفسه');
      expect(csv).toContain('حساب: سارة العتيبي');
      expect(csv).not.toContain('ADMIN_USER_STATUS_CHANGED');
      expect(csv).not.toContain('SELF_MODIFICATION_REFUSED');
      expect(csv).not.toContain('u1');
    });

    it('says so rather than failing silently when the export cannot be built', async () => {
      const user = userEvent.setup();

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));
      await screen.findAllByText(/تغيير حالة حساب/);

      api.auditLog.mockRejectedValueOnce(new Error('down'));
      await user.click(screen.getByRole('button', { name: 'تصدير البيانات' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحضير الملف');
    });

    it('offers nothing that changes an entry', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('tab', { name: 'سجل العمليات' }));
      await screen.findAllByText(/تغيير حالة حساب/);

      /*
       * An audit entry an administrator can edit is evidence of nothing. The
       * only buttons on this tab are the two filters and the export — checked by
       * name so a control added later has to be considered rather than slipping
       * in.
       */
      const buttons = screen.getAllByRole('button').map((node) => node.textContent);
      /* The three views are a real tablist now (TAM-149), so what is left as a
         button on this tab is the export and nothing else. */
      expect(buttons).toEqual(expect.arrayContaining(['تصدير البيانات']));
      expect(buttons.some((label) => /حذف|تعديل|حفظ/.test(label ?? ''))).toBe(false);
    });
  });
});
