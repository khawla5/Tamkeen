import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
}));

vi.mock('@/lib/api-client', () => ({
  coursesApi: {
    player: api.player,
    launch: api.launch,
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

    expect(screen.getByRole('button', { name: /ابدأ الدورة/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تابع الدورة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /راجع الدورة/ })).not.toBeInTheDocument();
  });

  it('offers "resume" once the course is in progress', async () => {
    await show({ status: 'IN_PROGRESS', gradePercent: 40 });

    expect(screen.getByRole('button', { name: /تابع الدورة/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ابدأ الدورة/ })).not.toBeInTheDocument();
  });

  it('offers "review" once it is passed', async () => {
    await show({ status: 'COMPLETED', gradePercent: 88, passed: true });

    expect(screen.getByRole('button', { name: /راجع الدورة/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ابدأ الدورة/ })).not.toBeInTheDocument();
  });

  it('offers no launch at all before the path is confirmed', async () => {
    /* Nothing is enrolled until the commitment gate (§4.5), so an enabled button
       would be one that cannot do what it says. */
    await show({ canLaunch: false });

    expect(screen.queryByRole('button', { name: /ابدأ الدورة/ })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /تابع الدورة/ })).toBeInTheDocument();
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

describe('course player — the handoff', () => {
  it('does not put the launch URL in the page', async () => {
    /* The whole point of minting per click: a URL in the markup would be a
       live credential sitting in the DOM, in view-source and in any cached
       copy of the page, from the moment it rendered. */
    await show();

    expect(api.launch).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('tamkeensso');
  });

  it('fetches the URL only when the learner clicks', async () => {
    await show();

    await userEvent.click(screen.getByRole('button', { name: /ابدأ الدورة/ }));

    await waitFor(() => {
      expect(api.launch).toHaveBeenCalledWith('course-1');
    });
  });

  it('shows an Arabic error and stays put when the handoff fails', async () => {
    /* Moodle being down is a real state now, not a hypothetical (§2B DoD 4). */
    api.launch.mockRejectedValue(new Error('LMS_UNREACHABLE'));
    await show();

    await userEvent.click(screen.getByRole('button', { name: /ابدأ الدورة/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/تعذّر فتح الدورة/);
  });
});
