import { screen, within } from '@testing-library/react';

import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssessmentResultView, PathRecommendations, RiasecLetter } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * Results & Path Selection (§4.4) — the Holland Code, and the ranking that
 * organizes the page (TAM-113/114).
 *
 * The API sends the paths already ranked. These tests assert the page *preserves*
 * that order rather than re-deriving it: re-sorting in the browser would put
 * §3A's rule in two places, and the fixtures below are deliberately given in the
 * API's order so a stray client-side sort would show up as a mismatch.
 */

const mocks = vi.hoisted(() => ({
  result: vi.fn(),
  list: vi.fn(),
  committedPathId: { current: null as string | null },
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  assessmentApi: { result: mocks.result, get: vi.fn(), submit: vi.fn() },
  pathsApi: { list: mocks.list, detail: vi.fn() },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({
    dashboard: {
      path: mocks.committedPathId.current ? { id: mocks.committedPathId.current } : null,
    },
  }),
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

/** In the order the API returns them: recommended first, by the user's letters. */
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
  mocks.committedPathId.current = null;
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

  it('renders the code through the shared component, not a second copy', async () => {
    /* TAM-108/TAM-114: the dashboard and this page must agree about what a
       Holland Code looks like. One component, imported from one path. */
    const { HollandCodeChips } = await import('@/components/riasec/holland-code-chips');
    const { container } = renderWithProviders(<HollandCodeChips code={['S', 'I', 'A']} ordinals />);

    renderWithProviders(<ResultsPage />);
    await screen.findByText('ميولك المهنية');

    const list = container.querySelector('ul')!;
    expect(screen.getAllByRole('list').some((node) => node.className === list.className)).toBe(
      true,
    );
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

describe('results — the ranked letter groups (TAM-113)', () => {
  it('gives each letter of the code its own heading, in the user’s rank order', async () => {
    renderWithProviders(<ResultsPage />);

    const first = await screen.findByRole('heading', {
      name: 'الأقرب إلى ميلك الأول — الاجتماعي',
    });
    const second = screen.getByRole('heading', { name: 'مناسب أيضًا — البحثي' });
    const third = screen.getByRole('heading', { name: 'مناسب أيضًا — الفني' });

    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    /* The quiet rank tag on the groups the heading does not already number. */
    expect(screen.getByText('ميلك الثاني')).toBeInTheDocument();
    expect(screen.getByText('ميلك الثالث')).toBeInTheDocument();
  });

  it('produces no heading for a letter the catalogue has no path for', async () => {
    mocks.list.mockResolvedValue({
      code: ['S', 'I', 'A'],
      paths: [path('s1', 'S', true, 0), path('a1', 'A', true, 2)],
    });

    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.queryByRole('heading', { name: 'مناسب أيضًا — البحثي' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'مناسب أيضًا — الفني' })).toBeInTheDocument();
    /* The third letter keeps its own rank tag — the groups are numbered by the
       user's code, not by how many groups happen to have paths. */
    expect(screen.queryByText('ميلك الثاني')).not.toBeInTheDocument();
    expect(screen.getByText('ميلك الثالث')).toBeInTheDocument();
  });

  it('shows no description on any card in the list', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.queryByText('وصف المسار.')).not.toBeInTheDocument();
  });

  it('preserves the API’s ordering rather than re-sorting', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    /* Scoped to path-card headings: the six-dimension section also uses an h3,
       and including it would make this assert the page layout rather than the
       ordering. The collapsed section still renders its cards into the DOM. */
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
      .filter((text) => text?.startsWith('مسار '));

    expect(headings).toEqual(['مسار s1', 'مسار s2', 'مسار i1', 'مسار a1', 'مسار e1', 'مسار r1']);
  });

  it('badges every recommended path and no other', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.getAllByText('موصى به')).toHaveLength(4);
  });
});

describe('results — the other paths, collapsed (TAM-113)', () => {
  it('offers them behind one toggle that counts them', async () => {
    renderWithProviders(<ResultsPage />);

    const toggle = await screen.findByText('عرض المسارات الأخرى (2)');
    const details = toggle.closest('details')!;

    /* Collapsed on arrival — the first screenful is the user's code and the
       paths that fit them. */
    expect(details.open).toBe(false);
  });

  it('is a native summary, so the platform owns the keyboard and the state', async () => {
    /*
     * jsdom does not implement `<summary>`'s activation behaviour, so pressing
     * Enter here would prove nothing about a browser. What this test can prove
     * is that the toggle *is* the native element — which is where the keyboard
     * operation and the expanded/collapsed announcement come from. The actual
     * open/close is asserted in Chromium by `journey-happy-path`.
     */
    renderWithProviders(<ResultsPage />);

    const toggle = await screen.findByText('عرض المسارات الأخرى (2)');

    expect(toggle.tagName).toBe('SUMMARY');
    expect(toggle.parentElement?.tagName).toBe('DETAILS');
    /* Not replaced by a div with a click handler, and not given a tabindex that
       would take it out of the natural order. */
    expect(toggle).not.toHaveAttribute('tabindex');
  });

  it('keeps every non-matching path fully selectable (§3A)', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByText('عرض المسارات الأخرى (2)');

    /* "Recommendation, not restriction." All six paths keep their link — the
       two non-matching ones included. */
    expect(screen.getAllByRole('link', { name: 'استعرض المسار' })).toHaveLength(6);
  });

  it('is absent when every path matches the user’s code', async () => {
    mocks.list.mockResolvedValue({
      code: ['S', 'I', 'A'],
      paths: [path('s1', 'S', true, 0)],
    });

    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.queryByText(/عرض المسارات الأخرى/)).not.toBeInTheDocument();
  });
});

describe('results — after the path is confirmed (TAM-114)', () => {
  beforeEach(() => {
    mocks.committedPathId.current = 'i1';
  });

  it('marks exactly one card as the user’s path and links it to مساري', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.getAllByText('مسارك')).toHaveLength(1);

    const links = screen.getAllByRole('link', { name: 'الانتقال إلى مساري' });
    expect(links).toHaveLength(1);

    const link = links[0]!;
    expect(link).toHaveAttribute('href', '/my-path');

    const card = link.closest('article')!;
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('مسار i1');
  });

  it('leaves no other card with a button — in any group or in the collapsed section', async () => {
    renderWithProviders(<ResultsPage />);
    await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' });

    expect(screen.queryAllByRole('link', { name: 'استعرض المسار' })).toHaveLength(0);
  });

  it('keeps the groups, the badges and the collapsed section unchanged', async () => {
    renderWithProviders(<ResultsPage />);

    expect(
      await screen.findByRole('heading', { name: 'الأقرب إلى ميلك الأول — الاجتماعي' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('موصى به')).toHaveLength(4);
    expect(screen.getByText('عرض المسارات الأخرى (2)')).toBeInTheDocument();
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
