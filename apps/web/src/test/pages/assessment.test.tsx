import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssessmentView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * A path's placement assessment (§4.3, D-134): one question at a time, progress,
 * back/next, and — the rule most easily lost in a refactor — **no score dump** on
 * finish. The learner is moved to the path, where the rung they were placed on
 * and the courses it opens are the answer.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  submit: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

/* Only the endpoint functions are replaced. `ApiError` stays real, because
   `useErrorMessage` narrows on it — a stubbed class would make every error fall
   through to the generic message and the assertion below would prove nothing. */
vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  assessmentApi: { get: mocks.get, submit: mocks.submit },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ pathId: 'path-1' }),
}));

vi.mock('@/components/layout/portal-provider', () => ({
  usePortal: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/layout/portal-page', () => ({
  PortalPage: ({
    title,
    chrome,
    children,
  }: {
    title: string;
    chrome?: 'nav' | 'bare';
    children: ReactNode;
  }) => (
    <div data-chrome={chrome ?? 'nav'}>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AssessmentPage } = await import('@/app/(portal)/paths/[pathId]/assessment/page');
const { ApiError } = await import('@/lib/api-client');

/**
 * Three questions is enough to exercise first / middle / last.
 *
 * Note what is *not* here: no option says whether it is correct, and no question
 * says what it is worth or which rung it targets. That absence is the contract
 * (`AssessmentView`), and a fixture carrying the answer key would let the page
 * start rendering it without a single test failing.
 */
const ASSESSMENT: AssessmentView = {
  id: 'assessment-1',
  pathId: 'path-1',
  pathName: 'مسار تحليل البيانات',
  version: 1,
  title: 'تقييم تحديد المستوى',
  description: 'يحدّد هذا التقييم المستوى الذي تبدأ منه.',
  questions: [1, 2, 3].map((n) => ({
    id: `q${n}`,
    order: n,
    text: `السؤال رقم ${n}`,
    options: [
      { id: `q${n}-a`, label: `الخيار الأول ${n}`, order: 1 },
      { id: `q${n}-b`, label: `الخيار الثاني ${n}`, order: 2 },
    ],
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.get.mockResolvedValue(ASSESSMENT);
  mocks.submit.mockResolvedValue({
    id: 'result-1',
    assessmentId: 'assessment-1',
    assessmentVersion: 1,
    pathId: 'path-1',
    pathName: 'مسار تحليل البيانات',
    completedAt: '2026-09-01T00:00:00.000Z',
    totalScore: 38,
    maxScore: 60,
    percent: 63,
    level: { id: 'level-2', name: 'متقدم', position: 2 },
    levelCount: 3,
    canRetake: false,
  });
});

async function renderFlow() {
  renderWithProviders(<AssessmentPage />);
  await screen.findByText('السؤال رقم 1');
}

describe('the placement assessment', () => {
  it('asks for the path it belongs to, never a global instrument', async () => {
    await renderFlow();

    expect(mocks.get).toHaveBeenCalledWith('path-1');
  });

  it('shows one question at a time with a progress indicator', async () => {
    await renderFlow();

    expect(screen.getByText('السؤال رقم 1')).toBeInTheDocument();
    expect(screen.queryByText('السؤال رقم 2')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('السؤال 1 من 3')).toBeInTheDocument();
  });

  it('refuses to advance until the question is answered', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('اختر إجابة للمتابعة.');
    expect(screen.getByText('السؤال رقم 1')).toBeInTheDocument();
  });

  it('advances once an option is chosen', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByLabelText('الخيار الثاني 1'));
    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(await screen.findByText('السؤال رقم 2')).toBeInTheDocument();
    expect(screen.getByText('السؤال 2 من 3')).toBeInTheDocument();
  });

  it('keeps the earlier answer when going back', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByLabelText('الخيار الثاني 1'));
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await screen.findByText('السؤال رقم 2');
    await user.click(screen.getByRole('button', { name: 'السابق' }));

    expect(await screen.findByText('السؤال رقم 1')).toBeInTheDocument();
    expect(screen.getByLabelText('الخيار الثاني 1')).toBeChecked();
  });

  it('disables back on the first question', async () => {
    await renderFlow();

    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
  });

  it('submits every answer and goes to the path, with no score shown', async () => {
    const user = userEvent.setup();
    await renderFlow();

    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByLabelText(`الخيار الثاني ${index + 1}`));
      await user.click(
        screen.getByRole('button', { name: index === 2 ? 'إنهاء التقييم' : 'التالي' }),
      );
    }

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));

    expect(mocks.submit).toHaveBeenCalledWith('path-1', {
      assessmentId: 'assessment-1',
      answers: [
        { questionId: 'q1', optionId: 'q1-b' },
        { questionId: 'q2', optionId: 'q2-b' },
        { questionId: 'q3', optionId: 'q3-b' },
      ],
    });

    /* §4.3: "No score dump." The learner lands on the path, where the rung and
       the courses it opens explain the result, and the nav state is refreshed
       first so the two agree. */
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/paths/path-1'));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/38/)).not.toBeInTheDocument();
  });

  it('shows the Arabic error and stays put when submission fails', async () => {
    const user = userEvent.setup();
    mocks.submit.mockRejectedValue(new ApiError('ASSESSMENT_ALREADY_TAKEN', 409));

    await renderFlow();

    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByLabelText(`الخيار الثاني ${index + 1}`));
      await user.click(
        screen.getByRole('button', { name: index === 2 ? 'إنهاء التقييم' : 'التالي' }),
      );
    }

    expect(await screen.findByRole('alert')).toHaveTextContent('سبق أن أدّيت هذا التقييم.');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('sends someone who was never assigned this path home, not to an error card', async () => {
    /* A retryable error screen would suggest something is broken; the wait is
       the dashboard's to explain. */
    mocks.get.mockRejectedValue(new ApiError('PATH_NOT_ASSIGNED', 403));

    renderWithProviders(<AssessmentPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('button', { name: /إعادة المحاولة/ })).not.toBeInTheDocument();
  });

  it('reports an empty question bank as an empty state, not a blank page', async () => {
    mocks.get.mockResolvedValue({ ...ASSESSMENT, questions: [] });

    renderWithProviders(<AssessmentPage />);

    expect(await screen.findByText('التقييم غير متاح حاليًا')).toBeInTheDocument();
  });

  it('offers a retry when the bank cannot be loaded', async () => {
    mocks.get.mockRejectedValue(new Error('boom'));

    renderWithProviders(<AssessmentPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل البيانات');
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });

  describe('shell and drafts (TAM-107, D-073)', () => {
    it('renders inside the normal shell — the sidebar stays reachable mid-assessment', async () => {
      const { container } = renderWithProviders(<AssessmentPage />);
      await screen.findByText('السؤال رقم 1');

      expect(container.querySelector('[data-chrome]')).toHaveAttribute('data-chrome', 'nav');
    });

    it('resumes where the learner left off after leaving and coming back', async () => {
      const user = userEvent.setup();
      const first = renderWithProviders(<AssessmentPage />);
      await screen.findByText('السؤال رقم 1');

      await user.click(screen.getByLabelText('الخيار الثاني 1'));
      await user.click(screen.getByRole('button', { name: 'التالي' }));
      await user.click(screen.getByLabelText('الخيار الأول 2'));
      await user.click(screen.getByRole('button', { name: 'التالي' }));
      await screen.findByText('السؤال رقم 3');

      first.unmount();
      renderWithProviders(<AssessmentPage />);

      expect(await screen.findByText('السؤال رقم 3')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'السابق' }));
      expect(screen.getByLabelText('الخيار الأول 2')).toBeChecked();
    });

    it('keys the draft by path, so two assigned paths do not share one', async () => {
      /* A single key would resume the wrong bank the moment a learner holds two
         assignments — D-134 allows exactly that. */
      const user = userEvent.setup();
      renderWithProviders(<AssessmentPage />);
      await screen.findByText('السؤال رقم 1');

      await user.click(screen.getByLabelText('الخيار الثاني 1'));
      await user.click(screen.getByRole('button', { name: 'التالي' }));
      await screen.findByText('السؤال رقم 2');

      expect(window.sessionStorage.getItem('tamkeen:assessment-draft:path-1')).not.toBeNull();
    });

    it('clears the draft on submit', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AssessmentPage />);
      await screen.findByText('السؤال رقم 1');

      for (let i = 0; i < 3; i += 1) {
        await user.click(screen.getByLabelText(`الخيار الثاني ${i + 1}`));
        await user.click(
          screen.getByRole('button', { name: i === 2 ? 'إنهاء التقييم' : 'التالي' }),
        );
      }
      await waitFor(() => expect(mocks.submit).toHaveBeenCalled());

      expect(window.sessionStorage.length).toBe(0);
    });

    it('discards a draft that no longer matches the question bank', async () => {
      window.sessionStorage.setItem(
        'tamkeen:assessment-draft:path-1',
        JSON.stringify({
          assessmentId: 'assessment-1',
          questionIds: ['old-1', 'old-2'],
          index: 1,
          answers: { 'old-1': 'x' },
        }),
      );
      renderWithProviders(<AssessmentPage />);

      expect(await screen.findByText('السؤال رقم 1')).toBeInTheDocument();
    });
  });
});
