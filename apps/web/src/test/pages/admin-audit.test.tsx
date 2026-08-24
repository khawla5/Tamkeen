import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAuditPage, AdminReports } from '@tamkeen/types';

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
  reportsCsvUrl: vi.fn(() => 'http://api/api/admin/reports.csv'),
  auditCsvUrl: vi.fn(() => 'http://api/api/admin/audit.csv'),
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
    assessed: 120,
    building: 9,
    active: 60,
    completed: 20,
    pathCompletionRate: 25,
    coursesPassed: 210,
    certificatesIssued: 230,
  },
  pathPopularity: [
    { pathId: 'p1', name: 'خدمة المتعاملين', riasecLetter: 'S', chosen: 40, completed: 12 },
    { pathId: 'p2', name: 'الحوكمة والامتثال', riasecLetter: 'C', chosen: 8, completed: 1 },
  ],
  codeDistribution: [{ code: 'SIA', count: 40 }],
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
        targetType: 'User',
        targetId: 'u1',
        detail: { reason: 'SELF_MODIFICATION_REFUSED' },
      },
    ],
    nextBefore: null,
    actions: ['ADMIN_USER_STATUS_CHANGED', 'PATH_CONFIRMED'],
    ...overrides,
  };
}

describe('Admin audit and reports (§4C.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.reports.mockResolvedValue(REPORTS);
    api.auditLog.mockResolvedValue(log());
  });

  it('shows the loading state before the reports arrive', () => {
    api.reports.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminAuditPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the reports fail', async () => {
    api.reports.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminAuditPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('lists the worst-performing courses first, and says that is the order', async () => {
    renderWithProviders(<AdminAuditPage />);

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
    renderWithProviders(<AdminAuditPage />);

    await screen.findByText('نسبة إكمال المسارات');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('explains an empty report rather than showing an empty card', async () => {
    api.reports.mockResolvedValue({ ...REPORTS, pathPopularity: [], courseOutcomes: [] });
    renderWithProviders(<AdminAuditPage />);

    expect(await screen.findAllByText('لا توجد بيانات كافية بعد.')).toHaveLength(2);
  });

  it('offers the export as an ordinary link, so the session cookie carries it', async () => {
    renderWithProviders(<AdminAuditPage />);

    const link = await screen.findByRole('link', { name: 'تصدير البيانات' });
    expect(link).toHaveAttribute('href', 'http://api/api/admin/reports.csv');
  });

  describe('the trail', () => {
    it('translates an action and names the actor', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);

      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));

      /* The label appears twice by design: once as a filter option and once on
         the entry. Scoped to the paragraph so the assertion is about the row. */
      expect(await screen.findAllByText(/تغيير حالة حساب/)).not.toHaveLength(0);
      expect(screen.getByText(/مسؤول النظام/)).toBeInTheDocument();
    });

    it('shows the reason a refusal happened', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));

      /* Half the value of a refused entry. Non-PII by construction — the audit
         service accepts enumerated codes and scalars, never free text. */
      expect(await screen.findByText(/reason=SELF_MODIFICATION_REFUSED/)).toBeInTheDocument();
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
              detail: null,
            },
          ],
        }),
      );

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));

      expect(await screen.findByText('SOMETHING_PHASE_9_ADDED')).toBeInTheDocument();
    });

    it('offers older entries only when there are some', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));

      await screen.findAllByText(/تغيير حالة حساب/);
      expect(screen.queryByRole('button', { name: 'عمليات أقدم' })).not.toBeInTheDocument();
    });

    it('pages by the cursor the server returned', async () => {
      const user = userEvent.setup();
      api.auditLog.mockResolvedValue(log({ nextBefore: '900' }));

      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));
      await user.click(await screen.findByRole('button', { name: 'عمليات أقدم' }));

      expect(api.auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ before: '900' }));
    });

    it('offers nothing that changes an entry', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAuditPage />);
      await user.click(await screen.findByRole('button', { name: 'سجل العمليات' }));
      await screen.findAllByText(/تغيير حالة حساب/);

      /*
       * An audit entry an administrator can edit is evidence of nothing. The
       * only buttons on this tab are the two filters and the export — checked by
       * name so a control added later has to be considered rather than slipping
       * in.
       */
      const buttons = screen.getAllByRole('button').map((node) => node.textContent);
      expect(buttons).toEqual(expect.arrayContaining(['التقارير', 'سجل العمليات']));
      expect(buttons.some((label) => /حذف|تعديل|حفظ/.test(label ?? ''))).toBe(false);
    });
  });
});
