import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CoursePathRef,
  CourseSummary,
  DashboardView,
  MyPathView,
  PathRecommendations,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The courses catalogue (§4.6, TAM-127).
 *
 * What is asserted here is the *default* the page opens on and the personal
 * information it layers over a global list — never a restriction. The server
 * remains the authority on what a learner may add (`assertCoursesSelectable`);
 * the integration suite proves that independently. Browsing everything stays
 * one selection away in every state, and that is asserted too.
 */

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listPaths: vi.fn(),
  myPath: vi.fn(),
  dashboard: { state: 'ASSESSED_NO_PATH', path: null } as unknown as DashboardView,
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  coursesApi: { list: mocks.listCourses, detail: vi.fn() },
  pathsApi: { list: mocks.listPaths, detail: vi.fn() },
  myPathApi: { get: mocks.myPath },
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({ dashboard: mocks.dashboard }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: CoursesPage } = await import('@/app/(portal)/courses/page');

const SOCIAL = { id: 'path-social', name: 'خدمة المتعاملين', riasecLetter: 'S' as const };
const DATA = { id: 'path-data', name: 'تحليل البيانات', riasecLetter: 'I' as const };
const EMPTY_PATH = { id: 'path-empty', name: 'مسار بلا دورات', riasecLetter: 'C' as const };

function course(
  n: number,
  paths: CoursePathRef[] = [SOCIAL],
  overrides: Partial<CourseSummary> = {},
): CourseSummary {
  return {
    id: `course-${n}`,
    moodleCourseId: 100 + n,
    title: `الدورة رقم ${n}`,
    summary: 'وصف مختصر للدورة.',
    durationMinutes: 120,
    status: 'AVAILABLE',
    language: 'AR',
    paths,
    ...overrides,
  };
}

const CATALOGUE = [
  course(1, [SOCIAL]),
  course(2, [SOCIAL, DATA]),
  course(3, [DATA]),
  course(4, []),
];

function paths(overrides: Partial<PathRecommendations> = {}): PathRecommendations {
  return {
    code: ['S', 'I', 'A'],
    /* The API has already applied `rankPathsByRecommendation`; the page must
       render this order and never re-derive it. */
    paths: [
      {
        ...SOCIAL,
        description: 'وصف',
        typicalDurationMinutes: 1200,
        courseCount: 2,
        displayOrder: 1,
        recommended: true,
        recommendationRank: 0,
      },
      {
        ...DATA,
        description: 'وصف',
        typicalDurationMinutes: 900,
        courseCount: 2,
        displayOrder: 2,
        recommended: true,
        recommendationRank: 1,
      },
      {
        ...EMPTY_PATH,
        description: 'وصف',
        typicalDurationMinutes: null,
        courseCount: 0,
        displayOrder: 3,
        recommended: false,
        recommendationRank: null,
      },
    ],
    ...overrides,
  };
}

function myPathView(): MyPathView {
  return {
    userPathId: 'up-1',
    pathId: SOCIAL.id,
    pathName: SOCIAL.name,
    riasecLetter: 'S',
    status: 'ACTIVE',
    confirmedAt: '2026-08-01T00:00:00.000Z',
    completedCount: 1,
    totalCount: 2,
    pathCertificateUnlocked: false,
    courses: [
      {
        id: 'upc-1',
        courseId: 'course-1',
        moodleCourseId: 101,
        title: 'الدورة رقم 1',
        durationMinutes: 120,
        order: 1,
        status: 'COMPLETED',
        gradePercent: 90,
        isNextUp: false,
      },
      {
        id: 'upc-2',
        courseId: 'course-2',
        moodleCourseId: 102,
        title: 'الدورة رقم 2',
        durationMinutes: 120,
        order: 2,
        status: 'IN_PROGRESS',
        gradePercent: null,
        isNextUp: true,
      },
    ],
  };
}

function committed(): DashboardView {
  return {
    state: 'ACTIVE_PATH',
    path: { id: SOCIAL.id },
  } as unknown as DashboardView;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dashboard = { state: 'ASSESSED_NO_PATH', path: null } as unknown as DashboardView;
  mocks.listCourses.mockResolvedValue(CATALOGUE);
  mocks.listPaths.mockResolvedValue(paths());
  mocks.myPath.mockResolvedValue(null);
});

async function renderCatalogue() {
  renderWithProviders(<CoursesPage />);
  await screen.findByText('4 دورة');
}

describe('courses catalogue — the state-aware default (TAM-127)', () => {
  it('opens an uncommitted learner on the whole catalogue, with nothing preselected', async () => {
    await renderCatalogue();

    expect(screen.getByRole('combobox', { name: 'المسار' })).toHaveValue('');
    /* No `pathId` on the request: the first screen really is global. */
    expect(mocks.listCourses).toHaveBeenCalledWith({
      q: undefined,
      pathId: undefined,
      maxDurationMinutes: undefined,
    });
  });

  it('opens a committed learner on their own path', async () => {
    mocks.dashboard = committed();
    mocks.myPath.mockResolvedValue(myPathView());

    await renderCatalogue();

    expect(screen.getByRole('combobox', { name: 'المسار' })).toHaveValue(SOCIAL.id);
    await waitFor(() =>
      expect(mocks.listCourses).toHaveBeenCalledWith({
        q: undefined,
        pathId: SOCIAL.id,
        maxDurationMinutes: undefined,
      }),
    );
  });

  it('lets the committed learner see everything again in one selection', async () => {
    const user = userEvent.setup();
    mocks.dashboard = committed();
    mocks.myPath.mockResolvedValue(myPathView());
    await renderCatalogue();

    await user.selectOptions(screen.getByRole('combobox', { name: 'المسار' }), '');

    await waitFor(() =>
      expect(mocks.listCourses).toHaveBeenLastCalledWith({
        q: undefined,
        pathId: undefined,
        maxDurationMinutes: undefined,
      }),
    );
    /* And it sticks — the default is an opening position, not an override. */
    expect(screen.getByRole('combobox', { name: 'المسار' })).toHaveValue('');
  });
});

