import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminPathCourseRow, AdminPathDetail, AdminPathRow } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.4 — one path's ladder, on its own screen (D-134).
 *
 * Four things carry this file, and all four are about a rule being visible
 * before it is enforced.
 *
 * **An unassigned membership reaches nobody, and this is the only screen that
 * can say so.** An entity offers a course to a path; until an administrator puts
 * it on a rung, no learner sees it. So the unassigned group is the work queue
 * and it sits above the ladder.
 *
 * **A path that cannot be offered says why, before the attempt.** No rungs, no
 * published assessment, or nothing placed — each is a refusal the server would
 * give, printed instead beside a disabled offer button.
 *
 * **A rung somebody is standing on cannot be deleted, and the badge says so.**
 * The server refuses; the screen disables the control and marks the rung, so the
 * refusal is predictable rather than discovered.
 *
 * **Hiding and deleting must not be confusable.** They are separate sections
 * with separate words, and the irreversible one is simply absent — with its
 * reason in place of it — for any path somebody was assigned (D-098).
 */

const api = vi.hoisted(() => ({
  getPath: vi.fn(),
  updatePath: vi.fn(),
  deletePath: vi.fn(),
  detachPathCourse: vi.fn(),
  placeCourse: vi.fn(),
  createLevel: vi.fn(),
  deleteLevel: vi.fn(),
  reorderLevels: vi.fn(),
  reorderLevelCourses: vi.fn(),
}));

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('next/navigation', () => ({ useParams: () => ({ pathId: 'p1' }) }));
vi.mock('@/lib/use-app-router', () => ({ useAppRouter: () => nav }));

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminPathPage } = await import('@/app/(admin)/admin/paths/[pathId]/page');

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

