import { seedEnglishAssessment } from './seed-runner';
import { ENGLISH_ASSESSMENT_SEED, ENGLISH_BANDS, ENGLISH_QUESTIONS } from './english-assessment';
import type { PrismaClient } from '../../generated/prisma';

/**
 * `seedEnglishAssessment`'s one consequential rule (D-083, applied to §4.13).
 *
 * **It bootstraps; it does not maintain.** Once an administrator has published
 * an edit through §4C.9, re-running the seed must leave every row alone — on
 * `npm run db:seed`, in a deployment script, in CI against a real database.
 * Getting this wrong overwrites a ministry-authored instrument with whatever
 * wording shipped in the repository, and for this instrument the loss would
 * include the band boundaries that decide what every future placement *means*.
 *
 * Tested against a stub rather than a database, deliberately: the property is
 * "which writes are issued", and asserting that directly is both possible
 * without Postgres and stronger than inspecting rows afterwards — a test that
 * read the database could pass while the seed had written and then rewritten
 * the same values.
 */

interface Stub {
  client: PrismaClient;
  calls: {
    assessmentUpdate: jest.Mock;
    assessmentCreate: jest.Mock;
    questionUpsert: jest.Mock;
    optionUpsert: jest.Mock;
    bandUpsert: jest.Mock;
    questionDeleteMany: jest.Mock;
    optionDeleteMany: jest.Mock;
  };
}

/** A Prisma stand-in holding whatever `english_assessments` rows the test wants. */
function stub(existing: Array<{ id: string; version: number; status: string }>): Stub {
  let counter = 0;
  const nextId = () => (counter += 1);

  const calls = {
    assessmentUpdate: jest.fn().mockResolvedValue({ id: 'a1' }),
    assessmentCreate: jest.fn().mockResolvedValue({ id: 'a1' }),
    /* A distinct id per call: the grouping below is only meaningful if each
       question is actually a different row. */
    questionUpsert: jest.fn().mockImplementation(() => Promise.resolve({ id: `q${nextId()}` })),
    optionUpsert: jest.fn().mockResolvedValue({ id: 'o1' }),
    bandUpsert: jest.fn().mockResolvedValue({ id: 'b1' }),
    questionDeleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    optionDeleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const client = {
    englishAssessment: {
      findMany: jest
        .fn()
        .mockResolvedValue(existing.map((row) => ({ ...row, effectiveFrom: null }))),
      update: calls.assessmentUpdate,
      create: calls.assessmentCreate,
    },
    englishAssessmentQuestion: {
      upsert: calls.questionUpsert,
      deleteMany: calls.questionDeleteMany,
      count: jest.fn().mockResolvedValue(30),
    },
    englishAssessmentOption: {
      upsert: calls.optionUpsert,
      deleteMany: calls.optionDeleteMany,
    },
    englishAssessmentBand: { upsert: calls.bandUpsert },
  } as unknown as PrismaClient;

  return { client, calls };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('seeding a fresh database', () => {
  it('creates version 1 and writes every question, option and band', async () => {
    const { client, calls } = stub([]);

    const result = await seedEnglishAssessment(client);

    expect(calls.assessmentCreate).toHaveBeenCalledTimes(1);
    expect(calls.questionUpsert).toHaveBeenCalledTimes(ENGLISH_QUESTIONS.length);
    expect(calls.bandUpsert).toHaveBeenCalledTimes(ENGLISH_BANDS.length);
    expect(result.englishQuestions).toBe(ENGLISH_QUESTIONS.length);
  });

  it('writes the bands in the same pass as the questions', async () => {
    /* They are only meaningful together: a table covering 0-60 is correct for
       this bank and wrong for a bank of twenty items. Seeding them apart would
       leave a window in which the instrument existed and could not score. */
    const { client, calls } = stub([]);

    await seedEnglishAssessment(client);

    const levels = calls.bandUpsert.mock.calls.map(
      (call) => (call[0] as { create: { level: string } }).create.level,
    );
    expect(levels).toEqual(ENGLISH_BANDS.map((band) => band.level));
  });

  it('writes exactly one correct option per question', async () => {
    /* The answer key reaching the database is the whole point of the seed, and
       an off-by-one here would place people against a bank that scores the
       wrong option — with nothing anywhere reporting it. */
    const { client, calls } = stub([]);

    await seedEnglishAssessment(client);

    const correctPerQuestion = new Map<string, number>();
    for (const call of calls.optionUpsert.mock.calls) {
      const arg = call[0] as {
        where: { questionId_key: { questionId: string } };
        create: { isCorrect: boolean };
      };
      const id = arg.where.questionId_key.questionId;
      correctPerQuestion.set(
        id,
        (correctPerQuestion.get(id) ?? 0) + (arg.create.isCorrect ? 1 : 0),
      );
    }

    expect(correctPerQuestion.size).toBe(ENGLISH_QUESTIONS.length);
    expect([...correctPerQuestion.values()]).toEqual(
      Array.from({ length: ENGLISH_QUESTIONS.length }, () => 1),
    );
  });
});

describe('re-seeding while version 1 is still the only version', () => {
  it('updates in place rather than creating a second version', async () => {
    const { client, calls } = stub([{ id: 'a1', version: 1, status: 'ACTIVE' }]);

    await seedEnglishAssessment(client);

    expect(calls.assessmentCreate).not.toHaveBeenCalled();
    expect(calls.assessmentUpdate).toHaveBeenCalledTimes(1);
    expect(calls.questionUpsert).toHaveBeenCalledTimes(ENGLISH_QUESTIONS.length);
  });
});

describe('re-seeding after the ministry has published an edit', () => {
  const published = [
    { id: 'a1', version: 1, status: 'RETIRED' },
    { id: 'a2', version: 2, status: 'ACTIVE' },
  ];

  it('writes nothing at all', async () => {
    /* The whole rule. Every write mock must be untouched — asserted over all of
       them rather than over the ones that came to mind, because the failure this
       guards is a *new* write added later without the guard in front of it. */
    const { client, calls } = stub(published);

    await seedEnglishAssessment(client);

    const touched = Object.entries(calls)
      .filter(([, mock]) => mock.mock.calls.length > 0)
      .map(([name]) => name);

    expect(touched).toEqual([]);
  });

  it('says so rather than standing back quietly', async () => {
    /* A seed that appears to run and changes nothing is how somebody spends an
       afternoon wondering why their edit did not take. */
    const { client } = stub(published);

    await seedEnglishAssessment(client);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(ENGLISH_ASSESSMENT_SEED.key));
  });

  it('still reports how many questions the live version holds', async () => {
    const { client } = stub(published);

    expect(await seedEnglishAssessment(client)).toEqual({ englishQuestions: 30 });
  });
});
