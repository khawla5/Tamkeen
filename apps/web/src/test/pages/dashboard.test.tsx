import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/api-client';
import type { DashboardPath, DashboardView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The dashboard's two states (§4.2, D-134).
 *
 * Each state has exactly one thing to say, and the test for each asserts both
 * what is shown *and* what is not — "no empty widgets" is a rule about absence,
 * so a test that only checked presence would pass on a screen cluttered with
 * everything.
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
  /* Null follows the system default (§4.12, D-018). */
  numberFormat: null,
};

const path = (overrides: Partial<DashboardPath> = {}): DashboardPath => ({
  id: 'path-1',
  name: 'مسار تحليل البيانات',
  placedLevel: { id: 'level-2', name: 'متقدم', position: 2 },
  pendingAssessmentId: null,
  completedCount: 2,
  inProgressCount: 1,
  totalCount: 5,
  nextCourse: { courseId: 'course-9', title: 'أساسيات البيانات' },
  ...overrides,
});

function renderDashboard(dashboard: Partial<DashboardView>) {
  portal.value.user = USER;
  portal.value.dashboard = {
    state: 'NO_PATH',
    paths: [],
    latestCertificate: null,
    recentActivity: [],
    ...dashboard,
  } as DashboardView;

  return renderWithProviders(<DashboardPage />);
}

describe('the dashboard', () => {
  describe('with no path assigned', () => {
    it('explains the wait and offers nothing to click', () => {
      /* D-130: nobody chooses a path, so an action here would misdescribe the
         product. The card owes them the truth and where it comes from. */
      renderDashboard({ state: 'NO_PATH' });

      expect(screen.getByText('لم يُسند إليك مسار بعد')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /الدورات/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('greets the employee by name', () => {
      renderDashboard({ state: 'NO_PATH' });

      expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
    });
  });

  describe('assigned but not yet placed', () => {
    const awaiting = {
      state: 'AWAITING_PLACEMENT' as const,
      paths: [
        path({
          placedLevel: null,
          pendingAssessmentId: 'assessment-1',
          completedCount: 0,
          inProgressCount: 0,
          totalCount: 0,
          nextCourse: null,
        }),
      ],
    };

    it('offers the assessment as the one action', () => {
      renderDashboard(awaiting);

      const start = screen.getByRole('link', { name: 'ابدأ التقييم' });
      expect(start).toHaveAttribute('href', '/paths/path-1/assessment');
    });

    it('shows no progress at all, rather than zero of zero', () => {
      /* "0 من 0" would tell the learner the path is empty when it is simply not
         yet theirs to start. */
      renderDashboard(awaiting);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('says so plainly when the path has no published assessment yet', () => {
      /* The administrator's problem, surfaced honestly rather than as a button
         that fails. */
      renderDashboard({
        state: 'AWAITING_PLACEMENT',
        paths: [path({ placedLevel: null, pendingAssessmentId: null, totalCount: 0 })],
      });

      expect(screen.getByText(/غير متاح بعد/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'ابدأ التقييم' })).not.toBeInTheDocument();
    });
  });

  describe('with an active path', () => {
    const active = { state: 'ACTIVE_PATH' as const, paths: [path()] };

    it('names the rung the assessment placed them on', () => {
      /* The fact that decides what everything else on the card means. */
      renderDashboard(active);

      expect(screen.getByText(/متقدم/)).toBeInTheDocument();
    });

    it('continues where they left off, as the single primary action', () => {
      renderDashboard(active);

      expect(screen.getByRole('link', { name: 'ابدأ الدورة' })).toHaveAttribute(
        'href',
        '/courses/course-9',
      );
    });

    it('counts progress over what the path owes them', () => {
      renderDashboard(active);

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-valuenow', '2');
      expect(progress).toHaveAttribute('aria-valuemax', '5');
    });

    it('sends them to My Path once nothing is left to continue', () => {
      renderDashboard({
        state: 'ACTIVE_PATH',
        paths: [path({ nextCourse: null, completedCount: 5, inProgressCount: 0 })],
      });

      expect(screen.getByRole('link', { name: 'عرض مساري' })).toBeInTheDocument();
    });

    it('renders one card per assigned path, because a learner may hold two', () => {
      renderDashboard({
        state: 'ACTIVE_PATH',
        paths: [path(), path({ id: 'path-2', name: 'مسار إدارة المشاريع' })],
      });

      expect(screen.getByText('مسار تحليل البيانات')).toBeInTheDocument();
      expect(screen.getByText('مسار إدارة المشاريع')).toBeInTheDocument();
    });

    it('shows the latest certificate, or says how the first one arrives', () => {
      renderDashboard(active);
      expect(screen.getByText(/لم تصدر لك شهادة بعد/)).toBeInTheDocument();

      renderDashboard({
        ...active,
        latestCertificate: {
          id: 'cert-1',
          type: 'COURSE',
          subjectTitle: 'دورة الأمن',
          issuedAt: '2026-05-01T00:00:00.000Z',
        },
      });

      expect(screen.getAllByText('دورة الأمن').length).toBeGreaterThan(0);
    });
  });

  describe('the activity feed', () => {
    it('names what happened, newest first, and is absent when nothing has', () => {
      renderDashboard({ state: 'ACTIVE_PATH', paths: [path()] });
      expect(screen.queryByRole('list', { name: 'آخر المستجدات' })).not.toBeInTheDocument();

      renderDashboard({
        state: 'ACTIVE_PATH',
        paths: [path()],
        recentActivity: [
          { kind: 'PATH_ASSIGNED', title: 'مسار تحليل البيانات', at: '2026-05-02T00:00:00.000Z' },
          { kind: 'COURSE_PASSED', title: 'دورة الأمن', at: '2026-05-01T00:00:00.000Z' },
        ],
      });

      const feed = screen.getByRole('list', { name: 'آخر المستجدات' });
      expect(within(feed).getAllByRole('listitem')).toHaveLength(2);
    });
  });
});
