import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityCourseDetail } from '@tamkeen/types';

import { MoodleEmbed } from '@/components/moodle-embed';
import { renderWithProviders } from '@/test/render';

/**
 * §4B.4 — Course Content with Moodle's editor framed (TAM-139, D-101).
 *
 * What a screen could quietly break: the credential must not be in the page
 * before the launch resolves and must be only the frame's `src` after; a
 * message from the wrong origin must change nothing; a frame that never says
 * "ready" must give way to the full-page fallback on a FRESH token; a content
 * change must refresh the read-back; and the page's one action must be the
 * publish gate, with its reasons.
 */

const MOODLE = 'http://moodle.test';
const EMBED_URL = `${MOODLE}/local/tamkeensso/login.php?token=abc.def&embed=author`;
const HANDOFF_URL = `${MOODLE}/local/tamkeensso/login.php?token=ghi.jkl`;

const api = vi.hoisted(() => ({
  getCourse: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  authorLaunch: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  entityApi: {
    getCourse: api.getCourse,
    publish: api.publish,
    unpublish: api.unpublish,
    authorLaunch: api.authorLaunch,
  },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ courseId: 'course-1' }) }));

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
      <div data-testid="page-action">{action}</div>
      {children}
    </div>
  ),
}));

const { default: CourseContentPage } =
  await import('@/app/(entity)/entity/courses/[courseId]/content/page');

const detail = (overrides: Partial<EntityCourseDetail> = {}): EntityCourseDetail => ({
  id: 'course-1',
  moodleCourseId: 900_001,
  title: 'إدارة المخاطر',
  summary: 'وصف',
  durationMinutes: 120,
  language: 'AR',
  publication: 'DRAFT',
  status: 'DRAFT',
  learnersHolding: 0,
  objectives: [],
  prerequisites: null,
  paths: [],
  riasecLetters: [],
  isGeneral: false,
  pathRules: { maxPaths: 3, maxLetters: 2, frozen: false, approvalRequired: false },
  content: { activityCount: 0, hasQuiz: false, completionConfigured: false },
  publishBlockers: ['NO_COMPLETION_CRITERIA'],
  availablePaths: [],
  enrolledCount: 0,
  completionRate: null,
  ...overrides,
});

function postFromFrame(origin: string, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin, data }));
  });
}

beforeEach(() => {
  api.getCourse.mockReset();
  api.publish.mockReset();
  api.authorLaunch.mockReset();
  api.getCourse.mockResolvedValue(detail());
  api.authorLaunch.mockImplementation((_id: string, options?: { embed?: boolean }) =>
    Promise.resolve(
      options?.embed ? { url: EMBED_URL, mode: 'embed' } : { url: HANDOFF_URL, mode: 'handoff' },
    ),
  );
});

describe('course content — the framed editor', () => {
  it('mints an embed launch on open, and frames it once it resolves', async () => {
    let resolveLaunch: (value: { url: string; mode: string }) => void = () => undefined;
    api.authorLaunch.mockImplementation(
      () =>
        new Promise<{ url: string; mode: string }>((resolve) => {
          resolveLaunch = resolve;
        }),
    );

    renderWithProviders(<CourseContentPage />);
    await screen.findByText('إدارة المخاطر');

    /* Before the launch resolves: nothing carrying a token anywhere in the page. */
    expect(document.body.innerHTML).not.toContain('token=');
    expect(api.authorLaunch).toHaveBeenCalledWith('course-1', { embed: true });

    await act(async () => {
      resolveLaunch({ url: EMBED_URL, mode: 'embed' });
    });

    const frame = await screen.findByTitle('إدارة المخاطر');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', EMBED_URL);
    /* …and only as the frame src — no link, no text. */
    expect(document.querySelectorAll('a[href*="token="]')).toHaveLength(0);
  });

  it('shows loading until Moodle says it is ready, then the frame alone', async () => {
    renderWithProviders(<CourseContentPage />);
    await screen.findByTitle('إدارة المخاطر');

    expect(screen.getByText('جارٍ فتح محرّر المحتوى')).toBeInTheDocument();

    postFromFrame(MOODLE, { type: 'tamkeen:ready' });

    await waitFor(() => {
      expect(screen.queryByText('جارٍ فتح محرّر المحتوى')).not.toBeInTheDocument();
    });
  });

  it('ignores a message from any origin but Moodle’s', async () => {
    renderWithProviders(<CourseContentPage />);
    await screen.findByTitle('إدارة المخاطر');
    api.getCourse.mockClear();

    postFromFrame('http://evil.test', { type: 'tamkeen:ready' });
    postFromFrame('http://evil.test', { type: 'tamkeen:content-changed' });

    expect(screen.getByText('جارٍ فتح محرّر المحتوى')).toBeInTheDocument();
    expect(api.getCourse).not.toHaveBeenCalled();
  });

  it('refreshes the read-back — and the publish gate with it — when content changes', async () => {
    renderWithProviders(<CourseContentPage />);
    await screen.findByTitle('إدارة المخاطر');
    postFromFrame(MOODLE, { type: 'tamkeen:ready' });

    expect(screen.getByText('لا يمكن نشر الدورة بعد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انشر الدورة' })).toBeDisabled();

    api.getCourse.mockResolvedValue(
      detail({
        content: { activityCount: 3, hasQuiz: true, completionConfigured: true },
        publishBlockers: [],
      }),
    );
    postFromFrame(MOODLE, { type: 'tamkeen:content-changed' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'انشر الدورة' })).toBeEnabled();
    });
    expect(screen.queryByText('لا يمكن نشر الدورة بعد')).not.toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('falls back to the full-page handoff on a fresh token when the frame never reports', async () => {
    /* Rendered directly with a short real timeout: the page never passes one,
       and faking timers around the whole page proved flaky under load. */
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    renderWithProviders(
      <MoodleEmbed
        title="إدارة المخاطر"
        labels={{
          loading: 'جارٍ فتح محرّر المحتوى',
          failedTitle: 'تعذّر عرض محرّر المحتوى داخل الصفحة',
          failedBody: 'يمكنك فتح المحرّر في منصة التعلّم مباشرة.',
          openFullPage: 'افتح في منصة التعلّم',
          opening: 'جارٍ الفتح…',
        }}
        launchEmbed={() => api.authorLaunch('course-1', { embed: true })}
        launchFullPage={() => api.authorLaunch('course-1')}
        translateError={() => 'خطأ'}
        onContentChanged={() => undefined}
        readyTimeoutMs={30}
      />,
    );
    await screen.findByTitle('إدارة المخاطر');

    expect(await screen.findByText('تعذّر عرض محرّر المحتوى داخل الصفحة')).toBeInTheDocument();
    expect(screen.queryByTitle('إدارة المخاطر')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'افتح في منصة التعلّم' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(HANDOFF_URL);
    });
    /* Two launches, two different tokens: the framed one is spent by now. */
    expect(api.authorLaunch).toHaveBeenCalledTimes(2);
    expect(api.authorLaunch).toHaveBeenLastCalledWith('course-1');

    vi.unstubAllGlobals();
  });

  it('keeps the full-size route quietly available under a working frame', async () => {
    renderWithProviders(<CourseContentPage />);
    await screen.findByTitle('إدارة المخاطر');
    postFromFrame(MOODLE, { type: 'tamkeen:ready' });

    expect(screen.getByRole('button', { name: 'افتح في منصة التعلّم' })).toBeInTheDocument();
  });
});

