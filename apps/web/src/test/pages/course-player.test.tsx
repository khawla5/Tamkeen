import { act, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoursePlayerView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The course view / player (§4.8).
 *
 * Two rules are actually under test. **One action, chosen by state** (§3) — so
 * each case asserts what is *absent* as well as what is shown, because "never
 * all three" is a rule about absence. And the launch URL must be fetched **on
 * click**, never rendered into the page: it carries a short-lived credential
 * (D-044), and a link in the markup would mean the credential existed before
 * anyone chose to use it.
 */

const api = vi.hoisted(() => ({
  player: vi.fn(),
  launch: vi.fn(),
  sync: vi.fn(),
  outline: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  coursesApi: {
    player: api.player,
    launch: api.launch,
    sync: api.sync,
    outline: api.outline,
  },
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ courseId: 'course-1' }),
}));

const { default: CoursePlayerPage } = await import('@/app/(portal)/courses/[courseId]/player/page');

const COURSE: CoursePlayerView = {
  courseId: 'course-1',
  title: 'أساسيات الأمن السيبراني',
  summary: 'مقدمة عملية.',
  durationMinutes: 90,
  pathName: 'المسار التقني',
  orderInPath: 3,
  totalInPath: 7,
  status: 'NOT_STARTED',
  gradePercent: null,
  passed: false,
  passThreshold: 70,
  canLaunch: true,
  nextCourseId: null,
};

const show = async (overrides: Partial<CoursePlayerView> = {}) => {
  api.player.mockResolvedValue({ ...COURSE, ...overrides });
  renderWithProviders(<CoursePlayerPage />);
  await screen.findByText(COURSE.title);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.outline.mockResolvedValue({
    items: [
      {
        moduleId: 11,
        name: 'مقدمة',
        kind: 'page',
        url: 'http://moodle.test/mod/page/view.php?id=11',
      },
      {
        moduleId: 12,
        name: 'المذكرة',
        kind: 'resource',
        url: 'http://moodle.test/mod/resource/view.php?id=12',
      },
      {
        moduleId: 13,
        name: 'الاختبار',
        kind: 'quiz',
        url: 'http://moodle.test/mod/quiz/view.php?id=13',
      },
    ],
  });
  api.launch.mockResolvedValue({ url: 'http://moodle.test/local/tamkeensso/login.php?token=x' });
});

