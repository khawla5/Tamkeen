import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminDashboardView, AdminImpactView, AdminReports } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The head of «قياس الأثر»: the Kingdom, four totals, and the programmes people
 * joined most.
 *
 * What is worth asserting is where each number *comes from* — a total that read
 * the wrong field would still render something plausible — that the ranking is
 * by how many joined and not in the reports' own worst-pass-rate order, and that
 * choosing a region says honestly that nothing is broken down by region yet.
 */

const api = vi.hoisted(() => ({ dashboard: vi.fn(), reports: vi.fn(), impact: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

const { ImpactDashboard } = await import('@/components/admin/impact-dashboard');

const DASHBOARD = {
  users: { employees: 40, entityAccounts: 6, admins: 2, suspended: 0, unverified: 0 },
  entities: { total: 7, active: 6, suspended: 1 },
  courses: { total: 60, published: 27, draft: 30, unowned: 0, unassigned: 3 },
} as unknown as AdminDashboardView;

const count = (value: number) => ({ value, previous: 0, delta: value });

const IMPACT = {
  learning: {
    coursesPassed: count(0),
    learningMinutes: count(125 * 60),
    passesWithoutDuration: 0,
    certificatesCourse: count(0),
    certificatesPath: count(0),
  },
} as unknown as AdminImpactView;

function reports(
  rows: Array<[string, number]>,
  overrides: Partial<AdminReports> = {},
): AdminReports {
  return {
    journey: {
      assigned: 20,
      placed: 12,
      completed: 3,
      pathCompletionRate: 15,
      coursesPassed: 48,
      certificatesIssued: 51,
    },
    certificates: { course: 48, path: 3, total: 51 },
    pathPopularity: [
      { pathId: 'p1', name: 'خدمة المتعاملين', assigned: 14, completed: 2 },
      { pathId: 'p2', name: 'الحوكمة', assigned: 6, completed: 1 },
    ],
    placementDistribution: [
      {
        pathId: 'p1',
        pathName: 'خدمة المتعاملين',
        levelId: 'l1',
        levelName: 'تأسيسي',
        position: 1,
        employees: 8,
      },
      {
        pathId: 'p1',
        pathName: 'خدمة المتعاملين',
        levelId: 'l2',
        levelName: 'متقدم',
        position: 2,
        employees: 4,
      },
    ],
    courseOutcomes: rows.map(([title, enrolled], index) => ({
      courseId: `c${index}`,
      title,
      enrolled,
      passed: 0,
      passRate: 0,
    })),
    ...overrides,
  } as unknown as AdminReports;
}

describe('Impact dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(DASHBOARD);
    api.impact.mockResolvedValue(IMPACT);
    api.reports.mockResolvedValue(
      reports([
        ['الأقل', 3],
        ['الأكثر', 90],
        ['المتوسط', 40],
      ]),
    );
  });

  it('shows the four totals, each from the field that answers it', async () => {
    renderWithProviders(<ImpactDashboard />);

    const totals = await screen.findByRole('region', { name: 'إجماليات المنصة' });

    /* 40 + 6 + 2 accounts; 27 published courses; 125 hours; 7 organisations. */
    expect(within(totals).getByText('المستخدمون').nextSibling).toHaveTextContent('48');
    expect(within(totals).getByText('البرامج التدريبية').nextSibling).toHaveTextContent('27');
    expect(within(totals).getByText('إجمالي ساعات التدريب').nextSibling).toHaveTextContent('125');
    expect(within(totals).getByText('الجهات المتعامَل معها').nextSibling).toHaveTextContent('7');
  });

  it('reads the hours over the whole life of the platform, not this month', async () => {
    renderWithProviders(<ImpactDashboard />);
    await screen.findByRole('region', { name: 'إجماليات المنصة' });

    expect(api.impact).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2000-01-01',
        to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('ranks the programmes by how many joined, most first', async () => {
    renderWithProviders(<ImpactDashboard />);

    const list = await screen.findByRole('list', { name: 'أكثر البرامج انضمامًا' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')?.textContent);

    expect(titles).toEqual(['الأكثر', 'المتوسط', 'الأقل']);
    expect(within(list).getByText('90 منضمّ')).toBeInTheDocument();
  });

  it('says so, rather than drawing an empty chart, when nobody has joined anything', async () => {
    api.reports.mockResolvedValue(reports([['دورة', 0]]));
    renderWithProviders(<ImpactDashboard />);

    expect(await screen.findByText('لم ينضمّ أحد إلى أي برنامج بعد.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'أكثر البرامج انضمامًا' })).not.toBeInTheDocument();
  });

  describe('where the trainees have got to', () => {
    it('counts the people at each stage, with the denominator beside the number', async () => {
      renderWithProviders(<ImpactDashboard />);

      const stages = await screen.findByRole('list', { name: 'أين وصل المتدربون' });

      expect(within(stages).getByText('20 من 20 مُسنَد إليهم')).toBeInTheDocument();
      expect(within(stages).getByText('12 من 20 مُسنَد إليهم')).toBeInTheDocument();
      expect(within(stages).getByText('3 من 20 مُسنَد إليهم')).toBeInTheDocument();
    });

    it('prints an em dash, not 0%, when nobody has been assigned a path', async () => {
      api.reports.mockResolvedValue(
        reports([], {
          journey: {
            assigned: 0,
            placed: 0,
            completed: 0,
            pathCompletionRate: null,
            coursesPassed: 0,
            certificatesIssued: 0,
          },
          pathPopularity: [],
          placementDistribution: [],
        }),
      );
      renderWithProviders(<ImpactDashboard />);

      const stages = await screen.findByRole('list', { name: 'أين وصل المتدربون' });

      expect(within(stages).getAllByText('—')).toHaveLength(3);
      expect(screen.queryByText(/من 0 مُسنَد إليهم/)).not.toBeInTheDocument();
    });

    it('shows what they have earned: courses passed and both kinds of certificate', async () => {
      renderWithProviders(<ImpactDashboard />);

      const section = await screen.findByRole('region', { name: 'الإنجازات' });

      expect(within(section).getByText('دورات مجتازة').nextSibling).toHaveTextContent('48');
      expect(within(section).getByText('شهادات دورات').nextSibling).toHaveTextContent('48');
      expect(within(section).getByText('مسارات مكتملة').nextSibling).toHaveTextContent('3');
    });

    it('shows each path’s own progress and the levels people were placed on', async () => {
      renderWithProviders(<ImpactDashboard />);

      const paths = await screen.findByRole('list', { name: 'التقدّم في كل مسار' });

      expect(within(paths).getByText('خدمة المتعاملين')).toBeInTheDocument();
      expect(within(paths).getByText('أُسند إليه 14 · أكمله 2')).toBeInTheDocument();
      expect(within(paths).getByText('المستويات: تأسيسي: 8 · متقدم: 4')).toBeInTheDocument();

      /* A path nobody was placed on has no levels line rather than an empty one. */
      expect(within(paths).getAllByText(/^المستويات:/)).toHaveLength(1);
    });
  });

  it('offers a retry when any of the three reads fails', async () => {
    api.reports.mockRejectedValue(new Error('down'));
    renderWithProviders(<ImpactDashboard />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('swaps the totals for the chosen region’s card, says there is nothing per region yet, and goes back', async () => {
    renderWithProviders(<ImpactDashboard />);
    const user = userEvent.setup();

    /* Nothing to go back from until a region is chosen. */
    await screen.findByRole('region', { name: 'إجماليات المنصة' });
    expect(screen.queryByRole('button', { name: 'عرض كل المناطق' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'الرياض' }));

    expect(screen.getByRole('heading', { name: 'منطقة الرياض' })).toBeInTheDocument();
    expect(screen.getByText(/لا تتوفر أرقام موزّعة على المناطق بعد/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'إجماليات المنصة' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'عرض كل المناطق' }));

    expect(screen.queryByRole('heading', { name: 'منطقة الرياض' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'إجماليات المنصة' })).toBeInTheDocument();
  });
});
