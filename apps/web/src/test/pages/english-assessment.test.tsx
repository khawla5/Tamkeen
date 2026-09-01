import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnglishAssessmentResultView, EnglishAssessmentView } from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * The English placement flow and its result (§4.13, D-123).
 *
 * The rules most easily lost in a refactor, and therefore the ones asserted
 * here: the answer key never reaches the page, the test cannot be started twice,
 * and the result page offers no retake.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  result: vi.fn(),
  submit: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api-client')>()),
  englishAssessmentApi: { get: mocks.get, result: mocks.result, submit: mocks.submit },
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

const { default: EnglishAssessmentPage } = await import('@/app/(portal)/english-assessment/page');
const { default: EnglishResultPage } =
  await import('@/app/(portal)/english-assessment/result/page');

/** Three questions is enough to exercise first / middle / last. */
const ASSESSMENT: EnglishAssessmentView = {
  id: 'english-1',
  version: 1,
  title: 'تقييم مستوى اللغة الإنجليزية',
  description: 'ثلاثون سؤالًا قصيرًا.',
  questions: [
    {
      id: 'q1',
      order: 1,
      text: 'She ___ to the office every morning.',
      options: [
        { id: 'q1-a', label: 'go', order: 1 },
        { id: 'q1-b', label: 'goes', order: 2 },
      ],
    },
    {
      id: 'q2',
      order: 2,
      text: 'Choose the closest meaning: "postpone".',
      options: [
        { id: 'q2-a', label: 'delay', order: 1 },
        { id: 'q2-b', label: 'cancel', order: 2 },
      ],
    },
    {
      id: 'q3',
      order: 3,
      text: 'If I had known, I ___ earlier.',
      options: [
        { id: 'q3-a', label: 'would have left', order: 1 },
        { id: 'q3-b', label: 'will leave', order: 2 },
      ],
    },
  ],
};

const RESULT: EnglishAssessmentResultView = {
  id: 'result-1',
  assessmentId: 'english-1',
  assessmentVersion: 1,
  completedAt: '2026-08-30T09:00:00.000Z',
  totalScore: 38,
  maxScore: 60,
  percent: 63.33333333333333,
  level: 'B2',
  canRetake: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.get.mockResolvedValue(ASSESSMENT);
  mocks.result.mockResolvedValue(null);
});

/** Answers the current question and advances. */
async function answerAndAdvance(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByLabelText(label));
  await user.click(screen.getByRole('button', { name: 'التالي' }));
}

