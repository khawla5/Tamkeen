import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminPathRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.4 — the list of study paths (D-134).
 *
 * **The list only lists.** Each row says how much of the path is still waiting
 * on the administrator: a course an entity has offered and nobody has placed
 * reaches no learner at all, and that is invisible from every other screen. The
 * ladder itself is a screen of its own (`admin-path-editor.test.tsx`), reached
 * by a link rather than a modal — the work there is long enough to scroll and
 * to come back to.
 *
 * Creating a path stays a dialog, because three fields answered once is exactly
 * what a modal is for.
 */

const api = vi.hoisted(() => ({
  listPaths: vi.fn(),
  createPath: vi.fn(),
}));

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/lib/use-app-router', () => ({ useAppRouter: () => nav }));

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
    key: 'english',
    name: 'مسار اللغة الإنجليزية',
    levelCount: 3,
    placedCourseCount: 8,
    unassignedCourseCount: 0,
    assignedLearners: 12,
    hasActiveAssessment: true,
    hasDraftAssessment: false,
    status: 'PUBLISHED',
    displayOrder: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listPaths.mockResolvedValue([row()]);
});

describe('Admin paths (§4C.4)', () => {
  it('shows the loading state, then the paths', () => {
    api.listPaths.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminPathsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    api.listPaths.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('summarises each path by its rungs, its placed courses and who is on it', async () => {
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText(/3 مستويات · 8 دورة مُسندة · 12 موظف/)).toBeInTheDocument();
  });

  it('marks on the list itself how many memberships nobody has placed', async () => {
    /* The administrator's work queue: content an entity offered that reaches no
       learner, and no other screen in the product would say so. */
    api.listPaths.mockResolvedValue([row({ unassignedCourseCount: 3 })]);
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('3 بانتظار الإسناد')).toBeInTheDocument();
  });

  it('marks a path that is not offered', async () => {
    api.listPaths.mockResolvedValue([row({ status: 'DRAFT' })]);
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('مسودة')).toBeInTheDocument();
  });

  it('explains an empty list rather than showing an empty box', async () => {
    api.listPaths.mockResolvedValue([]);
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByText('لا توجد مسارات بعد')).toBeInTheDocument();
  });

  it('opens the ladder as a link, so it can be bookmarked and opened in a tab', async () => {
    /* A modal has no address. Making this a link is most of what moving the
       editor onto its own screen bought. */
    renderWithProviders(<AdminPathsPage />);

    expect(await screen.findByRole('link', { name: 'إدارة' })).toHaveAttribute(
      'href',
      '/admin/paths/p1',
    );
  });

  it('offers no ladder editing on the list itself', async () => {
    renderWithProviders(<AdminPathsPage />);

    await screen.findByText(/3 مستويات/);
    expect(screen.queryByLabelText('اسم المسار')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('المستوى')).not.toBeInTheDocument();
  });
});

describe('Admin paths — creating one (§4C.4)', () => {
  it('says the path will not be offered yet, before the administrator commits', async () => {
    /* A path is created with no rungs, no assessment and nothing placed, so
       offering it immediately would strand whoever was assigned it. */
    const user = userEvent.setup();
    renderWithProviders(<AdminPathsPage />);

    await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));

    expect(screen.getByText(/يُنشأ المسار غير معروض/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض المسار' })).not.toBeInTheDocument();
  });

  it('will not submit until the key, the name and a real description are there', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPathsPage />);
    await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));

    const create = screen.getByRole('button', { name: 'إنشاء' });
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText(/اسم المسار/), 'مسار اللغة العربية');
    await user.type(screen.getByLabelText(/المعرّف/), 'arabic');
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText(/وصف المسار/), 'وصف كافٍ لهذا المسار.');
    expect(create).toBeEnabled();
  });

  it('goes straight into the new path’s ladder, which is always the next step', async () => {
    const user = userEvent.setup();
    api.createPath.mockResolvedValue({ id: 'p9' });
    renderWithProviders(<AdminPathsPage />);

    await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));
    await user.type(screen.getByLabelText(/اسم المسار/), 'مسار اللغة العربية');
    await user.type(screen.getByLabelText(/المعرّف/), 'arabic');
    await user.type(screen.getByLabelText(/وصف المسار/), 'وصف كافٍ لهذا المسار.');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/admin/paths/p9'));
  });

  it('shows the server’s refusal without losing what was typed', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    api.createPath.mockRejectedValue(new ApiError('PATH_KEY_TAKEN', 409));
    renderWithProviders(<AdminPathsPage />);

    await user.click(await screen.findByRole('button', { name: 'إنشاء مسار' }));
    await user.type(screen.getByLabelText(/اسم المسار/), 'مسار اللغة العربية');
    await user.type(screen.getByLabelText(/المعرّف/), 'english');
    await user.type(screen.getByLabelText(/وصف المسار/), 'وصف كافٍ لهذا المسار.');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/هذا المعرّف مستخدم/);
    expect(screen.getByLabelText(/اسم المسار/)).toHaveValue('مسار اللغة العربية');
    expect(nav.push).not.toHaveBeenCalled();
  });
});
