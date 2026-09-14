import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminAssessmentDraft,
  AdminAssessmentOverview,
  AdminAssessmentQuestion,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.3 — one path's placement assessment (D-134).
 *
 * Three rules carry this file.
 *
 * **Copy-on-write, said before the edit starts.** D-049 freezes the placements
 * an earlier version produced, and that is only reassuring if the person about
 * to change the instrument is told — otherwise the safe-feeling move is to
 * never edit it, and the ministry never improves it. The notice sits above the
 * primary action and again in the publish dialog.
 *
 * **The answer key lives only here.** `isCorrect`, `marks` and the rung an item
 * targets are on the admin contract and on no learner-facing view; the API test
 * asserts the absence, and this file asserts the presence.
 *
 * **Publishing is refused, and explained, rather than merely disabled.** A bank
 * that cannot place anybody is a path nobody assigned to it can start, so the
 * blockers are listed beside the button that they disable.
 */

const api = vi.hoisted(() => ({
  assessmentOverview: vi.fn(),
  assessmentDraft: vi.fn(),
  createAssessmentDraft: vi.fn(),
  publishAssessment: vi.fn(),
  discardAssessmentDraft: vi.fn(),
  addDraftQuestion: vi.fn(),
  updateDraftQuestion: vi.fn(),
  removeDraftQuestion: vi.fn(),
  updateDraftOption: vi.fn(),
  reorderDraft: vi.fn(),
  setAssessmentBands: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');

  return { ...actual, adminApi: api };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ pathId: 'path-1' }),
}));

