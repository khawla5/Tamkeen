import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FORMAT_CONTEXT, formatPercent, type EntityLearnerRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4B.5 — Learners / Review.
 *
 * **Most of this suite is about absence** (D-064). Review needs to identify a
 * colleague and see how they did on this entity's course; email, employee ID,
 * the Holland Code and the chosen path are none of a supplier's business, and
 * the first two are what would make a leaked export directly actionable
 * elsewhere in the ministry. The server enforces it, and these assertions stop
 * a later edit rendering something the API never sent.
 */

const api = vi.hoisted(() => ({ learners: vi.fn(), listCourses: vi.fn() }));

vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  entityApi: { learners: api.learners, listCourses: api.listCourses },
}));

vi.mock('@/components/layout/entity-page', () => ({
  EntityPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: EntityLearnersPage } = await import('@/app/(entity)/entity/learners/page');

const row = (overrides: Partial<EntityLearnerRow> = {}): EntityLearnerRow => ({
  userId: 'user-1',
  fullName: 'سارة الأحمد',
  department: 'تقنية المعلومات',
  courseId: 'course-1',
  courseTitle: 'إدارة المخاطر',
  status: 'COMPLETED',
  gradePercent: 88,
  passed: true,
  enrolledAt: '2026-08-01T00:00:00.000Z',
  completedAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.learners.mockResolvedValue([row()]);
  api.listCourses.mockResolvedValue([
    { id: 'course-1', title: 'إدارة المخاطر', publication: 'PUBLISHED' },
  ]);
});

describe('entity learners', () => {
  it('shows a loading state before the rows arrive', () => {
    api.learners.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<EntityLearnersPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reports a failure with a retry', async () => {
    api.learners.mockRejectedValue(new Error('down'));
    renderWithProviders(<EntityLearnersPage />);

    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('explains the empty state', async () => {
    api.learners.mockResolvedValue([]);
    renderWithProviders(<EntityLearnersPage />);

    expect(await screen.findByText('لا يوجد متدربون بعد')).toBeInTheDocument();
  });

  it('shows the learner, their department, progress and result', async () => {
    renderWithProviders(<EntityLearnersPage />);

    expect(await screen.findByText('سارة الأحمد')).toBeInTheDocument();
    expect(screen.getByText('تقنية المعلومات')).toBeInTheDocument();
    /* Through the shared formatter, not a hand-written "88%": it wraps the sign
       in bidi marks so a Latin percentage renders correctly inside RTL text, and
       a literal here would assert the wrong string while looking right. */
    expect(screen.getByText(formatPercent(88, DEFAULT_FORMAT_CONTEXT))).toBeInTheDocument();
    expect(screen.getByText('مجتاز')).toBeInTheDocument();
  });

  it('shows nothing beyond what review requires (D-064)', async () => {
    /*
     * Asserted against the rendered document rather than the props, so a later
     * edit that renders a field the API happens to add still fails here.
     */
    api.learners.mockResolvedValue([row()]);
    renderWithProviders(<EntityLearnersPage />);

    await screen.findByText('سارة الأحمد');

    const rendered = document.body.textContent ?? '';

    expect(rendered).not.toContain('@');
    expect(screen.queryByText(/الرقم الوظيفي/)).not.toBeInTheDocument();
    expect(screen.queryByText(/هولاند/)).not.toBeInTheDocument();
    expect(screen.queryByText(/المسار/)).not.toBeInTheDocument();
  });

  it('distinguishes "not started" from a grade of zero', async () => {
    /* A null grade means nothing was attempted; rendering it as 0% would report
       a failed attempt that never happened. */
    api.learners.mockResolvedValue([
      row({ status: 'NOT_STARTED', gradePercent: null, passed: false }),
    ]);

    renderWithProviders(<EntityLearnersPage />);

    expect(await screen.findByText('لم يبدأ')).toBeInTheDocument();
    expect(screen.queryByText(formatPercent(0, DEFAULT_FORMAT_CONTEXT))).not.toBeInTheDocument();
  });

  it('reports a completed-but-failed course as not passed', async () => {
    /*
     * A course can be COMPLETED in the LMS's sense and still not passed — the
     * defect D-054 corrected in the path certificate. Calling such a learner
     * "passed" would be worse than showing nothing.
     */
    api.learners.mockResolvedValue([row({ status: 'COMPLETED', gradePercent: 45, passed: false })]);

    renderWithProviders(<EntityLearnersPage />);

    expect(await screen.findByText('مكتملة')).toBeInTheDocument();
    expect(screen.getByText('غير مجتاز')).toBeInTheDocument();
  });

  it('filters by course', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityLearnersPage />);

    await screen.findByText('سارة الأحمد');
    await user.selectOptions(screen.getByLabelText('تصفية حسب الدورة'), 'course-1');

    await waitFor(() => {
      expect(api.learners).toHaveBeenCalledWith('course-1');
    });
  });

  it('gives the table a caption and column headers for assistive tech', async () => {
    renderWithProviders(<EntityLearnersPage />);

    await screen.findByText('سارة الأحمد');

    expect(screen.getByRole('table')).toHaveAccessibleName('المتدربون');
    expect(screen.getByRole('columnheader', { name: 'المتدرب' })).toBeInTheDocument();
  });
});
