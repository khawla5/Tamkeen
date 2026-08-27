import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityCourseDetail } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4B.4 — Course Content, and its fast path back from a live edit in the
 * frame (TAM-133).
 *
 * What matters here is not the read-back rendering — TAM-134's own tests
 * already cover the guide link, and the values are the same shape the manage
 * screen already asserts. What TAM-133 actually added is: the launch opens
 * *inline*, framed, rather than navigating away; the frame's own
 * `tamkeen:content-changed` message and the manual «تحديث» both call
 * `resync`, never a plain re-read; and a message from anywhere but the
 * frame's own origin is ignored.
 */

const api = vi.hoisted(() => ({
  getCourse: vi.fn(),
  authorLaunch: vi.fn(),
  resync: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')),
  entityApi: {
    getCourse: api.getCourse,
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
  paths: [],
  objectives: [],
  prerequisites: null,
  riasecLetters: [],
  content: { activityCount: 4, hasQuiz: true, completionConfigured: true },
  publishBlockers: [],
  learnersHolding: 0,
  availablePaths: [],
  enrolledCount: 0,
  completionRate: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getCourse.mockResolvedValue(detail());
});

describe('course content', () => {
  it('shows the course’s own name in the body', async () => {
    renderWithProviders(<CourseContentPage />);

    expect(await screen.findByText('إدارة المخاطر')).toBeInTheDocument();
  });

  it('reports the read-back it was given', async () => {
    renderWithProviders(<CourseContentPage />);

    await screen.findByText('إدارة المخاطر');
    /* hasQuiz and completionConfigured are both true in the fixture, so «نعم»
       legitimately appears twice — once per row. */
    expect(screen.getAllByText('نعم')).toHaveLength(2);
  });

  describe('launching the frame (D-045, TAM-129, TAM-133)', () => {
    it('never renders the handoff URL into the page', async () => {
      renderWithProviders(<CourseContentPage />);

      await screen.findByRole('button', { name: 'حرّر المحتوى في منصة التعلّم' });

      expect(document.body.innerHTML).not.toContain('token=');
      expect(api.authorLaunch).not.toHaveBeenCalled();
    });

    it('asks for an embedded launch, and opens it inline rather than navigating away', async () => {
      const user = userEvent.setup();
      api.authorLaunch.mockResolvedValue({
        url: 'http://moodle.test/local/tamkeensso/login.php?embed=author',
        mode: 'embed',
      });

      renderWithProviders(<CourseContentPage />);
      await user.click(await screen.findByRole('button', { name: 'حرّر المحتوى في منصة التعلّم' }));

      await waitFor(() => {
        expect(api.authorLaunch).toHaveBeenCalledWith('course-1', { embed: true });
      });

      const frame = await screen.findByTitle('تحرير المحتوى');
      expect(frame.tagName).toBe('IFRAME');
      expect(frame).toHaveAttribute(
        'src',
        'http://moodle.test/local/tamkeensso/login.php?embed=author',
      );

      /* The launch button becomes a close control once the frame is open —
         there is no second use for the original button while it is showing. */
      expect(
        screen.queryByRole('button', { name: 'حرّر المحتوى في منصة التعلّم' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'إنهاء التأليف' })).toBeInTheDocument();
    });
  });

  describe('the frame’s own edit signal (§4B.4, TAM-133)', () => {
    async function openFrame(user: ReturnType<typeof userEvent.setup>) {
      api.authorLaunch.mockResolvedValue({
        url: 'http://moodle.test/local/tamkeensso/login.php?embed=author',
        mode: 'embed',
      });

      renderWithProviders(<CourseContentPage />);
      await user.click(await screen.findByRole('button', { name: 'حرّر المحتوى في منصة التعلّم' }));
      await screen.findByTitle('تحرير المحتوى');
    }

    it('resyncs when the frame posts tamkeen:content-changed from its own origin', async () => {
      const user = userEvent.setup();
      await openFrame(user);

      api.resync.mockResolvedValue(detail({ title: 'إدارة المخاطر — بعد التعديل' }));
      const callsBefore = api.getCourse.mock.calls.length;

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'http://moodle.test',
            data: { type: 'tamkeen:content-changed' },
          }),
        );
      });

      await waitFor(() => {
        expect(api.resync).toHaveBeenCalledWith('course-1');
      });
      expect(await screen.findByText('إدارة المخاطر — بعد التعديل')).toBeInTheDocument();
      /* Applied from the resync response itself — no second request. */
      expect(api.getCourse.mock.calls.length).toBe(callsBefore);
    });

    it('ignores the same message from a different origin', async () => {
      const user = userEvent.setup();
      await openFrame(user);

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://attacker.example',
            data: { type: 'tamkeen:content-changed' },
          }),
        );
      });

      /* Give any (incorrect) handling a turn to run before asserting nothing
         happened. */
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(api.resync).not.toHaveBeenCalled();
    });

    it('ignores an unrelated message type from the right origin', async () => {
      const user = userEvent.setup();
      await openFrame(user);

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'http://moodle.test',
            data: { type: 'tamkeen:ready' },
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(api.resync).not.toHaveBeenCalled();
    });
  });

  describe('the manual «تحديث»', () => {
    it('calls resync, not a plain re-read', async () => {
      const user = userEvent.setup();
      api.resync.mockResolvedValue(detail({ title: 'بعد التحديث اليدوي' }));

      renderWithProviders(<CourseContentPage />);
      await user.click(await screen.findByRole('button', { name: 'تحديث' }));

      await waitFor(() => {
        expect(api.resync).toHaveBeenCalledWith('course-1');
      });
      expect(await screen.findByText('بعد التحديث اليدوي')).toBeInTheDocument();
    });

    it('reports a failed resync without losing the course', async () => {
      const user = userEvent.setup();
      api.resync.mockRejectedValue(new Error('network'));

      renderWithProviders(<CourseContentPage />);
      await user.click(await screen.findByRole('button', { name: 'تحديث' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('إدارة المخاطر')).toBeInTheDocument();
    });
  });
});