describe('courses catalogue — the grouped global view (TAM-127)', () => {
  it('groups by path in the API’s order, recommended first', async () => {
    await renderCatalogue();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    expect(headings).toEqual([SOCIAL.name, DATA.name, 'دورات خارج المسارات']);
  });

  it('marks a recommended group on its heading, never on a course card', async () => {
    await renderCatalogue();

    const social = screen.getByRole('heading', { level: 2, name: SOCIAL.name }).parentElement!;
    expect(within(social).getByText('موصى به')).toBeInTheDocument();

    /* Two recommended paths, two badges — and none inside the card list. */
    expect(screen.getAllByText('موصى به')).toHaveLength(2);
  });

  it('produces no heading for a path with no visible courses', async () => {
    await renderCatalogue();

    expect(screen.queryByRole('heading', { name: EMPTY_PATH.name })).not.toBeInTheDocument();
  });

  it('shows a course in every group it belongs to — the grouping is a lens, not a partition', async () => {
    await renderCatalogue();

    expect(screen.getAllByRole('link', { name: /الدورة رقم 2/ })).toHaveLength(2);
  });

  it('keeps a course that belongs to no path rather than dropping it silently', async () => {
    await renderCatalogue();

    const leftovers = screen.getByRole('heading', {
      level: 2,
      name: 'دورات خارج المسارات',
    }).nextElementSibling!;

    expect(within(leftovers as HTMLElement).getByText('الدورة رقم 4')).toBeInTheDocument();
  });

  it('collapses to the flat grid the moment a filter is active, and returns when cleared', async () => {
    const user = userEvent.setup();
    await renderCatalogue();

    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByRole('combobox', { name: 'المدة القصوى' }), '120');

    await waitFor(() => expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(4));
    /* Flat: the card titles are the only level-2 headings left. */
    expect(screen.queryByRole('heading', { name: SOCIAL.name })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'المدة القصوى' }), '');

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: SOCIAL.name })).toBeInTheDocument(),
    );
  });

  it('keeps card titles a level below their group heading', async () => {
    await renderCatalogue();

    expect(screen.getAllByRole('heading', { level: 3, name: /الدورة رقم/ }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('courses catalogue — the personal status chip (TAM-127)', () => {
  beforeEach(() => {
    mocks.dashboard = committed();
    mocks.myPath.mockResolvedValue(myPathView());
  });

  it('carries exactly one chip per own course, matching my-path’s status', async () => {
    await renderCatalogue();

    const completed = await screen.findByRole('link', { name: /الدورة رقم 1/ });
    expect(within(completed).getByText('مكتملة')).toBeInTheDocument();

    const inProgress = screen.getAllByRole('link', { name: /الدورة رقم 2/ })[0]!;
    expect(within(inProgress).getByText('قيد التنفيذ')).toBeInTheDocument();
  });

  it('gives a course outside the learner’s path no chip at all — absence is the signal', async () => {
    await renderCatalogue();
    await screen.findByText('مكتملة');

    const outside = screen.getAllByRole('link', { name: /الدورة رقم 3/ })[0]!;

    for (const word of ['مكتملة', 'قيد التنفيذ', 'في مسارك']) {
      expect(within(outside).queryByText(word)).not.toBeInTheDocument();
    }
  });

  it('still renders the catalogue when the progress lookup fails', async () => {
    mocks.myPath.mockRejectedValue(new Error('down'));

    await renderCatalogue();

    /* The chips are gone; the page is not. */
    expect(screen.queryByText('مكتملة')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /الدورة رقم/ }).length).toBeGreaterThan(0);
  });
});

describe('courses catalogue — cards and filters (TAM-127)', () => {
  it('links every card to the course page, never to the player', async () => {
    await renderCatalogue();

    for (const link of screen.getAllByRole('link', { name: /الدورة رقم/ })) {
      expect(link.getAttribute('href')).toMatch(/^\/courses\/course-\d+$/);
    }
  });

  it('renders path membership as tags rather than a comma-joined sentence', async () => {
    await renderCatalogue();

    const shared = screen.getAllByRole('link', { name: /الدورة رقم 2/ })[0]!;

    expect(within(shared).getByText(SOCIAL.name)).toBeInTheDocument();
    expect(within(shared).getByText(DATA.name)).toBeInTheDocument();
    expect(within(shared).queryByText(`${SOCIAL.name}، ${DATA.name}`)).not.toBeInTheDocument();
  });

  it('labels all three filters and announces the result count politely', async () => {
    await renderCatalogue();

    expect(screen.getByRole('searchbox', { name: 'ابحث في الدورات' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'المسار' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'المدة القصوى' })).toBeInTheDocument();

    expect(screen.getByText('4 دورة')).toHaveAttribute('aria-live', 'polite');
  });

  it('offers a way out of an over-narrow filter', async () => {
    const user = userEvent.setup();
    await renderCatalogue();

    mocks.listCourses.mockResolvedValue([]);
    await user.selectOptions(screen.getByRole('combobox', { name: 'المدة القصوى' }), '120');

    expect(await screen.findByText('لا توجد دورات مطابقة')).toBeInTheDocument();

    mocks.listCourses.mockResolvedValue(CATALOGUE);
    await user.click(screen.getByRole('button', { name: 'إزالة عوامل التصفية' }));

    expect(await screen.findByText('4 دورة')).toBeInTheDocument();
  });
});
