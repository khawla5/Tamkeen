import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminDashboardView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.1 — the admin dashboard.
 *
 * Integration health is what the page is for; the totals are context. So most of
 * what is asserted here is that an operator can tell the three failures apart —
 * Moodle down, Moodle refusing the token, and Moodle fine but the sync stalled —
 * because a single green tick would collapse all three into "something is wrong"
 * and cost them the first hour of the outage.
 */

const api = vi.hoisted(() => ({ dashboard: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ adminApi: { dashboard: api.dashboard } }));

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({
    title,
    action,
    children,
  }: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {action}
      {children}
    </div>
  ),
}));

const { default: AdminDashboardPage } = await import('@/app/(admin)/admin/page');

const VIEW: AdminDashboardView = {
  users: { employees: 312, entityAccounts: 5, admins: 2, suspended: 3, unverified: 7 },
  entities: { total: 4, active: 3, suspended: 1 },
  paths: { total: 6, active: 5 },
  courses: { total: 48, published: 40, draft: 4, unowned: 44 },
  journey: {
    assessed: 120,
    building: 9,
    active: 60,
    completed: 20,
    pathCompletionRate: 25,
    coursesPassed: 210,
    certificatesIssued: 230,
  },
  codeDistribution: [
    { code: 'SIA', count: 40 },
    { code: 'RIC', count: 10 },
  ],
  lms: {
    reachable: true,
    mode: 'real',
    siteName: 'منصة تمكين',
    baseUrl: 'https://moodle.ministry.gov.example',
    failureCode: null,
    lastCatalogSyncAt: '2026-08-23T09:00:00.000Z',
    lastCompletionSyncAt: '2026-08-23T09:05:00.000Z',
  },
  recentActivity: [
    {
      id: '9007199254740993',
      action: 'PATH_CONFIRMED',
      outcome: 'SUCCESS',
      actorName: 'سارة العتيبي',
      targetType: 'user_path',
      occurredAt: '2026-08-23T08:00:00.000Z',
    },
  ],
  assessment: { version: 1, effectiveFrom: '2026-08-01T00:00:00.000Z', hasDraft: false },
};

function view(patch: Partial<AdminDashboardView> = {}): AdminDashboardView {
  return { ...VIEW, ...patch };
}

describe('Admin dashboard (§4C.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(VIEW);
  });

  it('shows the loading state before the data arrives', () => {
    api.dashboard.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    api.dashboard.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('reports a reachable LMS in words, not only by colour', async () => {
    renderWithProviders(<AdminDashboardPage />);

    /* WCAG 1.4.1: the dot is decorative and the state is carried by text, which
       is what a screen reader and a colour-blind operator both get. */
    expect(await screen.findByText('منصة التعلم متصلة')).toBeInTheDocument();
    expect(screen.getByText('منصة تمكين')).toBeInTheDocument();
  });

  it('explains WHY the LMS is unreachable rather than only that it is', async () => {
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('منصة التعلم متصلة');

    api.dashboard.mockResolvedValue(
      view({ lms: { ...VIEW.lms, reachable: false, failureCode: 'UNAUTHORISED', siteName: null } }),
    );
    renderWithProviders(<AdminDashboardPage />);

    /* A rejected token and a dead server need different fixes. Collapsing them
       into one red tick is the difference between a five-minute fix and an
       afternoon. */
    expect(await screen.findByText(/رفضت المنصة رمز التكامل/)).toBeInTheDocument();
  });

  it('distinguishes a healthy LMS from a sync that has never run', async () => {
    api.dashboard.mockResolvedValue(
      view({ lms: { ...VIEW.lms, reachable: true, lastCompletionSyncAt: null } }),
    );
    renderWithProviders(<AdminDashboardPage />);

    /* The failure this exists to catch: Moodle answers, the scheduler is dead,
       and nobody's completion has been recorded for a day. */
    expect(await screen.findByText('منصة التعلم متصلة')).toBeInTheDocument();
    expect(screen.getByText('لم تُنفَّذ بعد')).toBeInTheDocument();
  });

  it('shows an em dash rather than 0% when nobody has committed to a path', async () => {
    api.dashboard.mockResolvedValue(
      view({ journey: { ...VIEW.journey, pathCompletionRate: null } }),
    );
    renderWithProviders(<AdminDashboardPage />);

    await screen.findByText('نسبة إكمال المسارات');
    /* 0% would read as failure; the rate is undefined, not zero. */
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the Holland code distribution left-to-right inside the RTL page', async () => {
    renderWithProviders(<AdminDashboardPage />);

    const code = await screen.findByText('SIA');
    /* Latin letters in an RTL container reorder without this. */
    expect(code).toHaveAttribute('dir', 'ltr');
  });

  it('explains the empty distribution instead of drawing an empty chart', async () => {
    api.dashboard.mockResolvedValue(view({ codeDistribution: [] }));
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText(/لم يُكمل أحد التقييم بعد/)).toBeInTheDocument();
  });

  it('translates an audit action into Arabic', async () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('تأكيد المسار')).toBeInTheDocument();
    expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
  });

  it('falls back to the raw code for an action with no Arabic copy', async () => {
    api.dashboard.mockResolvedValue(
      view({
        recentActivity: [
          {
            id: '1',
            action: 'SOMETHING_PHASE_9_ADDED',
            outcome: 'SUCCESS',
            actorName: null,
            targetType: null,
            occurredAt: '2026-08-23T08:00:00.000Z',
          },
        ],
      }),
    );
    renderWithProviders(<AdminDashboardPage />);

    /* A blank row would hide the event entirely, which is worse than an
       untranslated one. Phase 6's Arabic QA owns closing the gap. */
    expect(await screen.findByText('SOMETHING_PHASE_9_ADDED')).toBeInTheDocument();
    expect(screen.getByText(/النظام/)).toBeInTheDocument();
  });

  it('names the assessment version being served to new takers', async () => {
    renderWithProviders(<AdminDashboardPage />);

    await waitFor(() => expect(screen.getByText(/التقييم المعمول به/)).toBeInTheDocument());
  });

  it('surfaces courses no entity owns, which no entity portal can show', async () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('دورات بلا جهة')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
  });
});
