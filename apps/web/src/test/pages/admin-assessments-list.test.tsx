import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAssessmentOverview, AdminEnglishOverview } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.3 as a shelf (D-133): /admin/assessment lists every instrument, each
 * row a link into its own editor. Content only — assignment lives in
 * «الحسابات».
 */
const api = vi.hoisted(() => ({
  assessmentOverview: vi.fn(),
  englishOverview: vi.fn(),
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

function version(overrides: Partial<AdminAssessmentOverview['active'] & object> = {}) {
  return {
    id: 'v1',
    version: 1,
    status: 'ACTIVE' as const,
    title: 'تقييم الميول المهنية',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    retiredAt: null,
    questionCount: 30,
    resultCount: 206,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.assessmentOverview.mockResolvedValue({
    active: version(),
    draft: null,
    history: [],
  } satisfies AdminAssessmentOverview);
  api.englishOverview.mockResolvedValue({
    active: null,
    draft: version({ status: 'DRAFT' }),
    history: [],
  } satisfies AdminEnglishOverview);
});

describe('admin assessments list (§4C.3, D-133)', () => {
  it('lists every instrument as a link into its own editor', async () => {
    renderWithProviders(<AdminAssessmentsListPage />);

    const riasec = await screen.findByRole('link', { name: /تقييم الميول المهنية/ });
    const english = screen.getByRole('link', { name: /تقييم اللغة الإنجليزية/ });

    expect(riasec).toHaveAttribute('href', '/admin/assessment/riasec');
    expect(english).toHaveAttribute('href', '/admin/assessment/english');
  });

  it('summarises each instrument: active version and question count, or its absence', async () => {
    renderWithProviders(<AdminAssessmentsListPage />);

    expect(await screen.findByText(/الإصدار 1 · 30 سؤالًا/)).toBeInTheDocument();
    /* English has no active version yet — said plainly, with its draft badge. */
    expect(screen.getByText('لا يوجد إصدار مفعّل بعد.')).toBeInTheDocument();
    expect(screen.getByText('مسودة قيد التعديل')).toBeInTheDocument();
  });
});
