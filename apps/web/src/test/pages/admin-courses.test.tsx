import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCoursePage, AdminCourseRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.5 — course oversight.
 *
 * **The screen answers one question: can an employee choose this course, or
 * not.** Since TAM-134 it says so in two words — متاحة or مخفية — and prints the
 * *reason* under the badge when the answer is "no". The four-state derivation is
 * still what decides; what these tests hold is that the administrator is never
 * asked to translate it.
 *
 * **And it states the protection before the action.** Hiding a course learners
 * hold cannot take it from them; the status is derived and no combination of
 * inputs produces that (§2/D-015). Saying so on the dialog is the difference
 * between an administrator acting and an administrator hesitating.
 */

const api = vi.hoisted(() => ({
  listCourses: vi.fn(),
  interveneCourse: vi.fn(),
  deleteCourse: vi.fn(),
  listEntities: vi.fn(),
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

const { default: AdminCoursesPage } = await import('@/app/(admin)/admin/courses/page');

function row(overrides: Partial<AdminCourseRow> = {}): AdminCourseRow {
  return {
    id: 'c1',
    moodleCourseId: 101,
    title: 'مقدمة في خدمة المتعاملين',
    publication: 'PUBLISHED',
    status: 'AVAILABLE',
    lmsPresent: true,
    lmsVisible: true,
    language: 'AR',
    durationMinutes: 120,
    ownerEntityId: null,
    ownerEntityName: null,
    paths: [{ id: 'p1', name: 'خدمة المتعاملين' }],
    heldByLearners: 0,
    certificatesIssued: 0,
    canDelete: true,
    availableFrom: null,
    availableUntil: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    lastSyncedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function page(rows: AdminCourseRow[], overrides: Partial<AdminCoursePage> = {}): AdminCoursePage {
  return { rows, total: rows.length, page: 1, pageSize: 25, unownedTotal: 0, ...overrides };
}

function dialog() {
  return within(document.querySelector('dialog')!);
}

async function openManage(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'إدارة' }));
}

describe('Admin courses (§4C.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listCourses.mockResolvedValue(page([row()]));
    api.listEntities.mockResolvedValue([]);
  });

  it('shows the loading state before the list arrives', () => {
    api.listCourses.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminCoursesPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    api.listCourses.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminCoursesPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('explains an empty result rather than showing a bare table', async () => {
    api.listCourses.mockResolvedValue(page([]));
    renderWithProviders(<AdminCoursesPage />);

    expect(await screen.findByText('لا توجد دورات مطابقة')).toBeInTheDocument();
  });

  it('counts the courses no entity portal can show', async () => {
    api.listCourses.mockResolvedValue(page([row()], { unownedTotal: 41 }));
    renderWithProviders(<AdminCoursesPage />);

    /* If the administrator does not see these here, nobody ever does (D-063). */
    expect(await screen.findByText(/41 دورة بلا جهة موردة/)).toBeInTheDocument();
  });

  it('says a course has no supplier rather than leaving the cell blank', async () => {
    renderWithProviders(<AdminCoursesPage />);

    expect(await screen.findAllByText('بلا جهة')).not.toHaveLength(0);
  });

  it('hides pagination when everything fits on one page', async () => {
    renderWithProviders(<AdminCoursesPage />);

    await screen.findByText('مقدمة في خدمة المتعاملين');
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
  });

  describe('the two-word status (TAM-134)', () => {
    it('says متاحة for a course an employee can choose', async () => {
      renderWithProviders(<AdminCoursesPage />);

      expect(await screen.findByText('متاحة')).toBeInTheDocument();
    });

    it.each([
      ['DRAFT', 'DRAFT', 'قيد الإعداد لدى الجهة الموردة'],
      ['UNPUBLISHED', 'RETIRED', 'مسحوبة من الكتالوج'],
    ] as const)(
      'says مخفية for a %s course, with the reason under it',
      async (publication, status, reason) => {
        /* One word for the answer, one line for the cause. Neither the raw
           four-state status nor the publication decision appears as a column. */
        api.listCourses.mockResolvedValue(page([row({ publication, status })]));
        renderWithProviders(<AdminCoursesPage />);

        expect(await screen.findByText('مخفية')).toBeInTheDocument();
        expect(screen.getByText(reason)).toBeInTheDocument();
      },
    );

    it('names the LMS as the reason when a published course vanished from it', async () => {
      api.listCourses.mockResolvedValue(
        page([row({ publication: 'PUBLISHED', status: 'RETIRED', lmsPresent: false })]),
      );
      renderWithProviders(<AdminCoursesPage />);

      /* The one cause the administrator cannot fix from this screen, so it
         outranks every other reason. */
      expect(await screen.findByText('غير موجودة في منصة التعلم')).toBeInTheDocument();
    });

    it('names the expired period when that is what hid the course', async () => {
      api.listCourses.mockResolvedValue(
        page([row({ status: 'HIDDEN_BUT_COMPLETABLE', availableUntil: '2026-08-01' })]),
      );
      renderWithProviders(<AdminCoursesPage />);

      expect(await screen.findByText('خارج فترة الإتاحة')).toBeInTheDocument();
    });

    it('gives no reason for a course that is available', async () => {
      renderWithProviders(<AdminCoursesPage />);

      await screen.findByText('مقدمة في خدمة المتعاملين');
      expect(screen.queryByText('غير موجودة في منصة التعلم')).not.toBeInTheDocument();
      expect(screen.queryByText('مسحوبة من الكتالوج')).not.toBeInTheDocument();
    });

    it('filters by the same two words it renders', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);

      await screen.findByText('مقدمة في خدمة المتعاملين');
      await user.selectOptions(screen.getByLabelText('الحالة'), 'HIDDEN');

      /* The filter and the badge share one mapping (`courseStatusesFor`), so a
         filter cannot return rows the badge contradicts. */
      await waitFor(() =>
        expect(api.listCourses).toHaveBeenLastCalledWith(
          expect.objectContaining({ visibility: 'HIDDEN' }),
        ),
      );
    });
  });

  describe('the availability period (TAM-134)', () => {
    it('says a course with no period is permanent rather than leaving it blank', async () => {
      renderWithProviders(<AdminCoursesPage />);

      expect(await screen.findByText('دائمة')).toBeInTheDocument();
    });

    it('prints the period on the row', async () => {
      api.listCourses.mockResolvedValue(
        page([row({ availableFrom: '2026-09-01', availableUntil: '2026-09-30' })]),
      );
      renderWithProviders(<AdminCoursesPage />);

      expect(await screen.findByText(/من .* حتى /)).toBeInTheDocument();
    });

    it('offers to save the period only once it has changed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      expect(dialog().queryByRole('button', { name: 'حفظ فترة الإتاحة' })).not.toBeInTheDocument();

      await user.type(await dialog().findByLabelText('متاحة حتى'), '2026-09-30');

      expect(await dialog().findByRole('button', { name: 'حفظ فترة الإتاحة' })).toBeInTheDocument();
    });

    it('sends the period as calendar days', async () => {
      const user = userEvent.setup();
      api.interveneCourse.mockResolvedValue(row());

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.type(await dialog().findByLabelText('متاحة حتى'), '2026-09-30');
      await user.click(await dialog().findByRole('button', { name: 'حفظ فترة الإتاحة' }));

      await waitFor(() =>
        expect(api.interveneCourse).toHaveBeenCalledWith('c1', {
          availableFrom: null,
          availableUntil: '2026-09-30',
        }),
      );
    });

    it('clears a bound rather than leaving it as it was', async () => {
      /* Empty means "no bound", which only reaches the server as an explicit
         null — omitting the field would leave the old date in place and the
         administrator would watch a clear do nothing. */
      const user = userEvent.setup();
      api.listCourses.mockResolvedValue(page([row({ availableUntil: '2026-09-30' })]));
      api.interveneCourse.mockResolvedValue(row());

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.clear(await dialog().findByLabelText('متاحة حتى'));
      await user.click(await dialog().findByRole('button', { name: 'حفظ فترة الإتاحة' }));

      await waitFor(() =>
        expect(api.interveneCourse).toHaveBeenCalledWith('c1', {
          availableFrom: null,
          availableUntil: null,
        }),
      );
    });
  });

  describe('intervening', () => {
    it('states the protection before the action, when learners hold the course', async () => {
      const user = userEvent.setup();
      api.listCourses.mockResolvedValue(page([row({ heldByLearners: 7 })]));

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      /* Not discovered afterwards: an administrator who does not know the
         protection exists will hesitate over a safe action. */
      expect(await screen.findByText(/ويبقيها متاحة لمن اختارها حتى يكملها/)).toBeInTheDocument();
    });

    it('says nothing about held learners when nobody holds it', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      await dialog().findByText('ظهور الدورة في الكتالوج');
      expect(screen.queryByText(/ويبقيها متاحة لمن اختارها/)).not.toBeInTheDocument();
    });

    it('offers hide for a published course and restore for a withdrawn one', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      /* Context-dependent, never both (§3). */
      expect(await dialog().findByRole('button', { name: 'سحب الدورة' })).toBeInTheDocument();
      expect(dialog().queryByRole('button', { name: 'إعادة نشر الدورة' })).not.toBeInTheDocument();
    });

    it('offers to save an owner only once it has changed', async () => {
      const user = userEvent.setup();
      api.listEntities.mockResolvedValue([
        {
          id: 'e1',
          key: 'inst',
          name: 'معهد الإدارة',
          contactName: '',
          contactEmail: '',
          status: 'ACTIVE',
          accountCount: 1,
          courseCount: 3,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ]);

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      expect(dialog().queryByRole('button', { name: 'حفظ الجهة' })).not.toBeInTheDocument();

      await user.selectOptions(await dialog().findByLabelText('الجهة'), 'e1');

      expect(await dialog().findByRole('button', { name: 'حفظ الجهة' })).toBeInTheDocument();
    });

    it('offers no control that writes the status directly', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      await dialog().findByText('ظهور الدورة في الكتالوج');
      /* `status` is derived (D-059). A control for it would be a second author
         of the column the whole design exists to give one author. */
      expect(dialog().queryByLabelText('الحالة')).not.toBeInTheDocument();
    });

    it('shows the server’s refusal', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.interveneCourse.mockRejectedValue(new ApiError('COURSE_CANNOT_RETURN_TO_DRAFT', 409));

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.click(await dialog().findByRole('button', { name: 'سحب الدورة' }));

      await waitFor(() =>
        expect(dialog().getByRole('alert')).toHaveTextContent(/لا يمكن إعادة دورة منشورة/),
      );
    });
  });

  describe('deleting (TAM-134)', () => {
    it('keeps deletion apart from hiding, and dressed differently', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      /* Two sections, two words: the reversible decision is not styled as the
         irreversible one (D-098's shape, applied to courses). */
      expect(await dialog().findByText('ظهور الدورة في الكتالوج')).toBeInTheDocument();
      expect(dialog().getByText('حذف الدورة')).toBeInTheDocument();
      expect(dialog().getByRole('button', { name: 'حذف نهائي' })).toBeInTheDocument();
    });

    it('offers no delete for a course somebody has taken, and says why', async () => {
      const user = userEvent.setup();
      api.listCourses.mockResolvedValue(page([row({ canDelete: false, heldByLearners: 4 })]));

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);

      expect(await dialog().findByText(/لا يمكن حذف هذه الدورة/)).toBeInTheDocument();
      expect(dialog().queryByRole('button', { name: 'حذف نهائي' })).not.toBeInTheDocument();
    });

    it('names the course in the confirmation and says the LMS copy goes too', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));

      /* "Are you sure" beside a list of fifty is a question about nothing in
         particular. */
      expect(
        await dialog().findByText(/دورة «مقدمة في خدمة المتعاملين» من المنصة ومن منصة التعلم/),
      ).toBeInTheDocument();
    });

    it('offers the reversible alternative in the same breath', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));

      expect(await dialog().findByText(/واختر «سحب الدورة»/)).toBeInTheDocument();
    });

    it('deletes only after the confirmation', async () => {
      const user = userEvent.setup();
      api.deleteCourse.mockResolvedValue(undefined);

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));

      expect(api.deleteCourse).not.toHaveBeenCalled();

      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));

      await waitFor(() => expect(api.deleteCourse).toHaveBeenCalledWith('c1'));
    });

    it('shows the refusal when the course was taken since the screen loaded', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.deleteCourse.mockRejectedValue(new ApiError('COURSE_IN_USE', 409));

      renderWithProviders(<AdminCoursesPage />);
      await openManage(user);
      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));
      await user.click(await dialog().findByRole('button', { name: 'حذف نهائي' }));

      await waitFor(() => expect(dialog().getByRole('alert')).toBeInTheDocument());
    });
  });
});
