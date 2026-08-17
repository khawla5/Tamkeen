import { RIASEC_LETTERS, type RiasecLetter } from '@tamkeen/types';

import {
  isBalancedBank,
  maxAttainableByDimension,
  type ScorableQuestion,
} from '../assessment/scoring';
import { ASSESSMENT_QUESTIONS, ASSESSMENT_SEED, LIKERT_LEVELS } from './assessment';

/**
 * Content tests for the question bank.
 *
 * Wording is provisional and expected to change; the *properties* asserted here
 * are not. They are what makes a Holland Code a result rather than an artefact of
 * how the bank happened to be authored, so an edit that breaks one should fail CI
 * and force a deliberate decision (D-032).
 */

/** The bank as the scoring engine sees it, once options are expanded. */
const scorable: ScorableQuestion[] = ASSESSMENT_QUESTIONS.map((question) => ({
  id: question.key,
  options: LIKERT_LEVELS.map((level) => ({
    id: `${question.key}-${level.key}`,
    weights: { [question.letter]: level.weight } as Record<RiasecLetter, number>,
  })),
}));

const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]/;

describe('RIASEC question bank', () => {
  it('holds ~20-30 questions as CLAUDE.md §1 specifies', () => {
    expect(ASSESSMENT_QUESTIONS.length).toBe(30);
  });

  it('covers all six dimensions equally — five items each', () => {
    /* Asserted as one object rather than in a loop: a failure then names which
       dimensions are over- or under-represented instead of stopping at the first. */
    const counts = Object.fromEntries(
      RIASEC_LETTERS.map((letter) => [
        letter,
        ASSESSMENT_QUESTIONS.filter((question) => question.letter === letter).length,
      ]),
    );

    expect(counts).toEqual({ R: 5, I: 5, A: 5, S: 5, E: 5, C: 5 });
  });

  it('is balanced, so raw scores are comparable across dimensions (D-032)', () => {
    /* The property the whole result rests on: if one dimension could attain more
       points than another, the top-three code would reflect the bank's shape
       rather than the user's interests. */
    expect(isBalancedBank(scorable)).toBe(true);
  });

  it('lets every dimension attain exactly 20 points', () => {
    /* Five items × a top level worth 4. Asserted through the engine rather than
       recomputed here, so this measures what scoring will actually produce. */
    expect(maxAttainableByDimension(scorable)).toEqual({
      R: 20,
      I: 20,
      A: 20,
      S: 20,
      E: 20,
      C: 20,
    });
  });

  it('uses unique, stable question keys', () => {
    const keys = ASSESSMENT_QUESTIONS.map((question) => question.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('interleaves dimensions instead of grouping them', () => {
    /*
     * Five consecutive items on the same dimension read as a labelled section,
     * and a user who has decided how they want to be categorised can answer the
     * whole block uniformly. No two consecutive items share a dimension.
     */
    for (let index = 1; index < ASSESSMENT_QUESTIONS.length; index += 1) {
      expect(ASSESSMENT_QUESTIONS[index]!.letter).not.toBe(ASSESSMENT_QUESTIONS[index - 1]!.letter);
    }
  });

  it('is written in Arabic, with no stray English (§2 Arabic-first)', () => {
    /* Collecting the offenders means a failure lists every bad item by key,
       rather than halting on the first one. */
    const notArabic = ASSESSMENT_QUESTIONS.filter(
      (question) => !ARABIC_SCRIPT.test(question.text),
    ).map((question) => question.key);
    const hasLatin = ASSESSMENT_QUESTIONS.filter((question) =>
      LATIN_LETTERS.test(question.text),
    ).map((question) => question.key);

    expect(notArabic).toEqual([]);
    expect(hasLatin).toEqual([]);

    expect(ARABIC_SCRIPT.test(ASSESSMENT_SEED.title)).toBe(true);
    expect(ARABIC_SCRIPT.test(ASSESSMENT_SEED.description)).toBe(true);
  });

  it('has no blank or duplicated statements', () => {
    const texts = ASSESSMENT_QUESTIONS.map((question) => question.text.trim());

    expect(texts.every((text) => text.length > 0)).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('Likert levels', () => {
  it('offers five agreement levels', () => {
    expect(LIKERT_LEVELS).toHaveLength(5);
  });

  it('starts at zero so rejecting an item contributes nothing', () => {
    /*
     * On a 1-5 scale, a user who rejected every Realistic item would still
     * accumulate Realistic points purely for having answered — the floor would
     * track the number of items rather than the user's interest.
     */
    expect(LIKERT_LEVELS[0]!.weight).toBe(0);
  });

  it('increases monotonically with agreement', () => {
    const weights = LIKERT_LEVELS.map((level) => level.weight);

    expect(weights).toEqual([...weights].sort((left, right) => left - right));
    expect(new Set(weights).size).toBe(weights.length);
  });

  it('labels every level in Arabic, with unique keys', () => {
    for (const level of LIKERT_LEVELS) {
      expect(ARABIC_SCRIPT.test(level.label)).toBe(true);
      expect(LATIN_LETTERS.test(level.label)).toBe(false);
    }

    expect(new Set(LIKERT_LEVELS.map((level) => level.key)).size).toBe(LIKERT_LEVELS.length);
  });
});
