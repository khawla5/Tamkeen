import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminAssessmentDraft,
  AdminAssessmentOverview,
  AdminAssessmentQuestion,
  RiasecLetter,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.3 — assessment management.
 *
 * Two things carry this file.
 *
 * **The frozen-results notice appears before the decision, not after it.** D-049
 * guarantees that editing does not change anybody's recorded result, and that
 * guarantee is only useful if the person about to edit knows it — otherwise the
 * safe-feeling move is never to improve the assessment at all.
 *
 * **A blocker and a warning must not look alike.** One is a refusal the server
 * will repeat; the other is a judgement the administrator is allowed to make.
 * Rendering them the same way teaches that both can be clicked past, which is
 * exactly wrong for the one that skews every Holland Code the version produces.
 */

const api = vi.hoisted(() => ({
  assessmentOverview: vi.fn(),
  assessmentDraft: vi.fn(),
  createAssessmentDraft: vi.fn(),
  discardAssessmentDraft: vi.fn(),
  addDraftQuestion: vi.fn(),
  updateDraftQuestion: vi.fn(),
  removeDraftQuestion: vi.fn(),
  reorderDraft: vi.fn(),
  updateDraftOption: vi.fn(),
  publishAssessment: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminAssessmentPage } = await import('@/app/(admin)/admin/assessment/riasec/page');

function question(letter: RiasecLetter, index: number): AdminAssessmentQuestion {
  return {
    id: `q-${letter}${index}`,
    key: `${letter}${index}`,
    text: `عبارة عن البُعد ${letter} رقم ${index}`,
    order: index,
    options: [0, 1, 2, 3, 4].map((points) => ({
      id: `o-${letter}${index}-${points}`,
      key: `l${points}`,
      label: `مستوى ${points}`,
      order: points + 1,
      weights: { [letter]: points } as Partial<Record<RiasecLetter, number>>,
    })),
  };
}

const BALANCED = {
  blockers: [],
  warnings: [],
  attainable: { R: 20, I: 20, A: 20, S: 20, E: 20, C: 20 },
  balanced: true,
};

function draft(overrides: Partial<AdminAssessmentDraft> = {}): AdminAssessmentDraft {
  return {
    id: 'draft-1',
    key: 'riasec-core',
    version: 2,
    title: 'تقييم الميول المهنية',
    description: 'وصف',
    questions: [question('R', 1), question('I', 2), question('A', 3)],
    readiness: BALANCED,
    basedOnVersion: 1,
    ...overrides,
  };
}

const OVERVIEW: AdminAssessmentOverview = {
  active: {
    id: 'v1',
    version: 1,
    status: 'ACTIVE',
    title: 'تقييم الميول المهنية',
    effectiveFrom: '2026-08-01T00:00:00.000Z',
    retiredAt: null,
    questionCount: 30,
    resultCount: 120,
  },
  draft: null,
  history: [],
};

describe('Admin assessment (§4C.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.assessmentOverview.mockResolvedValue(OVERVIEW);
    api.assessmentDraft.mockResolvedValue(draft());
    api.createAssessmentDraft.mockResolvedValue(draft());
  });

  it('shows the loading state before the overview arrives', () => {
    api.assessmentOverview.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AdminAssessmentPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when the overview fails', async () => {
    api.assessmentOverview.mockRejectedValue(new Error('down'));
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByRole('button', { name: /إعادة/ })).toBeInTheDocument();
  });

  it('names the version in force, since when, and how many it scored', async () => {
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText('الإصدار 1')).toBeInTheDocument();
    expect(screen.getByText('المعمول به')).toBeInTheDocument();
    /* The concrete form of D-049: these results exist, and an edit will not
       touch them. */
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('says results are frozen before the edit starts, not after', async () => {
    renderWithProviders(<AdminAssessmentPage />);

    const notice = await screen.findByText(/نتائج من أكملوا التقييم لا تتغيّر/);
    expect(notice).toBeInTheDocument();
  });

  it('explains an assessment that does not exist rather than rendering an empty card', async () => {
    api.assessmentOverview.mockResolvedValue({ ...OVERVIEW, active: null });
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText(/لا يوجد تقييم مفعّل/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بدء التعديل' })).toBeDisabled();
  });

  it('opens the editor by creating a draft when none exists', async () => {
    const user = userEvent.setup();
    api.assessmentDraft.mockRejectedValue(new Error('no draft'));

    renderWithProviders(<AdminAssessmentPage />);
    await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

    /* One action, not two: §3 asks a primary action to do the thing it says. */
    await waitFor(() => expect(api.createAssessmentDraft).toHaveBeenCalled());
    expect(await screen.findByText('مسودة الإصدار 2')).toBeInTheDocument();
  });

  it('offers no back control, and two exits that actually leave', async () => {
    const user = userEvent.setup();
    api.assessmentDraft.mockRejectedValue(new Error('no draft'));

    renderWithProviders(<AdminAssessmentPage />);
    await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
    await screen.findByText('مسودة الإصدار 2');

    /* «رجوع» could not work: the page routes to the editor whenever a draft
       exists, and entering created one — so it returned to the overview for as
       long as the refetch took and landed back here. Publishing and discarding
       are the exits that do what they say. */
    expect(screen.queryByRole('button', { name: 'رجوع' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نشر الإصدار' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف المسودة' })).toBeInTheDocument();
  });

  it('goes straight to an existing draft rather than starting a second', async () => {
    api.assessmentOverview.mockResolvedValue({
      ...OVERVIEW,
      draft: { ...OVERVIEW.active!, id: 'd', version: 2, status: 'DRAFT', effectiveFrom: null },
    });

    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText('مسودة الإصدار 2')).toBeInTheDocument();
    expect(api.createAssessmentDraft).not.toHaveBeenCalled();
  });

  describe('the readiness panel', () => {
    it('confirms a balanced bank in words', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

      expect(await screen.findByText(/البنك متوازن وجاهز للنشر/)).toBeInTheDocument();
    });

    it('blocks publishing an unbalanced bank and says which dimensions differ', async () => {
      const user = userEvent.setup();
      api.assessmentDraft.mockResolvedValue(
        draft({
          readiness: {
            blockers: ['BANK_UNBALANCED'],
            warnings: [],
            attainable: { R: 20, I: 20, A: 20, S: 24, E: 20, C: 20 },
            balanced: false,
          },
        }),
      );

      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/الأبعاد الستة غير متساوية/);
      /* Naming the attainable maxima is what turns "something is wrong" into
         "even up the Social dimension". */
      expect(within(alert).getByText('24')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: 'نشر الإصدار' })).toBeDisabled();
    });

    it('lets a warning through, and says so', async () => {
      const user = userEvent.setup();
      api.assessmentDraft.mockResolvedValue(
        draft({
          readiness: { ...BALANCED, warnings: ['BANK_ADJACENT_DIMENSIONS'] },
        }),
      );

      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

      expect(await screen.findByText(/يتتابع سؤالان أو أكثر/)).toBeInTheDocument();
      expect(screen.getByText(/هذا تنبيه وليس منعًا/)).toBeInTheDocument();
      /* The difference that matters: a warning does not disable publishing. */
      expect(screen.getByRole('button', { name: 'نشر الإصدار' })).toBeEnabled();
    });

    it('renders a blocker as an alert and a warning as ordinary content', async () => {
      const user = userEvent.setup();
      api.assessmentDraft.mockResolvedValue(
        draft({ readiness: { ...BALANCED, warnings: ['BANK_ADJACENT_DIMENSIONS'] } }),
      );

      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await screen.findByText(/يتتابع سؤالان أو أكثر/);

      /* A warning is not announced assertively: it is not an error, and
         interrupting a screen-reader user for a judgement they are allowed to
         make is the wrong use of a live region. */
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('offers save only once the text has changed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

      const texts = await screen.findAllByLabelText('نص السؤال');
      expect(screen.queryByRole('button', { name: 'حفظ النص' })).not.toBeInTheDocument();

      await user.type(texts[0]!, 'ز');

      expect(await screen.findByRole('button', { name: 'حفظ النص' })).toBeInTheDocument();
    });

    it('asks for a dimension when adding a question, not for six weights', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await user.click(await screen.findByRole('button', { name: 'إضافة سؤال' }));

      /* Growing a balanced bank means adding one question per letter. Making
         that the easy path is how the editor helps rather than only reports. */
      expect(await screen.findByLabelText('البُعد')).toBeInTheDocument();
      expect(screen.getByText(/يأخذ السؤال الجديد نفس درجات الموافقة/)).toBeInTheDocument();
    });

    it('keeps the weight editor behind a click, so the common case stays legible', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await screen.findByText('مسودة الإصدار 2');

      expect(screen.queryByLabelText('نص الخيار')).not.toBeInTheDocument();

      await user.click(screen.getAllByRole('button', { name: 'عرض الأوزان' })[0]!);

      expect(await screen.findAllByLabelText('نص الخيار')).not.toHaveLength(0);
    });

    it('disables moving the first question up and the last one down', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));

      const up = await screen.findAllByRole('button', { name: 'تحريك لأعلى' });
      const down = screen.getAllByRole('button', { name: 'تحريك لأسفل' });

      expect(up[0]).toBeDisabled();
      expect(down.at(-1)).toBeDisabled();
    });
  });

  describe('publishing', () => {
    it('states the frozen-results rule again in the confirmation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await user.click(await screen.findByRole('button', { name: 'نشر الإصدار' }));

      /* The most consequential action in the portal. It is said once on the
         overview and again here, because these are different moments. */
      expect(await screen.findByText(/لا يُعاد احتسابها/)).toBeInTheDocument();
      expect(screen.getByText(/سيصبح الإصدار 2 هو التقييم المعمول به/)).toBeInTheDocument();
    });

    it('shows the server’s refusal rather than assuming the client check was enough', async () => {
      const user = userEvent.setup();
      const { ApiError } = await import('@/lib/api-client');
      api.publishAssessment.mockRejectedValue(new ApiError('BANK_UNBALANCED', 409));

      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await user.click(await screen.findByRole('button', { name: 'نشر الإصدار' }));
      /* `name` is a substring match by default, and 'نشر' also matches 'نشر
         الإصدار'. An anchored expression names the confirm button only. */
      await user.click(await screen.findByRole('button', { name: /^نشر$/ }));

      /* The disabled button is a courtesy; the rule is the server's, and a
         draft edited in another tab can still be refused here. */
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/غير متساوية/));
    });

    it('warns that discarding loses the work and spares the live version', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AdminAssessmentPage />);
      await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
      await user.click(await screen.findByRole('button', { name: 'حذف المسودة' }));

      expect(await screen.findByText(/ستفقد كل التعديلات غير المنشورة/)).toBeInTheDocument();
      expect(screen.getByText(/التقييم المعمول به لا يتأثر/)).toBeInTheDocument();
    });
  });
});
