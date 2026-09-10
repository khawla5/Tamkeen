import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminPathRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.3 as a shelf (D-133, D-134): `/admin/assessment` lists every path, each
 * row a link into that path's own editor.
 *
 * **There is no "the assessment" any more.** A path places its own learners with
 * its own bank and its own bands, so the row that says a path has none is the
 * finding this page exists for — a published path with no published assessment
 * strands everybody the ministry assigns to it. Content only: who is put on a
 * path is decided per account in «الحسابات» (D-133).
 */
const api = vi.hoisted(() => ({
  listPaths: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminAssessmentsListPage } = await import('@/app/(admin)/admin/assessment/page');

function path(overrides: Partial<AdminPathRow> = {}): AdminPathRow {
  return {
    id: 'path-1',
    key: 'data',
    name: 'مسار تحليل البيانات',
    levelCount: 3,
    placedCourseCount: 6,
    unassignedCourseCount: 0,
    assignedLearners: 12,
    hasActiveAssessment: true,
    hasDraftAssessment: false,
    status: 'PUBLISHED',
    displayOrder: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listPaths.mockResolvedValue([
    path(),
    path({
      id: 'path-2',
      key: 'security',
      name: 'مسار الأمن السيبراني',
      hasActiveAssessment: false,
      hasDraftAssessment: true,
    }),
  ]);
});

describe('admin assessments shelf (§4C.3, D-134)', () => {
  it('lists one row per path, each a link into that path’s own editor', async () => {
    renderWithProviders(<AdminAssessmentsListPage />);

    const data = await screen.findByRole('link', { name: /مسار تحليل البيانات/ });
    const security = screen.getByRole('link', { name: /مسار الأمن السيبراني/ });

    expect(data).toHaveAttribute('href', '/admin/assessment/path-1');
    expect(security).toHaveAttribute('href', '/admin/assessment/path-2');
  });

  it('says which paths can place a learner and which cannot', async () => {
    /* The whole reason the shelf is a list rather than a link into one editor:
       the absence has to be legible without opening each path. */
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByText('تقييم منشور')).toBeInTheDocument();
    expect(screen.getByText(/لا تقييم منشور/)).toBeInTheDocument();
  });

  it('marks a path whose next version is still being edited', async () => {
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByText('مسودة قيد التعديل')).toBeInTheDocument();
  });

  it('marks an unpublished path, whose missing assessment strands nobody yet', async () => {
    api.listPaths.mockResolvedValue([
      path({ status: 'DRAFT', hasActiveAssessment: false, assignedLearners: 0 }),
    ]);
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByText('مسودة')).toBeInTheDocument();
  });

  it('explains an empty shelf rather than showing an empty box', async () => {
    api.listPaths.mockResolvedValue([]);
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByText('لا توجد مسارات بعد')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    api.listPaths.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });
});
