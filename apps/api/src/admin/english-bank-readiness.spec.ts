import { CEFR_LEVELS, type CefrBand } from '@tamkeen/types';

import {
  ENGLISH_BANK_BLOCKER,
  ENGLISH_BANK_WARNING,
  MIN_ENGLISH_ATTAINABLE_MARKS,
  assessEnglishBank,
  type DraftEnglishQuestion,
} from './english-bank-readiness';
import { assessBank, type DraftQuestion } from './bank-readiness';
import { ASSESSMENT_QUESTIONS, LIKERT_LEVELS } from '../seed-data/assessment';

/**
 * The English publish gate (§4C.9, D-124).
 *
 * Two things are asserted here. First, that the gate catches every way a band
 * table can fail to be a partition — the one place a plausible-looking edit
 * produces an instrument that is silently wrong. Second, and just as
 * deliberately, that **it has no opinion about balance**: the concept does not
 * exist for a single-scale instrument, and the last block in this file proves
 * that Holland's guard is neither weakened nor consulted.
 */

function draftQuestion(
  id: string,
  overrides: Partial<DraftEnglishQuestion> = {},
): DraftEnglishQuestion {
  return {
    id,
    displayOrder: Number(id.replace(/\D/g, '')) || 1,
    marks: 1,
    level: 'A1',
    skill: 'GRAMMAR',
    options: [
      { id: `${id}-a`, isCorrect: false },
      { id: `${id}-b`, isCorrect: true },
    ],
    ...overrides,
  };
}

