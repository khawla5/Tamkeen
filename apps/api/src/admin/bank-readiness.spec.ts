import { RIASEC_LETTERS, type RiasecLetter } from '@tamkeen/types';

import { ASSESSMENT_QUESTIONS, LIKERT_LEVELS } from '../seed-data/assessment';
import { assessBank, BANK_BLOCKER, BANK_WARNING, type DraftQuestion } from './bank-readiness';

/**
 * The publish gate for an edited assessment (§4C.3, D-071).
 *
 * **The property that matters most is negative**: an unbalanced bank must be
 * *refused*, because nothing downstream can tell a Holland Code produced by a
 * fair instrument from one produced by a loaded one. The recommendation still
 * looks like a recommendation, the certificate still says what it says, and the
 * skew is invisible from every screen. This is the only place it can be caught,
 * so these cases are the ones a reviewer should read first.
 *
 * The seeded bank appears here as a fixture rather than as a separate content
 * test: the guard and the bank must agree, and asserting them against each other
 * is how a future edit to either one stays honest.
 */

/** One Likert item, weighted to a single dimension, as the seeded bank is. */
function likert(
  id: string,
  letter: RiasecLetter,
  order: number,
  points: readonly number[] = LIKERT_LEVELS.map((level) => level.weight),
): DraftQuestion {
  return {
    id,
    displayOrder: order,
    options: points.map((weight, index) => ({
      id: `${id}-o${index}`,
      weights: { [letter]: weight },
    })),
  };
}

/** A balanced bank: one item per dimension, interleaved. */
function balancedBank(perDimension = 1): DraftQuestion[] {
  const questions: DraftQuestion[] = [];
  let order = 0;

  for (let round = 0; round < perDimension; round += 1) {
    for (const letter of RIASEC_LETTERS) {
      order += 1;
      questions.push(likert(`${letter}${round}`, letter, order));
    }
  }

  return questions;
}

/** The seeded thirty-item bank, in the editor's shape. */
function seededBank(): DraftQuestion[] {
  return ASSESSMENT_QUESTIONS.map((question, index) => ({
    id: question.key,
    displayOrder: index + 1,
    options: LIKERT_LEVELS.map((level) => ({
      id: `${question.key}-${level.key}`,
      weights: { [question.letter]: level.weight },
    })),
  }));
}

describe('assessBank — the seeded bank', () => {
  it('publishes without blockers or warnings', () => {
    /* If this ever fails, either the guard has become stricter than the bank the
       product actually ships, or the bank has drifted out of balance. Both are
       worth failing CI for, and neither is visible from any screen. */
    expect(assessBank(seededBank())).toMatchObject({ blockers: [], warnings: [], balanced: true });
  });

  it('reports every dimension attaining the same twenty', () => {
    const { attainable } = assessBank(seededBank());

    /* D-032's number: five items per dimension, four points at the top level. */
    expect(new Set(RIASEC_LETTERS.map((letter) => attainable[letter]))).toEqual(new Set([20]));
  });
});

describe('assessBank — balance is a blocker', () => {
  it('refuses a bank with one extra question on a single dimension', () => {
    /* The realistic mistake: an administrator adds one good question and skews
       every Holland Code the version will ever produce. */
    const bank = [...balancedBank(2), likert('S-extra', 'S', 99)];
    const result = assessBank(bank);

    expect(result.blockers).toContain(BANK_BLOCKER.UNBALANCED);
    expect(result.balanced).toBe(false);
  });

  it('names what each dimension can attain, so the editor can say which differ', () => {
    const bank = [...balancedBank(1), likert('S-extra', 'S', 99)];
    const { attainable } = assessBank(bank);

    expect(attainable.S).toBe(8);
    expect(attainable.R).toBe(4);
  });

  it('accepts a per-dimension-equal increase, which is how the count changes', () => {
    /* Five per dimension to six is six new questions, one per letter. The guard
       has to permit exactly this or the count is not adjustable at all. */
    expect(assessBank(balancedBank(6)).blockers).toEqual([]);
  });

  it('refuses an imbalance produced by weights rather than by counts', () => {
    /*
     * The subtler half, and the reason the rule is expressed over *attainable
     * maxima* rather than over question counts: the bank below has one item per
     * dimension, so any count-based check passes it, while a taker who is
     * strongly Enterprising can score twice what a strongly Realistic one can.
     */
    const bank = balancedBank(1).map((question, index) =>
      RIASEC_LETTERS[index] === 'E'
        ? likert('E-heavy', 'E', question.displayOrder, [0, 2, 4, 6, 8])
        : question,
    );

    expect(assessBank(bank).blockers).toContain(BANK_BLOCKER.UNBALANCED);
  });

  it('accepts a rescaled bank as long as every dimension is rescaled with it', () => {
    /* Balance is not "0-4"; it is "the same ceiling for all six". A ministry that
       wanted a 0-8 scale should be able to have one. */
    const bank = RIASEC_LETTERS.map((letter, index) =>
      likert(`${letter}0`, letter, index + 1, [0, 2, 4, 6, 8]),
    );

    expect(assessBank(bank)).toMatchObject({ blockers: [], balanced: true });
  });
});

