import { CEFR_LEVELS, type CefrBand } from '@tamkeen/types';

import {
  ENGLISH_SCORING_ERROR,
  EnglishScoringError,
  maxAttainableScore,
  resolveCefrBand,
  scoreEnglishAssessment,
  sortBandsByLevel,
  tallyEnglishAnswers,
  type ScorableEnglishQuestion,
  type SubmittedEnglishAnswer,
} from './english-scoring';

/**
 * The English scoring engine (§2B "core product correctness", §4.13).
 *
 * The cases that matter most here are the **boundaries**. A band table is a
 * partition, so every internal boundary is a score that two adjacent bands could
 * plausibly claim, and an off-by-one in either direction places somebody a level
 * away from where they belong — silently, with no error anywhere. So each
 * boundary is asserted from both sides, and so are the two ends of the scale.
 */

/** A one-mark question whose second option is the correct one. */
function question(id: string, marks = 1): ScorableEnglishQuestion {
  return {
    id,
    marks,
    options: [
      { id: `${id}-a`, isCorrect: false },
      { id: `${id}-b`, isCorrect: true },
      { id: `${id}-c`, isCorrect: false },
    ],
  };
}

/** Ten one-mark questions: a 0-10 scale, easy to reason about. */
const BANK: ScorableEnglishQuestion[] = Array.from({ length: 10 }, (_unused, index) =>
  question(`q${index + 1}`),
);

/**
 * A partition of 0-10, one band per level, with uneven widths on purpose — an
 * evenly-split table would pass a mapping that divided by a constant.
 */
const BANDS: CefrBand[] = [
  { level: 'A1', minScore: 0, maxScore: 1 },
  { level: 'A2', minScore: 2, maxScore: 3 },
  { level: 'B1', minScore: 4, maxScore: 6 },
  { level: 'B2', minScore: 7, maxScore: 7 },
  { level: 'C1', minScore: 8, maxScore: 9 },
  { level: 'C2', minScore: 10, maxScore: 10 },
];

/** Answers the first `correct` questions correctly and the rest wrongly. */
function answers(
  correct: number,
  bank: ScorableEnglishQuestion[] = BANK,
): SubmittedEnglishAnswer[] {
  return bank.map((item, index) => ({
    questionId: item.id,
    optionId: index < correct ? `${item.id}-b` : `${item.id}-a`,
  }));
}

describe('maxAttainableScore', () => {
  it('sums the marks of every question', () => {
    expect(maxAttainableScore(BANK)).toBe(10);
  });

  it('respects per-question marks rather than counting questions', () => {
    expect(maxAttainableScore([question('q1', 3), question('q2', 5)])).toBe(8);
  });

  it('is zero for an empty bank', () => {
    expect(maxAttainableScore([])).toBe(0);
  });
});

describe('tallyEnglishAnswers', () => {
  it('awards a question’s marks only for its correct option', () => {
    expect(tallyEnglishAnswers(BANK, answers(7))).toBe(7);
  });

  it('awards nothing for a wrong answer, rather than a partial credit', () => {
    expect(tallyEnglishAnswers(BANK, answers(0))).toBe(0);
  });

  it('weights a question by its own marks', () => {
    const bank = [question('q1', 4), question('q2', 1)];

    expect(
      tallyEnglishAnswers(bank, [
        { questionId: 'q1', optionId: 'q1-b' },
        { questionId: 'q2', optionId: 'q2-a' },
      ]),
    ).toBe(4);
  });

  it('refuses a submission that misses a question', () => {
    /* A partial submission scores the unanswered items at zero and would be
       presented as a finished placement — a level below where the person is. */
    expect(() => tallyEnglishAnswers(BANK, answers(10).slice(0, 9))).toThrow(EnglishScoringError);

    try {
      tallyEnglishAnswers(BANK, answers(10).slice(0, 9));
    } catch (error) {
      expect((error as EnglishScoringError).code).toBe(ENGLISH_SCORING_ERROR.INCOMPLETE);
    }
  });

  it('refuses an answer to a question that is not in the bank', () => {
    const tampered = [...answers(10).slice(0, 9), { questionId: 'ghost', optionId: 'q1-b' }];

    try {
      tallyEnglishAnswers(BANK, tampered);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as EnglishScoringError).code).toBe(ENGLISH_SCORING_ERROR.UNKNOWN_QUESTION);
    }
  });

  it('refuses an option id belonging to a different question', () => {
    /* Distinct from an id that does not exist at all: this is the shape a
       tampered request actually takes, and both must be refused. */
    const tampered = answers(0).map((answer, index) =>
      index === 0 ? { ...answer, optionId: 'q2-b' } : answer,
    );

    try {
      tallyEnglishAnswers(BANK, tampered);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as EnglishScoringError).code).toBe(ENGLISH_SCORING_ERROR.UNKNOWN_OPTION);
    }
  });

  it('refuses the same question answered twice', () => {
    const tampered = [...answers(10), { questionId: 'q1', optionId: 'q1-b' }];

    try {
      tallyEnglishAnswers(BANK, tampered);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as EnglishScoringError).code).toBe(ENGLISH_SCORING_ERROR.DUPLICATE_ANSWER);
    }
  });
});

