import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssessmentResultView, PathRecommendations, RiasecLetter } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * Results & Path Selection (§4.4) — the Holland Code, and the gold ordering.
 *
 * The API sends the paths already ranked. These tests assert the page *preserves*
 * that order rather than re-deriving it: re-sorting in the browser would put
 * §3A's rule in two places, and the fixtures below are deliberately given in the
 * API's order so a stray client-side sort would show up as a mismatch.
 */

const mocks = vi.hoisted(() => ({ result: vi.fn(), list: vi.fn() }));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  assessmentApi: { result: mocks.result, get: vi.fn(), submit: vi.fn() },
  pathsApi: { list: mocks.list, detail: vi.fn() },
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: ResultsPage } = await import('@/app/(portal)/results/page');

const RESULT: AssessmentResultView = {
  id: 'result-1',
  assessmentId: 'assessment-1',
  assessmentVersion: 1,
  completedAt: '2026-08-17T09:00:00.000Z',
  scores: { S: 20, I: 15, A: 10, E: 5, C: 5, R: 0 },
  ranked: [
    { letter: 'S', score: 20, rank: 1, percent: 100 },
    { letter: 'I', score: 15, rank: 2, percent: 75 },
    { letter: 'A', score: 10, rank: 3, percent: 50 },
    { letter: 'E', score: 5, rank: 4, percent: 25 },
    { letter: 'C', score: 5, rank: 5, percent: 25 },
    { letter: 'R', score: 0, rank: 6, percent: 0 },
  ],
  code: ['S', 'I', 'A'],
  codeString: 'SIA',
  maxScore: 20,
  canRetake: true,
};

function path(id: string, letter: RiasecLetter, recommended: boolean, rank: number | null) {
  return {
    id,
    name: `مسار ${id}`,
    description: 'وصف المسار.',
    riasecLetter: letter,
    typicalDurationMinutes: 1200,
    courseCount: 11,
    displayOrder: 1,
    recommended,
    recommendationRank: rank,
  };
}

/** In the order the API returns them: gold first, by the user's letter order. */
const PATHS: PathRecommendations = {
  code: ['S', 'I', 'A'],
  paths: [
    path('s1', 'S', true, 0),
    path('s2', 'S', true, 0),
    path('i1', 'I', true, 1),
    path('a1', 'A', true, 2),
    path('e1', 'E', false, null),
    path('r1', 'R', false, null),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.result.mockResolvedValue(RESULT);
  mocks.list.mockResolvedValue(PATHS);
});

describe('results — the Holland Code', () => {
  it('names the three letters in rank order, in Arabic', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByText('ميولك المهنية');

    /* §4.4 asks for "the three letters with their Arabic type names". The
       ordinal is what makes the ranking visible — without it the code reads as
       an unordered set. */
    expect(screen.getByText(/1\.\s*$/)).toBeInTheDocument();
    expect(screen.getAllByText('الاجتماعي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('البحثي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('الفني').length).toBeGreaterThan(0);
  });

  it('explains what the code means in plain Arabic, not as a score', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByText('ميولك المهنية');

    expect(
      screen.getByText('تميل إلى العمل مع الناس ومساعدتهم، وتجد رضاك في التدريب والخدمة.'),
    ).toBeInTheDocument();
    /* No raw tally reaches the screen — §4.3's "no score dump" survives here. */
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });

  it('shows all six dimensions ranked, as percentages', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByText('ترتيب الميول الستة');

    /*
     * `Intl` wraps a percentage in bidi isolate marks (U+200E/U+200F) so it
     * renders correctly inside RTL text — invisible, but part of the string.
     * The matcher strips them rather than asserting against the visible glyphs,
     * which is what a user actually sees.
     */
    const percentage = (value: string) => (content: string) =>
      content.replace(/[‎‏؜]/g, '') === value;

    expect(screen.getByText(percentage('100%'))).toBeInTheDocument();
    expect(screen.getByText(percentage('75%'))).toBeInTheDocument();
    expect(screen.getByText(percentage('0%'))).toBeInTheDocument();
  });
});

describe('results — the retake entry point (D-015)', () => {
  it('is offered before a path is confirmed', async () => {
    renderWithProviders(<ResultsPage />);

    expect(await screen.findByRole('link', { name: 'إعادة التقييم' })).toHaveAttribute(
      'href',
      '/assessment',
    );
  });

  it('disappears entirely once committed — not merely disabled', async () => {
    /* A disabled control invites the question "why can't I?"; §2 says the option
       ceases to exist after commitment, so the UI should say nothing at all. */
    mocks.result.mockResolvedValue({ ...RESULT, canRetake: false });

    renderWithProviders(<ResultsPage />);
    await screen.findByText('ميولك المهنية');

    expect(screen.queryByText('إعادة التقييم')).not.toBeInTheDocument();
  });
});

describe('results — the gold rule', () => {
  it('separates recommended paths from the rest, recommended first', async () => {
    renderWithProviders(<ResultsPage />);

    const recommended = await screen.findByRole('heading', { name: 'مسارات موصى بها لك' });
    const others = screen.getByRole('heading', { name: 'مسارات أخرى' });

    expect(
      recommended.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('preserves the API’s ordering rather than re-sorting', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'مسارات موصى بها لك' });

    /* Scoped to path-card headings: the six-dimension section also uses an h3,
       and including it would make this assert the page layout rather than the
       ordering. */
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
      .filter((text) => text?.startsWith('مسار '));

    expect(headings).toEqual(['مسار s1', 'مسار s2', 'مسار i1', 'مسار a1', 'مسار e1', 'مسار r1']);
  });

  it('badges every recommended path and no other', async () => {
    renderWithProviders(<ResultsPage />);
    const recommendedHeading = await screen.findByRole('heading', { name: 'مسارات موصى بها لك' });

    const section = recommendedHeading.parentElement!;
    expect(within(section).getAllByText('موصى به')).toHaveLength(4);
    expect(screen.getAllByText('موصى به')).toHaveLength(4);
  });

  it('still lists non-matching paths as fully selectable (§3A)', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'مسارات أخرى' });

    /* "Gold = recommendation, not restriction." All six paths keep their link —
       the two non-matching ones included. */
    expect(screen.getAllByRole('link', { name: 'استعرض المسار' })).toHaveLength(6);
  });
});

describe('results — states', () => {
  it('sends an unassessed user to the assessment instead of a dead end', async () => {
    mocks.result.mockResolvedValue(null);

    renderWithProviders(<ResultsPage />);

    expect(await screen.findByText('لم تُكمل التقييم بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ابدأ التقييم' })).toHaveAttribute(
      'href',
      '/assessment',
    );
  });

  it('reports an empty catalogue as empty, not as a failure', async () => {
    mocks.list.mockResolvedValue({ code: null, paths: [] });

    renderWithProviders(<ResultsPage />);

    expect(await screen.findByText('لا توجد مسارات متاحة')).toBeInTheDocument();
  });

  it('offers a retry when either request fails', async () => {
    mocks.list.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ResultsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل البيانات');
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });
});
