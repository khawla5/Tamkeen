import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCoursePage, AdminCourseRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.5 — course oversight.
 *
 * **The screen answers one question: why can nobody see this course?** The
 * answer is always the publication decision and the two LMS facts disagreeing,
 * so the table shows the LMS's side whenever it is the reason — a course that is
 * published and still invisible is one the LMS stopped returning, and no amount
 * of looking at the derived status alone would say so.
 *
 * **And it states the protection before the action.** Hiding a course learners
 * hold cannot take it from them; the status is derived and no combination of
 * inputs produces that (§2/D-015). Saying so on the dialog is the difference
 * between an administrator acting and an administrator hesitating.
 */

const api = vi.hoisted(() => ({
  listCourses: vi.fn(),
  interveneCourse: vi.fn(),
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

  it('names the LMS as the reason when a published course is invisible', async () => {
    api.listCourses.mockResolvedValue(
      page([row({ publication: 'PUBLISHED', status: 'RETIRED', lmsPresent: false })]),
    );
    renderWithProviders(<AdminCoursesPage />);

    /* The derived status alone would say "retired" and leave the administrator
       looking for a decision nobody made. */
    expect(await screen.findByText('غير موجودة في منصة التعلم')).toBeInTheDocument();
  });

  it('stays quiet about the LMS when the LMS is not the reason', async () => {
    renderWithProviders(<AdminCoursesPage />);

    await screen.findByText('مقدمة في خدمة المتعاملين');
    expect(screen.queryByText('غير موجودة في منصة التعلم')).not.toBeInTheDocument();
    expect(screen.queryByText('مخفية في منصة التعلم')).not.toBeInTheDocument();
  });

  it('reads publishedAt, which nothing rendered before this page existed', async () => {
    renderWithProviders(<AdminCoursesPage />);

    expect(await screen.findByText('تاريخ النشر')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('hides pagination when everything fits on one page', async () => {
    renderWithProviders(<AdminCoursesPage />);

    await screen.findByText('مقدمة في خدمة المتعاملين');
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
  });

  describe('intervening', () => {
    it('states the protection before the action, when learners hold the course', async () => {
      const user = userEvent.setup();
      api.listCourses.mockResolvedValue(page([row({ heldByLearners: 7 })]));

      renderWithProviders(<AdminCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* Not discovered afterwards: an administrator who does not know the
         protection exists will hesitate over a safe action. */
      expect(await screen.findByText(/ويبقيها متاحة لمن اختارها حتى يكملها/)).toBeInTheDocument();
    });

    it('says nothing about held learners when nobody holds it', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      await dialog().findByText('قرار النشر');
      expect(screen.queryByText(/ويبقيها متاحة لمن اختارها/)).not.toBeInTheDocument();
    });

    it('offers hide for a published course and restore for a withdrawn one', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

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
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      expect(dialog().queryByRole('button', { name: 'حفظ الجهة' })).not.toBeInTheDocument();

      await user.selectOptions(await dialog().findByLabelText('الجهة'), 'e1');

      expect(await dialog().findByRole('button', { name: 'حفظ الجهة' })).toBeInTheDocument();
    });

    it('offers no control that writes the status directly', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      await dialog().findByText('قرار النشر');
      /* `status` is derived (D-059). A control for it would be a second author
         of the column the whole design exists to give one author. */
      expect(dialog().queryByLabelText('الحالة')).not.toBeInTheDocument();
    });

    it('shows the server’s refusal', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.interveneCourse.mockRejectedValue(new ApiError('COURSE_CANNOT_RETURN_TO_DRAFT', 409));

      renderWithProviders(<AdminCoursesPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await user.click(await dialog().findByRole('button', { name: 'سحب الدورة' }));

      await waitFor(() =>
        expect(dialog().getByRole('alert')).toHaveTextContent(/لا يمكن إعادة دورة منشورة/),
      );
    });
  });
});