function course(index: number, overrides: Partial<AdminPathCourseRow> = {}): AdminPathCourseRow {
  return {
    id: `pc${index}`,
    courseId: `c${index}`,
    moodleCourseId: 100 + index,
    title: `دورة رقم ${index}`,
    status: 'AVAILABLE',
    placement: 'PLACED',
    levelId: 'l1',
    position: index,
    ownerEntityName: 'الهيئة الوطنية للتدريب',
    assignedByEntityName: 'الهيئة الوطنية للتدريب',
    assignedAt: '2026-08-01T00:00:00.000Z',
    learnersStarted: 0,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminPathDetail> = {}): AdminPathDetail {
  return {
    ...row(),
    description: 'وصف المسار.',
    skillOutcomes: ['المراسلة بالإنجليزية في العمل الرسمي'],
    typicalDurationMinutes: 2220,
    levels: [
      {
        id: 'l1',
        name: 'مبتدئ (A1–A2)',
        position: 1,
        hasPlacedLearners: true,
        courses: [course(1), course(2)],
      },
      {
        id: 'l2',
        name: 'متوسط (B1–B2)',
        position: 2,
        hasPlacedLearners: false,
        courses: [course(3, { levelId: 'l2', position: 1 })],
      },
    ],
    unassignedCourses: [],
    learners: { awaitingPlacement: 4, active: 6, completed: 2 },
    blockers: [],
    selectableCourses: 3,
    certificateCount: 0,
    canDelete: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getPath.mockResolvedValue(detail());
});

/** Renders the screen and waits for the path to arrive. */
async function open() {
  const user = userEvent.setup();
  renderWithProviders(<AdminPathPage />);
  await screen.findByLabelText('اسم المسار');
  return user;
}

describe('Admin path editor — the screen itself (§4C.4)', () => {
  it('asks for the path in the address', async () => {
    await open();

    expect(api.getPath).toHaveBeenCalledWith('p1');
  });

  it('offers a way back to the list it was reached from', async () => {
    await open();

    expect(screen.getByRole('link', { name: 'إدارة المسارات' })).toHaveAttribute(
      'href',
      '/admin/paths',
    );
  });

  it('is a page, not a dialog — nothing here traps focus', async () => {
    /* The reason it moved: a ladder is a queue to clear and an order to get
       right, which is work you scroll and come back to. A modal gives none of
       that an address and nests its scrollbar inside the page's. */
    await open();

    expect(document.querySelector('dialog')).toBeNull();
  });

  it('offers a retry when the path cannot be loaded', async () => {
    api.getPath.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminPathPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });
});

describe('Admin path editor — the work queue (§4C.4, D-134)', () => {
  it('lists memberships on no rung, with who offered them and why they matter', async () => {
    api.getPath.mockResolvedValue(
      detail({
        unassignedCourses: [course(9, { placement: 'UNASSIGNED', levelId: null, position: null })],
      }),
    );
    await open();

    expect(screen.getByText('دورات بانتظار الإسناد (1)')).toBeInTheDocument();
    expect(screen.getByText(/فلا يراها أي موظف/)).toBeInTheDocument();
    expect(screen.getByText('دورة رقم 9')).toBeInTheDocument();
  });

  it('says so plainly when everything has been placed', async () => {
    await open();

    expect(screen.getByText('كل دورات المسار مُسندة إلى مستويات.')).toBeInTheDocument();
  });

  it('places an unassigned course with the same one control that moves a placed one', async () => {
    /* «ضع» «انقل» «أزل من المستوى» would be three spellings of one decision —
       where in the path does this belong — beside every course. */
    api.getPath.mockResolvedValue(
      detail({
        unassignedCourses: [course(9, { placement: 'UNASSIGNED', levelId: null, position: null })],
      }),
    );
    api.placeCourse.mockResolvedValue(detail());
    const user = await open();

    const controls = screen.getAllByLabelText('المستوى');
    await user.selectOptions(controls[0]!, 'l2');

    await waitFor(() =>
      expect(api.placeCourse).toHaveBeenCalledWith('p1', 'pc9', { levelId: 'l2' }),
    );
  });

  it('takes a placed course back off its rung through the same control', async () => {
    api.placeCourse.mockResolvedValue(detail());
    const user = await open();

    const control = screen.getAllByLabelText('المستوى')[0]!;
    expect(control).toHaveValue('l1');
    await user.selectOptions(control, '');

    await waitFor(() =>
      expect(api.placeCourse).toHaveBeenCalledWith('p1', 'pc1', { levelId: null }),
    );
  });

  it('offers no placement control at all until the path has a rung to place onto', async () => {
    api.getPath.mockResolvedValue(
      detail({
        levels: [],
        unassignedCourses: [course(9, { placement: 'UNASSIGNED', levelId: null, position: null })],
        blockers: ['PATH_NO_LEVELS'],
      }),
    );
    await open();

    expect(screen.getByLabelText('المستوى')).toBeDisabled();
  });
});

describe('Admin path editor — the ladder (§4C.4, D-134)', () => {
  it('names each rung by its position and its name, in order', async () => {
    await open();

    expect(screen.getByText('المستوى 1 — مبتدئ (A1–A2)')).toBeInTheDocument();
    expect(screen.getByText('المستوى 2 — متوسط (B1–B2)')).toBeInTheDocument();
  });

  it('adds a rung, and offers the control only once it is named', async () => {
    api.createLevel.mockResolvedValue(detail());
    const user = await open();

    const add = screen.getByRole('button', { name: 'إضافة مستوى' });
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText('اسم المستوى'), 'متقدم (C1)');
    await user.click(add);

    await waitFor(() => expect(api.createLevel).toHaveBeenCalledWith('p1', 'متقدم (C1)'));
  });

  it('refuses to delete a rung learners are standing on, and marks which', async () => {
    /* The server refuses it; saying so here means the administrator learns the
       rule instead of being refused by it. */
    await open();

    expect(screen.getByText('يوجد موظفون عند هذا المستوى')).toBeInTheDocument();

    const deletes = screen.getAllByRole('button', { name: 'حذف المستوى' });
    expect(deletes[0]).toBeDisabled();
    expect(deletes[1]).toBeEnabled();
  });

  it('says a rung deletion returns its courses rather than destroying them', async () => {
    api.deleteLevel.mockResolvedValue(detail());
    const user = await open();

    await user.click(screen.getAllByRole('button', { name: 'حذف المستوى' })[1]!);

    await waitFor(() => expect(api.deleteLevel).toHaveBeenCalledWith('p1', 'l2'));
    expect(
      await screen.findByText('حُذف المستوى، وعادت دوراته إلى قائمة الانتظار.'),
    ).toBeInTheDocument();
  });

  it('disables moving the first rung up and the last one down', async () => {
    await open();

    const up = screen.getAllByRole('button', { name: 'تحريك لأعلى' });
    const down = screen.getAllByRole('button', { name: 'تحريك لأسفل' });

    expect(up[0]).toBeDisabled();
    expect(down[down.length - 1]).toBeDisabled();
  });

  it('reorders the courses within one rung, sending the whole new order', async () => {
    /* Sequence is curriculum: the server re-packs positions to 1…n, so the
       client sends the order it wants rather than a delta. */
    api.reorderLevelCourses.mockResolvedValue(detail());
    const user = await open();

    const firstRung = screen.getByText('المستوى 1 — مبتدئ (A1–A2)').closest('div')!.parentElement!;
    const down = within(firstRung).getAllByRole('button', { name: 'تحريك لأسفل' });
    /* The first is the rung's own; the next belongs to the first course. */
    await user.click(down[1]!);

    await waitFor(() =>
      expect(api.reorderLevelCourses).toHaveBeenCalledWith('p1', 'l1', ['pc2', 'pc1']),
    );
  });

  it('explains an empty rung rather than showing an empty box', async () => {
    api.getPath.mockResolvedValue(
      detail({
        levels: [
          {
            id: 'l1',
            name: 'مبتدئ (A1–A2)',
            position: 1,
            hasPlacedLearners: false,
            courses: [],
          },
        ],
      }),
    );
    await open();

    expect(screen.getByText('لا توجد دورات في هذا المستوى.')).toBeInTheDocument();
  });

  it('warns that moving a started course keeps its progress, without asking', async () => {
    /* §10 of the brief is an open product question. Progress is keyed on the
       course and survives the move, so the administrator is told, not blocked. */
    api.getPath.mockResolvedValue(
      detail({
        levels: [
          {
            id: 'l1',
            name: 'مبتدئ (A1–A2)',
            position: 1,
            hasPlacedLearners: false,
            courses: [course(1, { learnersStarted: 4 })],
          },
        ],
      }),
    );
    await open();

    expect(screen.getByText(/بدأها 4 موظف/)).toBeInTheDocument();
    expect(screen.getByText(/لا يمسّ تقدّمهم/)).toBeInTheDocument();
  });
});