vi.mock('@/components/layout/admin-page', () => ({
  AdminPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const { default: AdminAssessmentPage } =
  await import('@/app/(admin)/admin/assessment/[pathId]/page');

const LEVELS = [
  { id: 'l1', name: 'تأسيسي', position: 1 },
  { id: 'l2', name: 'متقدم', position: 2 },
];

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    version: 1,
    status: 'ACTIVE' as const,
    title: 'تقييم تحديد المستوى',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    retiredAt: null,
    questionCount: 9,
    resultCount: 206,
    ...overrides,
  };
}

function question(index: number, levelId: string | null = 'l1'): AdminAssessmentQuestion {
  return {
    id: `q${index}`,
    key: `Q${index}`,
    text: `السؤال رقم ${index}`,
    order: index,
    marks: 2,
    levelId,
    topic: null,
    options: [
      { id: `q${index}-a`, key: 'A', label: 'الخيار الأول', order: 1, isCorrect: true },
      { id: `q${index}-b`, key: 'B', label: 'الخيار الثاني', order: 2, isCorrect: false },
    ],
  };
}

function overview(overrides: Partial<AdminAssessmentOverview> = {}): AdminAssessmentOverview {
  return {
    pathId: 'path-1',
    pathName: 'مسار تحليل البيانات',
    levels: LEVELS,
    active: version(),
    draft: null,
    history: [],
    ...overrides,
  };
}

function draft(overrides: Partial<AdminAssessmentDraft> = {}): AdminAssessmentDraft {
  return {
    id: 'd1',
    pathId: 'path-1',
    pathName: 'مسار تحليل البيانات',
    version: 2,
    title: 'تقييم تحديد المستوى',
    description: 'وصف',
    levels: LEVELS,
    questions: [question(1), question(2, 'l2')],
    bands: [
      { levelId: 'l1', minScore: 0, maxScore: 1 },
      { levelId: 'l2', minScore: 2, maxScore: 4 },
    ],
    bandsAreDefault: true,
    readiness: {
      blockers: [],
      warnings: [],
      maxScore: 4,
      levelsWithoutQuestion: [],
      bandsCoverRange: true,
    },
    basedOnVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.assessmentOverview.mockResolvedValue(overview());
  api.assessmentDraft.mockResolvedValue(draft());
  api.createAssessmentDraft.mockResolvedValue(draft());
});

/** Opens the editor from the overview, creating the draft on the way in. */
async function openEditor() {
  const user = userEvent.setup();
  renderWithProviders(<AdminAssessmentPage />);
  await user.click(await screen.findByRole('button', { name: 'بدء التعديل' }));
  await screen.findByText('مسودة الإصدار 2');
  return user;
}

describe('Admin assessment (§4C.3, D-134)', () => {
  it('asks for this path’s assessment, and names the path', async () => {
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByRole('heading', { name: 'مسار تحليل البيانات' })).toBeInTheDocument();
    expect(api.assessmentOverview).toHaveBeenCalledWith('path-1');
  });

  it('shows the live version with how many people it placed', async () => {
    /* The concrete form of D-049: these placements exist and an edit does not
       touch them. */
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText('الإصدار 1')).toBeInTheDocument();
    expect(screen.getByText('206')).toBeInTheDocument();
  });

  it('says an edit freezes existing placements, before the edit starts', async () => {
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText(/لا تتغيّر ولا يُعاد احتسابها/)).toBeInTheDocument();
  });

  it('offers a way in for a path with no assessment at all', async () => {
    /* A disabled button would leave the administrator with no way to fix the one
       case this screen exists for. */
    api.assessmentOverview.mockResolvedValue(overview({ active: null }));
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByRole('button', { name: 'إنشاء التقييم' })).toBeEnabled();
  });

  it('lists the retired versions, each with the placements it produced', async () => {
    api.assessmentOverview.mockResolvedValue(
      overview({
        history: [version({ id: 'v0', version: 0, status: 'RETIRED', resultCount: 40 })],
      }),
    );
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText('الإصدارات السابقة')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('goes straight into the editor when a draft is already open', async () => {
    /* Otherwise an administrator returning mid-edit meets a screen offering to
       start what they already started. */
    api.assessmentOverview.mockResolvedValue(
      overview({ draft: version({ id: 'v2', version: 2, status: 'DRAFT' }) }),
    );
    renderWithProviders(<AdminAssessmentPage />);

    expect(await screen.findByText('مسودة الإصدار 2')).toBeInTheDocument();
  });

  it('creates the draft on entering the editor when there is none', async () => {
    api.assessmentDraft.mockRejectedValue(new Error('no draft'));
    await openEditor();

    expect(api.createAssessmentDraft).toHaveBeenCalledWith('path-1');
  });
});

describe('Admin assessment — the answer key (§4C.3)', () => {
  it('shows what a question is worth and which rung it targets', async () => {
    /* Both are on the admin contract and on neither learner view. Marks and the
       target rung let a taker triage, which is what a placement test cannot
       afford. */
    await openEditor();

    expect(screen.getAllByLabelText('درجة السؤال')[0]).toHaveValue(2);
    expect(screen.getAllByLabelText('المستوى المستهدف')[0]).toHaveValue('l1');
    expect(screen.getAllByLabelText('المستوى المستهدف')[1]).toHaveValue('l2');
  });

  it('keeps the options folded away until asked for', async () => {
    /* Nine questions with four options each is a wall; the key is opened one
       item at a time. */
    const user = await openEditor();

    expect(screen.queryByLabelText('نص الخيار')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'عرض الخيارات' })[0]!);

    expect(screen.getAllByLabelText('نص الخيار').length).toBe(2);
  });

  it('records a new correct answer as one decision, not two', async () => {
    /* Exactly one option per question is correct, so marking one is what
       unmarks the other — the server enforces it and the screen asks for it
       once. */
    api.updateDraftOption.mockResolvedValue(draft());
    const user = await openEditor();

    await user.click(screen.getAllByRole('button', { name: 'عرض الخيارات' })[0]!);
    await user.click(screen.getAllByRole('radio')[1]!);

    await waitFor(() =>
      expect(api.updateDraftOption).toHaveBeenCalledWith('path-1', 'q1-b', { isCorrect: true }),
    );
  });

  it('changes the rung a question targets without a save step', async () => {
    api.updateDraftQuestion.mockResolvedValue(draft());
    const user = await openEditor();

    await user.selectOptions(screen.getAllByLabelText('المستوى المستهدف')[0]!, 'l2');

    await waitFor(() =>
      expect(api.updateDraftQuestion).toHaveBeenCalledWith('path-1', 'q1', { levelId: 'l2' }),
    );
  });

  it('offers save on a question only once its text or marks changed', async () => {
    const user = await openEditor();

    expect(screen.queryByRole('button', { name: 'حفظ النص' })).not.toBeInTheDocument();

    await user.type(screen.getAllByLabelText('نص السؤال')[0]!, '؟');

    expect(screen.getAllByRole('button', { name: 'حفظ النص' })).toHaveLength(1);
  });

  it('disables moving the first question up and the last one down', async () => {
    await openEditor();

    const up = screen.getAllByRole('button', { name: 'تحريك لأعلى' });
    const down = screen.getAllByRole('button', { name: 'تحريك لأسفل' });

    expect(up[0]).toBeDisabled();
    expect(down[down.length - 1]).toBeDisabled();
  });
});

