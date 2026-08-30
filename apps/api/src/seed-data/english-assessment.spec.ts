import { CEFR_LEVELS, ENGLISH_SKILLS } from '@tamkeen/types';

import {
  ENGLISH_ASSESSMENT_SEED,
  ENGLISH_BANDS,
  ENGLISH_MAX_SCORE,
  ENGLISH_QUESTIONS,
} from './english-assessment';
import { assessEnglishBank, type DraftEnglishQuestion } from '../admin/english-bank-readiness';
import { resolveCefrBand, scoreEnglishAssessment } from '../english-assessment/english-scoring';
import type { ScorableEnglishQuestion } from '../english-assessment/english-scoring';

/**
 * The seeded English bank as *content* (§4.13).
 *
 * The wording is a first draft for the ministry to review. The properties below
 * are not: they are what makes the bank a working instrument rather than thirty
 * sentences, and each one is the kind of mistake that produces a plausible but
 * wrong placement with nothing reporting it — a missing answer key, an item
 * worth nothing, a band table that stopped matching the bank after somebody
 * added a question.
 */

const scorable: ScorableEnglishQuestion[] = ENGLISH_QUESTIONS.map((question) => ({
  id: question.key,
  marks: question.marks,
  options: question.options.map((label, index) => ({
    id: `${question.key}-o${index + 1}`,
    isCorrect: index === question.correctIndex,
  })),
}));

const draft: DraftEnglishQuestion[] = ENGLISH_QUESTIONS.map((question, index) => ({
  id: question.key,
  displayOrder: index + 1,
  marks: question.marks,
  level: question.level,
  skill: question.skill,
  options: question.options.map((_unused, optionIndex) => ({
    id: `${question.key}-o${optionIndex + 1}`,
    isCorrect: optionIndex === question.correctIndex,
  })),
}));

/** Answers the first `n` items correctly (they are in ascending level order). */
function answerFirst(n: number) {
  return ENGLISH_QUESTIONS.map((question, index) => ({
    questionId: question.key,
    optionId: `${question.key}-o${index < n ? question.correctIndex + 1 : wrongOption(question) + 1}`,
  }));
}

function wrongOption(question: (typeof ENGLISH_QUESTIONS)[number]): number {
  return question.correctIndex === 0 ? 1 : 0;
}