describe('the English flow', () => {
  it('shows one question at a time with a progress indicator', async () => {
    renderWithProviders(<EnglishAssessmentPage />);

    expect(await screen.findByText(ASSESSMENT.questions[0]!.text)).toBeInTheDocument();
    expect(screen.queryByText(ASSESSMENT.questions[1]!.text)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('says the test is taken once, before the first answer', async () => {
    /* The fact that changes how somebody answers has to arrive before they
       start, not on the result page after it. */
    renderWithProviders(<EnglishAssessmentPage />);

    expect(await screen.findByText(/مرة واحدة فقط/)).toBeInTheDocument();
  });

  it('never renders which option is correct', async () => {
    /* The absence rule (D-034 applied to a proficiency test). The view type has
       no field for it, so this asserts the contract is actually what is
       rendered — a future "helpful" addition to the API would fail here. */
    const { container } = renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    expect(container.innerHTML).not.toMatch(/isCorrect|correct|marks/i);
  });

  it('refuses to advance past an unanswered question', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    await user.click(screen.getByRole('button', { name: 'التالي' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('اختر إجابة');
    expect(screen.getByText(ASSESSMENT.questions[0]!.text)).toBeInTheDocument();
  });

  it('walks forward and back without losing an answer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    await answerAndAdvance(user, 'goes');
    expect(await screen.findByText(ASSESSMENT.questions[1]!.text)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'السابق' }));

    expect(await screen.findByLabelText('goes')).toBeChecked();
  });

  it('submits every answer and goes to the result', async () => {
    const user = userEvent.setup();
    mocks.submit.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    await answerAndAdvance(user, 'goes');
    await answerAndAdvance(user, 'delay');
    await user.click(await screen.findByLabelText('would have left'));
    await user.click(screen.getByRole('button', { name: 'إنهاء التقييم' }));

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith({
        assessmentId: 'english-1',
        answers: [
          { questionId: 'q1', optionId: 'q1-b' },
          { questionId: 'q2', optionId: 'q2-a' },
          { questionId: 'q3', optionId: 'q3-a' },
        ],
      }),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/english-assessment/result'));
  });

  it('refreshes the portal before navigating, so the dashboard card agrees', async () => {
    const user = userEvent.setup();
    mocks.submit.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    await answerAndAdvance(user, 'goes');
    await answerAndAdvance(user, 'delay');
    await user.click(await screen.findByLabelText('would have left'));
    await user.click(screen.getByRole('button', { name: 'إنهاء التقييم' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('sends a learner who already has a result to it, rather than offering a second attempt', async () => {
    mocks.result.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishAssessmentPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/english-assessment/result'));
    expect(screen.queryByText(ASSESSMENT.questions[0]!.text)).not.toBeInTheDocument();
  });

  it('resumes a draft after the page is remounted', async () => {
    /* Thirty considered answers against one attempt: losing them to a reload
       would be losing the attempt. */
    const user = userEvent.setup();
    const first = renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);
    await answerAndAdvance(user, 'goes');
    await screen.findByText(ASSESSMENT.questions[1]!.text);
    first.unmount();

    renderWithProviders(<EnglishAssessmentPage />);

    expect(await screen.findByText(ASSESSMENT.questions[1]!.text)).toBeInTheDocument();
  });

  it('discards a draft whose bank has changed', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);
    await answerAndAdvance(user, 'goes');
    first.unmount();

    /* §4C.9 published an edit between the two visits. */
    mocks.get.mockResolvedValue({
      ...ASSESSMENT,
      id: 'english-2',
      questions: ASSESSMENT.questions.map((q) => ({ ...q, id: `${q.id}-v2` })),
    });
    renderWithProviders(<EnglishAssessmentPage />);

    expect(await screen.findByText(ASSESSMENT.questions[0]!.text)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows the API refusal in Arabic rather than a raw code', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocks.submit.mockRejectedValue(new ApiError('ENGLISH_ASSESSMENT_ALREADY_TAKEN', 409));
    renderWithProviders(<EnglishAssessmentPage />);
    await screen.findByText(ASSESSMENT.questions[0]!.text);

    await answerAndAdvance(user, 'goes');
    await answerAndAdvance(user, 'delay');
    await user.click(await screen.findByLabelText('would have left'));
    await user.click(screen.getByRole('button', { name: 'إنهاء التقييم' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('سبق أن أدّيت');
  });
});

describe('the English result', () => {
  it('names the level in Arabic and keeps the CEFR code', async () => {
    /* Both halves matter: the Arabic carries the meaning, the code is the token
       a training officer recognises. */
    mocks.result.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishResultPage />);

    expect(await screen.findByText('B2')).toBeInTheDocument();
    expect(screen.getByText('فوق المتوسط')).toBeInTheDocument();
  });

  it('shows the score as evidence for the level', async () => {
    mocks.result.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishResultPage />);

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '60');
  });

  it('offers no retake anywhere on the page', async () => {
    /* D-123. The absence is the assertion — a disabled control would be the
       redundant UI §3 forbids, and a working one would be a lie. */
    mocks.result.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishResultPage />);
    await screen.findByText('B2');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/إعادة/)).not.toBeInTheDocument();
    expect(screen.getByText(/نهائية ولا تُعاد/)).toBeInTheDocument();
  });

  it('says the level decides nothing about the training path', async () => {
    mocks.result.mockResolvedValue(RESULT);
    renderWithProviders(<EnglishResultPage />);

    expect(await screen.findByText(/لا تؤثّر على مسارك التدريبي/)).toBeInTheDocument();
  });

  it('offers the test when there is no result yet', async () => {
    mocks.result.mockResolvedValue(null);
    renderWithProviders(<EnglishResultPage />);

    expect(await screen.findByText('لم تؤدِّ تقييم اللغة بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ابدأ تقييم اللغة' })).toHaveAttribute(
      'href',
      '/english-assessment',
    );
  });

  it('offers a retry on a failed load rather than a blank page', async () => {
    mocks.result.mockRejectedValue(new Error('network'));
    renderWithProviders(<EnglishResultPage />);

    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});