describe('resolveCefrBand', () => {
  it('places the minimum score in the lowest band', () => {
    expect(resolveCefrBand(BANDS, 0)?.level).toBe('A1');
  });

  it('places the maximum score in the highest band', () => {
    expect(resolveCefrBand(BANDS, 10)?.level).toBe('C2');
  });

  it.each([
    /* Every internal boundary, from both sides. A band's ceiling belongs to that
       band and its ceiling + 1 belongs to the next — the single off-by-one that
       would place a person a level away with nothing to show for it. */
    [1, 'A1'],
    [2, 'A2'],
    [3, 'A2'],
    [4, 'B1'],
    [6, 'B1'],
    [7, 'B2'],
    [8, 'C1'],
    [9, 'C1'],
  ])('places %i in %s', (score, level) => {
    expect(resolveCefrBand(BANDS, score)?.level).toBe(level);
  });

  it('treats both bounds as inclusive on a single-score band', () => {
    /* B2 is exactly 7-7 in this table. A half-open reading would leave it
       unreachable, which is the failure mode with no symptom: nobody is ever
       placed at B2 and nothing reports why. */
    expect(resolveCefrBand(BANDS, 7)?.level).toBe('B2');
  });

  it('returns null for a score outside every band, rather than guessing', () => {
    expect(resolveCefrBand(BANDS, 11)).toBeNull();
    expect(resolveCefrBand(BANDS, -1)).toBeNull();
  });

  it('returns null when there are no bands at all', () => {
    expect(resolveCefrBand([], 0)).toBeNull();
  });
});

describe('sortBandsByLevel', () => {
  it('orders by the CEFR scale, not by the numbers', () => {
    const shuffled = [BANDS[3]!, BANDS[0]!, BANDS[5]!, BANDS[1]!, BANDS[4]!, BANDS[2]!];

    expect(sortBandsByLevel(shuffled).map((band) => band.level)).toEqual([...CEFR_LEVELS]);
  });

  it('does not mutate its input', () => {
    const input = [BANDS[3]!, BANDS[0]!];
    sortBandsByLevel(input);

    expect(input.map((band) => band.level)).toEqual(['B2', 'A1']);
  });
});

describe('scoreEnglishAssessment', () => {
  it('scores a perfect submission at the top of the scale', () => {
    expect(scoreEnglishAssessment(BANK, BANDS, answers(10))).toEqual({
      totalScore: 10,
      maxScore: 10,
      percent: 100,
      level: 'C2',
    });
  });

  it('scores an empty submission at the bottom of the scale', () => {
    expect(scoreEnglishAssessment(BANK, BANDS, answers(0))).toEqual({
      totalScore: 0,
      maxScore: 10,
      percent: 0,
      level: 'A1',
    });
  });

  it('reports the percentage against what the version could attain', () => {
    expect(scoreEnglishAssessment(BANK, BANDS, answers(4)).percent).toBe(40);
  });

  it('maps a mid-scale score to its band', () => {
    expect(scoreEnglishAssessment(BANK, BANDS, answers(5)).level).toBe('B1');
  });

  it('refuses to score when no band contains the total', () => {
    /* Unreachable through the product — the publish gate refuses an uncovered
       band table — but the alternative to refusing is defaulting to a level, and
       telling somebody they are A1 because a table was malformed is worse. */
    const gapped = BANDS.filter((band) => band.level !== 'B1');

    try {
      scoreEnglishAssessment(BANK, gapped, answers(5));
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as EnglishScoringError).code).toBe(ENGLISH_SCORING_ERROR.NO_BAND);
    }
  });

  it('reports zero percent rather than NaN when nothing is attainable', () => {
    const zeroBand: CefrBand[] = [{ level: 'A1', minScore: 0, maxScore: 0 }];

    expect(scoreEnglishAssessment([], zeroBand, []).percent).toBe(0);
  });
});
