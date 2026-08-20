import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATH_MAX_COURSES, PATH_MIN_COURSES, type PathDetail } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * Path build (§4.5): the live counter, the 5-10 bounds, and the hard commitment
 * dialog.
 *
 * The bounds are also enforced on the server — the integration suite proves that
 * independently. What is asserted here is that the page never *offers* an action
 * the server would reject, which is a usability property rather than a security
 * one and would not be caught by the API tests.
 */

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  selectPath: vi.fn(),
  setCourses: vi.fn(),
  confirm: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  pathsApi: { detail: mocks.detail, list: vi.fn() },
  myPathApi: {
    selectPath: mocks.selectPath,
    setCourses: mocks.setCourses,
    confirm: mocks.confirm,
    get: vi.fn(),
    addCourse: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ pathId: 'path-1' }),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: PathBuildPage } = await import('@/app/(portal)/paths/[pathId]/page');

function course(n: number, status: 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' = 'AVAILABLE') {
  return {
    id: `course-${n}`,
    moodleCourseId: 100 + n,
    title: `الدورة رقم ${n}`,
    summary: 'وصف مختصر للدورة.',
    durationMinutes: 120,
    status,
    language: 'AR' as const,
    paths: [],
  };
}

function detail(overrides: Partial<PathDetail> = {}): PathDetail {
  return {
    id: 'path-1',
    name: 'خدمة المتعاملين',
    description: 'مسار للتعامل المباشر مع الجمهور.',
    riasecLetter: 'S',
    typicalDurationMinutes: 1200,
    courseCount: 12,
    displayOrder: 1,
    recommended: true,
    recommendationRank: 0,
    canBuild: true,
    selectedCourseIds: [],
    courses: Array.from({ length: 12 }, (_unused, index) => course(index + 1)),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue(detail());
  mocks.selectPath.mockResolvedValue(undefined);
  mocks.setCourses.mockImplementation((ids: string[]) =>
    Promise.resolve({ selectedCourseIds: ids }),
  );
  mocks.confirm.mockResolvedValue({ userPathId: 'up-1' });
});

async function renderBuilder(overrides: Partial<PathDetail> = {}) {
  mocks.detail.mockResolvedValue(detail(overrides));
  renderWithProviders(<PathBuildPage />);
  await screen.findByText('الدورة رقم 1');
}

describe('path build — the counter', () => {
  it('starts at zero and states the allowed range', async () => {
    await renderBuilder();

    expect(screen.getByText('اخترت 0 من 5–10')).toBeInTheDocument();
  });

  it('counts up as courses are added, announcing politely', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    await user.click(screen.getAllByRole('button', { name: 'أضف' })[0]!);

    const counter = await screen.findByText('اخترت 1 من 5–10');
    /* aria-live so a screen-reader user hears the count change without the
       focus moving — the counter is the feedback for the toggle they pressed. */
    expect(counter).toHaveAttribute('aria-live', 'polite');
  });

  it('counts back down when a course is removed', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    const add = screen.getAllByRole('button', { name: 'أضف' });
    await user.click(add[0]!);
    await screen.findByText('اخترت 1 من 5–10');

    await user.click(screen.getByRole('button', { name: 'مضافة' }));
    expect(await screen.findByText('اخترت 0 من 5–10')).toBeInTheDocument();
  });
});

