import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/api-client';
import type { DashboardView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The dashboard's three states (§4.2).
 *
 * Each state has exactly one primary action, and the test for each asserts both
 * what is shown *and* what is not — "near-empty, no empty widgets" is a rule
 * about absence, so a test that only checks presence would pass on a screen
 * cluttered with everything.
 */

const portal = vi.hoisted(() => ({
  value: {
    user: {} as CurrentUser,
    dashboard: {} as DashboardView,
    refresh: vi.fn(),
  },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => portal.value,
}));

/* The real frame pulls in the nav rail, which needs a router; the page's own
   content is what is under test. */
vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: DashboardPage } = await import('@/app/(portal)/page');

const USER: CurrentUser = {
  id: 'user-1',
  email: 'employee@ministry.gov.example',
  fullName: 'سارة العتيبي',
  employeeId: 'EMP-2048',
  department: 'تقنية المعلومات',
  role: 'EMPLOYEE',
  /* Null follows the system default (§4.12, D-018). */
  numberFormat: null,
};

/** The fields every state carries (TAM-123), empty unless a test fills them. */
const EMPTY = {
  recommendedPaths: [] as DashboardView['recommendedPaths'],
  upcomingCourses: [] as DashboardView['upcomingCourses'],
  latestCertificate: null,
  recentActivity: [] as DashboardView['recentActivity'],
} satisfies Pick<
  DashboardView,
  'recommendedPaths' | 'upcomingCourses' | 'latestCertificate' | 'recentActivity'
>;

function setDashboard(dashboard: DashboardView) {
  portal.value = { user: USER, dashboard, refresh: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboard — PRE_ASSESSMENT', () => {
  beforeEach(() => {
    setDashboard({ state: 'PRE_ASSESSMENT', codeString: null, path: null, ...EMPTY });
  });

  it('offers the assessment as the single primary action', () => {
    renderWithProviders(<DashboardPage />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('ابدأ التقييم');
    expect(links[0]).toHaveAttribute('href', '/assessment');
  });

  it('shows the journey tracker with the assessment current and nothing done yet', () => {
    renderWithProviders(<DashboardPage />);

    const steps = screen.getAllByRole('listitem', { name: /التقييم|المسار|الدورات|الشهادة/ });
    expect(steps.map((li) => li.getAttribute('data-stage'))).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(screen.getByRole('list', { name: 'رحلتك التدريبية' })).toBeInTheDocument();
  });

  it('shows the personal header: name, department, employee id', () => {
    renderWithProviders(<DashboardPage />);

    const header = screen.getByRole('region', { name: 'بياناتك' });
    expect(header).toHaveTextContent('سارة العتيبي');
    expect(header).toHaveTextContent('تقنية المعلومات');
    expect(header).toHaveTextContent('EMP-2048');
  });

  it('shows no progress bar and no path tiles', () => {
    /* §4.2: "near-empty. No empty widgets." A progress bar reading zero of zero
       is exactly the empty widget that rule forbids. */
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('مساري')).not.toBeInTheDocument();
  });

  it('greets the user by name', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/أهلًا، سارة العتيبي/)).toBeInTheDocument();
  });
});

describe('dashboard — ASSESSED_NO_PATH', () => {
  beforeEach(() => {
    setDashboard({
      state: 'ASSESSED_NO_PATH',
      codeString: 'SIA',
      path: null,
      ...EMPTY,
      recommendedPaths: [
        { id: 'p1', name: 'خدمة المتعاملين', riasecLetter: 'S' },
        { id: 'p2', name: 'التدريب وتنمية القدرات', riasecLetter: 'S' },
        { id: 'p3', name: 'القيادة وإدارة الفرق', riasecLetter: 'E' },
      ],
      recentActivity: [{ kind: 'ASSESSMENT_COMPLETED', title: null, at: '2026-08-23T10:00:00Z' }],
    });
  });

  it('keeps one primary action — Results — and previews the top recommendations as cards', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('link', { name: 'اختر مسارك' })).toHaveAttribute('href', '/results');

    const preview = screen.getByRole('region', { name: 'مسارات موصى بها لك' });
    const cards = within(preview)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/paths/'));
    expect(cards.map((a) => a.getAttribute('href'))).toEqual([
      '/paths/p1',
      '/paths/p2',
      '/paths/p3',
    ]);
    expect(cards[0]).toHaveTextContent('خدمة المتعاملين');
    expect(cards[0]).toHaveTextContent('الاجتماعي');
    expect(within(preview).getByRole('link', { name: 'عرض كل المسارات' })).toHaveAttribute(
      'href',
      '/results',
    );
  });

  it('tracker: assessment done, path current', () => {
    renderWithProviders(<DashboardPage />);

    const steps = screen.getAllByRole('listitem', { name: /التقييم|المسار|الدورات|الشهادة/ });
    expect(steps.map((li) => li.getAttribute('data-stage'))).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });

  it('shows the Holland Code as Arabic chips in rank order — never the Latin string', () => {
    renderWithProviders(<DashboardPage />);

    const chips = within(screen.getByRole('list', { name: 'ميولك المهنية' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(chips).toEqual(['الاجتماعي', 'البحثي', 'الفني']);
    expect(screen.queryByText(/SIA/)).toBeNull();
  });

  it('offers no summaries or retake here — Results owns the explanation and the retake', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByText(/تميل إلى/)).toBeNull();
    expect(screen.queryByText('إعادة التقييم')).toBeNull();
  });

  it('does not offer the assessment again from here', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByText('ابدأ التقييم')).not.toBeInTheDocument();
  });
});