describe('Admin path editor — offering, hiding and deleting (§4C.4, D-098)', () => {
  it('explains why a path cannot be offered, before the attempt', async () => {
    api.getPath.mockResolvedValue(
      detail({ status: 'DRAFT', blockers: ['PATH_NO_ASSESSMENT'], canDelete: true }),
    );
    await open();

    expect(screen.getByText(/قبل نشر تقييم تحديد المستوى/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عرض المسار' })).toBeDisabled();
  });

  it('offers retire for an offered path, never both at once', async () => {
    /* Context-dependent, never both (§3). */
    await open();

    expect(screen.getByRole('button', { name: 'إيقاف العرض' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض المسار' })).not.toBeInTheDocument();
  });

  it('offers the reverse for a path that is not offered', async () => {
    api.getPath.mockResolvedValue(detail({ status: 'DRAFT' }));
    await open();

    expect(screen.getByRole('button', { name: 'عرض المسار' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إيقاف العرض' })).not.toBeInTheDocument();
  });

  it('separates the learners a change here can touch from the ones it cannot', async () => {
    await open();

    expect(screen.getByText('بانتظار تحديد المستوى')).toBeInTheDocument();
    expect(screen.getByText(/ولا يتأثرون بأي تغيير هنا/)).toBeInTheDocument();
  });

  it('refuses deletion in words for a path somebody was assigned, and still offers hiding', async () => {
    await open();

    expect(screen.getByText(/أُسند إلى موظفين أو صدرت عنه شهادات/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف نهائي' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إيقاف العرض' })).toBeInTheDocument();
  });

  it('keeps deleting and hiding apart, and confirms the irreversible one', async () => {
    /* The one thing that stays a dialog: a confirmation is one question, asked
       once and gone, which is exactly what a modal is for. */
    api.getPath.mockResolvedValue(detail({ canDelete: true }));
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));

    expect(await screen.findByText(/سيُحذف مسار «مسار اللغة الإنجليزية»/)).toBeInTheDocument();
    expect(screen.getByText(/اختر «إيقاف العرض»/)).toBeInTheDocument();
  });

  it('returns to the list once the path is gone', async () => {
    /* The screen has no subject any more, and the deleted path's URL is not
       somewhere the back button should return to. */
    api.getPath.mockResolvedValue(detail({ canDelete: true }));
    api.deletePath.mockResolvedValue(undefined);
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));
    const confirmation = await screen.findByText(/سيُحذف مسار/);
    await user.click(
      within(confirmation.closest('dialog')!).getByRole('button', { name: 'حذف نهائي' }),
    );

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/admin/paths'));
  });

  it('shows the server’s refusal when the path was assigned between load and click', async () => {
    const { ApiError } = await import('@/lib/api-client');
    api.getPath.mockResolvedValue(detail({ canDelete: true }));
    api.deletePath.mockRejectedValue(new ApiError('PATH_HELD_BY_LEARNERS', 409));
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));
    const confirmation = await screen.findByText(/سيُحذف مسار/);
    await user.click(
      within(confirmation.closest('dialog')!).getByRole('button', { name: 'حذف نهائي' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/مُسند إلى موظفين/);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('offers save only once something has changed', async () => {
    const user = await open();

    expect(screen.queryByRole('button', { name: 'حفظ التعديلات' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('اسم المسار'), 'ة');

    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
  });
});