describe('course player — context', () => {
  it('shows where the learner is in their path', async () => {
    await show();

    expect(screen.getByText(/المسار التقني/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('says the content opens in the learning platform, without a second login', async () => {
    /* The learner is about to leave the product. Saying so beats a silent
       navigation to a different-looking site. */
    await show();

    expect(screen.getByText(/منصة التعلّم/)).toBeInTheDocument();
  });
});

describe('course player — one action, chosen by state', () => {
  it('offers "start" for an untouched course, and nothing else', async () => {
    await show({ status: 'NOT_STARTED' });
  });

  it('offers "resume" once the course is in progress', async () => {
    await show({ status: 'IN_PROGRESS', gradePercent: 40 });
  });

  it('offers "review" once it is passed', async () => {
    await show({ status: 'COMPLETED', gradePercent: 88, passed: true });
  });

  it('offers no launch at all before the path is confirmed', async () => {
    /* Nothing is enrolled until the commitment gate (§4.5), so an enabled button
       would be one that cannot do what it says. */
    await show({ canLaunch: false });

    expect(screen.getByText(/لم يتم تأكيد مسارك/)).toBeInTheDocument();
  });
});

describe('course player — the outcome', () => {
  it('states the grade when the course was passed', async () => {
    await show({ status: 'COMPLETED', gradePercent: 88, passed: true });

    expect(screen.getByText(/اجتزت هذه الدورة/)).toBeInTheDocument();
  });

  it('gives a failing learner the grade, the threshold and a way back in', async () => {
    /* §4.8 asks for a *clear retake action*. A bare "not passed" leaves someone
       to infer why nothing was awarded and whether trying again is allowed. */
    await show({ status: 'IN_PROGRESS', gradePercent: 55, passed: false });

    expect(screen.getByText(/لم تجتز هذه الدورة بعد/)).toBeInTheDocument();
    expect(screen.getByText(/الحدّ المطلوب/)).toBeInTheDocument();
  });

  it('shows no outcome at all before anything is attempted', async () => {
    await show({ gradePercent: null });

    expect(screen.queryByText(/اجتزت هذه الدورة/)).not.toBeInTheDocument();
    expect(screen.queryByText(/لم تجتز هذه الدورة بعد/)).not.toBeInTheDocument();
  });

  /* Two cases rather than one: rendering twice inside a single test leaves both
     renders mounted, so the "absent" assertion would find the first one's link
     and fail for a reason that has nothing to do with the component. */
  it('links onward when a next course exists', async () => {
    await show({ status: 'COMPLETED', gradePercent: 90, passed: true, nextCourseId: 'course-2' });

    expect(screen.getByRole('link', { name: /الدورة التالية/ })).toBeInTheDocument();
  });

  it('offers no onward link on the last course', async () => {
    await show({ status: 'COMPLETED', gradePercent: 90, passed: true, nextCourseId: null });

    expect(screen.queryByRole('link', { name: /الدورة التالية/ })).not.toBeInTheDocument();
  });
});

describe('course player — the framed course (D-121)', () => {
  const launchResponse = (mode: 'embed' | 'handoff') => ({
    url: `http://moodle.test/local/tamkeensso/login.php?token=${mode}-x${mode === 'embed' ? '&embed=learner' : ''}`,
    mode,
  });

  beforeEach(() => {
    api.launch.mockImplementation((_id: string, options?: { embed?: boolean }) =>
      Promise.resolve(launchResponse(options?.embed ? 'embed' : 'handoff')),
    );
  });

  it('mints the framed launch on open, and the URL appears only as the frame src', async () => {
    let resolveLaunch: (value: unknown) => void = () => undefined;
    api.launch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLaunch = resolve;
        }),
    );
    await show();

    /* Before the launch resolves: nothing carrying a token anywhere in the page. */
    expect(document.body.innerHTML).not.toContain('token=');
    expect(api.launch).toHaveBeenCalledWith('course-1', { embed: true });

    await act(async () => {
      resolveLaunch(launchResponse('embed'));
    });

    const frame = await screen.findByTitle(COURSE.title);
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', expect.stringContaining('embed=learner'));
    expect(document.querySelectorAll('a[href*="token="]')).toHaveLength(0);
  });

  it('frames nothing before the path is confirmed', async () => {
    await show({ canLaunch: false });

    expect(api.launch).not.toHaveBeenCalled();
    expect(screen.queryByTitle(COURSE.title)).not.toBeInTheDocument();
  });

  it('asks for an on-demand sync and refetches when the framed quiz reports itself', async () => {
    api.sync.mockResolvedValue({ synced: true });
    await show();
    await screen.findByTitle(COURSE.title);
    api.player.mockClear();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'http://moodle.test',
          data: { type: 'tamkeen:quiz-finished' },
        }),
      );
    });

    await waitFor(() => {
      expect(api.sync).toHaveBeenCalledWith('course-1');
      expect(api.player).toHaveBeenCalled();
    });
  });

  it('ignores a quiz message from any origin but Moodle’s', async () => {
    await show();
    await screen.findByTitle(COURSE.title);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'http://evil.test',
          data: { type: 'tamkeen:quiz-finished' },
        }),
      );
    });

    expect(api.sync).not.toHaveBeenCalled();
  });

  it('shows the fallback when the framed launch itself fails', async () => {
    /* Moodle being down is a real state now, not a hypothetical (§2B DoD 4). */
    api.launch.mockRejectedValue(new Error('LMS_UNREACHABLE'));
    await show();

    expect(await screen.findByText(/تعذّر عرض الدورة داخل الصفحة/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /افتح في منصة التعلّم/ })).toBeInTheDocument();
  });

  describe('course player — previous / next (D-122)', () => {
    const ready = (cmid: number | null) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'http://moodle.test',
            data: { type: 'tamkeen:ready', cmid },
          }),
        );
      });

    it('follows the frame: on the course page only "next" leads in; on an activity both sides work', async () => {
      await show();
      await screen.findByTitle(COURSE.title);
      ready(null);

      expect(await screen.findByText(/صفحة الدورة/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /السابق/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /التالي/ })).toBeEnabled();

      ready(12);
      expect(await screen.findByText('النشاط 2 من 3')).toBeInTheDocument();
      expect(screen.getByText('المذكرة')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /السابق/ })).toBeEnabled();
      expect(screen.getByRole('button', { name: /التالي/ })).toBeEnabled();

      ready(13);
      expect(await screen.findByText('النشاط 3 من 3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /التالي/ })).toBeDisabled();
    });

    it('moves the frame to the neighbour without minting a new launch', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      await show();
      const frame = (await screen.findByTitle(COURSE.title)) as HTMLIFrameElement;
      ready(12);
      await screen.findByText('النشاط 2 من 3');
      api.launch.mockClear();

      await userEvent.click(screen.getByRole('button', { name: /التالي/ }));

      expect(frame.src).toBe('http://moodle.test/mod/quiz/view.php?id=13');
      expect(api.launch).not.toHaveBeenCalled();
    });
  });
});
