import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatPercent, type AdminImpactView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.8's «الأثر» (TAM-149).
 *
 * The tab answers a management question — how many of our people took part
 * this quarter, in which directorates, what did they complete, and is it
 * growing — so what is worth asserting is that every figure arrives with its
 * comparison, that a rate says what it is a rate *of*, and that the two things
 * that would silently mislead are said out loud: an unset course duration, and
 * a language-level block that is not enabled rather than empty.
 */

const api = vi.hoisted(() => ({ impact: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

const { ImpactTab, presetRange, isoDay } = await import('@/components/admin/impact-tab');

const count = (value: number, previous: number) => ({ value, previous, delta: value - previous });

/** jsdom's `Blob` has no `text()`; `FileReader` is what it does implement. */
function read(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function view(overrides: Partial<AdminImpactView> = {}): AdminImpactView {
  return {
    period: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T20:59:59.999Z' },
    previousPeriod: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T20:59:59.999Z' },
    department: null,
    participation: {
      registered: count(40, 25),
      assessed: count(30, 30),
      committed: count(18, 24),
      active: count(52, 40),
      participationRate: 25,
      previousParticipationRate: 20,
      accountsToDate: 320,
    },
    byDepartment: [
      {
        department: 'المديرية العامة للجوازات',
        registered: 30,
        assessed: 20,
        committed: 12,
        active: 40,
      },
      {
        department: 'المديرية العامة للسجون',
        registered: 10,
        assessed: 10,
        committed: 6,
        active: 12,
      },
      { department: 'أمن المنشآت', registered: 0, assessed: 0, committed: 0, active: 0 },
    ],
    learning: {
      coursesPassed: count(130, 100),
      learningMinutes: count(7200, 6000),
      passesWithoutDuration: 4,
      certificatesCourse: count(110, 93),
      certificatesPath: count(9, 4),
    },
    trend: [
      { month: '2026-07', coursesPassed: 100, certificates: 90 },
      { month: '2026-08', coursesPassed: 130, certificates: 110 },
    ],
    topCourses: [
      { courseId: 'c1', title: 'السلامة الميدانية', passes: 60, averageGrade: 82 },
      { courseId: 'c2', title: 'التحقيق الجنائي', passes: 20, averageGrade: null },
    ],
    topPaths: [{ pathId: 'p1', name: 'العمليات الميدانية', completions: 9 }],
    placements: [
      {
        pathId: 'p1',
        pathName: 'العمليات الميدانية',
        levelId: 'l1',
        levelName: 'تأسيسي',
        position: 1,
        employees: 12,
      },
      {
        pathId: 'p1',
        pathName: 'العمليات الميدانية',
        levelId: 'l2',
        levelName: 'متقدم',
        position: 2,
        employees: 8,
      },
    ],
    ...overrides,
  };
}

describe('Admin impact tab (§4C.8, TAM-149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.impact.mockResolvedValue(view());
  });

  it('shows the loading state before the figures arrive', () => {
    api.impact.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ImpactTab />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    api.impact.mockRejectedValue(new Error('down'));
    renderWithProviders(<ImpactTab />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('opens on the current month', async () => {
    renderWithProviders(<ImpactTab />);
    await screen.findByText('المشاركة');

    const month = presetRange('month');
    expect(api.impact).toHaveBeenCalledWith({
      from: month.from,
      to: month.to,
      department: undefined,
    });
  });

  it('carries a rise, a fall and no change beside every count', async () => {
    renderWithProviders(<ImpactTab />);

    /* Growth is the impact question, so it is answered on the tile rather than
       in a footnote — and a fall must read as a fall. */
    expect(await screen.findByText('+15')).toBeInTheDocument();
    expect(screen.getByText('−6')).toBeInTheDocument();
    expect(screen.getByText('بلا تغيير')).toBeInTheDocument();
  });

  it('says what the participation rate is a rate of', async () => {
    renderWithProviders(<ImpactTab />);

    /* The denominator is accounts, not the ministry's headcount, which the
       platform has no way of knowing — a rate that hides that is a rate the
       ministry would quote at somebody. */
    /* Through the shared formatting layer, because the percent sign and the
       digits are both D-018's to decide (the Arabic locale uses ٪). */
    expect(await screen.findByText(formatPercent(25))).toBeInTheDocument();
    expect(screen.getByText('من أصل 320 حساب')).toBeInTheDocument();
    expect(screen.getByText(/لا من عدد موظفي الوزارة/)).toBeInTheDocument();
  });

  it('compares the rate in percentage points, not in per cent', async () => {
    renderWithProviders(<ImpactTab />);

    /* Points, not per cent: calling five points "five" beside a percentage
       reads as five per cent. */
    expect(await screen.findByText('+5 نقطة مئوية عن الفترة السابقة')).toBeInTheDocument();
  });

  it('offers no comparison for a period there was nothing before', async () => {
    api.impact.mockResolvedValue(
      view({ participation: { ...view().participation, previousParticipationRate: null } }),
    );
    renderWithProviders(<ImpactTab />);

    /* A period before which no account existed has no rate, and "+25" against
       nothing would be an invention. */
    await screen.findByText('المشاركة');
    expect(screen.queryByText(/نقطة مئوية/)).not.toBeInTheDocument();
  });

  it('keeps a directorate that took no part, as a row of zeros', async () => {
    renderWithProviders(<ImpactTab />);

    const table = await screen.findByRole('table', { name: 'المشاركة حسب الإدارة' });
    expect(within(table).getByText('أمن المنشآت')).toBeInTheDocument();
  });

  it('sorts the department table on a column the reader chooses', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImpactTab />);

    const table = await screen.findByRole('table', { name: 'المشاركة حسب الإدارة' });
    await user.click(within(table).getByRole('button', { name: /متعلّمون نشطون/ }));

    const first = within(table).getAllByRole('row')[1]!;
    /* Descending on the first click: "which directorate is furthest ahead —
       and which is behind" is asked in that direction. */
    expect(within(first).getByText('المديرية العامة للجوازات')).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')[4]).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('reports hours rather than minutes, and admits what it could not count', async () => {
    renderWithProviders(<ImpactTab />);

    expect(await screen.findByText('120')).toBeInTheDocument();
    /* 7,200 minutes is 120 hours; the tile must not print the minutes. */
    expect(screen.getByText('ساعات تدريب مكتملة')).toBeInTheDocument();
    /* D-035: an unset duration contributes nothing, and a total that is
       silently short is worse than one that says so. */
    expect(screen.getByText(/4 من الدورات المجتازة بلا مدة محددة/)).toBeInTheDocument();
  });

  it('says nothing about missing durations when there are none', async () => {
    api.impact.mockResolvedValue(
      view({
        learning: { ...view().learning, passesWithoutDuration: 0 },
      }),
    );
    renderWithProviders(<ImpactTab />);

    await screen.findByText('التعلّم المُنجز');
    expect(screen.queryByText(/بلا مدة محددة/)).not.toBeInTheDocument();
  });

  it('names each month of the trend and prints both counts in words', async () => {
    renderWithProviders(<ImpactTab />);

    /* The bars are decorative: every one is paired with its number, so the row
       survives a printer that drops background colours (WCAG 1.4.1). */
    expect(await screen.findByText('أغسطس 2026')).toBeInTheDocument();
    expect(screen.getByText('130 دورة · 110 شهادة')).toBeInTheDocument();
  });

  it('names each path and rung the period’s assessments placed people on', async () => {
    /* D-134 replaced the career-type share, which described inclination rather
       than capability. This is a fact about the period like every other figure
       on the tab. */
    renderWithProviders(<ImpactTab />);

    const placements = await screen.findByRole('list', { name: 'تحديد المستويات في الفترة' });

    expect(within(placements).getByText('العمليات الميدانية · تأسيسي')).toBeInTheDocument();
    expect(within(placements).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says nobody was placed rather than leaving an empty block', async () => {
    /* A quarter in which no directorate sat an assessment is a real finding,
       not a gap in the data, so the heading stays and the list says so. */
    api.impact.mockResolvedValue(view({ placements: [] }));
    renderWithProviders(<ImpactTab />);

    expect(await screen.findByText('تحديد المستويات في الفترة')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'تحديد المستويات في الفترة' }),
    ).not.toBeInTheDocument();
  });

  it('narrows every figure to the department asked for', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImpactTab />);

    await screen.findByText('المشاركة');
    await user.selectOptions(screen.getByLabelText('الإدارة'), 'المديرية العامة للسجون');

    expect(api.impact).toHaveBeenLastCalledWith(
      expect.objectContaining({ department: 'المديرية العامة للسجون' }),
    );
  });

  it('asks for the quarter when the quarter is chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImpactTab />);

    await screen.findByText('المشاركة');
    await user.selectOptions(screen.getByLabelText('الفترة'), 'quarter');

    const quarter = presetRange('quarter');
    expect(api.impact).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: quarter.from, to: quarter.to }),
    );
  });

  it('exports every table in one file, with the period in its name', async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const created: Blob[] = [];

    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:impact';
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();

    renderWithProviders(<ImpactTab />);
    await screen.findByText('المشاركة');
    await user.click(screen.getByRole('button', { name: 'تصدير البيانات' }));

    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    /* Named by the two days the screen is showing, not by a UTC slice of the
       response: a year selected in Riyadh would otherwise download as
       `2025-12-31_2026-12-31` — a different period from the one inside it. */
    const month = presetRange('month');
    expect(anchor.download).toBe(`tamkeen-impact-${month.from}_${month.to}.csv`);

    const csv = await read(created[0]!);
    /* Written in the browser, where the Arabic copy lives, and through the
       shared `toCsv` — whose own spec pins the BOM that keeps Excel from
       reading the file as the system codepage (D-076). `FileReader` strips it
       here, so this asserts the words rather than the three bytes. */
    expect(created[0]!.type).toContain('text/csv');
    expect(csv).toContain('المشاركة حسب الإدارة');
    expect(csv).toContain('أمن المنشآت');
    expect(csv).toContain('السلامة الميدانية');
    /* The path and the rung spelled out, not a level id — an identifier in an
       Arabic report names nothing. */
    expect(csv).toContain('العمليات الميدانية · تأسيسي');

    click.mockRestore();
  });
});

describe('presetRange', () => {
  it('runs a month from its first day to its last', () => {
    expect(presetRange('month', new Date(2026, 1, 14))).toEqual({
      from: '2026-02-01',
      /* February, so a naive "day 30" would land in March. */
      to: '2026-02-28',
    });
  });

  it('aligns a quarter to the calendar', () => {
    expect(presetRange('quarter', new Date(2026, 7, 14))).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
  });

  it('runs a year end to end', () => {
    expect(presetRange('year', new Date(2026, 7, 14))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('reads a date in local time, so a day never shifts', () => {
    /* `toISOString` on a local midnight moves the date by the offset, which is
       how a period silently starts a day early. */
    expect(isoDay(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
