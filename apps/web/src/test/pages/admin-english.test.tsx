import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CEFR_LEVELS,
  type AdminEnglishDraft,
  type AdminEnglishOverview,
  type AdminEnglishQuestion,
  type CefrBand,
  type CefrLevel,
} from '@tamkeen/types';

import { renderWithProviders } from '@/test/render';

/**
 * §4C.9 — English placement management (D-124, D-125).
 *
 * Three things carry this file.
 *
 * **The band table is the configurable scoring rule**, so the editor's job is to
 * make an invalid one hard to produce and an invalid one impossible to publish.
 * The five-ceiling shape is asserted directly: gaps and overlaps are not
 * representable through this screen.
 *
 * **A blocker and a warning must not look alike** — the same rule §4C.3's tests
 * carry, for the same reason.
 *
 * **This screen is not the RIASEC one.** The last block asserts the absence of
 * every RIASEC concept here, and `admin-assessment.test.tsx` continues to assert
 * the Holland editor unchanged.
 */

const api = vi.hoisted(() => ({
  englishOverview: vi.fn(),
  englishDraft: vi.fn(),
  createEnglishDraft: vi.fn(),
  discardEnglishDraft: vi.fn(),
  addEnglishQuestion: vi.fn(),
  updateEnglishQuestion: vi.fn(),
  removeEnglishQuestion: vi.fn(),
  reorderEnglishDraft: vi.fn(),
  updateEnglishOption: vi.fn(),
  setEnglishBands: vi.fn(),
  publishEnglish: vi.fn(),
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

const { default: AdminEnglishPage } = await import('@/app/(admin)/admin/assessment/english/page');

function question(index: number, level: CefrLevel = 'B1'): AdminEnglishQuestion {
  return {
    id: `q-${index}`,
    key: `${level}-${index}`,
    text: `Question ${index}`,
    order: index,
    marks: 1,
    level,
    skill: 'GRAMMAR',
    options: [
      { id: `o-${index}-a`, key: 'o1', label: 'first', order: 1, isCorrect: true },
      { id: `o-${index}-b`, key: 'o2', label: 'second', order: 2, isCorrect: false },
    ],
  };
}

/** Ten one-mark items, one per level where there are levels to go round. */
const QUESTIONS: AdminEnglishQuestion[] = [
  ...CEFR_LEVELS.map((level, index) => question(index + 1, level)),
  ...Array.from({ length: 4 }, (_unused, index) => question(index + 7, 'B1')),
];

/** A valid partition of 0-10. */
const BANDS: CefrBand[] = [
  { level: 'A1', minScore: 0, maxScore: 1 },
  { level: 'A2', minScore: 2, maxScore: 3 },
  { level: 'B1', minScore: 4, maxScore: 6 },
  { level: 'B2', minScore: 7, maxScore: 7 },
  { level: 'C1', minScore: 8, maxScore: 9 },
  { level: 'C2', minScore: 10, maxScore: 10 },
];

function draft(overrides: Partial<AdminEnglishDraft> = {}): AdminEnglishDraft {
  return {
    id: 'draft-1',
    key: 'english-cefr',
    version: 2,
    title: 'تقييم مستوى اللغة الإنجليزية',
    description: 'وصف',
    questions: QUESTIONS,
    bands: BANDS,
    readiness: {
      blockers: [],
      warnings: [],
      maxScore: 10,
      levelsWithoutQuestion: [],
      bandsCoverRange: true,
    },
    basedOnVersion: 1,
    ...overrides,
  };
}

const OVERVIEW: AdminEnglishOverview = {
  active: {
    id: 'v1',
    version: 1,
    status: 'ACTIVE',
    title: 'تقييم مستوى اللغة الإنجليزية',
    effectiveFrom: '2026-08-01T09:00:00Z',
    retiredAt: null,
    questionCount: 30,
    resultCount: 12,
  },
  draft: null,
  history: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.englishOverview.mockResolvedValue(OVERVIEW);
  api.englishDraft.mockResolvedValue(draft());
  api.createEnglishDraft.mockResolvedValue(draft());
  api.setEnglishBands.mockResolvedValue(draft());
  api.updateEnglishOption.mockResolvedValue(draft());
  api.addEnglishQuestion.mockResolvedValue(draft());
  api.publishEnglish.mockResolvedValue(OVERVIEW.active);
});

/**
 * Enters the editor.
 *
 * The overview is the landing state, and the editor is one deliberate action
 * away — creating the draft is what "edit the test" *means*, so the page makes
 * it one click rather than two (§4C.3's shape, kept).
 */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: /تعديل التقييم|إنشاء الإصدار الأول/ }),
  );
  await screen.findByText('نطاقات المستويات');
}

