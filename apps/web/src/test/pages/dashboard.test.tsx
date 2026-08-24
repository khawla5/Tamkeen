import { screen } from '@testing-library/react';
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
  employeeId: 'E-1',
  department: 'تقنية المعلومات',
  role: 'EMPLOYEE',
};

function setDashboard(dashboard: DashboardView) {
  portal.value = { user: USER, dashboard, refresh: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboard — PRE_ASSESSMENT', () => {
  beforeEach(() => {
    setDashboard({ state: 'PRE_ASSESSMENT', codeString: null, path: null });
  });

  it('offers the assessment as the single primary action', () => {
    renderWithProviders(<DashboardPage />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('ابدأ التقييم');
    expect(links[0]).toHaveAttribute('href', '/assessment');
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

    expect(screen.getByText('أهلًا، سارة العتيبي')).toBeInTheDocument();
  });
});

describe('dashboard — ASSESSED_NO_PATH', () => {
  beforeEach(() => {
    setDashboard({ state: 'ASSESSED_NO_PATH', codeString: 'SIA', path: null });
  });

  it('points at path selection as the single action', () => {
    renderWithProviders(<DashboardPage />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/results');
    expect(links[0]).toHaveTextContent('اختر مسارك');
  });

  it('mentions the Holland Code the user received', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(/SIA/)).toBeInTheDocument();
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
      completedCount: 2,
      totalCount: 7,
      nextCourse: { id: 'upc-3', courseId: 'course-3', title: 'مهارات التواصل المؤسسي' },
    },
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
});
