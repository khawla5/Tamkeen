import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type {
  AssessmentResultView,
  AssessmentView,
  AssignedPaths,
  CourseDetail,
  CoursePlayerView,
  CourseSummary,
  DashboardView,
  MyPathView,
  PathDetail,
} from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { SharedStateLock } from './shared-state-lock';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The learner's journey end to end, against a real PostgreSQL database and the
 * mock LMS (§2B, D-134): assigned a path → sit its assessment → placed on a rung
 * → work the courses at and above it.
 *
 * **These are the tests that would catch a rule enforced only in the browser.**
 * Every one of them speaks HTTP, so a rule living solely in a React component
 * fails here. Four of the spec's acceptance criteria are this file:
 *
 *  - 4: an unassigned course appears in *no* learner response,
 *  - 9: a score places on the rung its band names, at both extremes,
 *  - 10: the learner's view is placed courses only, in position order,
 *  - and the entitlement rule underneath all of them — a path nobody assigned is
 *    a path that does not exist for you.
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

  sendCoursePassed(): Promise<void> {
    return Promise.resolve();
  }

  sendPathCompleted(): Promise<void> {
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

/** A seeded path that ships published, with an authored bank (D-134). */
const PATH_KEY = 'english';

describe('Learner journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  /* Serialised against the other suites that write globally visible product
     state — the paths, their ladders and the catalogue. */
  const lock = new SharedStateLock();

  let pathId: string;
  let levels: Array<{ id: string; name: string; position: number }>;
  /** questionId → the id of its correct option, read from the database. */
  let correctOption: Map<string, string>;
  /** questionId → an id that is not the correct one. */
  let wrongOption: Map<string, string>;

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

    const path = await prisma.path.findUnique({
      where: { key: PATH_KEY },
      select: {
        id: true,
        levels: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true } },
        assessments: {
          where: { status: 'ACTIVE' },
          select: {
            questions: {
              select: {
                id: true,
                options: { select: { id: true, isCorrect: true } },
              },
            },
          },
        },
      },
    });

    /*
     * Fail once, clearly, on an unseeded database.
     *
     * Without this, an empty database produces forty-odd unrelated-looking
     * assertion failures and the actual cause — "nobody ran the seed" — has to
     * be inferred from them.
     */
    if (!path || path.levels.length === 0 || !path.assessments[0]) {
      throw new Error(
        `No published "${PATH_KEY}" path with an active assessment. These tests need the seeded ` +
          'reference data — run `npm run db:seed --workspace @tamkeen/api` first.',
      );
    }

    pathId = path.id;
    levels = path.levels;

    /*
     * The answer key is deliberately absent from the API, so a test that wants
     * to produce a *chosen* score has to read it from the database. That is the
     * point: if this could be derived from the HTTP responses, so could a
     * learner's preferred placement.
     */
    correctOption = new Map();
    wrongOption = new Map();

    for (const question of path.assessments[0].questions) {
      const right = question.options.find((option) => option.isCorrect);
      const wrong = question.options.find((option) => !option.isCorrect);

      if (right) correctOption.set(question.id, right.id);
      if (wrong) wrongOption.set(question.id, wrong.id);
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

    /* Any membership this suite parked on no rung, put back where it was. */
    await restoreUnassignedFixture();

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

  function get(path: string, session: string) {
    return request(server()).get(path).set('Cookie', session);
  }

  /** Registers, verifies and signs in; returns the session cookie and the id. */
  async function signedInUser(label: string): Promise<{ session: string; userId: string }> {
    const email = `journey-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: numericEmployeeId(RUN_ID, label),
      department: 'تقنية المعلومات',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    const login = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const session = cookies.map((value) => value.split(';')[0]).join('; ');

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });

    return { session, userId: user.id };
  }

  /**
   * The ministry's act, done directly.
   *
   * The admin endpoint that performs it is covered by its own suite; here it is
   * a precondition rather than the thing under test, and going through the admin
   * API would make every learner test depend on an administrator session.
   */
  async function assignPath(userId: string, target = pathId): Promise<void> {
    await prisma.userPath.create({ data: { userId, pathId: target } });
  }

  /** Answers every question, correctly or not, and returns the placement. */
  async function sit(session: string, correct: boolean): Promise<AssessmentResultView> {
    const bank = (await get(`/api/paths/${pathId}/assessment`, session).expect(200))
      .body as AssessmentView;

    const answers = bank.questions.map((question) => ({
      questionId: question.id,
      optionId: (correct ? correctOption : wrongOption).get(question.id)!,
    }));

    const response = await post(
      `/api/paths/${pathId}/assessment/attempts`,
      { assessmentId: bank.id, answers },
      session,
    ).expect(201);

    return response.body as AssessmentResultView;
  }

  /* ── the unassigned course fixture ─────────────────────────────────────── */

  let parked: { id: string; levelId: string; position: number } | null = null;

  /**
   * Takes one of the path's placed courses off its rung for the duration of a
   * test, so "unassigned" can be asserted against a course that is genuinely in
   * the path.
   */
  async function parkACourse(): Promise<{ courseId: string; moodleCourseId: number }> {
    const membership = await prisma.pathCourse.findFirstOrThrow({
      where: { pathId, levelId: { not: null } },
      orderBy: { position: 'desc' },
      select: {
        id: true,
        levelId: true,
        position: true,
        courseId: true,
        course: { select: { moodleCourseId: true } },
      },
    });

    parked = {
      id: membership.id,
      levelId: membership.levelId!,
      position: membership.position!,
    };

    await prisma.pathCourse.update({
      where: { id: membership.id },
      data: { levelId: null, position: null },
    });

    return { courseId: membership.courseId, moodleCourseId: membership.course.moodleCourseId };
  }

  async function restoreUnassignedFixture(): Promise<void> {
    if (!parked) return;

    await prisma.pathCourse.update({
      where: { id: parked.id },
      data: { levelId: parked.levelId, position: parked.position },
    });

    parked = null;
  }

  /* ── entitlement ───────────────────────────────────────────────────────── */

  describe('a path nobody assigned', () => {
    it('does not exist for this learner, in any shape', async () => {
      const { session } = await signedInUser('unassigned');

      const paths = (await get('/api/paths', session).expect(200)).body as AssignedPaths;
      expect(paths.paths).toEqual([]);

      /* Not "empty" but "not found": knowing the path exists is itself something
         they are not entitled to. */
      await get(`/api/paths/${pathId}`, session).expect(404);

      /* And the assessment behind it is refused, audited, on the server. */
      await get(`/api/paths/${pathId}/assessment`, session).expect(403);
    });

    it('reports the dashboard as having no path at all', async () => {
      const { session } = await signedInUser('no-path');

      const dashboard = (await get('/api/dashboard', session).expect(200)).body as DashboardView;

      expect(dashboard.state).toBe('NO_PATH');
      expect(dashboard.paths).toEqual([]);
    });
  });

  /* ── assignment and placement ──────────────────────────────────────────── */

  describe('assigned, not yet placed', () => {
    it('shows the path with no level and the assessment still owed', async () => {
      const { session, userId } = await signedInUser('awaiting');
      await assignPath(userId);

      const paths = (await get('/api/paths', session).expect(200)).body as AssignedPaths;

      expect(paths.paths).toHaveLength(1);
      expect(paths.paths[0]).toMatchObject({ id: pathId, placedLevel: null });

      const dashboard = (await get('/api/dashboard', session).expect(200)).body as DashboardView;

      expect(dashboard.state).toBe('AWAITING_PLACEMENT');
      expect(dashboard.paths[0]?.pendingAssessmentId).not.toBeNull();
      /* Nothing is owed yet, so nothing is counted — a "0 من 0" progress bar
         would be telling them the path is empty. */
      expect(dashboard.paths[0]?.totalCount).toBe(0);
    });

    it('starts nothing: no course in the path is launchable', async () => {
      const { session, userId } = await signedInUser('unplaced-launch');
      await assignPath(userId);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const course = detail.levels.flatMap((level) => level.courses)[0]!;

      const player = (await get(`/api/courses/${course.id}/player`, session).expect(200))
        .body as CoursePlayerView;

      expect(player.canLaunch).toBe(false);
      await post(`/api/courses/${course.id}/launch`, {}, session).expect(409);
    });
  });

  describe('sitting the assessment', () => {
    it('places a perfect score on the top rung, and a blank one on the bottom', async () => {
      /* Acceptance criterion 9 at the HTTP boundary: the bands the seeded path
         falls back to are an even split, so the extremes are the two ends of the
         ladder and nothing in between can be mistaken for them. */
      const top = await signedInUser('top-score');
      await assignPath(top.userId);
      const best = await sit(top.session, true);

      const bottom = await signedInUser('bottom-score');
      await assignPath(bottom.userId);
      const worst = await sit(bottom.session, false);

      expect(best.level.position).toBe(levels.length);
      expect(best.totalScore).toBe(best.maxScore);
      expect(worst.level.position).toBe(1);
      expect(worst.totalScore).toBe(0);
    });

    it('refuses a second attempt once a placement stands', async () => {
      const { session, userId } = await signedInUser('retake');
      await assignPath(userId);
      await sit(session, true);

      const bank = (await get(`/api/paths/${pathId}/assessment`, session).expect(200))
        .body as AssessmentView;

      await post(
        `/api/paths/${pathId}/assessment/attempts`,
        {
          assessmentId: bank.id,
          answers: bank.questions.map((question) => ({
            questionId: question.id,
            optionId: question.options[0]!.id,
          })),
        },
        session,
      ).expect(409);
    });

    it('refuses a partial submission rather than scoring the gaps as wrong', async () => {
      const { session, userId } = await signedInUser('partial');
      await assignPath(userId);

      const bank = (await get(`/api/paths/${pathId}/assessment`, session).expect(200))
        .body as AssessmentView;

      await post(
        `/api/paths/${pathId}/assessment/attempts`,
        {
          assessmentId: bank.id,
          answers: bank.questions.slice(0, 2).map((question) => ({
            questionId: question.id,
            optionId: question.options[0]!.id,
          })),
        },
        session,
      ).expect(409);
    });

    it('never sends the answer key to the taker', async () => {
      /* D-034 applied to a placement test: an instrument whose key is in a
         network response measures nothing. */
      const { session, userId } = await signedInUser('no-key');
      await assignPath(userId);

      const response = await get(`/api/paths/${pathId}/assessment`, session).expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toContain('isCorrect');
      expect(body).not.toContain('marks');
      expect(body).not.toContain('levelId');
    });
  });

  /* ── the placed learner ────────────────────────────────────────────────── */

  describe('once placed', () => {
    it('returns the whole ladder, with their rung marked and the ones below it not startable', async () => {
      const { session, userId } = await signedInUser('placed-view');
      await assignPath(userId);
      const result = await sit(session, true);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const extra = detail.courses.find(
        (course) => course.status === 'AVAILABLE' && !courseIds.includes(course.id),
      )!;

      await post('/api/my-path/courses', { courseId: extra.id }, session).expect(204);

      const view = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      expect(view.totalCount).toBe(PATH_MIN_COURSES + 1);
      /* TAM-126: every stop carries its certificate id, null until issued. */
      expect(view.courses.every((course) => course.certificateId === null)).toBe(true);
    });

      expect(detail.levels).toHaveLength(levels.length);
      expect(detail.placedLevel?.id).toBe(result.level.id);
      expect(detail.levels.map((level) => level.standing)).toEqual([
        ...levels.slice(0, -1).map(() => 'BELOW'),
        'PLACED',
      ]);

      const myPath = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      const below = myPath.levels.filter((level) => level.standing === 'BELOW');

      expect(below.flatMap((level) => level.courses).every((course) => !course.startable)).toBe(
        true,
      );
      /* Counted over what they owe, not over the whole path: ground the
         placement says they covered is not work they failed to do. */
      expect(myPath.totalCount).toBe(
        myPath.levels
          .filter((level) => level.standing !== 'BELOW')
          .reduce((total, level) => total + level.courses.length, 0),
      );
    });

    it('numbers the courses on a rung contiguously, in position order', async () => {
      const { session, userId } = await signedInUser('ordered');
      await assignPath(userId);
      await sit(session, false);

      const myPath = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      const rung = myPath.levels.find((level) => level.standing === 'PLACED')!;

      expect(rung.courses.map((course) => course.order)).toEqual(
        rung.courses.map((_course, index) => index + 1),
      );
    });

    it('enrols them in what they owe, and lets them into it', async () => {
      const { session, userId } = await signedInUser('enrolled');
      await assignPath(userId);
      await sit(session, false);

      const enrolments = await prisma.enrollment.count({ where: { userId } });
      expect(enrolments).toBeGreaterThan(0);

      const myPath = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      const first = myPath.levels
        .flatMap((level) => level.courses)
        .find((course) => course.startable)!;

      const player = (await get(`/api/courses/${first.courseId}/player`, session).expect(200))
        .body as CoursePlayerView;

      expect(player.canLaunch).toBe(true);
      await post(`/api/courses/${first.courseId}/launch`, {}, session).expect(201);
    });
  });

  /* ── acceptance criterion 4 ────────────────────────────────────────────── */

  describe('a course in the path but on no rung', () => {
    it('appears in no learner response at all', async () => {
      const { courseId } = await parkACourse();

      const { session, userId } = await signedInUser('unassigned-course');
      await assignPath(userId);
      await sit(session, false);

      /* The path page. */
      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      expect(
        detail.levels.flatMap((level) => level.courses).map((course) => course.id),
      ).not.toContain(courseId);

      /* My Path. */
      const myPath = (await get('/api/my-path', session).expect(200)).body as MyPathView;
      expect(
        myPath.levels.flatMap((level) => level.courses).map((course) => course.courseId),
      ).not.toContain(courseId);

      /* The whole catalogue, and the catalogue filtered to this path. */
      const all = (await get('/api/courses', session).expect(200)).body as CourseSummary[];
      expect(all.map((course) => course.id)).not.toContain(courseId);

      const filtered = (await get(`/api/courses?pathId=${pathId}`, session).expect(200))
        .body as CourseSummary[];
      expect(filtered.map((course) => course.id)).not.toContain(courseId);

      /* Course detail, and the player behind it. */
      await get(`/api/courses/${courseId}`, session).expect(404);
      await get(`/api/courses/${courseId}/player`, session).expect(200);
      await post(`/api/courses/${courseId}/launch`, {}, session).expect(409);

      await restoreUnassignedFixture();
    });

    it('is not counted in anything the learner is told', async () => {
      const { courseId } = await parkACourse();

      const { session, userId } = await signedInUser('unassigned-count');
      await assignPath(userId);
      await sit(session, false);

      const paths = (await get('/api/paths', session).expect(200)).body as AssignedPaths;
      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;

      /* The summary's count and the detail's contents are the same number: a
         count that included the parked course would advertise a choice the page
         cannot show. */
      expect(paths.paths[0]?.courseCount).toBe(
        detail.levels.reduce((total, level) => total + level.courses.length, 0),
      );
      expect(courseId).toBeTruthy();

      await restoreUnassignedFixture();
    });
  });

  /* ── the catalogue ─────────────────────────────────────────────────────── */

  describe('the catalogue', () => {
    it('names the paths a course is placed in, with its rung', async () => {
      const { session, userId } = await signedInUser('catalogue');
      await assignPath(userId);
      await sit(session, true);

      const courses = (await get(`/api/courses?pathId=${pathId}`, session).expect(200))
        .body as CourseSummary[];

      expect(courses.length).toBeGreaterThan(0);
      for (const course of courses) {
        const lens = course.paths.find((entry) => entry.id === pathId)!;
        expect(lens.level).not.toBeNull();
      }
    });

    it('offers one action per course, and it depends on the rung', async () => {
      const { session, userId } = await signedInUser('actions');
      await assignPath(userId);
      await sit(session, true);

      const detail = (await get(`/api/paths/${pathId}`, session).expect(200)).body as PathDetail;
      const below = detail.levels.find((level) => level.standing === 'BELOW')!;
      const placed = detail.levels.find((level) => level.standing === 'PLACED')!;

      const belowCourse = (await get(`/api/courses/${below.courses[0]!.id}`, session).expect(200))
        .body as CourseDetail;
      const owedCourse = (await get(`/api/courses/${placed.courses[0]!.id}`, session).expect(200))
        .body as CourseDetail;

      expect(belowCourse.action).toBe('BELOW_LEVEL');
      expect(owedCourse.action).toBe('START_COURSE');
    });
  });
});
