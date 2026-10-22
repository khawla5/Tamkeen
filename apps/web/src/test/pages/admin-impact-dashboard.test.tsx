import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminDashboardView, AdminImpactView, AdminReports } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The head of «قياس الأثر»: has the need been met (illustrative), and what is the
 * platform itself doing (real).
 *
 * What is worth asserting is where each *real* number comes from — a total that
 * read the wrong field would still render something plausible — that the
 * ranking is by how many joined and not in the reports' own worst-pass-rate
 * order, and that the illustrative half says it is illustrative and keeps
 * working when the real half cannot load.
 */

const api = vi.hoisted(() => ({ dashboard: vi.fn(), reports: vi.fn(), impact: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

const { ImpactDashboard } = await import('@/components/admin/impact-dashboard');
const { ImpactReadiness } = await import('@/components/admin/impact-readiness');

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

describe('Impact dashboard — platform activity (real numbers)', () => {
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

  it('marks this half as real and the other as illustrative', async () => {
    renderWithProviders(<ImpactDashboard />);

    expect(await screen.findByText('أرقام حقيقية')).toBeInTheDocument();
    expect(screen.getAllByText('أرقام تجريبية').length).toBeGreaterThan(0);
    expect(screen.getByText('أرقام تجريبية توضيحية')).toBeInTheDocument();
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

  it('offers a retry when any of the three reads fails — and the readiness half still shows', async () => {
    api.reports.mockRejectedValue(new Error('down'));
    renderWithProviders(<ImpactDashboard />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
    /* Illustrative, and independent of the network: one failing request must not
       blank the whole page. */
    expect(screen.getByText('نسبة سدّ الاحتياج')).toBeInTheDocument();
  });

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
});

describe('Impact readiness (illustrative)', () => {
  /* A fixed clock: the days left and the pace are functions of "today". */
  const NOW = new Date('2026-10-04T12:00:00Z');

  it('states the target, its path, its date and the headcount it asks for', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    expect(
      screen.getByRole('heading', {
        name: /المستهدف: منسوبو الدفاع المدني المؤهّلون للاستجابة للحوادث الكبرى/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/مسار «الاستجابة للحوادث الكبرى»/)).toBeInTheDocument();
    expect(screen.getByText(/العدد المطلوب: 2,900 موظفًا/)).toBeInTheDocument();
  });

  it('answers «هل سُدّ الاحتياج؟» in four numbers', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    const kpis = screen.getByRole('region', { name: 'مؤشرات الجاهزية' });

    expect(within(kpis).getByText('نسبة سدّ الاحتياج').nextSibling).toHaveTextContent('66');
    expect(within(kpis).getByText('تأهّل 1,920 من 2,900 موظفًا')).toBeInTheDocument();
    expect(within(kpis).getByText('الفجوة المتبقية').nextSibling).toHaveTextContent('980');
    expect(within(kpis).getByText('الزمن حتى الجاهزية').nextSibling).toHaveTextContent('178 يومًا');
    expect(within(kpis).getByText(/^متقدّم \d+ يومًا$/)).toBeInTheDocument();
  });

  it('prints each region’s readiness on the map, so the shading is never the only carrier', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    expect(screen.getByRole('button', { name: /^نجران، 36/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^القصيم، 90/ })).toBeInTheDocument();
  });

  /** A region has two handles — its shape on the map and its row in the ranking. */
  const onMap = () => screen.getByRole('group', { name: 'خريطة جاهزية مناطق المملكة' });
  const inRanking = () => screen.getByRole('list', { name: 'أولويات سدّ الفجوة' });

  it('opens a region’s own units and their shares when it is chosen', async () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);
    const user = userEvent.setup();

    expect(
      screen.getByText('اختر منطقة من الخريطة لعرض مراكزها ونسبة جاهزيتها.'),
    ).toBeInTheDocument();

    await user.click(within(onMap()).getByRole('button', { name: /^نجران/ }));

    expect(screen.getByRole('heading', { name: 'منطقة نجران' })).toBeInTheDocument();
    expect(screen.getByText(/تأهّل 40 من 110، والفجوة 70/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'مراكز الإنقاذ والاستجابة' })).toHaveAttribute(
      'aria-valuenow',
      '37',
    );

    /* Choosing it again clears it. */
    await user.click(within(onMap()).getByRole('button', { name: /^نجران/ }));
    expect(screen.queryByRole('heading', { name: 'منطقة نجران' })).not.toBeInTheDocument();
  });

  it('selects the same region from its row in the ranking, and offers a way back out', async () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);
    const user = userEvent.setup();

    await user.click(within(inRanking()).getByRole('button', { name: /^نجران/ }));

    expect(screen.getByRole('heading', { name: 'منطقة نجران' })).toBeInTheDocument();
    /* The map and the list agree about what is chosen. */
    expect(within(onMap()).getByRole('button', { name: /^نجران/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(inRanking()).getByRole('button', { name: /^نجران/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'عرض كل المناطق' }));

    expect(screen.queryByRole('heading', { name: 'منطقة نجران' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض كل المناطق' })).not.toBeInTheDocument();
  });

  it('lights the region on the map when its row is hovered, and lets go when it is not', async () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);
    const user = userEvent.setup();

    const najran = () => within(onMap()).getByRole('button', { name: /^نجران/ });
    const before = najran().getAttribute('class');

    await user.hover(within(inRanking()).getByRole('button', { name: /^نجران/ }));
    expect(najran().getAttribute('class')).not.toBe(before);
    expect(najran()).toHaveAttribute('filter', 'url(#region-lift)');

    await user.unhover(within(inRanking()).getByRole('button', { name: /^نجران/ }));
    expect(najran().getAttribute('class')).toBe(before);
  });

  it('tells you the numbers on hover, not just the name', async () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);
    const user = userEvent.setup();

    await user.hover(within(onMap()).getByRole('button', { name: /^نجران/ }));

    /* Decorative for assistive technology (the region's own name already carries
       the same words), so it is found by its place rather than by a role — and
       its numbers are asserted *inside* it, because the ranking repeats them. */
    const tooltip = document.querySelector('[aria-hidden="true"].z-10');

    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveTextContent('نجران');
    expect(tooltip).toHaveTextContent('40 من 110');
    expect(tooltip).toHaveTextContent('الفجوة 70 · أولوية عالية');

    await user.unhover(within(onMap()).getByRole('button', { name: /^نجران/ }));
    expect(document.querySelector('[aria-hidden="true"].z-10')).toBeNull();
  });

  it('filters by band from the legend: fades the others, narrows the ranking, and lifts again', async () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);
    const user = userEvent.setup();

    const rows = () => within(inRanking()).getAllByRole('listitem');
    const all = rows().length;
    expect(all).toBe(13);

    const low = screen.getByRole('button', { name: /^أقل من/ });
    await user.click(low);

    expect(low).toHaveAttribute('aria-pressed', 'true');
    /* Najran (36%) and the Northern Borders (40%) are the only two below half. */
    expect(rows()).toHaveLength(2);
    expect(within(inRanking()).queryByText('الرياض')).not.toBeInTheDocument();

    /* The other regions stay on the map, faded, so their place is not lost. */
    const faded = within(onMap())
      .getByRole('button', { name: /^الرياض/ })
      .closest('g');
    expect(faded).toHaveClass('opacity-25');
    expect(
      within(onMap())
        .getByRole('button', { name: /^نجران/ })
        .closest('g'),
    ).not.toHaveClass('opacity-25');

    await user.click(low);
    expect(low).toHaveAttribute('aria-pressed', 'false');
    expect(rows()).toHaveLength(all);
  });

  it('ranks the regions to act on by the size of the gap, and names the priority in words', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    const list = screen.getByRole('list', { name: 'أولويات سدّ الفجوة' });
    const first = within(list).getAllByRole('listitem')[0]!;

    expect(within(first).getByText('مكة المكرمة')).toBeInTheDocument();
    expect(within(first).getByText('أولوية متوسطة')).toBeInTheDocument();
    /* More than one region is below half, so the word appears more than once. */
    expect(within(list).getAllByText('أولوية عالية').length).toBeGreaterThan(1);
  });

  it('shows the share met in each job', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    const jobs = screen.getByRole('list', { name: 'نسبة سدّ الاحتياج لكل وظيفة ومهمة' });

    expect(within(jobs).getByText(/70.*840 من 1,200/)).toBeInTheDocument();
  });

  it('places the plan and the achievement on one timeline, and says which is ahead', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    expect(
      screen.getByRole('img', { name: /مرّ 60.*من المدة، وتحقّق 66.*من المستهدف/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/بالوتيرة الحالية تتحقق الجاهزية قبل الموعد بنحو \d+ يومًا\./),
    ).toBeInTheDocument();
  });

  it('reports the indicators in points when the metric is itself a percentage', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    /* One card per indicator, in a labelled list; it was a table. */
    const list = screen.getByRole('list', { name: 'الأثر في الأداء' });

    expect(within(list).getByText(/14 نقاط/)).toBeInTheDocument();
    expect(within(list).getAllByText(/\(تحسّن\)/)).toHaveLength(4);
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('tags every block as illustrative', () => {
    renderWithProviders(<ImpactReadiness now={NOW} />);

    /* The target, the map, the jobs, the timeline and the indicators. */
    expect(screen.getAllByText(/^أرقام تجريبية/)).toHaveLength(5);
  });
});
