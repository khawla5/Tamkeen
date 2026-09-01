import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type {
  AdminAssessmentDraft,
  AdminAssessmentOverview,
  AdminAssessmentVersion,
  AssessmentView,
} from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { SharedStateLock } from './shared-state-lock';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.3 over real HTTP against a real database.
 *
 * **Two properties carry this suite, and both are about what does *not*
 * happen.**
 *
 * D-049: publishing an edit must not touch a result anybody already has. The
 * assertion is not "the numbers look the same" — it is that the result row, its
 * responses, and the questions those responses point at are all byte-identical
 * before and after, and that the question text a historical response resolves to
 * is still the text that was asked.
 *
 * D-034: no weighting may reach a taker. The admin draft endpoint returns
 * weights by design; the learner endpoint must not, and the check greps the
 * whole serialised response rather than named fields, because the failure mode
 * is a field nobody thought about.
 */

class EmailCapture {
  sendEmailVerification(): Promise<void> {
    return Promise.resolve();
  }
  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
  sendInvitation(): Promise<void> {
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

/**
 * Copying and publishing a bank writes several hundred rows.
 *
 * Jest's five-second default is calibrated for a test that makes one call; these
 * make one that copies the whole instrument, and against a database ten other
 * suites are using concurrently that is not a fair budget. Raised for this file
 * only — a slow *unit* test is a smell, a slow bulk copy is arithmetic.
 */
jest.setTimeout(30_000);

describe('Admin assessment management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /* Serialised against the other suites that write globally visible product
     state — the assessment and the catalogue of paths. See
     shared-state-lock.ts. */
  const lock = new SharedStateLock();

  let sessionAdmin: string;
  let adminId: string;

  let csrfCookie: string;
  let csrfToken: string;

  /**
   * The bank as the draft found it.
   *
   * Captured rather than hardcoded to the seed's thirty. The assertions below
   * are about *changes* — one dimension gaining a question, then the other five
   * catching up — and stating them against a remembered baseline keeps them true
   * whatever the instrument happened to be when the suite started, which is the
   * only honest thing to assume about shared state.
   */
  let baseline: { questions: number; attainable: number };

  /**
   * Every assessment row this run created.
   *
   * Tracked so the cleanup can delete exactly these, rather than "every version
   * above 1" — which is not namespaced to a run and, when two runs overlap even
   * briefly, deletes the *other* run's freshly created draft. That produced a
   * 404 from an endpoint whose draft demonstrably existed two tests earlier, and
   * cost a while to see.
   */
  const createdAssessmentIds: string[] = [];

  /** A result recorded against version 1, before any edit. */
  let frozen: {
    resultId: string;
    userId: string;
    scores: Record<string, number>;
    questionText: string;
    questionId: string;
  };

  beforeAll(async () => {
    await lock.acquire();
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(new EmailCapture())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const issued = await csrf();
    csrfCookie = issued.cookie;
    csrfToken = issued.token;

    adminId = await account('admin', 'SUPER_ADMIN');
    sessionAdmin = await signIn(`aasmt-${RUN_ID}-admin@ministry.gov.example`);

    frozen = await recordResultAgainstActiveVersion();
    /* Generous: the first thing this hook does is wait for the other suite to
       finish with the assessment, which can take most of a journey run. */
  }, 240_000);

  afterAll(async () => {
    /* Order matters: responses reference questions with Restrict, and results
       reference the assessment version with Restrict. */
    await prisma.assessmentResponse.deleteMany({ where: { resultId: frozen.resultId } });
    await prisma.assessmentResult.deleteMany({ where: { userId: frozen.userId } });

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `aasmt-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    /*
     * Return the instrument to a single active version 1, so the next suite —
     * and the next run of this one — starts where it expects to. The published
     * version 2 is deleted only after its results are gone, which by now they
     * are; version 1 is reactivated first because a partial unique index permits
     * only one ACTIVE row.
     */
    if (createdAssessmentIds.length > 0) {
      const original = await prisma.assessment.findFirst({
        where: { key: 'riasec-core', id: { notIn: createdAssessmentIds } },
        orderBy: { version: 'asc' },
        select: { id: true },
      });

      /* Reactivated before the later ones go: a partial unique index permits
         only one ACTIVE row per key, so the order is the constraint's, not a
         preference. */
      if (original) {
        await prisma.assessment.updateMany({
          where: { id: { in: createdAssessmentIds } },
          data: { status: 'RETIRED' },
        });
        await prisma.assessment.update({
          where: { id: original.id },
          data: { status: 'ACTIVE', retiredAt: null },
        });
      }

      await prisma.assessment.deleteMany({ where: { id: { in: createdAssessmentIds } } });
    }

    await app.close();
    await lock.release();
  }, 60_000);

  const server = () => app.getHttpServer() as unknown as App;

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      token: (response.body as { csrfToken: string }).csrfToken,
    };
  }

  function send(
    method: 'post' | 'patch' | 'delete',
    path: string,
    body: Record<string, unknown> = {},
    session?: string,
  ) {
    const agent = request(server());

    return agent[method](path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  const get = (path: string, session: string) => request(server()).get(path).set('Cookie', session);

  async function signIn(email: string): Promise<string> {
    const response = await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(
      200,
    );
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function account(label: string, role: 'EMPLOYEE' | 'SUPER_ADMIN'): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `aasmt-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `A-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    if (role === 'EMPLOYEE') {
      /* D-132: taking is gated on assignment; every taker in this suite is
         exercising the Holland instrument, so assign it at creation. */
      await prisma.assessmentAssignment.create({
        data: { userId: user.id, instrument: 'RIASEC' },
      });
    }

    return user.id;
  }

  /**
   * Records a completed assessment against whatever version is active.
   *
   * Written directly rather than through the API because the point is the row,
   * not the flow — the journey suite already proves the flow — and because the
   * answers have to be chosen from the *weights*, which no HTTP response
   * exposes. That inaccessibility is itself D-034 working.
   */
  async function recordResultAgainstActiveVersion() {
    const userId = await account('taker', 'EMPLOYEE');

    const active = await prisma.assessment.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            text: true,
            options: { orderBy: { displayOrder: 'asc' }, select: { id: true } },
          },
        },
      },
    });

    const result = await prisma.assessmentResult.create({
      data: {
        userId,
        assessmentId: active.id,
        assessmentVersion: active.version,
        scoreR: 11,
        scoreI: 12,
        scoreA: 13,
        scoreS: 14,
        scoreE: 15,
        scoreC: 16,
        maxScore: 20,
        code: 'CES',
      },
      select: { id: true },
    });

    await prisma.assessmentResponse.createMany({
      data: active.questions.map((question) => ({
        resultId: result.id,
        questionId: question.id,
        optionId: question.options[0]!.id,
      })),
    });

    return {
      resultId: result.id,
      userId,
      scores: { R: 11, I: 12, A: 13, S: 14, E: 15, C: 16 },
      questionText: active.questions[0]!.text,
      questionId: active.questions[0]!.id,
    };
  }

  describe('the overview', () => {
    it('names the active version and reports no draft in flight', async () => {
      const response = await get('/api/admin/assessment', sessionAdmin).expect(200);
      const overview = response.body as AdminAssessmentOverview;

      expect(overview.active?.status).toBe('ACTIVE');
      expect(overview.active?.effectiveFrom).not.toBeNull();
      expect(overview.draft).toBeNull();
      /* The count that makes D-049 concrete on the screen: these results exist,
         and editing will not touch them. */
      expect(overview.active?.resultCount).toBeGreaterThan(0);
    });

    it('refuses to hand out a draft that does not exist', async () => {
      await get('/api/admin/assessment/draft', sessionAdmin).expect(404);
    });
  });

  describe('drafting', () => {
    let draft: AdminAssessmentDraft;

    it('opens as a deep copy of the active version', async () => {
      const response = await send('post', '/api/admin/assessment/draft', {}, sessionAdmin).expect(
        201,
      );
      draft = response.body as AdminAssessmentDraft;
      createdAssessmentIds.push(draft.id);

      baseline = {
        questions: draft.questions.length,
        attainable: draft.readiness.attainable.R,
      };

      expect(draft.version).toBe(2);
      expect(draft.basedOnVersion).toBe(1);
      expect(draft.questions.length).toBeGreaterThan(0);
      /* A copy, not a reference: not one row is shared with the version people
         have already taken. */
      expect(draft.questions.map((q) => q.id)).not.toContain(frozen.questionId);
    });

    it('starts balanced, because the bank it copied was', async () => {
      expect(draft.readiness).toMatchObject({ blockers: [], warnings: [], balanced: true });
    });

    it('carries the weights, which is what makes it the admin surface', async () => {
      const weights = draft.questions[0]!.options.map((option) => option.weights);

      expect(weights.some((weight) => Object.keys(weight).length > 0)).toBe(true);
    });

    it('refuses a second draft', async () => {
      const response = await send('post', '/api/admin/assessment/draft', {}, sessionAdmin).expect(
        409,
      );

      expect((response.body as { message: string }).message).toBe('ASSESSMENT_DRAFT_EXISTS');
    });

    it('is not served to a taker while it is being edited', async () => {
      const employeeSession = await (async () => {
        await account('learner', 'EMPLOYEE');
        return signIn(`aasmt-${RUN_ID}-learner@ministry.gov.example`);
      })();

      const response = await get('/api/assessment', employeeSession).expect(200);

      /* Still version 1. An edit in progress must reach nobody. */
      expect((response.body as AssessmentView).version).toBe(1);
    });
  });

  describe('the balance guard', () => {
    it('blocks a publish after one dimension gains a question', async () => {
      await send(
        'post',
        '/api/admin/assessment/draft/questions',
        { text: 'عبارة إضافية عن العمل الاجتماعي مع الزملاء.', letter: 'S' },
        sessionAdmin,
      ).expect(201);

      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;

      expect(draftNow.readiness.balanced).toBe(false);
      expect(draftNow.readiness.blockers).toContain('BANK_UNBALANCED');
      /*
       * Named per dimension, so the editor can say which ones differ rather than
       * only that something does. The gap is one item's top weight — four on the
       * seeded Likert scale — and stating it as a delta rather than as "24 and
       * 20" keeps the assertion about the *rule* rather than about the fixture.
       */
      expect(draftNow.readiness.attainable.R).toBe(baseline.attainable);
      expect(draftNow.readiness.attainable.S).toBeGreaterThan(baseline.attainable);

      const refusal = await send(
        'post',
        '/api/admin/assessment/draft/publish',
        {},
        sessionAdmin,
      ).expect(409);

      expect((refusal.body as { message: string }).message).toBe('BANK_UNBALANCED');
    });

    it('audits the refusal with the blockers that caused it', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ASSESSMENT_PUBLISHED', outcome: 'FAILURE', actorUserId: adminId },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({
        reason: 'BANK_NOT_PUBLISHABLE',
        blockers: 'BANK_UNBALANCED',
      });
    });

    it('left the live assessment untouched while the publish was refused', async () => {
      const active = await prisma.assessment.findFirstOrThrow({
        where: { status: 'ACTIVE' },
        select: { version: true },
      });

      expect(active.version).toBe(1);
    });

    it('clears once the other five dimensions gain a question each', async () => {
      /* The per-dimension-equal change D-071 exists to permit: five per
         dimension to six is six questions, one per letter. */
      for (const letter of ['R', 'I', 'A', 'E', 'C'] as const) {
        await send(
          'post',
          '/api/admin/assessment/draft/questions',
          { text: `عبارة إضافية للبُعد ${letter} في بيئة العمل.`, letter },
          sessionAdmin,
        ).expect(201);
      }

      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;

      /* One new question per dimension — the per-dimension-equal change D-071
         exists to permit. */
      expect(draftNow.questions).toHaveLength(baseline.questions + 6);
      expect(draftNow.readiness.balanced).toBe(true);
      expect(draftNow.readiness.blockers).toEqual([]);
    });
  });

  describe('editing questions and weights', () => {
    it('rejects a weighting on a dimension that does not exist', async () => {
      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const optionId = draftNow.questions[0]!.options[0]!.id;

      /* The DTO names the six letters explicitly, so this is a 400 from
         validation rather than a 500 from the enum column (D-035). */
      await send(
        'patch',
        `/api/admin/assessment/draft/options/${optionId}`,
        { weights: { X: 4 } },
        sessionAdmin,
      ).expect(400);
    });

    it('refuses to edit an option belonging to a published version', async () => {
      const published = await prisma.assessmentOption.findFirstOrThrow({
        where: { question: { assessment: { status: 'ACTIVE' } } },
        select: { id: true },
      });

      /* Reported as absent, not forbidden: editing a published version is not a
         thing that exists, so there is nothing to be permitted to do. */
      await send(
        'patch',
        `/api/admin/assessment/draft/options/${published.id}`,
        { label: 'محاولة' },
        sessionAdmin,
      ).expect(404);
    });

    it('replaces an option’s weights wholesale rather than merging them', async () => {
      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const option = draftNow.questions[0]!.options[4]!;

      const updated = (
        await send(
          'patch',
          `/api/admin/assessment/draft/options/${option.id}`,
          { weights: { S: 4 } },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      /* "This option now contributes to S only" has to be expressible, and a
         merge cannot say it. */
      expect(updated.questions[0]!.options[4]!.weights).toEqual({ S: 4 });
    });

    it('restores the weighting it just changed', async () => {
      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const option = draftNow.questions[0]!.options[4]!;

      const restored = (
        await send(
          'patch',
          `/api/admin/assessment/draft/options/${option.id}`,
          { weights: { R: 4 } },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(restored.readiness.balanced).toBe(true);
    });

    it('reorders by a complete list and refuses a partial one', async () => {
      const draftNow = (await get('/api/admin/assessment/draft', sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const ids = draftNow.questions.map((question) => question.id);

      await send(
        'patch',
        '/api/admin/assessment/draft/order',
        { questionIds: ids.slice(0, 5) },
        sessionAdmin,
      ).expect(400);

      const reversed = [...ids].reverse();
      const after = (
        await send(
          'patch',
          '/api/admin/assessment/draft/order',
          { questionIds: reversed },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(after.questions.map((question) => question.id)).toEqual(reversed);
      /* Reordering cannot unbalance a bank — the same items are still there —
         which is why it is safe to offer without a re-validation ceremony. */
      expect(after.readiness.balanced).toBe(true);

      await send(
        'patch',
        '/api/admin/assessment/draft/order',
        { questionIds: ids },
        sessionAdmin,
      ).expect(200);
    });
  });

  describe('publishing', () => {
    let published: AdminAssessmentVersion;

    it('activates the draft and retires its predecessor', async () => {
      published = (
        await send('post', '/api/admin/assessment/draft/publish', {}, sessionAdmin).expect(201)
      ).body as AdminAssessmentVersion;

      expect(published.version).toBe(2);
      expect(published.status).toBe('ACTIVE');
      expect(published.effectiveFrom).not.toBeNull();

      const versions = await prisma.assessment.findMany({
        where: { key: 'riasec-core' },
        orderBy: { version: 'asc' },
        select: { version: true, status: true, retiredAt: true },
      });

      expect(versions).toHaveLength(2);
      expect(versions[0]).toMatchObject({ version: 1, status: 'RETIRED' });
      expect(versions[0]!.retiredAt).not.toBeNull();
      expect(versions[1]).toMatchObject({ version: 2, status: 'ACTIVE' });
    });

    it('serves the new bank to the next taker', async () => {
      await account('newtaker', 'EMPLOYEE');
      const session = await signIn(`aasmt-${RUN_ID}-newtaker@ministry.gov.example`);

      const view = (await get('/api/assessment', session).expect(200)).body as AssessmentView;

      expect(view.version).toBe(2);
      expect(view.questions).toHaveLength(baseline.questions + 6);
    });

    it('never lets a weighting reach that taker', async () => {
      await account('grepper', 'EMPLOYEE');
      const session = await signIn(`aasmt-${RUN_ID}-grepper@ministry.gov.example`);

      const response = await get('/api/assessment', session).expect(200);
      const serialised = JSON.stringify(response.body);

      /*
       * Greps the whole response rather than named fields. The admin draft
       * endpoint now returns weights by design, so the risk is no longer that
       * nobody thought about D-034 — it is that a shared mapper starts being
       * used by both surfaces.
       */
      for (const forbidden of ['weight', 'dimension', 'points', 'riasec']) {
        expect(serialised.toLowerCase()).not.toContain(forbidden);
      }
    });

    it('leaves the existing result exactly as it was taken', async () => {
      const result = await prisma.assessmentResult.findUniqueOrThrow({
        where: { id: frozen.resultId },
        select: {
          assessmentVersion: true,
          scoreR: true,
          scoreI: true,
          scoreA: true,
          scoreS: true,
          scoreE: true,
          scoreC: true,
          maxScore: true,
          code: true,
          assessment: { select: { version: true, status: true } },
        },
      });

      /* Not recomputed, not renumbered, not repointed. D-049 in one assertion. */
      expect(result).toMatchObject({
        assessmentVersion: 1,
        scoreR: 11,
        scoreI: 12,
        scoreA: 13,
        scoreS: 14,
        scoreE: 15,
        scoreC: 16,
        maxScore: 20,
        code: 'CES',
      });
      /* And it still points at version 1, which still exists. */
      expect(result.assessment).toMatchObject({ version: 1, status: 'RETIRED' });
    });

    it('leaves the questions that result answered still readable', async () => {
      const question = await prisma.assessmentQuestion.findUniqueOrThrow({
        where: { id: frozen.questionId },
        select: { text: true, assessment: { select: { version: true } } },
      });

      /*
       * The half that a scores-only guarantee misses. A result is the numbers
       * *and* the instrument that produced them; if the questions had been
       * edited in place, this row would claim version 1 and read as version 2's
       * wording, and nobody could explain the recommendation months later.
       */
      expect(question.text).toBe(frozen.questionText);
      expect(question.assessment.version).toBe(1);

      const responses = await prisma.assessmentResponse.count({
        where: { resultId: frozen.resultId },
      });
      expect(responses).toBe(baseline.questions);
    });

    it('shows the retired version in the history with its result count', async () => {
      const overview = (await get('/api/admin/assessment', sessionAdmin).expect(200))
        .body as AdminAssessmentOverview;

      expect(overview.active?.version).toBe(2);
      expect(overview.draft).toBeNull();
      expect(overview.history.map((row) => row.version)).toEqual([1]);
      expect(overview.history[0]!.resultCount).toBeGreaterThan(0);
    });

    it('serves the retired version read-only, exactly as it was taken', async () => {
      const overview = (await get('/api/admin/assessment', sessionAdmin).expect(200))
        .body as AdminAssessmentOverview;

      const historical = (
        await get(`/api/admin/assessment/versions/${overview.history[0]!.id}`, sessionAdmin).expect(
          200,
        )
      ).body as AdminAssessmentDraft;

      expect(historical.version).toBe(1);
      expect(historical.questions).toHaveLength(baseline.questions);
      expect(historical.questions.some((q) => q.text === frozen.questionText)).toBe(true);
    });

    it('refuses to publish when there is nothing to publish', async () => {
      await send('post', '/api/admin/assessment/draft/publish', {}, sessionAdmin).expect(404);
    });
  });

  describe('discarding', () => {
    it('removes a draft and everything under it, leaving the active version alone', async () => {
      const created = (
        await send('post', '/api/admin/assessment/draft', {}, sessionAdmin).expect(201)
      ).body as AdminAssessmentDraft;
      createdAssessmentIds.push(created.id);

      const draft = await prisma.assessment.findFirstOrThrow({
        where: { id: created.id },
        select: { id: true },
      });

      await send('delete', '/api/admin/assessment/draft', {}, sessionAdmin).expect(204);

      /* Safe by construction rather than by check: a draft is never served, so
         no response can reference its questions, so the Restrict that protects
         published banks has nothing to refuse. */
      expect(await prisma.assessment.count({ where: { id: draft.id } })).toBe(0);
      expect(await prisma.assessmentQuestion.count({ where: { assessmentId: draft.id } })).toBe(0);

      const active = await prisma.assessment.findFirstOrThrow({
        where: { status: 'ACTIVE' },
        select: { version: true },
      });
      expect(active.version).toBe(2);
    });
  });
});
