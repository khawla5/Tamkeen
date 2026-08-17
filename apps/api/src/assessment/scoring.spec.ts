import { RIASEC_LETTERS, type RiasecLetter } from '@tamkeen/types';

import {
  SCORING_ERROR,
  ScoringError,
  isBalancedBank,
  maxAttainableByDimension,
  scoreAssessment,
  tallyAnswers,
  type ScorableQuestion,
  type SubmittedAnswer,
} from './scoring';

/**
 * The server half of the scoring engine (§2B "core product correctness").
 *
 * The ranking and tie rules are covered in `@tamkeen/types`; what is asserted
 * here is the tally itself and — at least as importantly — that an invalid
 * submission is *refused* rather than scored into a plausible-looking profile.
 */

/** A five-level Likert item for one dimension, matching the seeded bank. */
function likertQuestion(id: string, letter: RiasecLetter): ScorableQuestion {
  return {
    id,
    options: [0, 1, 2, 3, 4].map((weight) => ({
      id: `${id}-o${weight}`,
      weights: { [letter]: weight } as Record<RiasecLetter, number>,
    })),
  };
}

/** One item per dimension — the smallest balanced bank. */
const BANK: ScorableQuestion[] = RIASEC_LETTERS.map((letter) =>
  likertQuestion(`q-${letter}`, letter),
);

/** Answers every question at the given Likert level (0-4). */
function answerAll(level: Record<RiasecLetter, number>): SubmittedAnswer[] {
  return RIASEC_LETTERS.map((letter) => ({
    questionId: `q-${letter}`,
    optionId: `q-${letter}-o${level[letter]}`,
  }));
}

describe('maxAttainableByDimension', () => {
  it('takes the best option per question, not the sum of its options', () => {
    /* Options are mutually exclusive — a user picks one. Summing them would
       inflate the maximum and shrink every displayed percentage. */
    expect(maxAttainableByDimension([likertQuestion('q1', 'S')]).S).toBe(4);
  });

  it('adds across questions that feed the same dimension', () => {
    const bank = [likertQuestion('q1', 'S'), likertQuestion('q2', 'S')];

    expect(maxAttainableByDimension(bank).S).toBe(8);
  });

  it('reports zero for a dimension no question feeds', () => {
    expect(maxAttainableByDimension([likertQuestion('q1', 'S')]).R).toBe(0);
  });

  it('handles an option weighted across several dimensions', () => {
    const bank: ScorableQuestion[] = [
      {
        id: 'q1',
        options: [
          { id: 'o1', weights: { S: 3, E: 2 } },
          { id: 'o2', weights: { I: 4 } },
        ],
      },
    ];

    expect(maxAttainableByDimension(bank)).toMatchObject({ S: 3, E: 2, I: 4, R: 0 });
  });
});

describe('isBalancedBank', () => {
  it('accepts a bank where every dimension can attain the same maximum', () => {
    expect(isBalancedBank(BANK)).toBe(true);
  });

  it('rejects a bank that gives one dimension more items than another', () => {
    /*
     * The failure this prevents: ranking compares raw scores across dimensions,
     * so a dimension with extra items would rank highly on volume rather than on
     * the user's interests — and the Holland Code would be an artefact of the
     * question bank rather than a result. (D-032)
     */
    expect(isBalancedBank([...BANK, likertQuestion('q-extra', 'S')])).toBe(false);
  });
});

describe('tallyAnswers', () => {
  it('sums the chosen options’ weights per dimension', () => {
    const scores = tallyAnswers(BANK, answerAll({ R: 0, I: 1, A: 2, S: 3, E: 4, C: 2 }));

    expect(scores).toEqual({ R: 0, I: 1, A: 2, S: 3, E: 4, C: 2 });
  });

  it('credits every dimension an option carries', () => {
    const bank: ScorableQuestion[] = [
      { id: 'q1', options: [{ id: 'o1', weights: { S: 3, E: 2 } }] },
    ];

    expect(tallyAnswers(bank, [{ questionId: 'q1', optionId: 'o1' }])).toMatchObject({
      S: 3,
      E: 2,
      R: 0,
    });
  });

  it('rejects a submission that leaves a question unanswered', () => {
    /* Otherwise the unanswered dimensions score zero and the result is presented
       as a finished profile. */
    const partial = answerAll({ R: 4, I: 4, A: 4, S: 4, E: 4, C: 4 }).slice(0, 5);

    expect(() => tallyAnswers(BANK, partial)).toThrow(
      expect.objectContaining({ code: SCORING_ERROR.INCOMPLETE }) as Error,
    );
  });

  it('rejects an answer to a question that is not in the bank', () => {
    const answers = [
      ...answerAll({ R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 }),
      { questionId: 'q-nope', optionId: 'q-nope-o1' },
    ];

    expect(() => tallyAnswers(BANK, answers)).toThrow(
      expect.objectContaining({ code: SCORING_ERROR.UNKNOWN_QUESTION }) as Error,
    );
  });

  it('rejects the same question answered twice', () => {
    const answers = [
      ...answerAll({ R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 }),
      { questionId: 'q-R', optionId: 'q-R-o4' },
    ];

    expect(() => tallyAnswers(BANK, answers)).toThrow(
      expect.objectContaining({ code: SCORING_ERROR.DUPLICATE_ANSWER }) as Error,
    );
  });

  it('rejects an option id belonging to a different question', () => {
    /* A tampered request could otherwise borrow a high-weight option from
       another item and steer its own result. */
    const answers = answerAll({ R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 });
    answers[0] = { questionId: 'q-R', optionId: 'q-S-o4' };

    expect(() => tallyAnswers(BANK, answers)).toThrow(
      expect.objectContaining({ code: SCORING_ERROR.UNKNOWN_OPTION }) as Error,
    );
  });

  it('rejects an option id that exists nowhere', () => {
    const answers = answerAll({ R: 1, I: 1, A: 1, S: 1, E: 1, C: 1 });
    answers[0] = { questionId: 'q-R', optionId: 'made-up' };

    expect(() => tallyAnswers(BANK, answers)).toThrow(ScoringError);
  });
});

describe('scoreAssessment', () => {
  it('produces a ranked profile and a Holland Code from raw answers', () => {
    const profile = scoreAssessment(BANK, answerAll({ S: 4, I: 3, A: 2, E: 1, C: 1, R: 0 }));

    expect(profile.codeString).toBe('SIA');
    expect(profile.scores).toEqual({ S: 4, I: 3, A: 2, E: 1, C: 1, R: 0 });
    expect(profile.ranked).toHaveLength(6);
  });

  it('reports the attainable maximum so results can be shown as percentages', () => {
    const profile = scoreAssessment(BANK, answerAll({ S: 4, I: 0, A: 0, E: 0, C: 0, R: 0 }));

    expect(profile.maxScore).toBe(4);
    expect(profile.ranked[0]).toMatchObject({ letter: 'S', percent: 100 });
  });

  it('applies the canonical tie-break end to end', () => {
    const profile = scoreAssessment(BANK, answerAll({ R: 3, I: 3, A: 3, S: 3, E: 3, C: 3 }));

    expect(profile.codeString).toBe('RIA');
  });

  it('never returns a partial code', () => {
    const profile = scoreAssessment(BANK, answerAll({ R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 }));

    expect(profile.code).toHaveLength(3);
  });
});
