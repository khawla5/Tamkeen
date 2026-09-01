import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import {
  PATH_MAX_COURSES,
  PATH_MIN_COURSES,
  type AssessmentResultView,
  type AssessmentView,
  type CourseDetail,
  type CourseLaunchView,
  type CoursePlayerView,
  type CourseSummary,
  type DashboardView,
  type MyPathView,
  type PathDetail,
  type PathRecommendations,
  type RiasecLetter,
} from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { SharedStateLock } from './shared-state-lock';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * Integration tests for the Phase 1 journey, against a real PostgreSQL database
 * and the mock LMS: assessment → Holland Code → gold-ranked paths → build 5-10
 * → confirm → My Path (§2B).
 *
 * These are the tests that would catch a rule being enforced only in the
 * browser. Every one of them speaks HTTP, so a rule that lives solely in a React
 * component fails here.
 */

class EmailCapture {
  verifications = new Map<string, string>();
  resets = new Map<string, string>();

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.set(to, token);
    return Promise.resolve();
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    this.resets.set(to, token);
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

describe('Phase 1 journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  /* Serialised against the other suites that write globally visible product
     state — the assessment and the catalogue of paths. See
     shared-state-lock.ts. */
  const lock = new SharedStateLock();

  /** questionId → the dimension it feeds, read from the database. */
  let questionLetter: Map<string, RiasecLetter>;
  /** questionId → option ids ordered by their weight, 0 through 4. */
  let optionsByWeight: Map<string, string[]>;

  beforeAll(async () => {
    await lock.acquire();
    emails = new EmailCapture();
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(emails)
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

    /*
     * The scoring key is deliberately absent from the API, so a test that wants
     * to produce a *chosen* Holland Code has to read the weights from the
     * database. That is the point: if this could be derived from the HTTP
     * responses, so could a user's preferred result.
     */
    const questions = await prisma.assessmentQuestion.findMany({
      select: {
        id: true,
        options: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, weights: { select: { dimension: true, points: true } } },
        },
      },
    });

    /*
     * Fail once, clearly, on an unseeded database.
     *
     * Without this, an empty database produces forty-odd unrelated-looking
     * assertion failures and the actual cause — "nobody ran the seed" — has to
     * be inferred from them. This is exactly how CI failed the first time Phase
     * 1 ran: the workflow applied migrations but never seeded.
     */
    if (questions.length === 0) {
      throw new Error(
        'No assessment questions found. These tests need the seeded reference data — ' +
          'run `npm run db:seed --workspace @tamkeen/api` against this database first.',
      );
    }

    questionLetter = new Map();
    optionsByWeight = new Map();

    for (const question of questions) {
      const letter = question.options.flatMap((option) => option.weights)[0]?.dimension;
      if (letter) {
        questionLetter.set(question.id, letter);
      }

      optionsByWeight.set(
        question.id,
        [...question.options]
          .sort((left, right) => (left.weights[0]?.points ?? 0) - (right.weights[0]?.points ?? 0))
          .map((option) => option.id),
      );
    }
  }, 240_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `journey-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await app.close();
    await lock.release();
  }, 60_000);

  const server = () => app.getHttpServer() as unknown as App;

  let csrfCookie: string;
  let csrfToken: string;

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      token: (response.body as { csrfToken: string }).csrfToken,
    };
  }

  function post(path: string, body: Record<string, unknown>, session?: string) {
    return request(server())
      .post(path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  function put(path: string, body: Record<string, unknown>, session: string) {
    return request(server())
      .put(path)
      .set('Cookie', [csrfCookie, session].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  function get(path: string, session: string) {
    return request(server()).get(path).set('Cookie', session);
  }

  /** Registers, verifies and signs in; returns the session cookie. */
  async function signedInUser(label: string): Promise<string> {
    const email = `journey-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: numericEmployeeId(RUN_ID, label),
      department: 'تقنية المعلومات',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    /* D-132: taking is gated on assignment, so every journey employee gets the
       Holland instrument the way the ministry would grant it. */
    const registered = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    await prisma.assessmentAssignment.create({
      data: { userId: registered.id, instrument: 'RIASEC' },
    });

    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  /**
   * Answers every question so that the six dimensions score in the given order
   * of preference, producing a predictable Holland Code.
   */
  function answersFor(levels: Record<RiasecLetter, number>) {
    return [...questionLetter.entries()].map(([questionId, letter]) => ({
      questionId,
      optionId: optionsByWeight.get(questionId)![levels[letter]]!,
    }));
  }

