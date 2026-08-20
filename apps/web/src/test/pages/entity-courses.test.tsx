import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityCourseSummary } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4B.2 — My Courses, and the create form it hosts.
 *
 * Two things beyond the obvious are pinned here. A course is rendered in **its
 * own** language direction (D-047) — without that, an English title inside the
 * RTL column has its punctuation rearranged, which is correctness rather than
 * polish. And the create form asks for three fields only: path membership,
 * duration and objectives belong on the manage screen, after the entity has
 * seen the course in Moodle.
 */

const api = vi.hoisted(() => ({ listCourses: vi.fn(), createCourse: vi.fn() }));
const nav = vi.hoisted(() => ({ push: vi.fn(), search: new URLSearchParams() }));

/* The real module is spread in rather than replaced wholesale, so `ApiError`
   and `NetworkError` stay themselves — `useErrorMessage` narrows on those
   classes, and a stubbed module makes every failure translate as UNKNOWN_ERROR
   while the test still looks like it is exercising the error path. */
vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  entityApi: { listCourses: api.listCourses, createCourse: api.createCourse },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.search,
}));

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

const { default: EntityCoursesPage } = await import('@/app/(entity)/entity/courses/page');

const course = (overrides: Partial<EntityCourseSummary> = {}): EntityCourseSummary => ({
  id: 'course-1',
  moodleCourseId: 900_001,
  title: 'إدارة المخاطر',
  summary: 'وصف',
  durationMinutes: 120,
  language: 'AR',
  publication: 'PUBLISHED',
  status: 'AVAILABLE',
  paths: [],
  enrolledCount: 12,
  completionRate: 50,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = new URLSearchParams();
  api.listCourses.mockResolvedValue([course()]);
});

describe('entity my-courses', () => {
  it('shows a loading state before the list arrives', () => {
    api.listCourses.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<EntityCoursesPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reports a failure with a retry', async () => {
    api.listCourses.mockRejectedValue(new Error('down'));
    renderWithProviders(<EntityCoursesPage />);

    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('explains the empty state rather than showing a bare heading', async () => {
    api.listCourses.mockResolvedValue([]);
    renderWithProviders(<EntityCoursesPage />);

    expect(await screen.findByText('لا توجد دورات بعد')).toBeInTheDocument();
  });

  it('shows the publication state and the learner-visible status separately', async () => {
    /* They answer different questions — "what did I decide" and "what can a
       learner see" — and the gap between them is what an entity needs to notice
       when the LMS has hidden a course they believe is published (D-059). */
    api.listCourses.mockResolvedValue([
      course({ publication: 'PUBLISHED', status: 'HIDDEN_BUT_COMPLETABLE' }),
    ]);

    renderWithProviders(<EntityCoursesPage />);

    expect(await screen.findByText('منشورة')).toBeInTheDocument();
    expect(screen.getByText(/مغلقة للاختيار الجديد/)).toBeInTheDocument();
  });

  it('renders an English course left-to-right inside the RTL column (D-047)', async () => {
    api.listCourses.mockResolvedValue([course({ title: 'Risk Management 101', language: 'EN' })]);
    renderWithProviders(<EntityCoursesPage />);

    const title = await screen.findByText('Risk Management 101');

    expect(title).toHaveAttribute('dir', 'ltr');
    expect(title).toHaveAttribute('lang', 'en');
  });

  it('renders an Arabic course right-to-left', async () => {
    renderWithProviders(<EntityCoursesPage />);

    expect(await screen.findByText('إدارة المخاطر')).toHaveAttribute('dir', 'rtl');
  });

  it('omits the completion rate when nobody has started', async () => {
    /* Not "0%" — see the dashboard test for why that reads as failure. */
    api.listCourses.mockResolvedValue([course({ enrolledCount: 0, completionRate: null })]);
    renderWithProviders(<EntityCoursesPage />);

    await screen.findByText('إدارة المخاطر');
    expect(screen.queryByText(/نسبة الاجتياز/)).not.toBeInTheDocument();
  });

  it('filters by publication state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EntityCoursesPage />);

    await screen.findByText('إدارة المخاطر');
    await user.selectOptions(screen.getByLabelText('كل الحالات'), 'DRAFT');

    await waitFor(() => {
      expect(api.listCourses).toHaveBeenCalledWith({ q: undefined, publication: 'DRAFT' });
    });
  });

  describe('the create form', () => {
    it('opens from the primary action, which then stops competing with it', async () => {
      /* §3: one primary action per screen. While the form is open, the button
         that opened it would be a second way to do the same thing. */
      const user = userEvent.setup();
      renderWithProviders(<EntityCoursesPage />);

      await user.click(await screen.findByRole('button', { name: 'أضف دورة' }));

      expect(screen.getByRole('heading', { name: 'دورة جديدة' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'أضف دورة' })).not.toBeInTheDocument();
    });

    it('opens straight away when the dashboard sent the entity here to create one', async () => {
      nav.search = new URLSearchParams('new=1');
      renderWithProviders(<EntityCoursesPage />);

      expect(await screen.findByRole('heading', { name: 'دورة جديدة' })).toBeInTheDocument();
    });

    it('asks for three fields and nothing else', async () => {
      /* Path membership, duration, objectives and prerequisites are answers an
         entity forms while authoring, so they belong on the manage screen. */
      const user = userEvent.setup();
      renderWithProviders(<EntityCoursesPage />);

      await user.click(await screen.findByRole('button', { name: 'أضف دورة' }));

      expect(screen.getByLabelText('اسم الدورة')).toBeInTheDocument();
      expect(screen.getByLabelText('وصف مختصر')).toBeInTheDocument();
      expect(screen.getByLabelText('لغة الدورة')).toBeInTheDocument();
      expect(screen.queryByLabelText('المسارات')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('المدة بالدقائق')).not.toBeInTheDocument();
    });

    it('creates the course and goes to its manage screen', async () => {
      /* The course exists but is an empty draft, so the next thing to do is
         always there. */
      const user = userEvent.setup();
      api.createCourse.mockResolvedValue({ id: 'new-course' });

      renderWithProviders(<EntityCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'أضف دورة' }));

      await user.type(screen.getByLabelText('اسم الدورة'), 'دورة جديدة');
      await user.type(screen.getByLabelText('وصف مختصر'), 'وصف');
      await user.click(screen.getByRole('button', { name: 'إنشاء الدورة' }));

      await waitFor(() => {
        expect(api.createCourse).toHaveBeenCalledWith({
          title: 'دورة جديدة',
          summary: 'وصف',
          language: 'AR',
        });
      });

      expect(nav.push).toHaveBeenCalledWith('/entity/courses/new-course');
    });

    it('reports a failed creation without losing what was typed', async () => {
      const user = userEvent.setup();
      api.createCourse.mockRejectedValue(new Error('nope'));

      renderWithProviders(<EntityCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'أضف دورة' }));

      await user.type(screen.getByLabelText('اسم الدورة'), 'دورة جديدة');
      await user.type(screen.getByLabelText('وصف مختصر'), 'وصف');
      await user.click(screen.getByRole('button', { name: 'إنشاء الدورة' }));

      await waitFor(() => {
        expect(api.createCourse).toHaveBeenCalled();
      });

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByLabelText('اسم الدورة')).toHaveValue('دورة جديدة');
    });
  });
});