/** Ten one-mark questions, one per level where there are levels to go round. */
const QUESTIONS: DraftEnglishQuestion[] = [
  ...CEFR_LEVELS.map((level, index) =>
    draftQuestion(`q${index + 1}`, { level, displayOrder: index + 1 }),
  ),
  ...Array.from({ length: 4 }, (_unused, index) =>
    draftQuestion(`q${index + 7}`, { level: 'B1', displayOrder: index + 7 }),
  ),
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

describe('assessEnglishBank — a well-formed version', () => {
  it('publishes with no blockers and no warnings', () => {
    const readiness = assessEnglishBank(QUESTIONS, BANDS);

    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toEqual([]);
  });

  it('reports the attainable total the band table must cover', () => {
    expect(assessEnglishBank(QUESTIONS, BANDS).maxScore).toBe(10);
    expect(assessEnglishBank(QUESTIONS, BANDS).bandsCoverRange).toBe(true);
  });

  it('accepts a bank whose items are worth different amounts', () => {
    /* Difficulty weighting is the point of `marks`, not a skew to be corrected —
       the distinction from Holland's balance rule, asserted rather than assumed. */
    const weighted = [
      draftQuestion('q1', { marks: 4, level: 'C2', displayOrder: 1 }),
      ...CEFR_LEVELS.slice(0, 5).map((level, index) =>
        draftQuestion(`q${index + 2}`, { level, marks: 1, displayOrder: index + 2 }),
      ),
      draftQuestion('q7', { marks: 1, level: 'B1', displayOrder: 7 }),
    ];

    expect(assessEnglishBank(weighted, BANDS).blockers).toEqual([]);
  });
});

describe('assessEnglishBank — the question rules', () => {
  it('refuses a question with fewer than two options', () => {
    const bad = [
      draftQuestion('q1', { options: [{ id: 'q1-a', isCorrect: true }] }),
      ...QUESTIONS.slice(1),
    ];

    expect(assessEnglishBank(bad, BANDS).blockers).toContain(
      ENGLISH_BANK_BLOCKER.QUESTION_WITHOUT_OPTIONS,
    );
  });

  it('refuses a question no option can score', () => {
    const bad = [
      draftQuestion('q1', {
        options: [
          { id: 'q1-a', isCorrect: false },
          { id: 'q1-b', isCorrect: false },
        ],
      }),
      ...QUESTIONS.slice(1),
    ];

    expect(assessEnglishBank(bad, BANDS).blockers).toContain(
      ENGLISH_BANK_BLOCKER.NO_CORRECT_OPTION,
    );
  });

  it('refuses a question with two correct options', () => {
    const bad = [
      draftQuestion('q1', {
        options: [
          { id: 'q1-a', isCorrect: true },
          { id: 'q1-b', isCorrect: true },
        ],
      }),
      ...QUESTIONS.slice(1),
    ];

    expect(assessEnglishBank(bad, BANDS).blockers).toContain(
      ENGLISH_BANK_BLOCKER.MULTIPLE_CORRECT_OPTIONS,
    );
  });

  it('refuses a question worth nothing', () => {
    const bad = [draftQuestion('q1', { marks: 0 }), ...QUESTIONS.slice(1)];

    expect(assessEnglishBank(bad, BANDS).blockers).toContain(
      ENGLISH_BANK_BLOCKER.NON_POSITIVE_MARKS,
    );
  });

  it('refuses a bank with fewer attainable marks than there are levels to tell apart', () => {
    const tiny = CEFR_LEVELS.slice(0, 4).map((level, index) =>
      draftQuestion(`q${index + 1}`, { level, displayOrder: index + 1 }),
    );
    const tinyBands: CefrBand[] = CEFR_LEVELS.map((level, index) => ({
      level,
      minScore: Math.min(index, 4),
      maxScore: Math.min(index, 4),
    }));

    expect(assessEnglishBank(tiny, tinyBands).blockers).toContain(
      ENGLISH_BANK_BLOCKER.TOO_FEW_MARKS,
    );
  });

  it('accepts exactly the minimum attainable marks', () => {
    const minimal = CEFR_LEVELS.slice(0, MIN_ENGLISH_ATTAINABLE_MARKS).map((level, index) =>
      draftQuestion(`q${index + 1}`, { level, displayOrder: index + 1 }),
    );
    const minimalBands: CefrBand[] = CEFR_LEVELS.map((level, index) => ({
      level,
      minScore: index === 0 ? 0 : index,
      maxScore: index,
    }));

    const readiness = assessEnglishBank(minimal, minimalBands);

    expect(readiness.maxScore).toBe(MIN_ENGLISH_ATTAINABLE_MARKS);
    expect(readiness.blockers).not.toContain(ENGLISH_BANK_BLOCKER.TOO_FEW_MARKS);
    expect(readiness.blockers).not.toContain(ENGLISH_BANK_BLOCKER.BANDS_DO_NOT_COVER_RANGE);
  });
});

describe('assessEnglishBank — the band table is the configurable scoring rule', () => {
  it('refuses a table missing a level', () => {
    expect(
      assessEnglishBank(
        QUESTIONS,
        BANDS.filter((band) => band.level !== 'C1'),
      ).blockers,
    ).toContain(ENGLISH_BANK_BLOCKER.BANDS_INCOMPLETE);
  });

  it('refuses a table naming a level twice', () => {
    const duplicated = [...BANDS.slice(0, 5), { level: 'C1' as const, minScore: 10, maxScore: 10 }];

    expect(assessEnglishBank(QUESTIONS, duplicated).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_INCOMPLETE,
    );
  });

  it('names one fault, not three, for an incomplete table', () => {
    /* Contiguity and coverage are not meaningful over a table that is missing a
       level; reporting them too would send an administrator chasing two
       problems that do not exist. */
    const blockers = assessEnglishBank(QUESTIONS, BANDS.slice(0, 5)).blockers;

    expect(blockers).toEqual([ENGLISH_BANK_BLOCKER.BANDS_INCOMPLETE]);
  });

  it('refuses a band whose floor is above its ceiling', () => {
    const inverted = BANDS.map((band) =>
      band.level === 'B1' ? { ...band, minScore: 6, maxScore: 4 } : band,
    );

    expect(assessEnglishBank(QUESTIONS, inverted).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BAND_RANGE_INVALID,
    );
  });

  it('refuses a gap between two bands', () => {
    /* 4 is scoreable and belongs to nobody: a learner who scores it cannot be
       placed at all. */
    const gapped = BANDS.map((band) => (band.level === 'B1' ? { ...band, minScore: 5 } : band));

    expect(assessEnglishBank(QUESTIONS, gapped).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_NOT_CONTIGUOUS,
    );
  });

  it('refuses an overlap between two bands', () => {
    /* Worse than a gap, because it has no symptom: the level a person is told
       depends on which row was read first. */
    const overlapping = BANDS.map((band) =>
      band.level === 'B1' ? { ...band, minScore: 3 } : band,
    );

    expect(assessEnglishBank(QUESTIONS, overlapping).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_NOT_CONTIGUOUS,
    );
  });

  it('refuses a table that does not start at zero', () => {
    const floating = BANDS.map((band) => (band.level === 'A1' ? { ...band, minScore: 1 } : band));

    expect(assessEnglishBank(QUESTIONS, floating).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_DO_NOT_COVER_RANGE,
    );
  });

  it('refuses a table that stops short of the attainable total', () => {
    /* Contiguous and well-formed, and still wrong: a perfect score of 10 falls
       outside every band, so the strongest candidates cannot be placed. Written
       to stay contiguous on purpose — shrinking C2's ceiling alone would trip
       BAND_RANGE_INVALID first and prove nothing about coverage. */
    const short: CefrBand[] = [
      ...BANDS.slice(0, 4),
      { level: 'C1', minScore: 8, maxScore: 8 },
      { level: 'C2', minScore: 9, maxScore: 9 },
    ];

    const blockers = assessEnglishBank(QUESTIONS, short).blockers;

    expect(blockers).toContain(ENGLISH_BANK_BLOCKER.BANDS_DO_NOT_COVER_RANGE);
    expect(blockers).not.toContain(ENGLISH_BANK_BLOCKER.BANDS_NOT_CONTIGUOUS);
  });

  it('refuses a table that runs past the attainable total', () => {
    /* A C2 nobody can reach. The bank was shortened and the table was not. */
    const long = BANDS.map((band) => (band.level === 'C2' ? { ...band, maxScore: 12 } : band));

    expect(assessEnglishBank(QUESTIONS, long).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_DO_NOT_COVER_RANGE,
    );
  });

  it('rejects a table ordered by number rather than by level', () => {
    /* B1 below A2 is not "sorted differently", it is wrong — and sorting the
       table by minScore before checking it would have accepted this. */
    const scrambled: CefrBand[] = [
      { level: 'A1', minScore: 0, maxScore: 1 },
      { level: 'B1', minScore: 2, maxScore: 3 },
      { level: 'A2', minScore: 4, maxScore: 6 },
      { level: 'B2', minScore: 7, maxScore: 7 },
      { level: 'C1', minScore: 8, maxScore: 9 },
      { level: 'C2', minScore: 10, maxScore: 10 },
    ];

    expect(assessEnglishBank(QUESTIONS, scrambled).blockers).toContain(
      ENGLISH_BANK_BLOCKER.BANDS_NOT_CONTIGUOUS,
    );
  });
});

describe('assessEnglishBank — coverage is a warning, not a refusal', () => {
  it('warns when a level has no question targeting it', () => {
    const noC2 = QUESTIONS.map((item) =>
      item.level === 'C2' ? { ...item, level: 'B1' as const } : item,
    );
    const readiness = assessEnglishBank(noC2, BANDS);

    expect(readiness.warnings).toContain(ENGLISH_BANK_WARNING.LEVEL_WITHOUT_QUESTION);
    expect(readiness.levelsWithoutQuestion).toEqual(['C2']);
  });

  it('still allows the version to be published', () => {
    const noC2 = QUESTIONS.map((item) =>
      item.level === 'C2' ? { ...item, level: 'B1' as const } : item,
    );

    expect(assessEnglishBank(noC2, BANDS).blockers).toEqual([]);
  });
});

describe('the English gate has no opinion about balance (D-124)', () => {
  it('never reports a Holland blocker code', () => {
    const codes = Object.values(ENGLISH_BANK_BLOCKER);

    for (const code of codes) {
      expect(code.startsWith('ENGLISH_BANK_')).toBe(true);
    }
    expect(codes).not.toContain('BANK_UNBALANCED');
  });

  it('accepts an English bank that would be "unbalanced" if it had dimensions', () => {
    /* Six questions targeting one level, worth wildly different amounts. There
       is nothing here to balance, and the gate must not invent something. */
    const lopsided = [
      draftQuestion('q1', { marks: 6, level: 'A1', displayOrder: 1 }),
      ...CEFR_LEVELS.slice(1).map((level, index) =>
        draftQuestion(`q${index + 2}`, { level, marks: 1, displayOrder: index + 2 }),
      ),
    ];
    const bands: CefrBand[] = [
      { level: 'A1', minScore: 0, maxScore: 1 },
      { level: 'A2', minScore: 2, maxScore: 3 },
      { level: 'B1', minScore: 4, maxScore: 5 },
      { level: 'B2', minScore: 6, maxScore: 7 },
      { level: 'C1', minScore: 8, maxScore: 9 },
      { level: 'C2', minScore: 10, maxScore: 11 },
    ];

    expect(assessEnglishBank(lopsided, bands).blockers).toEqual([]);
  });

  it('leaves the Holland guard exactly as it was: the seeded bank still passes it', () => {
    /* The regression this whole sub-phase is written to make impossible. If
       anything here had reached into `bank-readiness.ts`, this is where it would
       show. */
    const holland: DraftQuestion[] = ASSESSMENT_QUESTIONS.map((item, index) => ({
      id: item.key,
      displayOrder: index + 1,
      options: LIKERT_LEVELS.map((level) => ({
        id: `${item.key}-${level.key}`,
        weights: { [item.letter]: level.weight },
      })),
    }));

    const readiness = assessBank(holland);

    expect(readiness.balanced).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });
});