  const SIA_LEVELS: Record<RiasecLetter, number> = { S: 4, I: 3, A: 2, E: 1, C: 1, R: 0 };

  async function takeAssessment(
    session: string,
    levels: Record<RiasecLetter, number> = SIA_LEVELS,
  ): Promise<AssessmentResultView> {
    const assessment = (await get('/api/assessment', session).expect(200)).body as AssessmentView;

    const response = await post(
      '/api/assessment/submit',
      { assessmentId: assessment.id, answers: answersFor(levels) },
      session,
    ).expect(201);

    return response.body as AssessmentResultView;
  }

  /** Picks a path, selects `count` of its available courses. */
  async function buildPath(session: string, count: number, pathId?: string) {
    const recommendations = (await get('/api/paths', session).expect(200))
      .body as PathRecommendations;
    const chosenPathId = pathId ?? recommendations.paths[0]!.id;

    await post('/api/my-path/select', { pathId: chosenPathId }, session).expect(204);

    const detail = (await get(`/api/paths/${chosenPathId}`, session).expect(200))
      .body as PathDetail;
    const selectable = detail.courses.filter((course) => course.status === 'AVAILABLE');

    const courseIds = selectable.slice(0, count).map((course) => course.id);
    await put('/api/my-path/courses', { courseIds }, session).expect(200);

    return { pathId: chosenPathId, courseIds, detail };
  }

  // ── Assessment ──────────────────────────────────────────────────────────────