describe('assessBank — the other blockers', () => {
  it('refuses a bank too small to rank six dimensions', () => {
    /* Below six, at least one dimension can attain nothing, and the code comes
       out of D-031's tie-break rather than out of the answers. */
    const bank = RIASEC_LETTERS.slice(0, 3).map((letter, index) =>
      likert(`${letter}0`, letter, index + 1),
    );

    expect(assessBank(bank).blockers).toContain(BANK_BLOCKER.TOO_FEW_QUESTIONS);
  });

  it('refuses a question with fewer than two options', () => {
    const bank = balancedBank(1);
    bank[0] = { ...bank[0]!, options: [bank[0]!.options[0]!] };

    expect(assessBank(bank).blockers).toContain(BANK_BLOCKER.QUESTION_WITHOUT_OPTIONS);
  });

  it('refuses an option that contributes to no dimension at all', () => {
    /*
     * Distinct from the Likert floor. "Does not apply to me at all" has its
     * dimension and scores 0 on it; an option with no weight rows contributes
     * nowhere, so choosing it is indistinguishable from not answering — while
     * `tallyAnswers` counts it as a complete submission.
     */
    const bank = balancedBank(1);
    bank[0] = {
      ...bank[0]!,
      options: [...bank[0]!.options, { id: 'orphan', weights: {} }],
    };

    expect(assessBank(bank).blockers).toContain(BANK_BLOCKER.DIMENSIONLESS_OPTION);
  });

  it('reports every blocker at once rather than stopping at the first', () => {
    /* An administrator fixing one problem at a time, discovering the next only
       after re-publishing, is the editor being obstructive. */
    const bank = [likert('R0', 'R', 1), likert('R1', 'R', 2)];
    const { blockers } = assessBank(bank);

    expect(blockers).toEqual(
      expect.arrayContaining([BANK_BLOCKER.TOO_FEW_QUESTIONS, BANK_BLOCKER.UNBALANCED]),
    );
  });
});

describe('assessBank — adjacency only warns', () => {
  it('warns when two consecutive questions share a dimension', () => {
    const bank = [...balancedBank(1), likert('R-second', 'R', 7)];
    /* Balanced it is not — but the warning must be present alongside the
       blocker, because an administrator fixing the balance should not then
       discover the adjacency as a fresh surprise. */
    const result = assessBank([...bank, likert('R-third', 'R', 8)]);

    expect(result.warnings).toContain(BANK_WARNING.ADJACENT_DIMENSIONS);
  });

  it('does not turn adjacency into a blocker', () => {
    /* Six items grouped by dimension: balanced, and readable as a labelled
       section. D-071 says an administrator may have a reason for that. */
    const bank = [
      likert('R0', 'R', 1),
      likert('R1', 'R', 2),
      likert('I0', 'I', 3),
      likert('I1', 'I', 4),
      likert('A0', 'A', 5),
      likert('A1', 'A', 6),
      likert('S0', 'S', 7),
      likert('S1', 'S', 8),
      likert('E0', 'E', 9),
      likert('E1', 'E', 10),
      likert('C0', 'C', 11),
      likert('C1', 'C', 12),
    ];
    const result = assessBank(bank);

    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain(BANK_WARNING.ADJACENT_DIMENSIONS);
  });

  it('judges adjacency by presentation order, not by insertion order', () => {
    /* The questions arrive out of order and interleave once sorted, which is
       what a taker actually sees. */
    const bank = [
      likert('R0', 'R', 1),
      likert('R1', 'R', 3),
      likert('I0', 'I', 2),
      likert('I1', 'I', 4),
      likert('A0', 'A', 5),
      likert('S0', 'S', 6),
      likert('E0', 'E', 7),
      likert('C0', 'C', 8),
      likert('A1', 'A', 9),
      likert('S1', 'S', 10),
      likert('E1', 'E', 11),
      likert('C1', 'C', 12),
    ];

    expect(assessBank(bank).warnings).toEqual([]);
  });
});
