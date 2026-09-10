import { screen } from '@testing-library/react';
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
 *
 * The second thing asserted is the D-134 finding this page now exists to
 * surface: a path the ministry assigned people to that nobody can start,
 * because its assessment was never published. Assignment happens on another
 * screen, so without this a directorate sits at «بانتظار تحديد المستوى» and
 * nobody learns why.
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
  paths: { total: 6, published: 5, draft: 1 },
  courses: { total: 48, published: 40, draft: 4, unowned: 44, unassigned: 6 },
  journey: {
    assigned: 120,
    placed: 60,
    completed: 20,
    pathCompletionRate: 25,
    coursesPassed: 210,
    certificatesIssued: 230,
  },
  pathDistribution: [
    { pathId: 'path-1', name: 'مسار تحليل البيانات', assigned: 40, placed: 32, completed: 8 },
    { pathId: 'path-2', name: 'مسار إدارة المشاريع', assigned: 10, placed: 4, completed: 0 },
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
      action: 'LEARNER_PLACED',
      outcome: 'SUCCESS',
      actorName: 'سارة العتيبي',
      targetType: 'user_path',
      occurredAt: '2026-08-23T08:00:00.000Z',
    },
  ],
  pathsWithoutAssessment: [],
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

  it('shows an em dash rather than 0% when nobody has finished a path', async () => {
    api.dashboard.mockResolvedValue(
      view({ journey: { ...VIEW.journey, pathCompletionRate: null } }),
    );
    renderWithProviders(<AdminDashboardPage />);

    await screen.findByText('نسبة إكمال المسارات');
    /* 0% would read as failure; the rate is undefined, not zero. */
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('counts the courses sitting in a path on no rung, which no learner can reach', async () => {
    /* D-134's one catalogue number that names work waiting on the
       administrator: an entity offered the course, nobody placed it. */
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('دورات بانتظار الإسناد إلى مستوى')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});

describe('Admin dashboard — paths nobody can start (§4C.1, D-134)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(VIEW);
  });

  it('names each stranded path and links straight to the assessment that fixes it', async () => {
    api.dashboard.mockResolvedValue(
      view({ pathsWithoutAssessment: [{ id: 'path-9', name: 'مسار الأمن السيبراني' }] }),
    );
    renderWithProviders(<AdminDashboardPage />);

    const link = await screen.findByRole('link', { name: 'مسار الأمن السيبراني' });
    expect(link).toHaveAttribute('href', '/admin/assessment/path-9');
  });

  it('shows the section not at all when nothing is stuck', async () => {
    /* An empty warning card would train the administrator to ignore the one
       place on this page that is ever urgent. */
    renderWithProviders(<AdminDashboardPage />);

    await screen.findByText('منصة التعلم متصلة');
    expect(screen.queryByText('مسارات لا يمكن البدء فيها')).not.toBeInTheDocument();
  });
});

describe('Admin dashboard — the assignment picture (§4C.1, D-134)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(VIEW);
  });

  it('names each path with how many were assigned it and how many were placed', async () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('مسار تحليل البيانات')).toBeInTheDocument();
    expect(screen.getByText('40 موظف')).toBeInTheDocument();
    expect(screen.getByText('32 حُدِّد مستواه')).toBeInTheDocument();
  });

  it('says in words when a path was assigned and nobody was placed', async () => {
    /* The finding the section exists for, carried by wording rather than by the
       warning colour alone (WCAG 1.4.1). */
    api.dashboard.mockResolvedValue(
      view({
        pathDistribution: [
          { pathId: 'path-1', name: 'مسار تحليل البيانات', assigned: 40, placed: 0, completed: 0 },
        ],
      }),
    );
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('لم يُحدَّد مستوى أحد')).toBeInTheDocument();
  });

  it('explains an empty picture instead of drawing an empty chart', async () => {
    api.dashboard.mockResolvedValue(view({ pathDistribution: [] }));
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('لم يُسند أي مسار بعد.')).toBeInTheDocument();
    expect(screen.queryByText('لم يُحدَّد مستوى أحد')).not.toBeInTheDocument();
  });

  it('names no career type — the ministry stopped asking that question', async () => {
    /* The Holland distribution went with the recommendation model (D-134). A
       leftover would be a chart nobody has a decision behind. */
    renderWithProviders(<AdminDashboardPage />);

    await screen.findByText('مسار تحليل البيانات');
    for (const type of ['الاجتماعي', 'البحثي', 'الواقعي']) {
      expect(screen.queryByText(type)).not.toBeInTheDocument();
    }
  });
});

describe('Admin dashboard — recent activity (§4C.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(VIEW);
  });

  it('keeps the activity list inside its own scroll area, reachable by keyboard', async () => {
    renderWithProviders(<AdminDashboardPage />);

    const list = await screen.findByRole('group', { name: /أحدث النشاط/ });
    /* An overflow container cannot be scrolled from the keyboard unless it is
       focusable (WCAG 2.1.1), and it must say what it holds. */
    expect(list).toHaveAttribute('tabindex', '0');
    expect(list.className).toContain('overflow-y-auto');
  });

  it('translates an audit action into Arabic', async () => {
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('تحديد مستوى موظف في مسار')).toBeInTheDocument();
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

  it('says so plainly when nothing has happened yet', async () => {
    api.dashboard.mockResolvedValue(view({ recentActivity: [] }));
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText('لا يوجد نشاط مسجَّل بعد.')).toBeInTheDocument();
  });
});