  describe('assessment', () => {
    it('serves the seeded bank in presentation order', async () => {
      const session = await signedInUser('a1');
      const body = (await get('/api/assessment', session).expect(200)).body as AssessmentView;

      expect(body.questions).toHaveLength(30);
      expect(body.questions.map((question) => question.order)).toEqual(
        [...Array(30).keys()].map((index) => index + 1),
      );
      expect(body.questions[0]!.options).toHaveLength(5);
    });

    it('never exposes the scoring key', async () => {
      /*
       * The single most important assertion in this file. If option weights
       * reach the browser, a user can answer whichever way produces the result
       * they already wanted and every downstream recommendation is theatre.
       */
      const session = await signedInUser('a2');
      const response = await get('/api/assessment', session).expect(200);
      const raw = JSON.stringify(response.body);

      expect(raw).not.toMatch(/weight/i);
      expect(raw).not.toMatch(/dimension/i);
      expect(raw).not.toMatch(/points/i);
      expect(raw).not.toMatch(/riasec/i);
    });

    it('requires a session', async () => {
      await request(server()).get('/api/assessment').expect(401);
    });

    it('scores a submission into the expected Holland Code', async () => {
      const session = await signedInUser('a3');
      const result = await takeAssessment(session);

      expect(result.codeString).toBe('SIA');
      expect(result.code).toEqual(['S', 'I', 'A']);
    });

    it('persists all six dimension scores, not just the code (§3A)', async () => {
      const session = await signedInUser('a4');
      const result = await takeAssessment(session);

      /* Five items per dimension, weights 0-4 → level × 5. */
      expect(result.scores).toEqual({ S: 20, I: 15, A: 10, E: 5, C: 5, R: 0 });
      expect(result.maxScore).toBe(20);
      expect(result.ranked).toHaveLength(6);
    });

    it('applies the canonical tie-break through the whole stack', async () => {
      const session = await signedInUser('a5');
      const result = await takeAssessment(session, { R: 2, I: 2, A: 2, S: 2, E: 2, C: 2 });

      expect(result.codeString).toBe('RIA');
    });

    it('rejects an incomplete submission rather than scoring it', async () => {
      const session = await signedInUser('a6');
      const assessment = (await get('/api/assessment', session).expect(200)).body as AssessmentView;

      const response = await post(
        '/api/assessment/submit',
        { assessmentId: assessment.id, answers: answersFor(SIA_LEVELS).slice(0, 10) },
        session,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('ASSESSMENT_INCOMPLETE');
    });

    it('rejects an option belonging to another question', async () => {
      const session = await signedInUser('a7');
      const assessment = (await get('/api/assessment', session).expect(200)).body as AssessmentView;

      const answers = answersFor(SIA_LEVELS);
      answers[0] = { questionId: answers[0]!.questionId, optionId: answers[1]!.optionId };

      const response = await post(
        '/api/assessment/submit',
        { assessmentId: assessment.id, answers },
        session,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('ASSESSMENT_UNKNOWN_OPTION');
    });

    it('returns null for a user who has not been assessed', async () => {
      const session = await signedInUser('a8');

      const response = await get('/api/assessment/result', session).expect(200);
      expect(response.body).toEqual({});
    });
  });

  // ── Retake policy (D-015) ───────────────────────────────────────────────────

  describe('retake policy', () => {
    it('allows a retake before a path is confirmed, and the newest result wins', async () => {
      const session = await signedInUser('r1');

      const first = await takeAssessment(session);
      expect(first.canRetake).toBe(true);

      const second = await takeAssessment(session, { E: 4, C: 3, R: 2, S: 1, I: 1, A: 0 });
      expect(second.codeString).toBe('ECR');

      const latest = (await get('/api/assessment/result', session).expect(200))
        .body as AssessmentResultView;
      expect(latest.codeString).toBe('ECR');
      expect(latest.id).toBe(second.id);
    });

    it('keeps the earlier attempt rather than overwriting it (D-033)', async () => {
      const session = await signedInUser('r2');
      await takeAssessment(session);
      await takeAssessment(session, { E: 4, C: 3, R: 2, S: 1, I: 1, A: 0 });

      const user = await prisma.user.findFirstOrThrow({
        where: { email: { startsWith: `journey-${RUN_ID}-r2@` } },
        select: { id: true },
      });
      const results = await prisma.assessmentResult.count({ where: { userId: user.id } });

      expect(results).toBe(2);
    });

    it('refuses a retake once a path is confirmed', async () => {
      const session = await signedInUser('r3');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const assessment = (await get('/api/assessment', session).expect(200)).body as AssessmentView;
      const response = await post(
        '/api/assessment/submit',
        { assessmentId: assessment.id, answers: answersFor(SIA_LEVELS) },
        session,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('ASSESSMENT_LOCKED');
    });

    it('reports canRetake=false once committed, so the UI can hide the entry point', async () => {
      const session = await signedInUser('r4');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const latest = (await get('/api/assessment/result', session).expect(200))
        .body as AssessmentResultView;

      expect(latest.canRetake).toBe(false);
    });
  });

  // ── Gold recommendation (§3A) ───────────────────────────────────────────────

  describe('paths and the gold rule', () => {
    it('returns every path — gold is a highlight, not a filter', async () => {
      const session = await signedInUser('g1');
      await takeAssessment(session);

      const body = (await get('/api/paths', session).expect(200)).body as PathRecommendations;

      /*
       * Counted against the database rather than against the seed's twelve.
       *
       * The invariant is "every *offered* path comes back, recommended or not" —
       * that gold highlights rather than filters. Hardcoding twelve stated a
       * fixture as though it were a product rule, and broke the first time
       * another suite legitimately offered a thirteenth path.
       */
      const offered = await prisma.path.count({ where: { isActive: true } });

      expect(body.paths).toHaveLength(offered);
      expect(offered).toBeGreaterThan(0);
      expect(body.paths.filter((path) => !path.recommended).length).toBeGreaterThan(0);
    });

    it('marks exactly the paths whose letter is in the user’s code', async () => {
      const session = await signedInUser('g2');
      await takeAssessment(session);

      const body = (await get('/api/paths', session).expect(200)).body as PathRecommendations;

      expect(body.code).toEqual(['S', 'I', 'A']);
      for (const path of body.paths) {
        expect(path.recommended).toBe(['S', 'I', 'A'].includes(path.riasecLetter));
      }
    });

    it('sorts gold paths by the user’s letter order, #1 first', async () => {
      const session = await signedInUser('g3');
      await takeAssessment(session);

      const body = (await get('/api/paths', session).expect(200)).body as PathRecommendations;
      const goldLetters = body.paths
        .filter((path) => path.recommended)
        .map((path) => path.riasecLetter);

      expect(goldLetters).toEqual(['S', 'S', 'I', 'I', 'A', 'A']);
      /* And every non-gold path comes after every gold one. */
      expect(body.paths.slice(0, 6).every((path) => path.recommended)).toBe(true);
      expect(body.paths.slice(6).some((path) => path.recommended)).toBe(false);
    });

    it('marks nothing gold before the assessment', async () => {
      const session = await signedInUser('g4');

      const body = (await get('/api/paths', session).expect(200)).body as PathRecommendations;

      expect(body.code).toBeNull();
      expect(body.paths.every((path) => !path.recommended)).toBe(true);
      expect(body.paths).toHaveLength(12);
    });

    it('counts only courses a user could actually pick', async () => {
      const session = await signedInUser('g5');
      const body = (await get('/api/paths', session).expect(200)).body as PathRecommendations;

      for (const path of body.paths) {
        expect(path.courseCount).toBeGreaterThanOrEqual(PATH_MAX_COURSES);
      }
    });
  });

  // ── Building and the 5-10 rule ──────────────────────────────────────────────

  describe('building a path', () => {
    it('rejects selecting more than ten courses', async () => {
      const session = await signedInUser('b1');
      await takeAssessment(session);

      const { pathId } = await buildPath(session, 1);
      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const tooMany = detail.courses
        .filter((course) => course.status === 'AVAILABLE')
        .slice(0, PATH_MAX_COURSES + 1)
        .map((course) => course.id);

      expect(tooMany).toHaveLength(PATH_MAX_COURSES + 1);
      await put('/api/my-path/courses', { courseIds: tooMany }, session).expect(400);
    });

    it('refuses to confirm with fewer than five', async () => {
      const session = await signedInUser('b2');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES - 1);

      const response = await post('/api/my-path/confirm', {}, session).expect(400);
      expect((response.body as { message: string }).message).toBe('COURSE_COUNT_OUT_OF_RANGE');
    });

    it('refuses a course that belongs to a different path', async () => {
      const session = await signedInUser('b3');
      await takeAssessment(session);

      const recommendations = (await get('/api/paths', session).expect(200))
        .body as PathRecommendations;
      const [first, ...rest] = recommendations.paths;
      const otherPath = (await get(`/api/paths/${rest[0]!.id}`, session).expect(200))
        .body as PathDetail;
      const firstPath = (await get(`/api/paths/${first!.id}`, session).expect(200))
        .body as PathDetail;

      const firstIds = new Set(firstPath.courses.map((course) => course.id));
      const foreign = otherPath.courses.find((course) => !firstIds.has(course.id))!;

      await post('/api/my-path/select', { pathId: first!.id }, session).expect(204);

      const response = await put(
        '/api/my-path/courses',
        { courseIds: [foreign.id] },
        session,
      ).expect(400);

      expect((response.body as { message: string }).message).toBe('COURSE_NOT_IN_PATH');
    });

    it('clears the selection when the user switches path before committing', async () => {
      const session = await signedInUser('b4');
      await takeAssessment(session);

      const { detail } = await buildPath(session, PATH_MIN_COURSES);
      const recommendations = (await get('/api/paths', session).expect(200))
        .body as PathRecommendations;
      const other = recommendations.paths.find((path) => path.id !== detail.id)!;

      await post('/api/my-path/select', { pathId: other.id }, session).expect(204);

      const switched = (await get(`/api/paths/${other.id}`, session).expect(200))
        .body as PathDetail;
      expect(switched.selectedCourseIds).toEqual([]);
    });

    it('shows the selection only against the path it belongs to', async () => {
      const session = await signedInUser('b5');
      await takeAssessment(session);
      const { pathId, courseIds } = await buildPath(session, PATH_MIN_COURSES);

      const own = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      expect(own.selectedCourseIds.sort()).toEqual([...courseIds].sort());

      const recommendations = (await get('/api/paths', session).expect(200))
        .body as PathRecommendations;
      const other = recommendations.paths.find((path) => path.id !== pathId)!;
      const otherDetail = (await get(`/api/paths/${other.id}`, session).expect(200))
        .body as PathDetail;

      expect(otherDetail.selectedCourseIds).toEqual([]);
    });
  });

  // ── The commitment gate (D-002) ─────────────────────────────────────────────

  describe('confirming the path', () => {
    it('confirms with five and lands on My Path', async () => {
      const session = await signedInUser('c1');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);

      const view = (await post('/api/my-path/confirm', {}, session).expect(200)).body as MyPathView;

      expect(view.status).toBe('ACTIVE');
      expect(view.confirmedAt).not.toBeNull();
      expect(view.totalCount).toBe(PATH_MIN_COURSES);
      expect(view.courses.map((course) => course.courseId)).toEqual(courseIds);
    });

    it('confirms with ten', async () => {
      const session = await signedInUser('c2');
      await takeAssessment(session);
      await buildPath(session, PATH_MAX_COURSES);

      const view = (await post('/api/my-path/confirm', {}, session).expect(200)).body as MyPathView;

      expect(view.totalCount).toBe(PATH_MAX_COURSES);
    });

    it('refuses a second confirmation', async () => {
      const session = await signedInUser('c3');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const response = await post('/api/my-path/confirm', {}, session).expect(409);
      expect((response.body as { message: string }).message).toBe('PATH_ALREADY_CONFIRMED');
    });

    it('refuses to switch path after commitment (D-002)', async () => {
      const session = await signedInUser('c4');
      await takeAssessment(session);
      const { pathId } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const recommendations = (await get('/api/paths', session).expect(200))
        .body as PathRecommendations;
      const other = recommendations.paths.find((path) => path.id !== pathId)!;

      const response = await post('/api/my-path/select', { pathId: other.id }, session).expect(409);
      expect((response.body as { message: string }).message).toBe('PATH_ALREADY_CONFIRMED');
    });

    it('refuses to change the course set after commitment', async () => {
      const session = await signedInUser('c5');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      await put('/api/my-path/courses', { courseIds: courseIds.slice(0, 3) }, session).expect(409);
    });

    it('reports canBuild=false on every path once committed', async () => {
      const session = await signedInUser('c6');
      await takeAssessment(session);
      const { pathId } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      expect(detail.canBuild).toBe(false);
    });

    it('provisions the LMS user and records enrolment on confirm', async () => {
      const session = await signedInUser('c7');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const user = await prisma.user.findFirstOrThrow({
        where: { email: { startsWith: `journey-${RUN_ID}-c7@` } },
        select: { id: true, moodleUserId: true },
      });

      expect(user.moodleUserId).not.toBeNull();

      const enrolled = await prisma.userPathCourse.count({
        where: { userPath: { userId: user.id }, enrolledAt: { not: null } },
      });
      expect(enrolled).toBe(PATH_MIN_COURSES);
    });

    it('audits the commitment (§2)', async () => {
      const session = await signedInUser('c8');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const user = await prisma.user.findFirstOrThrow({
        where: { email: { startsWith: `journey-${RUN_ID}-c8@` } },
        select: { id: true },
      });
      const entry = await prisma.auditLog.findFirst({
        where: { actorUserId: user.id, action: 'PATH_CONFIRMED' },
      });

      expect(entry).not.toBeNull();
      expect(entry?.outcome).toBe('SUCCESS');
    });

    it('allows the quiet post-commitment add while under ten (§4.9)', async () => {
      const session = await signedInUser('c9');
      await takeAssessment(session);
      const { pathId, courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const extra = detail.courses.find(
        (course) => course.status === 'AVAILABLE' && !courseIds.includes(course.id),
      )!;

      await post('/api/my-path/courses', { courseId: extra.id }, session).expect(204);

      const view = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      expect(view.totalCount).toBe(PATH_MIN_COURSES + 1);
    });

    it('refuses an eleventh course after commitment', async () => {
      const session = await signedInUser('c10');
      await takeAssessment(session);
      const { pathId, courseIds } = await buildPath(session, PATH_MAX_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const extra = detail.courses.find(
        (course) => course.status === 'AVAILABLE' && !courseIds.includes(course.id),
      )!;

      const response = await post('/api/my-path/courses', { courseId: extra.id }, session).expect(
        400,
      );
      expect((response.body as { message: string }).message).toBe('COURSE_COUNT_OUT_OF_RANGE');
    });
  });

  // ── My Path and the dashboard ───────────────────────────────────────────────

  describe('my path', () => {
    it('is null before a path is chosen', async () => {
      const session = await signedInUser('m1');
      const response = await get('/api/my-path', session).expect(200);

      expect(response.body).toEqual({});
    });

    it('marks the first incomplete course as next up, and only that one', async () => {
      const session = await signedInUser('m2');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      const view = (await post('/api/my-path/confirm', {}, session).expect(200)).body as MyPathView;

      expect(view.courses.filter((course) => course.isNextUp)).toHaveLength(1);
      expect(view.courses[0]!.isNextUp).toBe(true);
    });

    it('keeps the path certificate locked while courses remain', async () => {
      const session = await signedInUser('m3');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      const view = (await post('/api/my-path/confirm', {}, session).expect(200)).body as MyPathView;

      expect(view.completedCount).toBe(0);
      expect(view.pathCertificateUnlocked).toBe(false);
    });

    it('does not leak another user’s path', async () => {
      const owner = await signedInUser('m4');
      await takeAssessment(owner);
      await buildPath(owner, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, owner).expect(200);

      const stranger = await signedInUser('m5');
      const response = await get('/api/my-path', stranger).expect(200);

      expect(response.body).toEqual({});
    });
  });

  describe('dashboard states (§4.2)', () => {
    it('is PRE_ASSESSMENT for a new user', async () => {
      const session = await signedInUser('d1');
      const body = (await get('/api/dashboard', session).expect(200)).body as DashboardView;

      expect(body.state).toBe('PRE_ASSESSMENT');
      expect(body.codeString).toBeNull();
      expect(body.path).toBeNull();
    });

    it('is ASSESSED_NO_PATH after the assessment', async () => {
      const session = await signedInUser('d2');
      await takeAssessment(session);

      const body = (await get('/api/dashboard', session).expect(200)).body as DashboardView;

      expect(body.state).toBe('ASSESSED_NO_PATH');
      expect(body.codeString).toBe('SIA');
    });

    it('stays ASSESSED_NO_PATH while a path is merely being built', async () => {
      /* §4.2 has three states, and a half-built path leaves the user's next
         action unchanged: go and choose. */
      const session = await signedInUser('d3');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);

      const body = (await get('/api/dashboard', session).expect(200)).body as DashboardView;
      expect(body.state).toBe('ASSESSED_NO_PATH');

      /* TAM-123: the decision is on the dashboard — the top recommended paths,
         in rank order, never more than three, and all actually recommended. */
      expect(body.recommendedPaths.length).toBeGreaterThan(0);
      expect(body.recommendedPaths.length).toBeLessThanOrEqual(3);
      for (const path of body.recommendedPaths) {
        expect(body.codeString).toContain(path.riasecLetter);
      }
      expect(body.upcomingCourses).toEqual([]);
      expect(body.recentActivity.map((a) => a.kind)).toEqual(['ASSESSMENT_COMPLETED']);
    });

    it('is ACTIVE_PATH once confirmed, with a single continue target', async () => {
      const session = await signedInUser('d4');
      await takeAssessment(session);
      await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const body = (await get('/api/dashboard', session).expect(200)).body as DashboardView;

      expect(body.state).toBe('ACTIVE_PATH');
      expect(body.path?.totalCount).toBe(PATH_MIN_COURSES);
      expect(body.path?.completedCount).toBe(0);
      /* The status strip (TAM-108): the path's type and the in-progress count
         come from the server so the page renders one payload. */
      expect(body.path?.riasecLetter).toMatch(/^[RIASEC]$/);
      expect(body.path?.inProgressCount).toBe(0);
      expect(body.path?.nextCourse).not.toBeNull();

      /* TAM-123: the active dashboard knows what comes next and what happened. */
      expect(body.recommendedPaths).toEqual([]);
      expect(body.upcomingCourses.length).toBeGreaterThan(0);
      expect(body.upcomingCourses.length).toBeLessThanOrEqual(3);
      expect(body.upcomingCourses[0]?.id).toBe(body.path?.nextCourse?.id);
      expect(body.latestCertificate).toBeNull();
      expect(body.recentActivity.map((a) => a.kind)).toEqual([
        'PATH_CONFIRMED',
        'ASSESSMENT_COMPLETED',
      ]);
      expect(body.recentActivity[0]?.title).toBe(body.path?.name);
    });
  });

  // ── Catalogue (§4.6, §4.7) ──────────────────────────────────────────────────

  describe('courses catalogue', () => {
    it('is browsable before the assessment', async () => {
      const session = await signedInUser('k1');
      const body = (await get('/api/courses', session).expect(200)).body as CourseSummary[];

      expect(body.length).toBeGreaterThan(0);
    });

    it('hides a course that has left the catalogue from someone who never picked it', async () => {
      const session = await signedInUser('k2');
      const body = (await get('/api/courses', session).expect(200)).body as CourseSummary[];

      expect(body.every((course) => course.status === 'AVAILABLE')).toBe(true);
    });

    it('filters by path', async () => {
      const session = await signedInUser('k3');
      const paths = (await get('/api/paths', session).expect(200)).body as PathRecommendations;
      const target = paths.paths[0]!;

      const body = (await get(`/api/courses?pathId=${target.id}`, session).expect(200))
        .body as CourseSummary[];

      expect(body.length).toBeGreaterThan(0);
      expect(body.every((course) => course.paths.some((path) => path.id === target.id))).toBe(true);
    });

    it('filters by duration', async () => {
      const session = await signedInUser('k4');
      const body = (await get('/api/courses?maxDurationMinutes=150', session).expect(200))
        .body as CourseSummary[];

      expect(body.length).toBeGreaterThan(0);
      expect(body.every((course) => (course.durationMinutes ?? 0) <= 150)).toBe(true);
    });

    it('searches Arabic titles', async () => {
      const session = await signedInUser('k5');
      const body = (
        await get(
          '/api/courses?q=%D8%A7%D9%84%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA',
          session,
        ).expect(200)
      ).body as CourseSummary[];

      expect(body.length).toBeGreaterThan(0);
      expect(
        body.every(
          (course) => course.title.includes('البيانات') || course.summary.includes('البيانات'),
        ),
      ).toBe(true);
    });

    it('rejects an unknown query parameter rather than ignoring it', async () => {
      const session = await signedInUser('k6');
      await get('/api/courses?bogus=1', session).expect(400);
    });
  });

  describe('the course player and its handoff (§4.8, D-044)', () => {
    it('reports the path context and refuses to launch before commitment', async () => {
      const session = await signedInUser('pl1');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);

      const player = (await get(`/api/courses/${courseIds[0]!}/player`, session).expect(200))
        .body as CoursePlayerView;

      expect(player.orderInPath).toBe(1);
      expect(player.totalInPath).toBe(PATH_MIN_COURSES);
      /* Nothing is enrolled until the commitment gate, so offering entry would
         be offering something that cannot work (§4.5). */
      expect(player.canLaunch).toBe(false);
    });

    it('mints a launch URL once the path is confirmed', async () => {
      const session = await signedInUser('pl2');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const player = (await get(`/api/courses/${courseIds[0]!}/player`, session).expect(200))
        .body as CoursePlayerView;
      expect(player.canLaunch).toBe(true);

      const launch = (await post(`/api/courses/${courseIds[0]!}/launch`, {}, session).expect(201))
        .body as CourseLaunchView;

      expect(launch.url).toMatch(/^https?:\/\//);
      /* The web-services token is long-lived and grants the whole API. It must
         never reach a browser, whatever else this URL carries. */
      expect(launch.url).not.toMatch(/wstoken/i);
    });

    it('refuses to launch a course the learner never chose', async () => {
      /* The guard that matters: without it, any authenticated user could mint
         entry to any course in the catalogue. */
      const session = await signedInUser('pl3');
      await takeAssessment(session);
      const { courseIds, detail } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const notChosen = detail.courses.find((course) => !courseIds.includes(course.id));
      expect(notChosen).toBeDefined();

      await post(`/api/courses/${notChosen!.id}/launch`, {}, session).expect(409);
    });

    it('refuses to launch for a user with no path at all', async () => {
      const session = await signedInUser('pl4');
      const courses = (await get('/api/courses', session).expect(200)).body as CourseSummary[];

      await post(`/api/courses/${courses[0]!.id}/launch`, {}, session).expect(409);
    });

    it('requires a session', async () => {
      const courses = (await get('/api/courses', await signedInUser('pl5')).expect(200))
        .body as CourseSummary[];

      await request(server())
        .post(`/api/courses/${courses[0]!.id}/launch`)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(401);
    });

    it('mints a different URL every time, so none can be replayed', async () => {
      /* Single use is enforced by the plugin, but a stable URL would mean the
         same spent token was handed out again on the next click. */
      const session = await signedInUser('pl6');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const first = (await post(`/api/courses/${courseIds[0]!}/launch`, {}, session).expect(201))
        .body as CourseLaunchView;
      const second = (await post(`/api/courses/${courseIds[0]!}/launch`, {}, session).expect(201))
        .body as CourseLaunchView;

      expect(second.url).not.toBe(first.url);
    });
  });

  describe('course detail offers exactly one action (§4.7)', () => {
    it('offers nothing to act on before a path is chosen', async () => {
      const session = await signedInUser('x1');
      const courses = (await get('/api/courses', session).expect(200)).body as CourseSummary[];

      const detail = (await get(`/api/courses/${courses[0]!.id}`, session).expect(200))
        .body as CourseDetail;

      expect(detail.action).toBe('NONE');
      expect(detail.objectives.length).toBeGreaterThanOrEqual(3);
      /* The raw LMS deep link is deliberately no longer part of this response.
         It carries no session, so a screen linking to it would send the learner
         to a Moodle page that does not know who they are; entry goes through
         the player's signed handoff instead (D-044). */
      expect(detail).not.toHaveProperty('courseUrl');
    });

    it('offers ADD_TO_PATH for an unselected course in the path being built', async () => {
      const session = await signedInUser('x2');
      await takeAssessment(session);
      const { pathId, courseIds } = await buildPath(session, PATH_MIN_COURSES);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const unselected = detail.courses.find(
        (course) => course.status === 'AVAILABLE' && !courseIds.includes(course.id),
      )!;

      const view = (await get(`/api/courses/${unselected.id}`, session).expect(200))
        .body as CourseDetail;
      expect(view.action).toBe('ADD_TO_PATH');
      /* Not in the user's path at all — no personal status, no certificate. */
      expect(view.personalStatus).toBeNull();
      expect(view.certificateId).toBeNull();
    });

    it('offers IN_PATH for a selected course before commitment', async () => {
      const session = await signedInUser('x3');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);

      const view = (await get(`/api/courses/${courseIds[0]}`, session).expect(200))
        .body as CourseDetail;
      expect(view.action).toBe('IN_PATH');
      expect(view.personalStatus).toBe('NOT_STARTED');
    });

    it('offers START_COURSE once the path is confirmed', async () => {
      const session = await signedInUser('x4');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const view = (await get(`/api/courses/${courseIds[0]}`, session).expect(200))
        .body as CourseDetail;
      expect(view.action).toBe('START_COURSE');
      /* Confirmed but nothing attempted yet — `action` alone cannot tell this
         apart from genuinely in progress; `personalStatus` is why §4.7's
         status chip exists as its own field (TAM-128). */
      expect(view.personalStatus).toBe('NOT_STARTED');
    });

    it('offers COMPLETED with a certificate link once the course is passed and a certificate exists', async () => {
      const session = await signedInUser('x6');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const user = await prisma.user.findFirstOrThrow({
        where: { email: { startsWith: `journey-${RUN_ID}-x6@` } },
        select: { id: true },
      });
      await prisma.userPathCourse.updateMany({
        where: { userPath: { userId: user.id }, courseId: courseIds[0] },
        data: { status: 'COMPLETED' },
      });
      const certificate = await prisma.certificate.create({
        data: {
          userId: user.id,
          type: 'COURSE',
          courseId: courseIds[0],
          verificationId: randomBytes(32).toString('base64url'),
          pdfPath: `2026/${courseIds[0]}-course.pdf`,
          pdfSha256: 'digest',
          pdfBytes: 1,
          holderName: 'موظف الاختبار',
          subjectTitle: 'عنوان الدورة',
          issuedAt: new Date(),
        },
      });

      const view = (await get(`/api/courses/${courseIds[0]}`, session).expect(200))
        .body as CourseDetail;
      expect(view.action).toBe('COMPLETED');
      expect(view.personalStatus).toBe('COMPLETED');
      expect(view.certificateId).toBe(certificate.id);
    });

    it('never offers a second action alongside the first', async () => {
      const session = await signedInUser('x5');
      await takeAssessment(session);
      const { courseIds } = await buildPath(session, PATH_MIN_COURSES);
      await post('/api/my-path/confirm', {}, session).expect(200);

      const view = (await get(`/api/courses/${courseIds[0]}`, session).expect(200))
        .body as CourseDetail;

      /* `action` is a single value by construction — this asserts the contract
         has not quietly grown into a list of permitted actions. */
      expect(Array.isArray(view.action)).toBe(false);
      expect(typeof view.action).toBe('string');
    });
  });
});