describe('path build — the 5-10 rule', () => {
  it('keeps confirm disabled below the minimum, and says how many more are needed', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    expect(screen.getByRole('button', { name: 'تأكيد المسار' })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'أضف' })[0]!);
    await screen.findByText('اخترت 1 من 5–10');

    expect(
      screen.getByText('اختر 4 دورات إضافية على الأقل لتتمكن من التأكيد.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد المسار' })).toBeDisabled();
  });

  it('enables confirm at exactly five', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    for (let index = 0; index < PATH_MIN_COURSES; index += 1) {
      await user.click(screen.getAllByRole('button', { name: 'أضف' })[0]!);
      await screen.findByText(`اخترت ${index + 1} من 5–10`);
    }

    expect(screen.getByRole('button', { name: 'تأكيد المسار' })).toBeEnabled();
  });

  it('stops offering more courses at ten', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    for (let index = 0; index < PATH_MAX_COURSES; index += 1) {
      await user.click(screen.getAllByRole('button', { name: 'أضف' })[0]!);
      await screen.findByText(`اخترت ${index + 1} من 5–10`);
    }

    /* The remaining two courses now say so rather than silently failing when
       pressed — the bound is visible, not just enforced. */
    expect(screen.queryAllByRole('button', { name: 'أضف' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'بلغت الحد الأقصى للدورات.' }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'تأكيد المسار' })).toBeEnabled();
  });

  it('refuses to offer a course that has left the catalogue (D-015)', async () => {
    await renderBuilder({
      courses: [
        course(1, 'HIDDEN_BUT_COMPLETABLE'),
        ...Array.from({ length: 11 }, (_u, i) => course(i + 2)),
      ],
    });

    const disabled = screen.getByRole('button', { name: 'غير متاحة للإضافة' });
    expect(disabled).toBeDisabled();
    expect(screen.getByText('لم تعد هذه الدورة معروضة للاختيارات الجديدة.')).toBeInTheDocument();
  });

  it('marks the toggle state for assistive tech, not by colour alone', async () => {
    const user = userEvent.setup();
    await renderBuilder();

    const first = screen.getAllByRole('button', { name: 'أضف' })[0]!;
    expect(first).toHaveAttribute('aria-pressed', 'false');

    await user.click(first);

    expect(await screen.findByRole('button', { name: 'مضافة' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('path build — the commitment gate', () => {
  async function selectFive(user: ReturnType<typeof userEvent.setup>) {
    for (let index = 0; index < PATH_MIN_COURSES; index += 1) {
      await user.click(screen.getAllByRole('button', { name: 'أضف' })[0]!);
      await screen.findByText(`اخترت ${index + 1} من 5–10`);
    }
  }

  it('does not confirm without passing through the dialog', async () => {
    const user = userEvent.setup();
    await renderBuilder();
    await selectFive(user);

    await user.click(screen.getByRole('button', { name: 'تأكيد المسار' }));

    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('states plainly that the path cannot be changed', async () => {
    const user = userEvent.setup();
    await renderBuilder();
    await selectFive(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد المسار' }));

    /* "Are you sure?" would not do. The user is agreeing to something
       irreversible and must be told exactly what. */
    expect(
      screen.getByText(
        'عند التأكيد يُقفَل مسارك ومجموعة دوراتك. لا يمكنك تغيير المسار بعد ذلك، ولا إعادة التقييم.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('المسار: خدمة المتعاملين')).toBeInTheDocument();
    expect(screen.getByText('عدد الدورات: 5')).toBeInTheDocument();
  });

  it('confirms and lands on My Path when the user agrees', async () => {
    const user = userEvent.setup();
    await renderBuilder();
    await selectFive(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد المسار' }));
    await user.click(screen.getByRole('button', { name: 'نعم، أكّد المسار' }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/my-path'));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('backs out without confirming', async () => {
    const user = userEvent.setup();
    await renderBuilder();
    await selectFive(user);
    await user.click(screen.getByRole('button', { name: 'تأكيد المسار' }));
    await user.click(screen.getByRole('button', { name: 'رجوع' }));

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('path build — after commitment', () => {
  it('shows the locked state instead of the builder', async () => {
    mocks.detail.mockResolvedValue(detail({ canBuild: false }));
    renderWithProviders(<PathBuildPage />);

    expect(await screen.findByText('مسارك مؤكَّد')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'أضف' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأكيد المسار' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الذهاب إلى مساري' })).toHaveAttribute(
      'href',
      '/my-path',
    );
  });
});
