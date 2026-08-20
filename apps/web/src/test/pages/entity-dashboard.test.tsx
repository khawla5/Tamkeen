import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityDashboardView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4B.1 — the entity dashboard.
 *
 * The counts are context; `needsAttention` is what the page is for. §3 requires
 * every screen to show only what is actionable, and an entity can do nothing
 * about "twelve published courses" — so most of what is asserted here is that
 * the blocked drafts are surfaced, with their reasons, and that a deliberately
 * withdrawn course is not nagged about.
 */

const api = vi.hoisted(() => ({ dashboard: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ entityApi: { dashboard: api.dashboard } }));

vi.mock('@/components/layout/entity-page', () => ({
  EntityPage: ({
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

const { default: EntityDashboardPage } = await import('@/app/(entity)/entity/page');

const VIEW: EntityDashboardView = {
  entityName: 'الهيئة الوطنية للتدريب',
  publishedCourses: 4,
  draftCourses: 2,
  withdrawnCourses: 1,
  totalLearners: 30,
  completionRate: 60,
  needsAttention: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.dashboard.mockResolvedValue(VIEW);
});

describe('entity dashboard', () => {
  it('shows a loading state before the data arrives', () => {
    api.dashboard.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<EntityDashboardPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reports a failure with a retry rather than an empty page', async () => {
    api.dashboard.mockRejectedValue(new Error('down'));
    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('renders the counts', async () => {
    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByText('دورات منشورة')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows a dash rather than 0% when nobody has started', async () => {
    /* A rate over an empty denominator is undefined, not zero — and "0%" on a
       catalogue nobody has begun reads as failure. */
    api.dashboard.mockResolvedValue({ ...VIEW, totalLearners: 0, completionRate: null });
    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('offers exactly one primary action', async () => {
    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByRole('link', { name: 'أضف دورة' })).toHaveAttribute(
      'href',
      '/entity/courses?new=1',
    );
  });

  it('lists a blocked draft with every reason it is blocked', async () => {
    /*
     * All of them, not the first: a gate that reveals one problem per attempt
     * makes an entity fix, click, fix, click.
     */
    api.dashboard.mockResolvedValue({
      ...VIEW,
      needsAttention: [
        { id: 'c1', title: 'دورة غير مكتملة', blockers: ['NO_PATH', 'NO_DURATION'] },
      ],
    });

    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByText('دورة غير مكتملة')).toBeInTheDocument();
    expect(screen.getByText(/أضف الدورة إلى مسار/)).toBeInTheDocument();
    expect(screen.getByText(/حدّد مدة الدورة/)).toBeInTheDocument();
  });

  it('names the completion-criteria blocker in terms an entity can act on', async () => {
    /* The D-042 dead end. "No completion criteria" means nobody on the course
       can ever pass it, which is worth saying plainly. */
    api.dashboard.mockResolvedValue({
      ...VIEW,
      needsAttention: [{ id: 'c1', title: 'دورة', blockers: ['NO_COMPLETION_CRITERIA'] }],
    });

    renderWithProviders(<EntityDashboardPage />);

    expect(await screen.findByText(/شروط إكمال الدورة/)).toBeInTheDocument();
  });

  it('says so plainly when nothing needs attention', async () => {
    renderWithProviders(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('كل دوراتك مكتملة وجاهزة.')).toBeInTheDocument();
    });
  });
});
