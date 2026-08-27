import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityCourseDetail } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4B.3 / §4B.4 — Add / Manage Course.
 *
 * The rules worth pinning in a component test are the ones a screen can quietly
 * break: that publishing is refused *and explained* rather than merely disabled,
 * that exactly one of publish/unpublish is offered, that withdrawing a course
 * learners hold says so before the entity commits, and that the RIASEC letters
 * are shown but not editable (D-066).
 */

const api = vi.hoisted(() => ({
  getCourse: vi.fn(),
  updateCourse: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  authorLaunch: vi.fn(),
  resync: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  entityApi: {
    getCourse: api.getCourse,
    updateCourse: api.updateCourse,
    publish: api.publish,
    unpublish: api.unpublish,
    authorLaunch: api.authorLaunch,
    resync: api.resync,
  },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ courseId: 'course-1' }) }));

vi.mock('@/components/layout/entity-page', () => ({
  EntityPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: ManageCoursePage } = await import('@/app/(entity)/entity/courses/[courseId]/page');

const detail = (overrides: Partial<EntityCourseDetail> = {}): EntityCourseDetail => ({
  id: 'course-1',
  moodleCourseId: 900_001,
  title: 'إدارة المخاطر',
  summary: 'وصف',
  durationMinutes: 120,
  language: 'AR',
  publication: 'DRAFT',
  status: 'DRAFT',
  paths: [{ id: 'path-1', name: 'مسار القيادة', riasecLetter: 'E', status: 'APPROVED' }],
  objectives: ['هدف أول'],
  prerequisites: null,
  riasecLetters: ['E'],
  content: { activityCount: 4, hasQuiz: true, completionConfigured: true },
  publishBlockers: [],
  learnersHolding: 0,
  availablePaths: [
    { id: 'path-1', name: 'مسار القيادة', riasecLetter: 'E' },
    { id: 'path-2', name: 'مسار التحليل', riasecLetter: 'I' },
    { id: 'path-3', name: 'مسار الإدارة', riasecLetter: 'E' },
    { id: 'path-4', name: 'مسار الميدان', riasecLetter: 'R' },
    { id: 'path-5', name: 'مسار الخدمة', riasecLetter: 'S' },
  ],
  isGeneral: false,
  pathRules: { maxPaths: 3, maxLetters: 2, frozen: false, approvalRequired: false },
  enrolledCount: 0,
  completionRate: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getCourse.mockResolvedValue(detail());
  api.updateCourse.mockResolvedValue(detail());
});

describe('manage course', () => {
  it('shows a loading state, then the course', async () => {
    renderWithProviders(<ManageCoursePage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('إدارة المخاطر')).toBeInTheDocument();
  });

  it('reports a failure with a retry', async () => {
    api.getCourse.mockRejectedValue(new Error('down'));
    renderWithProviders(<ManageCoursePage />);

    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  describe('the publish gate (D-061)', () => {
    it('disables publishing and says why, rather than only disabling it', async () => {
      /* A button that cannot be pressed and does not explain itself is worse
         than no button. */
      api.getCourse.mockResolvedValue(
        detail({ publishBlockers: ['NO_PATH', 'NO_OBJECTIVES'], paths: [], objectives: [] }),
      );

      renderWithProviders(<ManageCoursePage />);

      expect(await screen.findByRole('button', { name: 'انشر الدورة' })).toBeDisabled();
      expect(screen.getByText(/أضف الدورة إلى مسار/)).toBeInTheDocument();
      expect(screen.getByText(/أضف هدفًا واحدًا/)).toBeInTheDocument();
    });

    it('warns about missing completion criteria where the entity can fix it', async () => {
      /* The D-042 dead end: without criteria nobody on this course can ever
         pass, so the warning belongs beside the launch into Moodle. */
      api.getCourse.mockResolvedValue(
        detail({
          content: { activityCount: 2, hasQuiz: true, completionConfigured: false },
          publishBlockers: ['NO_COMPLETION_CRITERIA'],
        }),
      );

      renderWithProviders(<ManageCoursePage />);

      expect(await screen.findByText(/لن يتمكّن أي متدرب من اجتياز/)).toBeInTheDocument();

      /* The one blocker fixed inside Moodle, not this form (TAM-143) — its
         list item is the one that gets a guide deep link. */
      expect(screen.getByRole('link', { name: 'دليل إنشاء الدورة' })).toHaveAttribute(
        'href',
        '/entity/guide#completion',
      );
    });

    it('publishes when nothing is blocking', async () => {
      const user = userEvent.setup();
      api.publish.mockResolvedValue(detail({ publication: 'PUBLISHED', status: 'AVAILABLE' }));

      renderWithProviders(<ManageCoursePage />);
      await user.click(await screen.findByRole('button', { name: 'انشر الدورة' }));

      await waitFor(() => {
        expect(api.publish).toHaveBeenCalledWith('course-1');
      });
    });

    it('offers unpublish instead of publish once published (§3)', async () => {
      /* Context-dependent action: never both. */
      api.getCourse.mockResolvedValue(detail({ publication: 'PUBLISHED', status: 'AVAILABLE' }));

      renderWithProviders(<ManageCoursePage />);

      expect(await screen.findByRole('button', { name: 'أوقف النشر' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'انشر الدورة' })).not.toBeInTheDocument();
    });
  });

  describe('unpublishing (§2, D-015, D-059)', () => {
    it('says how many learners keep the course before the entity commits', async () => {
      /*
       * A held course degrades to HIDDEN_BUT_COMPLETABLE rather than being
       * withdrawn. An entity told nothing would believe they had removed
       * something learners can still take.
       */
      const user = userEvent.setup();
      api.getCourse.mockResolvedValue(
        detail({ publication: 'PUBLISHED', status: 'AVAILABLE', learnersHolding: 7 }),
      );

      renderWithProviders(<ManageCoursePage />);
      await user.click(await screen.findByRole('button', { name: 'أوقف النشر' }));

      expect(screen.getByText(/يتابعها 7 متدرب/)).toBeInTheDocument();
    });

    it('confirms through a dialog rather than acting on the first click', async () => {
      const user = userEvent.setup();
      api.getCourse.mockResolvedValue(detail({ publication: 'PUBLISHED', status: 'AVAILABLE' }));
      api.unpublish.mockResolvedValue({
        publication: 'UNPUBLISHED',
        status: 'RETIRED',
        learnersHolding: 0,
      });

      renderWithProviders(<ManageCoursePage />);
      await user.click(await screen.findByRole('button', { name: 'أوقف النشر' }));

      expect(api.unpublish).not.toHaveBeenCalled();

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'أوقف النشر' }));

      await waitFor(() => {
        expect(api.unpublish).toHaveBeenCalledWith('course-1');
      });
    });
  });

  describe('the metadata form (§4B.3)', () => {
    it('saves path membership, duration, objectives and language together', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ManageCoursePage />);

      await screen.findByLabelText('المدة بالدقائق');
      await user.click(screen.getByLabelText('مسار التحليل'));
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      await waitFor(() => {
        expect(api.updateCourse).toHaveBeenCalledWith('course-1', {
          pathIds: ['path-1', 'path-2'],
          durationMinutes: 120,
          objectives: ['هدف أول'],
          prerequisites: null,
          language: 'AR',
        });
      });
    });

    it('shows the RIASEC letters but offers no way to edit them (D-066)', async () => {
      /* §3A makes the path the owner of the letter; a separately authored one
         could contradict it and nothing downstream would notice. */
      renderWithProviders(<ManageCoursePage />);

      /* The derived value is shown… */
      await screen.findByLabelText('المدة بالدقائق');
      expect(screen.getAllByText(/تصنيف هولاند/).length).toBeGreaterThan(0);

      /* …and there is no control of any kind to change it. */
      expect(screen.queryByLabelText(/تصنيف هولاند/)).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /هولاند/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /هولاند/ })).not.toBeInTheDocument();
    });

    it('confirms a save politely, and the confirmation survives the refetch', async () => {
      /*
       * The second half is the part that matters, and the browser suite is what
       * found it. Saving refetches the course, and if the loading state
       * unmounted the view on every refetch — not just the first load — the
       * confirmation would vanish the instant it was earned, taking any
       * half-typed field with it.
       */
      const user = userEvent.setup();
      renderWithProviders(<ManageCoursePage />);

      await screen.findByLabelText('المدة بالدقائق');
      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      await waitFor(() => {
        expect(api.getCourse).toHaveBeenCalledTimes(2);
      });

      /* Still there after the refetch has settled, not merely at some point
         during it. */
      expect(screen.getByText('تم حفظ البيانات')).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: undefined })).not.toBeNull();
    });
  });

  describe('the way to the editor (TAM-139, D-101)', () => {
    it('links to the content page and mints nothing here', async () => {
      /*
       * The author credential is minted in one place — the content page, when
       * it opens. Manage Course only points there, so nothing carrying a token
       * can appear on this page at all.
       */
      renderWithProviders(<ManageCoursePage />);

      const link = await screen.findByRole('link', { name: 'افتح محرّر المحتوى' });
      expect(link).toHaveAttribute('href', '/entity/courses/course-1/content');

      expect(document.body.innerHTML).not.toContain('token=');
      expect(api.authorLaunch).not.toHaveBeenCalled();
    });
  });

  describe('path membership rules (TAM-141)', () => {
    /* The accessible name carries the disabled reason too, so match by prefix. */
    const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp('^' + name) });

    it('disables the remaining paths once the cap is reached, and says why', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ManageCoursePage />);
      await screen.findByLabelText('المدة بالدقائق');

      /* E already; add E and I → three paths, two letters: allowed, and the cap. */
      await user.click(box('مسار الإدارة'));
      await user.click(box('مسار التحليل'));

      expect(box('مسار الميدان')).toBeDisabled();
      expect(box('مسار الخدمة')).toBeDisabled();
      expect(screen.getAllByText('بلغت الحد الأقصى للمسارات.').length).toBeGreaterThan(0);
      /* A ticked one stays removable. */
      expect(box('مسار التحليل')).toBeEnabled();
    });

    it('disables a path that would add a third RIASEC letter, under the cap', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ManageCoursePage />);
      await screen.findByLabelText('المدة بالدقائق');

      /* E + I selected: two letters. R and S would be a third. E is still fine. */
      await user.click(box('مسار التحليل'));

      expect(box('مسار الميدان')).toBeDisabled();
      expect(box('مسار الخدمة')).toBeDisabled();
      expect(box('مسار الإدارة')).toBeEnabled();
      expect(screen.getByText('E · I')).toBeInTheDocument();
    });

    it('freezes a grandfathered course to removals, and explains it', async () => {
      api.getCourse.mockResolvedValue(
        detail({
          paths: [
            { id: 'path-1', name: 'مسار القيادة', riasecLetter: 'E', status: 'APPROVED' },
            { id: 'path-2', name: 'مسار التحليل', riasecLetter: 'I', status: 'APPROVED' },
            { id: 'path-4', name: 'مسار الميدان', riasecLetter: 'R', status: 'APPROVED' },
          ],
          pathRules: { maxPaths: 3, maxLetters: 2, frozen: true, approvalRequired: false },
        }),
      );
      renderWithProviders(<ManageCoursePage />);
      await screen.findByLabelText('المدة بالدقائق');

      expect(screen.getAllByText(/يمكنك إزالة مسارات فقط/).length).toBeGreaterThan(0);
      expect(box('مسار الخدمة')).toBeDisabled();
      expect(box('مسار الإدارة')).toBeDisabled();
      expect(box('مسار الميدان')).toBeEnabled();
    });

    it('marks a membership still awaiting the admin', async () => {
      api.getCourse.mockResolvedValue(
        detail({
          paths: [
            { id: 'path-1', name: 'مسار القيادة', riasecLetter: 'E', status: 'APPROVED' },
            { id: 'path-2', name: 'مسار التحليل', riasecLetter: 'I', status: 'PENDING' },
          ],
          pathRules: { maxPaths: 3, maxLetters: 2, frozen: false, approvalRequired: true },
        }),
      );
      renderWithProviders(<ManageCoursePage />);
      await screen.findByLabelText('المدة بالدقائق');

      expect(screen.getByText('بانتظار موافقة الإدارة')).toBeInTheDocument();
      expect(
        screen.getByText('المسارات الجديدة تبقى بانتظار موافقة الإدارة قبل أن يراها المتدربون.'),
      ).toBeInTheDocument();
    });

    it('offers no path choice on a general course', async () => {
      api.getCourse.mockResolvedValue(detail({ isGeneral: true, paths: [], riasecLetters: [] }));
      renderWithProviders(<ManageCoursePage />);
      await screen.findByLabelText('المدة بالدقائق');

      expect(screen.getByText(/دورة عامة/)).toBeInTheDocument();
      expect(box('مسار القيادة')).toBeDisabled();
    });
  });

  describe('the manual resync (§4B.4, TAM-133)', () => {
    it('applies the resync response directly, with no second request', async () => {
      const user = userEvent.setup();
      api.resync.mockResolvedValue(detail({ title: 'إدارة المخاطر — محدّثة' }));

      renderWithProviders(<ManageCoursePage />);
      await screen.findByText('إدارة المخاطر');
      const callsBefore = api.getCourse.mock.calls.length;

      await user.click(screen.getByRole('button', { name: 'تحديث' }));

      await waitFor(() => {
        expect(api.resync).toHaveBeenCalledWith('course-1');
      });
      expect(await screen.findByText('إدارة المخاطر — محدّثة')).toBeInTheDocument();
      /* The endpoint returns the full detail precisely so this page needs no
         second request — a `getCourse` here would mean the resync response
         was thrown away. */
      expect(api.getCourse.mock.calls.length).toBe(callsBefore);
    });

    it('reports a failed resync without losing the course', async () => {
      const user = userEvent.setup();
      api.resync.mockRejectedValue(new Error('network'));

      renderWithProviders(<ManageCoursePage />);
      await user.click(await screen.findByRole('button', { name: 'تحديث' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('إدارة المخاطر')).toBeInTheDocument();
    });
  });
});