describe('§4C.9 — the overview', () => {
  it('says results stay frozen before offering the edit', async () => {
    /* D-049 is only reassuring if the person about to change the instrument
       knows it — otherwise the safe-feeling move is to never improve it. */
    renderWithProviders(<AdminEnglishPage />);

    expect(await screen.findByText(/نتائج من أدّوه سابقًا تبقى كما هي/)).toBeInTheDocument();
  });

  it('shows how many people the active version placed', async () => {
    renderWithProviders(<AdminEnglishPage />);

    expect(await screen.findByText('عدد من حُدِّد مستواهم')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('offers to create the first version when none is active', async () => {
    /* The one place §4C.9 diverges from §4C.3, which disables its edit button
       without an active bank. There is no seeded English instrument to copy, so
       refusing here would be an editor that cannot create what it edits. */
    api.englishOverview.mockResolvedValue({ active: null, draft: null, history: [] });
    renderWithProviders(<AdminEnglishPage />);

    const button = await screen.findByRole('button', { name: 'إنشاء الإصدار الأول' });
    expect(button).toBeEnabled();
  });
});

describe('§4C.9 — the band table is the configurable scoring rule', () => {
  it('shows the attainable total the table has to cover', async () => {
    /* It changes on every question added or mark edited, so it is the thing an
       administrator will most often have out of step. */
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(screen.getByText(/الدرجة الكلية للتقييم: 10/)).toBeInTheDocument();
  });

  it('offers five editable ceilings, not twelve independent bounds', async () => {
    /* A partition of 0…max is determined by its five internal boundaries. Twelve
       fields would let somebody type a gap and then be refused for it. */
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    const ceilings = screen
      .getAllByRole('spinbutton')
      .filter((input) => input.id.startsWith('band-'));

    expect(ceilings).toHaveLength(CEFR_LEVELS.length - 1);
    expect(ceilings.map((input) => input.id)).not.toContain('band-C2');
  });

  it('pins the top band to the attainable total rather than offering a field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(screen.getByText('إلى 10')).toBeInTheDocument();
  });

  it('derives every lower bound from the previous ceiling, so a gap is unreachable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    /* Lower A1's ceiling from 1 to 0; A2 must follow to 1 with no gap left. */
    const a1 = screen.getByLabelText(/الحد الأعلى للمستوى A1/);
    await user.clear(a1);
    await user.type(a1, '0');

    await user.click(screen.getByRole('button', { name: 'حفظ النطاقات' }));

    await waitFor(() => expect(api.setEnglishBands).toHaveBeenCalled());
    const saved = api.setEnglishBands.mock.calls[0]![0] as CefrBand[];

    expect(saved[0]).toEqual({ level: 'A1', minScore: 0, maxScore: 0 });
    expect(saved[1]!.minScore).toBe(1);
    /* The defining property, asserted over the whole table rather than one pair. */
    for (let index = 1; index < saved.length; index += 1) {
      expect(saved[index]!.minScore).toBe(saved[index - 1]!.maxScore + 1);
    }
    expect(saved[saved.length - 1]!.maxScore).toBe(10);
  });

  it('fills the boundaries evenly on request, as a starting point', async () => {
    /* Growing a bank makes every boundary stale at once; retyping five numbers
       to get back to "roughly even" is work the screen can do. */
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'توزيع متساوٍ' }));
    await user.click(screen.getByRole('button', { name: 'حفظ النطاقات' }));

    await waitFor(() => expect(api.setEnglishBands).toHaveBeenCalled());
    const saved = api.setEnglishBands.mock.calls[0]![0] as CefrBand[];

    expect(saved).toHaveLength(6);
    expect(saved[0]!.minScore).toBe(0);
    expect(saved[5]!.maxScore).toBe(10);
  });

  it('will not save a table with no questions behind it', async () => {
    api.englishDraft.mockResolvedValue(
      draft({
        questions: [],
        readiness: {
          blockers: ['ENGLISH_BANK_TOO_FEW_MARKS'],
          warnings: [],
          maxScore: 0,
          levelsWithoutQuestion: [...CEFR_LEVELS],
          bandsCoverRange: false,
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(screen.getByRole('button', { name: 'حفظ النطاقات' })).toBeDisabled();
    expect(screen.getByText(/لا توجد درجة كلية/)).toBeInTheDocument();
  });
});

describe('§4C.9 — blockers and warnings are different things', () => {
  it('names each blocker rather than counting them', async () => {
    api.englishDraft.mockResolvedValue(
      draft({
        readiness: {
          blockers: ['ENGLISH_BANK_NO_CORRECT_OPTION', 'ENGLISH_BANK_BANDS_NOT_CONTIGUOUS'],
          warnings: [],
          maxScore: 10,
          levelsWithoutQuestion: [],
          bandsCoverRange: false,
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(screen.getByText(/بلا إجابة صحيحة محدّدة/)).toBeInTheDocument();
    expect(screen.getByText(/فجوة أو تداخل/)).toBeInTheDocument();
  });

  it('refuses to publish while a blocker stands, and says why in the dialog', async () => {
    const user = userEvent.setup();
    api.englishDraft.mockResolvedValue(
      draft({
        readiness: {
          blockers: ['ENGLISH_BANK_BANDS_DO_NOT_COVER_RANGE'],
          warnings: [],
          maxScore: 10,
          levelsWithoutQuestion: [],
          bandsCoverRange: false,
        },
      }),
    );
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);
    expect(screen.getByText(/لا يمكن نشر هذه المسودة/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'نشر الإصدار' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/لا يمكن النشر قبل معالجة/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'نشر الإصدار' })).toBeDisabled();
    expect(api.publishEnglish).not.toHaveBeenCalled();
  });

  it('publishes past a warning, and names the levels that are missing', async () => {
    const user = userEvent.setup();
    api.englishDraft.mockResolvedValue(
      draft({
        readiness: {
          blockers: [],
          warnings: ['ENGLISH_BANK_LEVEL_WITHOUT_QUESTION'],
          maxScore: 10,
          levelsWithoutQuestion: ['C2'],
          bandsCoverRange: true,
        },
      }),
    );
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(screen.getByText(/تنبيه قبل النشر/)).toBeInTheDocument();
    /* Which levels, not just that some are missing. */
    expect(screen.getByText(/C2 \(متمكّن\)/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'نشر الإصدار' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'نشر الإصدار' }));

    await waitFor(() => expect(api.publishEnglish).toHaveBeenCalled());
  });
});

describe('§4C.9 — the answer key', () => {
  it('marks the correct option as a radio, so two-correct is unreachable here', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    await user.click(screen.getAllByRole('button', { name: 'عرض الخيارات والإجابة الصحيحة' })[0]!);

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();

    await user.click(radios[1]!);

    await waitFor(() =>
      expect(api.updateEnglishOption).toHaveBeenCalledWith('o-1-b', { isCorrect: true }),
    );
    /* Never sent as "unset the other one": the server clears the siblings, so
       there is one writer for the rule. */
    expect(api.updateEnglishOption).toHaveBeenCalledTimes(1);
  });

  it('asks for the options when adding an item, rather than generating them', async () => {
    /* A RIASEC item's five agreement levels are the same every time, so §4C.3
       generates them. An English item's distractors are content somebody wrote. */
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'إضافة سؤال' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getAllByLabelText('نص الخيار').length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByLabelText('درجة السؤال')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('المستوى المستهدف')).toBeInTheDocument();
  });

  it('re-points the correct answer after blank options are dropped', async () => {
    /* The bug this guards: filling options 1 and 3, marking 3 correct, and
       having the blank row silently move the right answer to option 2. */
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'إضافة سؤال' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('نص السؤال'), 'She ___ every morning.');
    const fields = within(dialog).getAllByLabelText('نص الخيار');
    await user.type(fields[0]!, 'go');
    await user.type(fields[2]!, 'goes');
    await user.click(within(dialog).getAllByRole('radio')[2]!);

    await user.click(within(dialog).getByRole('button', { name: 'إضافة سؤال' }));

    await waitFor(() => expect(api.addEnglishQuestion).toHaveBeenCalled());
    const sent = api.addEnglishQuestion.mock.calls[0]![0] as {
      options: string[];
      correctIndex: number;
    };

    expect(sent.options).toEqual(['go', 'goes']);
    expect(sent.correctIndex).toBe(1);
    expect(sent.options[sent.correctIndex]).toBe('goes');
  });
});

describe('§4C.9 is not the RIASEC editor (D-124)', () => {
  it('never calls a RIASEC endpoint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    await user.click(screen.getAllByRole('button', { name: 'عرض الخيارات والإجابة الصحيحة' })[0]!);

    for (const name of [
      'assessmentOverview',
      'assessmentDraft',
      'createAssessmentDraft',
      'addDraftQuestion',
      'updateDraftOption',
      'publishAssessment',
    ]) {
      expect((api as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it('offers no dimension, no weight and no balance anywhere on the screen', async () => {
    /* The concepts do not exist for a single-scale instrument (D-125). Asserted
       over the rendered text rather than over a component, so a future "helpful"
       reuse of the RIASEC panel fails here. */
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AdminEnglishPage />);
    await openEditor(user);

    expect(container.textContent).not.toMatch(/متوازن|البُعد|الميول/);
    expect(screen.queryByText('الاجتماعي')).not.toBeInTheDocument();
  });
});
