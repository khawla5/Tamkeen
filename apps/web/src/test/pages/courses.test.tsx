import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AssignedPaths,
  CoursePathRef,
  CourseSummary,
  DashboardView,
  MyPathView,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The courses catalogue (§4.6, TAM-127, restated for D-134).
 *
 * What is asserted here is the *default* the page opens on and the personal
 * information it layers over the list — never a restriction. The server remains
 * the authority on what a learner may start; the integration suite proves that
 * independently. Browsing every assigned path stays one selection away in every
 * state, and that is asserted too.
 */

const mocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  listPaths: vi.fn(),
  myPathAll: vi.fn(),
  dashboard: {} as DashboardView,
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  coursesApi: { list: mocks.listCourses, detail: vi.fn() },
  pathsApi: { list: mocks.listPaths, detail: vi.fn() },
  myPathApi: { get: vi.fn(), all: mocks.myPathAll },
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

const LEVEL = { id: 'level-2', name: 'متقدم', position: 2 };

const SERVICE: CoursePathRef = { id: 'path-service', name: 'خدمة المتعاملين', level: LEVEL };
const DATA: CoursePathRef = { id: 'path-data', name: 'تحليل البيانات', level: LEVEL };
const EMPTY_PATH = { id: 'path-empty', name: 'مسار بلا دورات' };

function course(
  n: number,
  paths: CoursePathRef[] = [SERVICE],
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
  course(1, [SERVICE]),
  course(2, [SERVICE, DATA]),
  course(3, [DATA]),
  course(4, []),
];

/** The paths the ministry assigned, in the API's order. Never re-sorted. */
function assignedPaths(placed = true): AssignedPaths {
  return {
    paths: [
      {
        id: SERVICE.id,
        name: SERVICE.name,
        description: 'وصف',
        typicalDurationMinutes: 1200,
        courseCount: 2,
        levelCount: 3,
        displayOrder: 1,
        placedLevel: placed ? LEVEL : null,
        completed: false,
      },
      {
        id: DATA.id,
        name: DATA.name,
        description: 'وصف',
        typicalDurationMinutes: 900,
        courseCount: 2,
        levelCount: 3,
        displayOrder: 2,
        placedLevel: placed ? LEVEL : null,
        completed: false,
      },
      {
        ...EMPTY_PATH,
        description: 'وصف',
        typicalDurationMinutes: null,
        courseCount: 0,
        levelCount: 1,
        displayOrder: 3,
        placedLevel: null,
        completed: false,
      },
    ],
  };
}

/** One assigned path's ladder, as `/api/my-path/all` returns it. */
function ladder(): MyPathView[] {
  return [
    {
      userPathId: 'up-1',
      pathId: SERVICE.id,
      pathName: SERVICE.name,
      status: 'ACTIVE',
      assignedAt: '2026-08-01T00:00:00.000Z',
      placedLevel: LEVEL,
      pendingAssessmentId: null,
      completedCount: 1,
      totalCount: 2,
      pathCertificateUnlocked: false,
      levels: [
        {
          id: 'level-1',
          name: 'تأسيسي',
          position: 1,
          standing: 'BELOW',
          courses: [
            {
              courseId: 'course-3',
              moodleCourseId: 103,
              title: 'الدورة رقم 3',
              durationMinutes: 120,
              order: 1,
              status: 'NOT_STARTED',
              gradePercent: null,
              passed: false,
              isNextUp: false,
              /* Below their rung: ground the placement says they covered. */
              startable: false,
            },
          ],
        },
        {
          ...LEVEL,
          standing: 'PLACED',
          courses: [
            {
              courseId: 'course-1',
              moodleCourseId: 101,
              title: 'الدورة رقم 1',
              durationMinutes: 120,
              order: 1,
              status: 'COMPLETED',
              gradePercent: 90,
              passed: true,
              isNextUp: false,
              startable: true,
            },
            {
              courseId: 'course-2',
              moodleCourseId: 102,
              title: 'الدورة رقم 2',
              durationMinutes: 120,
              order: 2,
              status: 'IN_PROGRESS',
              gradePercent: null,
              passed: false,
              isNextUp: true,
              startable: true,
            },
          ],
        },
      ],
    },
  ];
}

/** A learner the ministry put on exactly one path. */
function oneAssignedPath(): DashboardView {
  return {
    state: 'ACTIVE_PATH',
    paths: [{ id: SERVICE.id }],
  } as unknown as DashboardView;
}

/** A learner on two paths: neither is "theirs" more than the other. */
function twoAssignedPaths(): DashboardView {
  return {
    state: 'ACTIVE_PATH',
    paths: [{ id: SERVICE.id }, { id: DATA.id }],
  } as unknown as DashboardView;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dashboard = twoAssignedPaths();
  mocks.listCourses.mockResolvedValue(CATALOGUE);
  mocks.listPaths.mockResolvedValue(assignedPaths());
  mocks.myPathAll.mockResolvedValue([]);
});