describe('dashboard — ACTIVE_PATH', () => {
  const ACTIVE: DashboardView = {
    state: 'ACTIVE_PATH',
    codeString: 'SIA',
    path: {
      id: 'path-1',
      name: 'خدمة المتعاملين',
      riasecLetter: 'S',
      completedCount: 2,
      inProgressCount: 1,
      totalCount: 7,
      nextCourse: { id: 'upc-3', courseId: 'course-3', title: 'مهارات التواصل المؤسسي' },
    },
    ...EMPTY,
    upcomingCourses: [
      { id: 'upc-3', courseId: 'course-3', title: 'مهارات التواصل المؤسسي', status: 'IN_PROGRESS' },
      { id: 'upc-4', courseId: 'course-4', title: 'إدارة الشكاوى', status: 'NOT_STARTED' },
      { id: 'upc-5', courseId: 'course-5', title: 'أخلاقيات الخدمة', status: 'NOT_STARTED' },
    ],
    latestCertificate: {
      id: 'cert-1',
      type: 'COURSE',
      subjectTitle: 'استقبال الطلبات',
      issuedAt: '2026-08-20T09:00:00Z',
    },
    recentActivity: [
      { kind: 'CERTIFICATE_ISSUED', title: 'استقبال الطلبات', at: '2026-08-20T09:00:00Z' },
      { kind: 'COURSE_PASSED', title: 'استقبال الطلبات', at: '2026-08-20T08:55:00Z' },
      { kind: 'PATH_CONFIRMED', title: 'خدمة المتعاملين', at: '2026-08-18T12:00:00Z' },
    ],
  };

  it('shows progress as text as well as a bar (WCAG 1.4.1)', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    expect(screen.getByText('2 من 7 دورات مكتملة')).toBeInTheDocument();
  });

  it('links "continue" to the next course, not to the path', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('link', { name: 'ابدأ الدورة' })).toHaveAttribute(
      'href',
      '/courses/course-3',
    );
    expect(screen.getByText('الدورة التالية: مهارات التواصل المؤسسي')).toBeInTheDocument();
  });

  it('offers My Path instead of a course once everything is done', () => {
    setDashboard({
      ...ACTIVE,
      path: { ...ACTIVE.path!, completedCount: 7, nextCourse: null },
    });
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('أكملت جميع دورات مسارك.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض مساري' })).toHaveAttribute('href', '/my-path');
    expect(screen.queryByRole('link', { name: 'ابدأ الدورة' })).not.toBeInTheDocument();
  });

  it('shows the compact tiles §4.2 asks for, and nothing beyond them', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    /* §4.2 names My Path, Certificates and CV, and all three now have pages
       behind them. Courses is ours — a learner mid-path still browses. */
    expect(screen.getByRole('link', { name: 'مساري' })).toHaveAttribute('href', '/my-path');
    expect(screen.getByRole('link', { name: 'الدورات' })).toHaveAttribute('href', '/courses');
    expect(screen.getByRole('link', { name: 'شهاداتي' })).toHaveAttribute('href', '/certificates');
    expect(screen.getByRole('link', { name: 'السيرة الذاتية' })).toHaveAttribute('href', '/cv');
  });

  it('shows a status strip — the path by name and type, and the three course counts', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const strip = screen.getByRole('list', { name: 'حالتك الحالية' });
    expect(strip).toHaveTextContent('خدمة المتعاملين');
    expect(strip).toHaveTextContent('الاجتماعي');
    const counts = [...strip.querySelectorAll('[data-count]')].map((el) => el.textContent);
    /* completed / in progress / not started, summing to the total. */
    expect(counts).toEqual(['2', '1', '4']);
    expect(strip.querySelectorAll('a, button')).toHaveLength(0);
  });

  it('lists the next courses in order with their status, the current one first', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const list = screen.getByRole('list', { name: 'الدورات التالية' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('مهارات التواصل المؤسسي');
    expect(items[0]).toHaveTextContent('قيد التنفيذ');
    expect(items[1]).toHaveTextContent('لم تبدأ');
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/courses/course-3');
  });

  it('shows the latest certificate with a link to the gallery', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const region = screen.getByRole('region', { name: 'أحدث شهادة' });
    expect(region).toHaveTextContent('استقبال الطلبات');
    expect(within(region).getByRole('link')).toHaveAttribute('href', '/certificates');
  });

  it('shows the locked path-certificate slot when nothing has been earned yet', () => {
    setDashboard({ ...ACTIVE, latestCertificate: null });
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('region', { name: 'أحدث شهادة' })).toHaveTextContent(
      'لم تصدر لك شهادة بعد',
    );
  });

  it('lists the last three things that happened, newest first, in Arabic', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const feed = screen.getByRole('list', { name: 'آخر المستجدات' });
    const items = within(feed)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/صدرت شهادة/);
    expect(items[1]).toMatch(/اجتزت دورة/);
    expect(items[2]).toMatch(/أكّدت مسار/);
  });

  it('tracker: assessment and path done, courses current', () => {
    setDashboard(ACTIVE);
    renderWithProviders(<DashboardPage />);

    const steps = screen.getAllByRole('listitem', { name: /التقييم|المسار|الدورات|الشهادة/ });
    expect(steps.map((li) => li.getAttribute('data-stage'))).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
    ]);
  });
});
