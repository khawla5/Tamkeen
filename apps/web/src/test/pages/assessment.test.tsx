import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssessmentView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The assessment flow (§4.3): one question at a time, progress, back/next, and
 * — the rule most easily lost in a refactor — **no score dump** on finish.
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

const { default: AssessmentPage } = await import('@/app/(portal)/assessment/page');
const { ApiError } = await import('@/lib/api-client');

/** Three questions is enough to exercise first / middle / last. */
const ASSESSMENT: AssessmentView = {
  id: 'assessment-1',
  version: 1,
  title: 'تقييم الميول المهنية',
  questions: [1, 2, 3].map((n) => ({
    id: `q${n}`,
    order: n,
    text: `العبارة رقم ${n}`,
    options: [
      { id: `q${n}-l0`, label: 'لا ينطبق عليّ إطلاقًا', order: 1 },
      { id: `q${n}-l4`, label: 'ينطبق عليّ تمامًا', order: 2 },
    ],
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(ASSESSMENT);
  mocks.submit.mockResolvedValue({ id: 'result-1', codeString: 'SIA' });
});

async function renderFlow() {
  renderWithProviders(<AssessmentPage />);
  await screen.findByText('العبارة رقم 1');
}

describe('assessment flow', () => {
  it('shows one question at a time with a progress indicator', async () => {
    await renderFlow();

    expect(screen.getByText('العبارة رقم 1')).toBeInTheDocument();
    expect(screen.queryByText('العبارة رقم 2')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('السؤال 1 من 3')).toBeInTheDocument();
  });

  it('refuses to advance until the question is answered', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('اختر إجابة للمتابعة.');
    expect(screen.getByText('العبارة رقم 1')).toBeInTheDocument();
  });

  it('advances once an option is chosen', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByLabelText('ينطبق عليّ تمامًا'));
    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(await screen.findByText('العبارة رقم 2')).toBeInTheDocument();
    expect(screen.getByText('السؤال 2 من 3')).toBeInTheDocument();
  });

  it('keeps the earlier answer when going back', async () => {
    const user = userEvent.setup();
    await renderFlow();

    await user.click(screen.getByLabelText('ينطبق عليّ تمامًا'));
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    await screen.findByText('العبارة رقم 2');
    await user.click(screen.getByRole('button', { name: 'السابق' }));

    expect(await screen.findByText('العبارة رقم 1')).toBeInTheDocument();
    expect(screen.getByLabelText('ينطبق عليّ تمامًا')).toBeChecked();
  });

  it('disables back on the first question', async () => {
    await renderFlow();

    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
  });

  it('submits every answer and goes straight to results, with no score shown', async () => {
    const user = userEvent.setup();
    await renderFlow();

    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByLabelText('ينطبق عليّ تمامًا'));
      await user.click(
        screen.getByRole('button', { name: index === 2 ? 'إنهاء التقييم' : 'التالي' }),
      );
    }

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));

    expect(mocks.submit).toHaveBeenCalledWith({
      assessmentId: 'assessment-1',
      answers: [
        { questionId: 'q1', optionId: 'q1-l4' },
        { questionId: 'q2', optionId: 'q2-l4' },
        { questionId: 'q3', optionId: 'q3-l4' },
      ],
    });

    /* §4.3: "No score dump." The user is moved to Results rather than shown a
       tally, and the nav state is refreshed first so the two agree. */
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/results'));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/SIA/)).not.toBeInTheDocument();
  });

  it('shows the Arabic error and stays put when submission fails', async () => {
    const user = userEvent.setup();
    mocks.submit.mockRejectedValue(new ApiError('ASSESSMENT_LOCKED', 409));

    await renderFlow();

    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByLabelText('ينطبق عليّ تمامًا'));
      await user.click(
        screen.getByRole('button', { name: index === 2 ? 'إنهاء التقييم' : 'التالي' }),
      );
    }

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'لا يمكن إعادة التقييم بعد تأكيد المسار.',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
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
});