describe('course content — the page action', () => {
  it('is the publish gate, with its reasons in the read-back strip', async () => {
    renderWithProviders(<CourseContentPage />);
    await screen.findByTitle('إدارة المخاطر');

    const action = screen.getByTestId('page-action');
    expect(action).toContainElement(screen.getByRole('button', { name: 'انشر الدورة' }));
    expect(screen.getByText('لا يمكن نشر الدورة بعد')).toBeInTheDocument();
    /* Exactly one primary action on the page: the fallback is secondary and
       the refresh is a ghost. */
    expect(screen.queryByRole('button', { name: 'أوقف النشر' })).not.toBeInTheDocument();
  });

  it('publishes when nothing is blocking, and offers unpublish afterwards (§3)', async () => {
    const user = userEvent.setup();
    api.getCourse.mockResolvedValue(
      detail({
        content: { activityCount: 3, hasQuiz: true, completionConfigured: true },
        publishBlockers: [],
      }),
    );
    api.publish.mockImplementation(async () => {
      api.getCourse.mockResolvedValue(
        detail({
          publication: 'PUBLISHED',
          status: 'AVAILABLE',
          content: { activityCount: 3, hasQuiz: true, completionConfigured: true },
          publishBlockers: [],
        }),
      );
    });

    renderWithProviders(<CourseContentPage />);
    await user.click(await screen.findByRole('button', { name: 'انشر الدورة' }));

    expect(await screen.findByRole('button', { name: 'أوقف النشر' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'انشر الدورة' })).not.toBeInTheDocument();
    expect(api.publish).toHaveBeenCalledWith('course-1');
  });

  it('says plainly when the LMS could not be read', async () => {
    api.getCourse.mockResolvedValue(
      detail({ content: null, publishBlockers: ['LMS_UNREACHABLE'] }),
    );

    renderWithProviders(<CourseContentPage />);

    expect(
      await screen.findByText('تعذّر الوصول إلى منصة التعلّم لقراءة محتوى الدورة.'),
    ).toBeInTheDocument();
  });

  describe('course content — title, description and the guide (TAM-143)', () => {
    it('shows the course title and description learners will read', async () => {
      renderWithProviders(<CourseContentPage />);

      expect(await screen.findByText('إدارة المخاطر')).toBeInTheDocument();
      expect(screen.getByText('وصف')).toBeInTheDocument();
    });

    it('links the completion blocker and the strip to the guide', async () => {
      renderWithProviders(<CourseContentPage />);
      await screen.findByText('إدارة المخاطر');

      /* The blocker's link and the read-back strip's both lead to the guide's
         completion section (TAM-143 — the guide shipped on main). */
      const guide = screen.getAllByRole('link', { name: 'دليل إنشاء الدورة' });
      expect(guide.length).toBeGreaterThanOrEqual(2);
      for (const link of guide) {
        expect(link).toHaveAttribute('href', '/entity/guide#completion');
      }
    });
  });
});
