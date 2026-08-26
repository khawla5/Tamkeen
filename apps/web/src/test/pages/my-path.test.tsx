import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PATH_MAX_COURSES,
  formatPercent,
  type MyPathCourseView,
  type MyPathView,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4.9 — My Path as a journey (TAM-126).
 *
 * What is asserted is the rule the old page broke: exactly one action on the
 * page, the next-up course's; done stops expose links only; upcoming stops
 * expose nothing. Then the certificate stop in both states, the quiet add's
 * three conditions, and the states around the run view.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  myPathApi: {
    get: mocks.get,
    selectPath: vi.fn(),
    setCourses: vi.fn(),
    confirm: vi.fn(),
    addCourse: vi.fn(),
  },
}));

vi.mock('@/components/layout/portal-page', () => ({
  PAGE_MAX_WIDTH: 'max-w-6xl',
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: MyPathPage } = await import('@/app/(portal)/my-path/page');

function course(overrides: Partial<MyPathCourseView> & { id: string }): MyPathCourseView {
  return {
    courseId: `c-${overrides.id}`,
    moodleCourseId: 1,
    title: `دورة ${overrides.id}`,
    durationMinutes: 240,
    order: 0,
    status: 'NOT_STARTED',
    gradePercent: null,
    isNextUp: false,
    certificateId: null,
    ...overrides,
  };
}

const ACTIVE: MyPathView = {
  userPathId: 'up-1',
  pathId: 'path-1',
  pathName: 'المحتوى الرقمي والتصميم',
  riasecLetter: 'A',
  status: 'ACTIVE',
  confirmedAt: '2026-08-01T00:00:00.000Z',
  courses: [
    course({ id: '1', status: 'COMPLETED', gradePercent: 92, certificateId: 'cert-1' }),
    course({ id: '2', status: 'COMPLETED', gradePercent: 85, certificateId: 'cert-2' }),
    course({ id: '3', status: 'NOT_STARTED', isNextUp: true }),
    course({ id: '4', status: 'IN_PROGRESS' }),
    course({ id: '5' }),
  ],
  completedCount: 2,
  totalCount: 5,
  pathCertificateUnlocked: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(ACTIVE);
});

describe('my path — the rail', () => {
  it('has exactly one action, on the next-up course, and it goes through the player', async () => {
    renderWithProviders(<MyPathPage />);
    await screen.findByText('دورة 3');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const start = screen.getByRole('link', { name: 'ابدأ الدورة' });
    expect(start).toHaveAttribute('href', '/courses/c-3/player');
    /* The in-progress course that is not next-up gets no action of its own. */
    expect(screen.queryByRole('link', { name: 'تابع الدورة' })).toBeNull();
    expect(screen.getByText('التالية')).toBeInTheDocument();
  });

  it('keeps the stops in API order, as an ordered list, with the state in words', async () => {
    renderWithProviders(<MyPathPage />);
    await screen.findByText('دورة 3');

    const list = screen.getByRole('list', { name: '' }) ?? screen.getAllByRole('list')[0];
    const items = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    const titles = items.map((item) => within(item).queryByRole('heading', { level: 3 }));
    expect(titles.slice(0, 5).map((h) => h?.textContent)).toEqual([
      'دورة 1',
      'دورة 2',
      'دورة 3',
      'دورة 4',
      'دورة 5',
    ]);
    expect(list).toBeTruthy();

    expect(screen.getAllByText('مكتملة')).toHaveLength(2);
    expect(screen.getByText('قيد التنفيذ')).toBeInTheDocument();
    expect(screen.getAllByText('لم تبدأ').length).toBeGreaterThanOrEqual(2);
  });

  it('done stops show the grade through format.percent and a link to their certificate — no button', async () => {
    renderWithProviders(<MyPathPage />);
    await screen.findByText('دورة 1');

    expect(screen.getByText(`الدرجة: ${formatPercent(92)}`)).toBeInTheDocument();
    expect(screen.getByText(`الدرجة: ${formatPercent(85)}`)).toBeInTheDocument();

    const view = screen.getByRole('link', { name: 'عرض شهادة دورة 1' });
    expect(view).toHaveAttribute('href', expect.stringContaining('/api/certificates/cert-1/file'));
    expect(screen.getAllByText('عرض الشهادة')).toHaveLength(2);
  });

  it('upcoming stops expose nothing interactive', async () => {
    renderWithProviders(<MyPathPage />);
    const item = (await screen.findByText('دورة 5')).closest('li')!;

    expect(within(item).queryAllByRole('link')).toHaveLength(0);
    expect(within(item).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('my path — the certificate stop', () => {
  it('locked: says what unlocks it, with the real remaining count', async () => {
    renderWithProviders(<MyPathPage />);

    expect(await screen.findByText(/بقيت 3/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'عرض الشهادة' })).toBeNull();
  });

  it('unlocked: keeps the link to the gallery', async () => {
    mocks.get.mockResolvedValue({
      ...ACTIVE,
      status: 'COMPLETED',
      courses: ACTIVE.courses.map((c) => ({ ...c, status: 'COMPLETED', isNextUp: false })),
      completedCount: 5,
      pathCertificateUnlocked: true,
    });
    renderWithProviders(<MyPathPage />);

    expect(await screen.findByText('أتممت المسار وصدرت شهادتك.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'عرض الشهادة' })).toHaveAttribute(
      'href',
      '/certificates',
    );
    expect(screen.queryByRole('link', { name: 'ابدأ الدورة' })).toBeNull();
  });
});

describe('my path — the quiet add (§4.9)', () => {
  it('points at the catalogue while the path is active and under the cap', async () => {
    renderWithProviders(<MyPathPage />);

    const add = await screen.findByRole('link', {
      name: `إضافة دورة (لديك 5 من ${PATH_MAX_COURSES})`,
    });
    expect(add).toHaveAttribute('href', '/courses');
  });

  it('disappears at the cap', async () => {
    mocks.get.mockResolvedValue({ ...ACTIVE, totalCount: PATH_MAX_COURSES });
    renderWithProviders(<MyPathPage />);
    await screen.findByText('دورة 3');

    expect(screen.queryByRole('link', { name: /إضافة دورة/ })).toBeNull();
  });

  it('never renders for a completed path', async () => {
    mocks.get.mockResolvedValue({ ...ACTIVE, status: 'COMPLETED', pathCertificateUnlocked: true });
    renderWithProviders(<MyPathPage />);
    await screen.findByText('دورة 3');

    expect(screen.queryByRole('link', { name: /إضافة دورة/ })).toBeNull();
  });
});

describe('my path — the states around the run view', () => {
  it('shows a loading state first', () => {
    mocks.get.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<MyPathPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    mocks.get.mockRejectedValue(new Error('down'));
    renderWithProviders(<MyPathPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إعادة المحاولة|حاول/ })).toBeInTheDocument();
  });

  it('with no path, sends the learner to results', async () => {
    mocks.get.mockResolvedValue(null);
    renderWithProviders(<MyPathPage />);

    expect(await screen.findByText('لم تختر مسارًا بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'اختر مسارك' })).toHaveAttribute('href', '/results');
  });

  it('while still building, sends the learner back to the build page', async () => {
    mocks.get.mockResolvedValue({ ...ACTIVE, status: 'BUILDING', confirmedAt: null });
    renderWithProviders(<MyPathPage />);

    expect(await screen.findByText('لم تؤكّد مسارك بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'متابعة اختيار الدورات' })).toHaveAttribute(
      'href',
      '/paths/path-1',
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