describe('Admin assessment — readiness and publishing (§4C.3)', () => {
  it('refuses publication and lists why, rather than only disabling the button', async () => {
    api.assessmentDraft.mockResolvedValue(
      draft({
        readiness: {
          blockers: ['BANK_NO_CORRECT_OPTION', 'BANK_BANDS_NOT_A_PARTITION'],
          warnings: [],
          maxScore: 4,
          levelsWithoutQuestion: [],
          bandsCoverRange: false,
        },
      }),
    );
    await openEditor();

    expect(screen.getByText('يوجد سؤال بلا إجابة صحيحة محددة.')).toBeInTheDocument();
    expect(
      screen.getByText('نطاقات الدرجات لا تغطي كل الدرجات دون فجوة أو تداخل.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نشر الإصدار' })).toBeDisabled();
  });

  it('warns without blocking when a rung has no question aimed at it', async () => {
    /* Advisory, not a refusal: a bank can still place people, but nobody meant
       a rung to be untested. */
    api.assessmentDraft.mockResolvedValue(
      draft({
        readiness: {
          blockers: [],
          warnings: ['BANK_LEVEL_WITHOUT_QUESTION'],
          maxScore: 4,
          levelsWithoutQuestion: ['l2'],
          bandsCoverRange: true,
        },
      }),
    );
    await openEditor();

    expect(screen.getByText('يوجد مستوى بلا سؤال موجَّه إليه.')).toBeInTheDocument();
    /* Named, not counted: "one level" leaves the administrator to find which. */
    expect(screen.getAllByText('متقدم').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'نشر الإصدار' })).toBeEnabled();
  });

  it('states the highest attainable score, which the bands have to cover', async () => {
    await openEditor();

    expect(screen.getByText(/أعلى درجة ممكنة 4/)).toBeInTheDocument();
  });

  it('repeats the frozen-results notice at the moment of publishing', async () => {
    const user = await openEditor();

    await user.click(screen.getByRole('button', { name: 'نشر الإصدار' }));

    const dialog = within(document.querySelector('dialog')!);
    expect(dialog.getByText(/تبقى كما هي، ولا يُعاد احتسابها/)).toBeInTheDocument();
  });

  it('publishes only after the confirmation, and leaves the editor', async () => {
    api.publishAssessment.mockResolvedValue(undefined);
    const user = await openEditor();

    await user.click(screen.getByRole('button', { name: 'نشر الإصدار' }));
    expect(api.publishAssessment).not.toHaveBeenCalled();

    await user.click(
      within(document.querySelector('dialog')!).getByRole('button', { name: 'نشر' }),
    );

    await waitFor(() => expect(api.publishAssessment).toHaveBeenCalledWith('path-1'));
  });

  it('says what a discard costs, and what it does not', async () => {
    const user = await openEditor();

    await user.click(screen.getByRole('button', { name: 'حذف المسودة' }));

    expect(
      within(document.querySelector('dialog')!).getByText(/التقييم المعمول به لا يتأثر/),
    ).toBeInTheDocument();
  });

  it('shows the server’s refusal rather than assuming the disabled button was enough', async () => {
    const { ApiError } = await import('@/lib/api-client');
    api.publishAssessment.mockRejectedValue(new ApiError('BANK_NO_CORRECT_OPTION', 409));
    const user = await openEditor();

    await user.click(screen.getByRole('button', { name: 'نشر الإصدار' }));
    await user.click(
      within(document.querySelector('dialog')!).getByRole('button', { name: 'نشر' }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Admin assessment — the placement bands (§4C.3, D-134)', () => {
  it('shows one row per rung, each with its own two bounds', async () => {
    await openEditor();

    expect(screen.getByText('قاعدة تحديد المستوى')).toBeInTheDocument();
    expect(screen.getAllByLabelText('من')).toHaveLength(2);
    expect(screen.getAllByLabelText('إلى')).toHaveLength(2);
    expect(screen.getAllByLabelText('من')[0]).toHaveValue(0);
    expect(screen.getAllByLabelText('إلى')[1]).toHaveValue(4);
  });

  it('says the bands are the even split nobody has authored yet', async () => {
    /* A default that looked authored would let an administrator believe a
       decision was made about where the rungs fall. */
    await openEditor();

    expect(screen.getByText(/لا توجد نطاقات محفوظة/)).toBeInTheDocument();
    /* And no reset, because there is nothing to reset to. */
    expect(
      screen.queryByRole('button', { name: 'العودة إلى التقسيم المتساوي' }),
    ).not.toBeInTheDocument();
  });

  it('offers a way back to the even split once a rule has been authored', async () => {
    api.assessmentDraft.mockResolvedValue(draft({ bandsAreDefault: false }));
    await openEditor();

    expect(screen.getByRole('button', { name: 'العودة إلى التقسيم المتساوي' })).toBeInTheDocument();
  });

  it('refuses to save a table that leaves a score unplaceable', async () => {
    /* Validated with the same shared `checkBands` the server uses, so the
       screen and the refusal cannot disagree. */
    const user = await openEditor();

    const maxima = screen.getAllByLabelText('إلى');
    /* Ending the first rung at 0 while the second still starts at 2 leaves the
       score 1 on no rung at all. */
    await user.clear(maxima[0]!);
    await user.type(maxima[0]!, '0');

    expect(await screen.findByRole('alert')).toHaveTextContent('توجد درجات لا يغطيها أي نطاق.');
    expect(screen.getByRole('button', { name: 'حفظ النطاقات' })).toBeDisabled();
    expect(api.setAssessmentBands).not.toHaveBeenCalled();
  });

  it('saves the whole table at once, never one band', async () => {
    /* A partition is a single object: moving one boundary necessarily changes
       two rows, so a per-band save would force the administrator through states
       that are invalid by construction. */
    api.setAssessmentBands.mockResolvedValue(draft({ bandsAreDefault: false }));
    const user = await openEditor();

    const maxima = screen.getAllByLabelText('إلى');
    const minima = screen.getAllByLabelText('من');
    await user.clear(maxima[0]!);
    await user.type(maxima[0]!, '2');
    await user.clear(minima[1]!);
    await user.type(minima[1]!, '3');
    await user.click(screen.getByRole('button', { name: 'حفظ النطاقات' }));

    await waitFor(() =>
      expect(api.setAssessmentBands).toHaveBeenCalledWith('path-1', [
        { levelId: 'l1', minScore: 0, maxScore: 2 },
        { levelId: 'l2', minScore: 3, maxScore: 4 },
      ]),
    );
  });
});
