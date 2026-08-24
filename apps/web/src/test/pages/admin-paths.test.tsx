import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminPathDetail, AdminPathRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.4 — study paths.
 *
 * Three things carry this file, and all three are about a rule being visible
 * before it is enforced.
 *
 * **The 5-10 bounds are printed and have no control.** D-074 and §2 make them
 * fixed; an administrator explaining a rejected path build needs the numbers,
 * and nobody needs a way to lower them.
 *
 * **A path that cannot be offered says why.** Fewer than five selectable courses
 * means no learner could ever confirm it, and that is invisible from every
 * screen once the path is live.
 *
 * **A course held by learners cannot be removed, and the count says so.** The
 * server refuses; the panel disables the control and prints the number beside
 * the title, so the refusal is predictable rather than discovered.
 */

const api = vi.hoisted(() => ({
  listPaths: vi.fn(),
  pathBounds: vi.fn(),
  getPath: vi.fn(),
  createPath: vi.fn(),
  updatePath: vi.fn(),
  attachPathCourse: vi.fn(),
  detachPathCourse: vi.fn(),
  reorderPathCourses: vi.fn(),
  attachableCourses: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({
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

const { default: AdminPathsPage } = await import('@/app/(admin)/admin/paths/page');

function row(overrides: Partial<AdminPathRow> = {}): AdminPathRow {
  return {
    id: 'p1',
    key: 'hr',
    name: 'مسار الموارد البشرية',
    riasecLetter: 'S',
    courseCount: 8,
    committedLearners: 12,
    isActive: true,
    displayOrder: 1,
    ...overrides,
  };
}

function course(index: number, held = 0) {
  return {
    id: `c${index}`,
    moodleCourseId: 100 + index,
    title: `دورة رقم ${index}`,
    status: 'AVAILABLE' as const,
    displayOrder: index,
    ownerEntityName: null,
    heldByLearners: held,
  };
}

function detail(overrides: Partial<AdminPathDetail> = {}): AdminPathDetail {
  return {
    ...row(),
    description: 'وصف المسار الكامل الذي يقرأه الموظف قبل اختياره.',
    typicalDurationMinutes: 600,
    courses: [course(1), course(2), course(3), course(4), course(5)],
    learners: { building: 3, active: 9, completed: 3 },
    blockers: [],
    selectableCourses: 5,
    ...overrides,
  };
}

function dialog() {
  return within(document.querySelector('dialog')!);
}

describe('Admin paths (§4C.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listPaths.mockResolvedValue([row()]);
    api.pathBounds.mockResolvedValue({ min: 5, max: 10 });
    api.getPath.mockResolvedValue(detail());
    api.attachableCourses.mockResolvedValue([]);
  });

  it('shows the loading state before the list arrives', () => {
    api.listPaths.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminPathsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    api.listPaths.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('explains an empty list rather than showing a bare page', async () => {
    api.listPaths.mockResolvedValue([]);
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('لا توجد مسارات بعد')).toBeInTheDocument();
  });

  it('prints the 5-10 rule and offers no way to change it', async () => {
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText(/يختار الموظف بين 5 و10 دورات/)).toBeInTheDocument();
    /* D-074: shown, never edited. A spinbutton here would be the control that
       eventually lowers the floor. */
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('names the RIASEC type in Arabic and the committed learners', async () => {
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('الاجتماعي')).toBeInTheDocument();
    expect(screen.getByText(/12 موظفًا أكّدوا هذا المسار/)).toBeInTheDocument();
  });

  it('marks a path that is not offered', async () => {
    api.listPaths.mockResolvedValue([row({ isActive: false })]);
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('غير معروض')).toBeInTheDocument();
  });

  describe('creating', () => {
    it('says the new path will not be offered yet', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminPathsPage />);

      await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));

      /* Which is why the form has no activate switch — an answer rather than an
         omission. */
      expect(await screen.findByText(/يُنشأ المسار غير معروض على الموظفين/)).toBeInTheDocument();
      expect(dialog().queryByLabelText(/عرض/)).not.toBeInTheDocument();
    });

    it('opens the new path straight away, since it needs courses next', async () => {
      const user = userEvent.setup();
      api.createPath.mockResolvedValue(detail({ id: 'p2', courses: [], selectableCourses: 0 }));

      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));

      await user.type(dialog().getByLabelText('اسم المسار'), 'مسار جديد');
      await user.type(dialog().getByLabelText('المعرّف'), 'new-path');
      await user.type(dialog().getByLabelText('وصف المسار'), 'وصف كافٍ لتجاوز الحد الأدنى.');
      await user.click(dialog().getByRole('button', { name: 'إنشاء' }));

      await waitFor(() => expect(api.getPath).toHaveBeenCalledWith('p2'));
    });
  });

  describe('the detail panel', () => {
    it('separates learners who are committed from learners who are still choosing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* The distinction the retirement decision turns on: only the people still
         choosing are affected by taking the path out of new selections. */
      expect(await screen.findByText('يختارون دوراتهم')).toBeInTheDocument();
      expect(screen.getByText('هؤلاء وحدهم من يتأثر بإيقاف عرض المسار.')).toBeInTheDocument();
      expect(screen.getByText('أكّدوا المسار، ولا يتأثرون بأي تغيير هنا.')).toBeInTheDocument();
    });

    it('explains why a path cannot be offered, before the attempt', async () => {
      const user = userEvent.setup();
      api.getPath.mockResolvedValue(
        detail({
          isActive: false,
          courses: [course(1), course(2)],
          selectableCourses: 2,
          blockers: ['PATH_TOO_FEW_COURSES'],
        }),
      );

      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      expect(await screen.findByText(/أقل من الحد الأدنى الذي يحتاجه الموظف/)).toBeInTheDocument();
      expect(dialog().getByRole('button', { name: 'عرض المسار' })).toBeDisabled();
    });

    it('disables removing a course learners hold, and says how many', async () => {
      const user = userEvent.setup();
      api.getPath.mockResolvedValue(
        detail({ courses: [course(1, 4), course(2), course(3), course(4), course(5)] }),
      );

      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* The number beside the title is the reason the control is disabled —
         a disabled button with no explanation teaches nothing. */
      expect(await screen.findByText(/يحتفظ بها 4 من الموظفين/)).toBeInTheDocument();

      const remove = dialog().getAllByRole('button', { name: 'إزالة الدورة من المسار' });
      expect(remove[0]).toBeDisabled();
      expect(remove[1]).toBeEnabled();
    });

    it('offers retire for an offered path and activate for one that is not', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      /* Context-dependent, never both (§3). */
      expect(await dialog().findByRole('button', { name: 'إيقاف العرض' })).toBeInTheDocument();
      expect(dialog().queryByRole('button', { name: 'عرض المسار' })).not.toBeInTheDocument();
    });

    it('shows the server’s refusal rather than assuming the disabled button was enough', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.updatePath.mockRejectedValue(new ApiError('PATH_TOO_FEW_COURSES', 409));

      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));
      await user.click(await dialog().findByRole('button', { name: 'إيقاف العرض' }));

      await waitFor(() =>
        expect(dialog().getByRole('alert')).toHaveTextContent(/أقل من الحد الأدنى/),
      );
    });

    it('offers save only once something has changed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      await screen.findByLabelText('اسم المسار');
      expect(dialog().queryByRole('button', { name: 'حفظ التعديلات' })).not.toBeInTheDocument();

      await user.type(dialog().getByLabelText('اسم المسار'), 'ـ');

      expect(await dialog().findByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
    });

    it('disables moving the first course up and the last one down', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      const up = await dialog().findAllByRole('button', { name: 'تحريك لأعلى' });
      const down = dialog().getAllByRole('button', { name: 'تحريك لأسفل' });

      expect(up[0]).toBeDisabled();
      expect(down.at(-1)).toBeDisabled();
    });

    it('explains an empty course list rather than showing an empty box', async () => {
      const user = userEvent.setup();
      api.getPath.mockResolvedValue(
        detail({ courses: [], selectableCourses: 0, blockers: ['PATH_TOO_FEW_COURSES'] }),
      );

      renderWithProviders(<AdminPathsPage />);
      await user.click(await screen.findByRole('button', { name: 'إدارة' }));

      expect(await screen.findByText('لا توجد دورات في هذا المسار بعد.')).toBeInTheDocument();
    });
  });
});
