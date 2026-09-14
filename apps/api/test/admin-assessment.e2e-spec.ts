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
 * §4C.3 over real HTTP against a real database (D-134).
 *
 * **Three properties carry this suite, and two of them are about what does
 * *not* happen.**
 *
 * D-049: publishing an edit must not touch a placement anybody already has. The
 * assertion is not "the numbers look the same" — it is that the result row, its
 * responses, and the questions those responses point at are all identical
 * before and after, and that the question text a historical response resolves
 * to is still the text that was asked.
 *
 * The absence rule: no answer key may reach a taker. The admin draft endpoint
 * returns `isCorrect`, `marks` and the rung an item targets by design; the
 * learner endpoint must not, and the check greps the whole serialised response
 * rather than named fields, because the failure mode is a field nobody thought
 * about.
 *
 * And the publish gate: a bank that cannot place somebody, or a band table that
 * leaves a score on no rung, is refused rather than published — because the
 * consequence is a path whose learners sit at «بانتظار تحديد المستوى» forever.
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
 * Jest's five-second default is calibrated for a test that makes one call;
 * these make one that copies a whole instrument, and against a database ten
 * other suites are using concurrently that is not a fair budget.
 */
jest.setTimeout(30_000);

describe('Admin assessment management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /* Serialised against the other suites that write globally visible product
     state — the paths and their assessments. See shared-state-lock.ts. */
  const lock = new SharedStateLock();

  let sessionAdmin: string;
  let adminId: string;

  let csrfCookie: string;
  let csrfToken: string;

  /** The suite's own path, so no learner's ladder is disturbed. */
  let pathId: string;
  let levels: Array<{ id: string; name: string; position: number }>;
  /** The version this suite publishes as the path's first live assessment. */
  let activeAssessmentId: string;

  /** A placement recorded against the first published version, before any edit. */
  let frozen: {
    resultId: string;
    userId: string;
    totalScore: number;
    maxScore: number;
    levelId: string;
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

    await createPathWithLadder();
    await publishFirstVersion();
    frozen = await recordPlacementAgainstActiveVersion();
  }, 240_000);

  afterAll(async () => {
    /* Order matters: responses reference questions with Restrict, and results
       reference the assessment version with Restrict. */
    await prisma.learnerPlacement.deleteMany({ where: { pathId } });
    await prisma.pathAssessmentResponse.deleteMany({
      where: { result: { assessment: { pathId } } },
    });
    await prisma.pathAssessmentResult.deleteMany({ where: { assessment: { pathId } } });
    await prisma.pathAssessment.deleteMany({ where: { pathId } });
    await prisma.userPath.deleteMany({ where: { pathId } });
    await prisma.level.deleteMany({ where: { pathId } });
    await prisma.path.deleteMany({ where: { id: pathId } });

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

  /** Every endpoint in this suite hangs off one path. */
  const route = (suffix = '') => `/api/admin/paths/${pathId}/assessment${suffix}`;

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

    return user.id;
  }

  /** Three rungs, because a two-rung band table hides an off-by-one. */
  async function createPathWithLadder(): Promise<void> {
    const path = await prisma.path.create({
      data: {
        key: `aasmt-${RUN_ID}`,
        name: 'مسار اختبار التقييم',
        description: 'مسار أُنشئ لاختبار إدارة التقييم.',
        displayOrder: 990,
        riasecLetter: 'R',
        status: 'DRAFT',
        levels: {
          create: [
            { name: 'تأسيسي', position: 1 },
            { name: 'متقدم', position: 2 },
            { name: 'متخصص', position: 3 },
          ],
        },
      },
      select: {
        id: true,
        levels: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true } },
      },
    });

    pathId = path.id;
    levels = path.levels;
  }

  /** Six items, two marks each: a max of twelve, comfortably over three rungs. */
  async function publishFirstVersion(): Promise<void> {
    await send('post', route('/draft'), {}, sessionAdmin).expect(201);

    for (let index = 0; index < 6; index += 1) {
      const draft = (
        await send(
          'post',
          route('/draft/questions'),
          {
            text: `السؤال التأسيسي رقم ${index + 1}`,
            marks: 2,
            levelId: levels[index % levels.length]!.id,
          },
          sessionAdmin,
        ).expect(201)
      ).body as AdminAssessmentDraft;

      /* A new question arrives with options and no answer marked: the bank is
         not publishable until somebody says which one is right. */
      const question = draft.questions[draft.questions.length - 1]!;
      await send(
        'patch',
        route(`/draft/options/${question.options[0]!.id}`),
        { isCorrect: true },
        sessionAdmin,
      ).expect(200);
    }

    const version = (await send('post', route('/publish'), {}, sessionAdmin).expect(201))
      .body as AdminAssessmentVersion;

    activeAssessmentId = version.id;
  }

  /**
   * Records a completed attempt against whatever version is active.
   *
   * Written directly rather than through the API because the point is the rows,
   * not the flow — the journey suite already proves the flow — and because the
   * answers would have to be chosen from `isCorrect`, which no learner-facing
   * response exposes. That inaccessibility is itself the absence rule working.
   */
  async function recordPlacementAgainstActiveVersion() {
    const userId = await account('taker', 'EMPLOYEE');
    await prisma.userPath.create({ data: { userId, pathId } });

    const active = await prisma.pathAssessment.findFirstOrThrow({
      where: { pathId, status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            text: true,
            marks: true,
            options: { orderBy: { displayOrder: 'asc' }, select: { id: true, isCorrect: true } },
          },
        },
      },
    });

    const maxScore = active.questions.reduce((total, row) => total + row.marks, 0);
    /* Every answer right, so the placement lands on the top rung — the case an
       off-by-one in the band table would break first. */
    const result = await prisma.pathAssessmentResult.create({
      data: {
        userId,
        assessmentId: active.id,
        assessmentVersion: active.version,
        totalScore: maxScore,
        maxScore,
      },
      select: { id: true },
    });

    await prisma.pathAssessmentResponse.createMany({
      data: active.questions.map((question) => ({
        resultId: result.id,
        questionId: question.id,
        optionId: (question.options.find((option) => option.isCorrect) ?? question.options[0]!).id,
      })),
    });

    const topLevel = levels[levels.length - 1]!;
    await prisma.learnerPlacement.create({
      data: {
        learnerId: userId,
        pathId,
        levelId: topLevel.id,
        resultId: result.id,
        score: maxScore,
      },
    });

    return {
      resultId: result.id,
      userId,
      totalScore: maxScore,
      maxScore,
      levelId: topLevel.id,
      questionText: active.questions[0]!.text,
      questionId: active.questions[0]!.id,
    };
  }

  describe('the overview', () => {
    it('names the path, its rungs and the active version, with no draft in flight', async () => {
      const response = await get(route(), sessionAdmin).expect(200);
      const overview = response.body as AdminAssessmentOverview;

      expect(overview.pathId).toBe(pathId);
      expect(overview.pathName).toBe('مسار اختبار التقييم');
      expect(overview.levels.map((level) => level.name)).toEqual(['تأسيسي', 'متقدم', 'متخصص']);
      expect(overview.active).toMatchObject({ status: 'ACTIVE', questionCount: 6 });
      expect(overview.draft).toBeNull();
    });

    it('reports a path that has no assessment at all, rather than 404', async () => {
      /* The one case §4C.3's shelf exists to surface: a published path nobody
         assigned to it can start. An error here would read as a broken screen. */
      const bare = await prisma.path.create({
        data: {
          key: `aasmt-bare-${RUN_ID}`,
          name: 'مسار بلا تقييم',
          description: 'مسار أُنشئ لاختبار غياب التقييم.',
          displayOrder: 991,
          riasecLetter: 'R',
          status: 'DRAFT',
        },
        select: { id: true },
      });

      const overview = (
        await get(`/api/admin/paths/${bare.id}/assessment`, sessionAdmin).expect(200)
      ).body as AdminAssessmentOverview;

      expect(overview.active).toBeNull();
      expect(overview.draft).toBeNull();
      expect(overview.history).toEqual([]);

      await prisma.path.delete({ where: { id: bare.id } });
    });

    it('refuses to hand out a draft that does not exist', async () => {
      await get(route('/draft'), sessionAdmin).expect(404);
    });

    it('answers 404 for a path that is not one', async () => {
      await get(
        '/api/admin/paths/00000000-0000-4000-8000-000000000000/assessment',
        sessionAdmin,
      ).expect(404);
    });
  });

  describe('drafting', () => {
    let draft: AdminAssessmentDraft;

    it('opens as a deep copy of the active version', async () => {
      draft = (await send('post', route('/draft'), {}, sessionAdmin).expect(201))
        .body as AdminAssessmentDraft;

      expect(draft.version).toBe(2);
      expect(draft.basedOnVersion).toBe(1);
      expect(draft.questions).toHaveLength(6);

      /* A copy, not a reference: editing the draft must not be able to reach a
         published row, which is the whole of what D-049 rests on. */
      const activeQuestionIds = new Set(
        (
          await prisma.pathAssessmentQuestion.findMany({
            where: { assessmentId: activeAssessmentId },
            select: { id: true },
          })
        ).map((row) => row.id),
      );

      expect(draft.questions.some((question) => activeQuestionIds.has(question.id))).toBe(false);
    });

    it('carries the answer key, which is what makes it the admin surface', async () => {
      const serialised = JSON.stringify(draft);

      expect(serialised).toContain('isCorrect');
      expect(serialised).toContain('marks');
      expect(draft.questions.every((question) => question.options.some((o) => o.isCorrect))).toBe(
        true,
      );
    });

    it('copies the band table alongside the questions', async () => {
      expect(draft.bands).toHaveLength(levels.length);
      expect(draft.readiness.bandsCoverRange).toBe(true);
      expect(draft.readiness.maxScore).toBe(12);
    });

    it('refuses a second draft', async () => {
      const response = await send('post', route('/draft'), {}, sessionAdmin).expect(409);

      expect(response.body).toMatchObject({ message: 'ASSESSMENT_DRAFT_EXISTS' });
    });

    it('is not served to a taker while it is being edited', async () => {
      /* The learner endpoint reads the ACTIVE version, never the draft; an
         employee mid-assessment must not have the bank change under them. */
      const takerSession = await signInAsTaker();
      const view = (await get(`/api/paths/${pathId}/assessment`, takerSession).expect(200))
        .body as AssessmentView;

      expect(view.version).toBe(1);
      expect(view.questions).toHaveLength(6);
    });
  });

  /** The taker created in `beforeAll` already holds this path. */
  async function signInAsTaker(): Promise<string> {
    return signIn(`aasmt-${RUN_ID}-taker@ministry.gov.example`);
  }

  describe('the publish gate', () => {
    it('refuses a bank with a question nobody marked an answer on', async () => {
      const before = (await get(route('/draft'), sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;

      const added = (
        await send(
          'post',
          route('/draft/questions'),
          { text: 'سؤال بلا إجابة صحيحة محددة', marks: 2 },
          sessionAdmin,
        ).expect(201)
      ).body as AdminAssessmentDraft;

      expect(added.readiness.blockers).toContain('BANK_NO_CORRECT_OPTION');

      const refused = await send('post', route('/publish'), {}, sessionAdmin).expect(409);
      expect(refused.body).toMatchObject({ message: 'BANK_NO_CORRECT_OPTION' });

      /* Cleaned up so the following tests start from a publishable bank. */
      const question = added.questions[added.questions.length - 1]!;
      const cleaned = (
        await send('delete', route(`/draft/questions/${question.id}`), {}, sessionAdmin).expect(200)
      ).body as AdminAssessmentDraft;

      expect(cleaned.questions).toHaveLength(before.questions.length);
      expect(cleaned.readiness.blockers).toEqual([]);
    });

    it('audits the refusal with the blocker that caused it', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { actorUserId: adminId, action: 'ADMIN_ASSESSMENT_PUBLISHED', outcome: 'FAILURE' },
        orderBy: { id: 'desc' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({ reason: 'BANK_NOT_PUBLISHABLE' });
    });

    it('left the live version untouched while the publish was refused', async () => {
      const overview = (await get(route(), sessionAdmin).expect(200))
        .body as AdminAssessmentOverview;

      expect(overview.active).toMatchObject({ version: 1, questionCount: 6 });
    });

    it('refuses to publish a band table that leaves a score on no rung', async () => {
      /*
       * The draft is where an author is allowed to be mid-thought, so a gap is
       * stored and reported rather than rejected on the way in — moving one
       * boundary of a partition necessarily passes through states with a gap.
       * What must not happen is publishing one: a learner scoring 4 could then
       * be placed on no rung at all, and there is nothing sensible for the
       * server to guess.
       */
      const saved = (
        await send(
          'patch',
          route('/draft/bands'),
          {
            bands: [
              { levelId: levels[0]!.id, minScore: 0, maxScore: 3 },
              { levelId: levels[1]!.id, minScore: 5, maxScore: 8 },
              { levelId: levels[2]!.id, minScore: 9, maxScore: 12 },
            ],
          },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(saved.readiness.bandsCoverRange).toBe(false);
      expect(saved.readiness.blockers).toContain('BANK_BANDS_NOT_A_PARTITION');

      const refused = await send('post', route('/publish'), {}, sessionAdmin).expect(409);
      expect(refused.body).toMatchObject({ message: 'BANK_BANDS_NOT_A_PARTITION' });
    });

    it('refuses a table that names one rung twice', async () => {
      /* The unique index would refuse it too; the named error is what lets the
         screen say which mistake was made. */
      const refused = await send(
        'patch',
        route('/draft/bands'),
        {
          bands: [
            { levelId: levels[0]!.id, minScore: 0, maxScore: 6 },
            { levelId: levels[0]!.id, minScore: 7, maxScore: 12 },
          ],
        },
        sessionAdmin,
      ).expect(400);

      expect(refused.body).toMatchObject({ message: 'ASSESSMENT_BAND_LEVEL_REPEATED' });
    });

    it('refuses a band naming a level from another path', async () => {
      const foreign = await prisma.level.findFirstOrThrow({
        where: { pathId: { not: pathId } },
        select: { id: true },
      });

      await send(
        'patch',
        route('/draft/bands'),
        { bands: [{ levelId: foreign.id, minScore: 0, maxScore: 12 }] },
        sessionAdmin,
      ).expect(400);
    });

    it('accepts a table that partitions the whole range, and says it is authored', async () => {
      const saved = (
        await send(
          'patch',
          route('/draft/bands'),
          {
            bands: [
              { levelId: levels[0]!.id, minScore: 0, maxScore: 3 },
              { levelId: levels[1]!.id, minScore: 4, maxScore: 8 },
              { levelId: levels[2]!.id, minScore: 9, maxScore: 12 },
            ],
          },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(saved.bandsAreDefault).toBe(false);
      expect(saved.readiness.bandsCoverRange).toBe(true);
      expect(saved.readiness.blockers).toEqual([]);
    });

    it('returns to the even split when the table is cleared', async () => {
      const reset = (
        await send('patch', route('/draft/bands'), { bands: [] }, sessionAdmin).expect(200)
      ).body as AdminAssessmentDraft;

      expect(reset.bandsAreDefault).toBe(true);
      expect(reset.readiness.bandsCoverRange).toBe(true);
    });

    it('warns, without blocking, when a rung has no question aimed at it', async () => {
      /* Advisory: the bank can still place people, but nobody meant a rung to
         be untested, and only a human can decide whether that is deliberate. */
      const draft = (await get(route('/draft'), sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;

      const aimedAtTop = draft.questions.filter((question) => question.levelId === levels[2]!.id);

      let latest = draft;
      for (const question of aimedAtTop) {
        latest = (
          await send(
            'patch',
            route(`/draft/questions/${question.id}`),
            { levelId: null },
            sessionAdmin,
          ).expect(200)
        ).body as AdminAssessmentDraft;
      }

      expect(latest.readiness.warnings).toContain('BANK_LEVEL_WITHOUT_QUESTION');
      expect(latest.readiness.levelsWithoutQuestion).toContain(levels[2]!.id);
      expect(latest.readiness.blockers).toEqual([]);

      /* Restored, so the published version below is the one an author meant. */
      for (const question of aimedAtTop) {
        await send(
          'patch',
          route(`/draft/questions/${question.id}`),
          { levelId: levels[2]!.id },
          sessionAdmin,
        ).expect(200);
      }
    });
  });

  describe('editing questions and options', () => {
    it('refuses to edit a question belonging to a published version', async () => {
      /* The concrete mechanism behind D-049: there is no route from the draft
         endpoints to a live row, so a frozen result cannot be re-scored. */
      await send(
        'patch',
        route(`/draft/questions/${frozen.questionId}`),
        { text: 'نص جديد لسؤال منشور' },
        sessionAdmin,
      ).expect(404);
    });

    it('moves the answer to another option as one decision, not two', async () => {
      const before = (await get(route('/draft'), sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const question = before.questions[0]!;
      const wrong = question.options.find((option) => !option.isCorrect)!;

      const after = (
        await send(
          'patch',
          route(`/draft/options/${wrong.id}`),
          { isCorrect: true },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      const updated = after.questions.find((row) => row.id === question.id)!;
      /* Exactly one, still: a question with two right answers is not a state
         the editor should be able to reach, and two requests would leave the
         bank invalid in between. */
      expect(updated.options.filter((option) => option.isCorrect)).toHaveLength(1);
      expect(updated.options.find((option) => option.isCorrect)!.id).toBe(wrong.id);
    });

    it('changes what a question is worth, and the maximum follows', async () => {
      const before = (await get(route('/draft'), sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;

      const after = (
        await send(
          'patch',
          route(`/draft/questions/${before.questions[0]!.id}`),
          { marks: 5 },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(after.readiness.maxScore).toBe(before.readiness.maxScore + 3);
      /* And the default bands re-cover the wider range on their own. */
      expect(after.readiness.bandsCoverRange).toBe(true);

      await send(
        'patch',
        route(`/draft/questions/${before.questions[0]!.id}`),
        { marks: 2 },
        sessionAdmin,
      ).expect(200);
    });

    it('refuses an option belonging to a published version', async () => {
      const published = await prisma.pathAssessmentOption.findFirstOrThrow({
        where: { question: { assessmentId: activeAssessmentId } },
        select: { id: true },
      });

      await send(
        'patch',
        route(`/draft/options/${published.id}`),
        { label: 'نص لن يُكتب' },
        sessionAdmin,
      ).expect(404);
    });

    it('reorders by a complete list and refuses a partial one', async () => {
      const draft = (await get(route('/draft'), sessionAdmin).expect(200))
        .body as AdminAssessmentDraft;
      const ids = draft.questions.map((question) => question.id);

      const reversed = (
        await send(
          'patch',
          route('/draft/questions/order'),
          { questionIds: [...ids].reverse() },
          sessionAdmin,
        ).expect(200)
      ).body as AdminAssessmentDraft;

      expect(reversed.questions.map((question) => question.id)).toEqual([...ids].reverse());

      /* A partial list would leave the questions it omits at whatever position
         they held, which is an order nobody chose. */
      await send(
        'patch',
        route('/draft/questions/order'),
        { questionIds: ids.slice(0, 2) },
        sessionAdmin,
      ).expect(400);

      await send(
        'patch',
        route('/draft/questions/order'),
        { questionIds: ids },
        sessionAdmin,
      ).expect(200);
    });
  });

  describe('publishing', () => {
    let published: AdminAssessmentVersion;

    it('activates the draft and retires its predecessor', async () => {
      published = (await send('post', route('/publish'), {}, sessionAdmin).expect(201))
        .body as AdminAssessmentVersion;

      expect(published).toMatchObject({ version: 2, status: 'ACTIVE' });
      expect(published.effectiveFrom).not.toBeNull();

      const previous = await prisma.pathAssessment.findUniqueOrThrow({
        where: { id: activeAssessmentId },
        select: { status: true, retiredAt: true },
      });

      expect(previous.status).toBe('RETIRED');
      expect(previous.retiredAt).not.toBeNull();
    });

    it('serves the new bank to the next taker', async () => {
      const takerSession = await signInAsTaker();
      const view = (await get(`/api/paths/${pathId}/assessment`, takerSession).expect(200))
        .body as AssessmentView;

      expect(view.version).toBe(2);
    });

    it('never lets the answer key reach that taker', async () => {
      /* Greps the whole serialised response rather than named fields: the
         failure mode is a field nobody thought about. Neither `marks` nor the
         target rung is the key, but both let a taker triage — which a placement
         test cannot afford. */
      const takerSession = await signInAsTaker();
      const response = await get(`/api/paths/${pathId}/assessment`, takerSession).expect(200);
      const serialised = JSON.stringify(response.body);

      expect(serialised).not.toContain('isCorrect');
      expect(serialised).not.toContain('marks');
      expect(serialised).not.toContain('levelId');
      expect(serialised).not.toContain('topic');
    });

    it('leaves the existing placement exactly as it was taken', async () => {
      const result = await prisma.pathAssessmentResult.findUniqueOrThrow({
        where: { id: frozen.resultId },
        select: {
          assessmentId: true,
          assessmentVersion: true,
          totalScore: true,
          maxScore: true,
        },
      });

      expect(result).toMatchObject({
        assessmentId: activeAssessmentId,
        assessmentVersion: 1,
        totalScore: frozen.totalScore,
        maxScore: frozen.maxScore,
      });

      const placement = await prisma.learnerPlacement.findFirstOrThrow({
        where: { learnerId: frozen.userId, pathId },
        select: { levelId: true, resultId: true },
      });

      /* The rung is the thing that would actually hurt: a re-scored result could
         move somebody down a level they had already been working at. */
      expect(placement).toMatchObject({ levelId: frozen.levelId, resultId: frozen.resultId });
    });

    it('leaves the questions that placement answered still readable', async () => {
      const responses = await prisma.pathAssessmentResponse.findMany({
        where: { resultId: frozen.resultId },
        select: { question: { select: { id: true, text: true } } },
      });

      expect(responses).toHaveLength(6);

      const answered = responses.find((row) => row.question.id === frozen.questionId);
      /* Not merely present: the *text* a historical response resolves to is
         still the text that was asked. */
      expect(answered?.question.text).toBe(frozen.questionText);
    });

    it('shows the retired version in the history with its placement count', async () => {
      const overview = (await get(route(), sessionAdmin).expect(200))
        .body as AdminAssessmentOverview;

      const retired = overview.history.find((row) => row.id === activeAssessmentId);

      expect(retired).toMatchObject({ status: 'RETIRED', version: 1 });
      expect(retired?.resultCount).toBe(1);
    });

    it('serves the retired version read-only, exactly as it was taken', async () => {
      const version = (
        await get(route(`/versions/${activeAssessmentId}`), sessionAdmin).expect(200)
      ).body as AdminAssessmentDraft;

      expect(version.version).toBe(1);
      expect(version.questions).toHaveLength(6);
      expect(version.questions.some((question) => question.text === frozen.questionText)).toBe(
        true,
      );
    });

    it('refuses to publish when there is nothing to publish', async () => {
      await send('post', route('/publish'), {}, sessionAdmin).expect(404);
    });
  });

  describe('discarding', () => {
    it('removes a draft and everything under it, leaving the active version alone', async () => {
      const draft = (await send('post', route('/draft'), {}, sessionAdmin).expect(201))
        .body as AdminAssessmentDraft;

      await send('delete', route('/draft'), {}, sessionAdmin).expect(204);

      expect(await prisma.pathAssessment.count({ where: { id: draft.id } })).toBe(0);
      expect(await prisma.pathAssessmentQuestion.count({ where: { assessmentId: draft.id } })).toBe(
        0,
      );
      expect(await prisma.pathAssessmentBand.count({ where: { assessmentId: draft.id } })).toBe(0);

      const overview = (await get(route(), sessionAdmin).expect(200))
        .body as AdminAssessmentOverview;
      expect(overview.active).toMatchObject({ version: 2, status: 'ACTIVE' });
      expect(overview.draft).toBeNull();
    });

    it('refuses to discard a draft that does not exist', async () => {
      await send('delete', route('/draft'), {}, sessionAdmin).expect(404);
    });
  });

  describe('who may reach any of it', () => {
    it('refuses an employee the admin surface entirely', async () => {
      const takerSession = await signInAsTaker();

      await get(route(), takerSession).expect(403);
      await get(route('/draft'), takerSession).expect(403);
      await send('post', route('/draft'), {}, takerSession).expect(403);
      await send('post', route('/publish'), {}, takerSession).expect(403);
    });

    it('refuses an anonymous request', async () => {
      await request(server()).get(route()).expect(401);
    });
  });
});