async function renderCatalogue() {
  renderWithProviders(<CoursesPage />);
  await screen.findByText('4 دورة');
}

describe('courses catalogue — where the page starts (TAM-127, D-134)', () => {
  it('opens a learner on two paths across everything, with nothing preselected', async () => {
    await renderCatalogue();

    expect(screen.getByRole('combobox', { name: 'المسار' })).toHaveValue('');
    /* No `pathId` on the request: neither path is more theirs than the other. */
    expect(mocks.listCourses).toHaveBeenCalledWith({
      q: undefined,
      pathId: undefined,
      maxDurationMinutes: undefined,
    });
  });

  it('opens a learner on a single path with that path selected', async () => {
    mocks.dashboard = oneAssignedPath();

    await renderCatalogue();

    expect(screen.getByRole('combobox', { name: 'المسار' })).toHaveValue(SERVICE.id);
    await waitFor(() =>
      expect(mocks.listCourses).toHaveBeenCalledWith({
        q: undefined,
        pathId: SERVICE.id,
        maxDurationMinutes: undefined,
      }),
    );
  });

  it('lets that learner see everything again in one selection', async () => {
    const user = userEvent.setup();
    mocks.dashboard = oneAssignedPath();
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

describe('courses catalogue — the grouped view (TAM-127)', () => {
  it('groups by path in the API’s order', async () => {
    await renderCatalogue();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    expect(headings).toEqual([SERVICE.name, DATA.name, 'دورات خارج المسارات']);
  });

  it('names the learner’s rung on the group heading, never on a course card', async () => {
    /* A fact about the path, said once. Repeating it on twelve cards would be
       the redundant UI §3 forbids. */
    await renderCatalogue();

    const service = screen.getByRole('heading', { level: 2, name: SERVICE.name }).parentElement!;
    expect(within(service).getByText(/متقدم/)).toBeInTheDocument();

    /* Two placed paths, two markers — and none inside the card list. */
    expect(screen.getAllByText(/مستواك: متقدم/)).toHaveLength(2);
  });

  it('names no rung on a path whose assessment has not been taken', async () => {
    mocks.listPaths.mockResolvedValue(assignedPaths(false));

    await renderCatalogue();

    expect(screen.queryByText(/مستواك/)).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: SERVICE.name })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'المدة القصوى' }), '');

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: SERVICE.name })).toBeInTheDocument(),
    );
  });

  it('keeps card titles a level below their group heading', async () => {
    await renderCatalogue();

    expect(screen.getAllByRole('heading', { level: 3, name: /الدورة رقم/ }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('courses catalogue — the personal status chip (TAM-127, D-134)', () => {
  beforeEach(() => {
    mocks.dashboard = oneAssignedPath();
    mocks.myPathAll.mockResolvedValue(ladder());
  });

  it('carries exactly one chip per owed course, matching the ladder’s status', async () => {
    await renderCatalogue();

    const completed = await screen.findByRole('link', { name: /الدورة رقم 1/ });
    expect(within(completed).getByText('مكتملة')).toBeInTheDocument();

    const inProgress = screen.getAllByRole('link', { name: /الدورة رقم 2/ })[0]!;
    expect(within(inProgress).getByText('قيد التنفيذ')).toBeInTheDocument();
  });

  it('gives a course below the learner’s rung no chip — absence is the honest signal', async () => {
    /* "لم تبدأ" would be a lie: the placement says they covered this ground, so
       the course is not owed and no status describes it. */
    await renderCatalogue();
    await screen.findByText('مكتملة');

    const below = screen.getAllByRole('link', { name: /الدورة رقم 3/ })[0]!;

    for (const word of ['مكتملة', 'قيد التنفيذ', 'في مسارك']) {
      expect(within(below).queryByText(word)).not.toBeInTheDocument();
    }
  });

  it('gives a course in no assigned path no chip at all', async () => {
    await renderCatalogue();
    await screen.findByText('مكتملة');

    const outside = screen.getAllByRole('link', { name: /الدورة رقم 4/ })[0]!;

    for (const word of ['مكتملة', 'قيد التنفيذ', 'في مسارك']) {
      expect(within(outside).queryByText(word)).not.toBeInTheDocument();
    }
  });

  it('still renders the catalogue when the progress lookup fails', async () => {
    mocks.myPathAll.mockRejectedValue(new Error('down'));

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

    expect(within(shared).getByText(SERVICE.name)).toBeInTheDocument();
    expect(within(shared).getByText(DATA.name)).toBeInTheDocument();
    expect(within(shared).queryByText(`${SERVICE.name}، ${DATA.name}`)).not.toBeInTheDocument();
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