describe('the bank as an instrument', () => {
  it('has thirty questions', () => {
    expect(ENGLISH_QUESTIONS).toHaveLength(30);
  });

  it('covers all six CEFR levels, five items each', () => {
    const perLevel = Object.fromEntries(
      CEFR_LEVELS.map((level) => [
        level,
        ENGLISH_QUESTIONS.filter((question) => question.level === level).length,
      ]),
    );

    expect(perLevel).toEqual({ A1: 5, A2: 5, B1: 5, B2: 5, C1: 5, C2: 5 });
  });

  it('covers all four skills', () => {
    /* §4.13 asks for grammar, vocabulary, reading and practical English. A bank
       that quietly became thirty grammar items would still publish. */
    const unused = ENGLISH_SKILLS.filter(
      (skill) => !ENGLISH_QUESTIONS.some((question) => question.skill === skill),
    );

    expect(unused).toEqual([]);
  });

  it('gives every level at least one reading and one practical item', () => {
    const missing = CEFR_LEVELS.flatMap((level) => {
      const skills = new Set(
        ENGLISH_QUESTIONS.filter((question) => question.level === level).map(
          (question) => question.skill,
        ),
      );

      return (['READING', 'PRACTICAL'] as const)
        .filter((skill) => !skills.has(skill))
        .map((skill) => `${level}:${skill}`);
    });

    expect(missing).toEqual([]);
  });

  it('runs in ascending level order', () => {
    /* Unlike the RIASEC bank's interleaving (D-032). Opening with C2 grammar
       makes a genuine A2 speaker give up on a test that was about to place them
       correctly. */
    const ranks = ENGLISH_QUESTIONS.map((question) => CEFR_LEVELS.indexOf(question.level));

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('has a unique, stable key per question', () => {
    /* Keys are what a stored response points at, so a duplicate would make two
       different items look like the same item revised. */
    const keys = ENGLISH_QUESTIONS.map((question) => question.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('asks no question twice', () => {
    const texts = ENGLISH_QUESTIONS.map((question) => question.text.trim());

    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('every item is answerable and scoreable', () => {
  it('offers at least two options', () => {
    const tooFew = ENGLISH_QUESTIONS.filter((question) => question.options.length < 2).map(
      (question) => question.key,
    );

    expect(tooFew).toEqual([]);
  });

  it('marks exactly one option correct, and it exists', () => {
    /* The concept Holland's model has no analogue for, and the one whose absence
       would make an item unscoreable while looking perfectly normal. */
    const unanswerable = ENGLISH_QUESTIONS.filter(
      (question) => question.correctIndex < 0 || question.correctIndex >= question.options.length,
    ).map((question) => question.key);

    expect(unanswerable).toEqual([]);
  });

  it('does not always put the correct answer in the same position', () => {
    /*
     * The defect this exists to prevent: the items are authored with the right
     * answer first, because that is how a human reviews an answer key — and
     * seeding them that way would be a test anybody could pass without a word of
     * English, because the position *is* the answer.
     *
     * Asserted as a distribution rather than "not always zero": one stray item
     * moved off position 0 would satisfy the weaker check while twenty-nine
     * others still gave the game away.
     */
    const positions = ENGLISH_QUESTIONS.map((question) => question.correctIndex);
    const counts = new Map<number, number>();
    for (const position of positions) {
      counts.set(position, (counts.get(position) ?? 0) + 1);
    }

    /* Every position an item offers is used at least once … */
    expect(counts.size).toBeGreaterThanOrEqual(4);
    /* … and no single one holds more than a third of the answers. */
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(Math.ceil(ENGLISH_QUESTIONS.length / 3));
    }
  });

  it('keeps the correct option pointing at the answer the author wrote', () => {
    /* Rotation moves the options; it must not move the *answer*. Spot-checked
       against three items whose correct text is known from the source above,
       because a rotation bug would otherwise be invisible — every structural
       property would still hold while the bank scored the wrong option. */
    const byKey = new Map(ENGLISH_QUESTIONS.map((question) => [question.key, question]));

    const correctOf = (key: string) => {
      const question = byKey.get(key)!;
      return question.options[question.correctIndex];
    };

    expect(correctOf('A1-1')).toBe('is');
    expect(correctOf('B1-2')).toBe('delay');
    expect(correctOf('C2-1')).toBe('cogent');
  });

  it('offers no duplicate or blank options within a question', () => {
    const faulty = ENGLISH_QUESTIONS.filter((question) => {
      const labels = question.options.map((option) => option.trim());

      return labels.some((label) => label.length === 0) || new Set(labels).size !== labels.length;
    }).map((question) => question.key);

    expect(faulty).toEqual([]);
  });

  it('is worth more at higher levels, and never nothing', () => {
    expect(ENGLISH_QUESTIONS.filter((question) => question.marks < 1).map((q) => q.key)).toEqual(
      [],
    );

    /* One mark value per level, and never decreasing up the scale. */
    const valuesPerLevel = CEFR_LEVELS.map((level) => [
      ...new Set(
        ENGLISH_QUESTIONS.filter((question) => question.level === level).map(
          (question) => question.marks,
        ),
      ),
    ]);

    expect(valuesPerLevel.map((values) => values.length)).toEqual([1, 1, 1, 1, 1, 1]);

    const perLevel = valuesPerLevel.map((values) => values[0]!);
    expect(perLevel).toEqual([...perLevel].sort((a, b) => a - b));
  });

  it('is written in English, as an English test must be', () => {
    /* §2 is Arabic-first and `messages.test.ts` enforces that over the message
       catalogue — but an English proficiency item cannot be posed in Arabic
       without ceasing to measure anything (D-047's rule, applied to assessment
       content). The chrome around it stays Arabic, asserted below. */
    const ARABIC = /[؀-ۿ]/;

    const withArabic = ENGLISH_QUESTIONS.filter(
      (question) => ARABIC.test(question.text) || question.options.some((o) => ARABIC.test(o)),
    ).map((question) => question.key);

    expect(withArabic).toEqual([]);
  });

  it('names and describes the instrument in Arabic', () => {
    const ARABIC = /[؀-ۿ]/;

    expect(ARABIC.test(ENGLISH_ASSESSMENT_SEED.title)).toBe(true);
    expect(ARABIC.test(ENGLISH_ASSESSMENT_SEED.description)).toBe(true);
  });
});

describe('the band table matches the bank it belongs to', () => {
  it('attains sixty marks', () => {
    expect(ENGLISH_MAX_SCORE).toBe(60);
  });

  it('partitions zero to the attainable total', () => {
    /* The property D-125 exists to protect, asserted here over the seed so a
       content edit that changes the total without moving the table fails CI
       rather than shipping a bank nobody at the top can be placed in. */
    expect(ENGLISH_BANDS[0]!.minScore).toBe(0);
    expect(ENGLISH_BANDS[ENGLISH_BANDS.length - 1]!.maxScore).toBe(ENGLISH_MAX_SCORE);

    for (let index = 1; index < ENGLISH_BANDS.length; index += 1) {
      expect(ENGLISH_BANDS[index]!.minScore).toBe(ENGLISH_BANDS[index - 1]!.maxScore + 1);
    }
  });

  it('names every level exactly once, in ascending order', () => {
    expect(ENGLISH_BANDS.map((band) => band.level)).toEqual([...CEFR_LEVELS]);
  });

  it('places every attainable score in exactly one band', () => {
    /* Every integer from 0 to the total, checked individually: a gap and a
       learner cannot be placed at all, an overlap and the level they are told
       depends on which row was read first. */
    const misplaced = Array.from({ length: ENGLISH_MAX_SCORE + 1 }, (_unused, score) => score)
      .map((score) => ({
        score,
        matches: ENGLISH_BANDS.filter((band) => score >= band.minScore && score <= band.maxScore)
          .length,
      }))
      .filter((entry) => entry.matches !== 1);

    expect(misplaced).toEqual([]);
  });
});

describe('the seeded bank publishes and scores', () => {
  it('passes the publish gate with no blockers', () => {
    /* The CI guard §2B asks for: an edit to this file that breaks the
       instrument fails the build rather than being noticed in production. */
    const readiness = assessEnglishBank(draft, ENGLISH_BANDS);

    expect(readiness.blockers).toEqual([]);
    expect(readiness.maxScore).toBe(ENGLISH_MAX_SCORE);
    expect(readiness.bandsCoverRange).toBe(true);
  });

  it('raises no warnings either — every level has items targeting it', () => {
    expect(assessEnglishBank(draft, ENGLISH_BANDS).warnings).toEqual([]);
  });

  it('places a perfect attempt at C2 and an empty one at A1', () => {
    expect(scoreEnglishAssessment(scorable, ENGLISH_BANDS, answerFirst(30)).level).toBe('C2');
    expect(scoreEnglishAssessment(scorable, ENGLISH_BANDS, answerFirst(0)).level).toBe('A1');
  });

  it('cannot reach the top band on the lower levels alone', () => {
    /* The property that makes the table defensible rather than arbitrary: a
       taker who answers every A and B item correctly and no C item must not be
       placed at C1 or C2. */
    const throughB2 = ENGLISH_QUESTIONS.filter((question) =>
      ['A1', 'A2', 'B1', 'B2'].includes(question.level),
    ).reduce((total, question) => total + question.marks, 0);

    const level = resolveCefrBand(ENGLISH_BANDS, throughB2)?.level;

    expect(throughB2).toBe(30);
    expect(CEFR_LEVELS.indexOf(level!)).toBeLessThan(CEFR_LEVELS.indexOf('C1'));
  });

  it('places a taker who answers only the A-level items at A1', () => {
    const throughA2 = ENGLISH_QUESTIONS.filter((question) =>
      ['A1', 'A2'].includes(question.level),
    ).reduce((total, question) => total + question.marks, 0);

    expect(resolveCefrBand(ENGLISH_BANDS, throughA2)?.level).toBe('A1');
  });
});
