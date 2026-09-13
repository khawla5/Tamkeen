import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { AdminPathDetail, AdminPathRow, MyPathView, PathDetail } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { SharedStateLock } from './shared-state-lock';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.4 over real HTTP against a real database (D-134).
 *
 * **The properties are about what an administrator cannot accidentally do**, and
 * six of the spec's acceptance criteria live here:
 *
 *  - 5: placing sets both the level and the position, and positions stay
 *       contiguous,
 *  - 6: moving between rungs re-packs both of them,
 *  - 7: placing into another path's level is refused with 422,
 *  - 8: deleting a rung unassigns its courses and deletes none of them,
 *  - 11: a move after publication reaches the learner on their next fetch,
 *  - 12: a path can never have two live assessments.
 *
 * The learner half of 11 is asserted against the learner's own endpoint rather
 * than reasoned about, which is the only way to know the two agree.
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

describe('Admin path management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /* This suite creates and publishes a path, which every learner then sees.
     Serialised against the suites that read the catalogue. */
  const lock = new SharedStateLock();

  let sessionAdmin: string;

  let csrfCookie: string;
  let csrfToken: string;

  /** The path this suite creates and manages. Removed in afterAll. */
  let pathId: string;
  /** Six catalogue courses, borrowed for membership and never modified. */
  let courseIds: string[];
  /** A level belonging to a *different* path, for the cross-path refusal. */
  let foreignLevelId: string;

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

    await account('admin', 'SUPER_ADMIN');
    sessionAdmin = await signIn(`apath-${RUN_ID}-admin@ministry.gov.example`);

    /*
     * Borrowed from the catalogue rather than created.
     *
     * Creating six courses of our own looked like better namespacing and was
     * worse: a course this process invents does not exist in the LMS, so *every*
     * catalogue sync — which another suite runs — correctly withdraws it, and
     * their status would flip out from under the assertions here for a reason
     * that is the product working exactly as designed.
     */
    const courses = await prisma.course.findMany({
      where: { status: 'AVAILABLE', moodleCourseId: { lt: 900_000 } },
      orderBy: { moodleCourseId: 'asc' },
      take: 6,
      select: { id: true },
    });
    courseIds = courses.map((course) => course.id);
    expect(courseIds).toHaveLength(6);

    const foreign = await prisma.level.findFirstOrThrow({
      where: { path: { key: 'english' } },
      select: { id: true },
    });
    foreignLevelId = foreign.id;
  }, 240_000);

  afterAll(async () => {
    if (pathId) {
      /* Placements and results first: `Restrict` on both relations is what makes
         "frozen as taken" true (D-049), so the teardown has to unwind the
         attempt before the instrument that scored it. */
      await prisma.learnerPlacement.deleteMany({ where: { pathId } });
      await prisma.pathAssessmentResponse.deleteMany({
        where: { result: { assessment: { pathId } } },
      });
      await prisma.pathAssessmentResult.deleteMany({ where: { assessment: { pathId } } });
      await prisma.userPath.deleteMany({ where: { pathId } });
      await prisma.pathCourse.deleteMany({ where: { pathId } });
      await prisma.pathAssessment.deleteMany({ where: { pathId } });
      await prisma.level.deleteMany({ where: { pathId } });
      await prisma.path.deleteMany({ where: { id: pathId } });
    }

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `apath-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.enrollment.deleteMany({ where: { userId: { in: ids } } });
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
    method: 'post' | 'patch' | 'delete' | 'put',
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
        email: `apath-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `P-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    return user.id;
  }

  /** The current detail, which every write returns anyway. */
  const detail = async (): Promise<AdminPathDetail> =>
    (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200)).body as AdminPathDetail;

  /** The membership row for a course, wherever it currently sits. */
  const membershipOf = (path: AdminPathDetail, courseId: string) =>
    [...path.levels.flatMap((level) => level.courses), ...path.unassignedCourses].find(
      (row) => row.courseId === courseId,
    )!;

  describe('creating a path', () => {
    it('creates it as a draft, and says everything it still needs', async () => {
      const response = await send(
        'post',
        '/api/admin/paths',
        {
          key: `apath-${RUN_ID}`,
          name: 'مسار الاختبار',
          description: 'مسار أُنشئ لاختبار إدارة المسارات في لوحة الإشراف.',
          typicalDurationMinutes: 600,
        },
        sessionAdmin,
      ).expect(201);

      const path = response.body as AdminPathDetail;
      pathId = path.id;

      expect(path.status).toBe('DRAFT');
      expect(path.levels).toEqual([]);
      expect(path.unassignedCourses).toEqual([]);
      /* All three blockers at once, so one pass fixes the path rather than
         three round trips discovering them one at a time. */
      expect(path.blockers).toEqual([
        'PATH_NO_LEVELS',
        'PATH_NO_ASSESSMENT',
        'PATH_NO_PLACED_COURSES',
      ]);
    });

    it('refuses a duplicate key and a key that is not a slug', async () => {
      await send(
        'post',
        '/api/admin/paths',
        {
          key: `apath-${RUN_ID}`,
          name: 'آخر',
          description: 'وصف كافٍ لتجاوز الحد الأدنى للطول.',
        },
        sessionAdmin,
      ).expect(409);

      await send(
        'post',
        '/api/admin/paths',
        {
          key: 'مفتاح عربي',
          name: 'آخر',
          description: 'وصف كافٍ لتجاوز الحد الأدنى للطول.',
        },
        sessionAdmin,
      ).expect(400);
    });
  });

  describe('the ladder', () => {
    it('adds rungs in order', async () => {
      for (const name of ['تأسيسي', 'متقدم', 'متخصص']) {
        await send('post', `/api/admin/paths/${pathId}/levels`, { name }, sessionAdmin).expect(201);
      }

      const path = await detail();

      expect(path.levels.map((level) => level.name)).toEqual(['تأسيسي', 'متقدم', 'متخصص']);
      expect(path.levels.map((level) => level.position)).toEqual([1, 2, 3]);
      expect(path.blockers).not.toContain('PATH_NO_LEVELS');
    });

    it('reorders them and keeps the positions contiguous', async () => {
      const before = await detail();
      const reversed = [...before.levels].reverse().map((level) => level.id);

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/levels/order`,
        { levelIds: reversed },
        sessionAdmin,
      ).expect(200);

      const path = response.body as AdminPathDetail;

      expect(path.levels.map((level) => level.id)).toEqual(reversed);
      expect(path.levels.map((level) => level.position)).toEqual([1, 2, 3]);

      /* Put it back, so the rest of the suite reads bottom-to-top. */
      await send(
        'patch',
        `/api/admin/paths/${pathId}/levels/order`,
        { levelIds: before.levels.map((level) => level.id) },
        sessionAdmin,
      ).expect(200);
    });

    it('refuses a partial order rather than guessing the rest', async () => {
      const path = await detail();

      await send(
        'patch',
        `/api/admin/paths/${pathId}/levels/order`,
        { levelIds: [path.levels[0]!.id] },
        sessionAdmin,
      ).expect(409);
    });
  });

  describe('membership and placement', () => {
    it('attaches a course unassigned, whoever attaches it', async () => {
      /* Even an administrator's own attach lands in the queue: putting a course
         on a rung is a second decision with its own endpoint (D-134). */
      for (const courseId of courseIds) {
        await send('post', `/api/admin/paths/${pathId}/courses`, { courseId }, sessionAdmin).expect(
          201,
        );
      }

      const path = await detail();

      expect(path.unassignedCourses).toHaveLength(courseIds.length);
      expect(path.unassignedCourses.every((row) => row.placement === 'UNASSIGNED')).toBe(true);
      expect(path.unassignedCourses.every((row) => row.levelId === null)).toBe(true);
      expect(path.blockers).toContain('PATH_NO_PLACED_COURSES');
    });

    it('refuses a level or a position on the attach itself', async () => {
      const path = await detail();

      await send(
        'post',
        `/api/admin/paths/${pathId}/courses`,
        { courseId: courseIds[0], levelId: path.levels[0]!.id },
        sessionAdmin,
      ).expect(400);
    });

    it('places a course, setting both the level and the position', async () => {
      const path = await detail();
      const level = path.levels[0]!;
      const membership = path.unassignedCourses[0]!;

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${membership.id}/placement`,
        { levelId: level.id },
        sessionAdmin,
      ).expect(200);

      const placed = membershipOf(response.body as AdminPathDetail, membership.courseId);

      expect(placed).toMatchObject({ placement: 'PLACED', levelId: level.id, position: 1 });
    });

    it('keeps positions contiguous as a rung fills up', async () => {
      const path = await detail();
      const level = path.levels[0]!;

      for (const membership of path.unassignedCourses.slice(0, 2)) {
        await send(
          'patch',
          `/api/admin/paths/${pathId}/courses/${membership.id}/placement`,
          { levelId: level.id },
          sessionAdmin,
        ).expect(200);
      }

      const after = await detail();
      const filled = after.levels.find((row) => row.id === level.id)!;

      expect(filled.courses.map((course) => course.position)).toEqual([1, 2, 3]);
    });

    it('inserts at a position and pushes the rest down', async () => {
      const path = await detail();
      const level = path.levels[0]!;
      const moving = path.unassignedCourses[0]!;
      const before = level.courses.map((course) => course.courseId);

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${moving.id}/placement`,
        { levelId: level.id, position: 1 },
        sessionAdmin,
      ).expect(200);

      const after = (response.body as AdminPathDetail).levels.find((row) => row.id === level.id)!;

      expect(after.courses.map((course) => course.courseId)).toEqual([moving.courseId, ...before]);
      expect(after.courses.map((course) => course.position)).toEqual([1, 2, 3, 4]);
    });

    it('refuses a position outside the rung rather than clamping it', async () => {
      /* Silently putting a course somewhere other than where the request said
         would make a drag-and-drop client look like it had lost the row. */
      const path = await detail();

      await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${path.unassignedCourses[0]!.id}/placement`,
        { levelId: path.levels[1]!.id, position: 5 },
        sessionAdmin,
      ).expect(422);
    });

    it('re-packs both rungs when a course moves between them', async () => {
      const path = await detail();
      const from = path.levels[0]!;
      const to = path.levels[1]!;
      const moving = from.courses[1]!;

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${moving.id}/placement`,
        { levelId: to.id },
        sessionAdmin,
      ).expect(200);

      const after = response.body as AdminPathDetail;
      const source = after.levels.find((row) => row.id === from.id)!;
      const destination = after.levels.find((row) => row.id === to.id)!;

      expect(source.courses.map((course) => course.position)).toEqual([1, 2, 3]);
      expect(destination.courses.map((course) => course.position)).toEqual([1]);
      expect(destination.courses[0]!.courseId).toBe(moving.courseId);
    });

    it('reorders within a rung, taking the complete order', async () => {
      const path = await detail();
      const level = path.levels[0]!;
      const reversed = [...level.courses].reverse().map((course) => course.id);

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/levels/${level.id}/order`,
        { pathCourseIds: reversed },
        sessionAdmin,
      ).expect(200);

      const after = (response.body as AdminPathDetail).levels.find((row) => row.id === level.id)!;

      expect(after.courses.map((course) => course.id)).toEqual(reversed);
      expect(after.courses.map((course) => course.position)).toEqual([1, 2, 3]);
    });

    it('takes a course off a rung, back to the queue', async () => {
      const path = await detail();
      const level = path.levels[0]!;
      const removing = level.courses[2]!;

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${removing.id}/placement`,
        { levelId: null },
        sessionAdmin,
      ).expect(200);

      const after = response.body as AdminPathDetail;

      expect(membershipOf(after, removing.courseId)).toMatchObject({
        placement: 'UNASSIGNED',
        levelId: null,
        position: null,
      });
      expect(
        after.levels.find((row) => row.id === level.id)!.courses.map((course) => course.position),
      ).toEqual([1, 2]);
    });

    it('refuses a level belonging to a different path', async () => {
      /* 422 rather than 404: the request is well-formed and the level exists —
         it is the combination that is wrong, and saying so is what lets a client
         tell a typo from a bug. */
      const path = await detail();

      await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${path.unassignedCourses[0]!.id}/placement`,
        { levelId: foreignLevelId },
        sessionAdmin,
      ).expect(422);
    });
  });

  describe('deleting a rung', () => {
    it('unassigns its courses and deletes none of them', async () => {
      const before = await detail();
      const level = before.levels[1]!;
      const held = level.courses.map((course) => course.courseId);
      const totalBefore =
        before.levels.reduce((total, row) => total + row.courses.length, 0) +
        before.unassignedCourses.length;

      expect(held.length).toBeGreaterThan(0);

      const response = await send(
        'delete',
        `/api/admin/paths/${pathId}/levels/${level.id}`,
        {},
        sessionAdmin,
      ).expect(200);

      const after = response.body as AdminPathDetail;
      const totalAfter =
        after.levels.reduce((total, row) => total + row.courses.length, 0) +
        after.unassignedCourses.length;

      expect(after.levels.map((row) => row.id)).not.toContain(level.id);
      expect(totalAfter).toBe(totalBefore);
      for (const courseId of held) {
        expect(after.unassignedCourses.map((row) => row.courseId)).toContain(courseId);
      }
      /* And the rungs above close the gap, so the ladder stays 1 … n. */
      expect(after.levels.map((row) => row.position)).toEqual([1, 2]);
    });
  });

  describe('publishing', () => {
    it('refuses while the path has no assessment', async () => {
      /* The blocker that matters most: assignment happens on another screen, so
         a path published without one strands a whole directorate silently. */
      const path = await detail();

      expect(path.blockers).toEqual(['PATH_NO_ASSESSMENT']);

      await send('patch', `/api/admin/paths/${pathId}`, { status: 'PUBLISHED' }, sessionAdmin)
        .expect(409)
        .expect((response) => {
          expect((response.body as { message: string }).message).toBe('PATH_NO_ASSESSMENT');
        });
    });

    it('allows only one live assessment per path', async () => {
      /* Acceptance criterion 12. The second draft is refused by the service and,
         underneath it, by a partial unique index. */
      await send('post', `/api/admin/paths/${pathId}/assessment/draft`, {}, sessionAdmin).expect(
        201,
      );
      await send('post', `/api/admin/paths/${pathId}/assessment/draft`, {}, sessionAdmin).expect(
        409,
      );

      await expect(
        prisma.pathAssessment.create({
          data: { pathId, version: 99, title: 'ثانٍ', description: 'وصف', status: 'DRAFT' },
        }),
      ).rejects.toThrow();
    });

    it('publishes once the ladder, the bank and a placed course are all there', async () => {
      const draft = await prisma.pathAssessment.findFirstOrThrow({
        where: { pathId, status: 'DRAFT' },
        select: { id: true },
      });

      /* A minimal publishable bank: two rungs, one item each, one correct
         answer. The editor's own suite covers authoring; here it is a
         precondition for the publish gate. */
      const path = await detail();

      for (const [index, level] of path.levels.entries()) {
        const question = await prisma.pathAssessmentQuestion.create({
          data: {
            assessmentId: draft.id,
            key: `q${index + 1}`,
            displayOrder: index + 1,
            text: `سؤال ${index + 1}`,
            marks: 1,
            levelId: level.id,
          },
          select: { id: true },
        });

        await prisma.pathAssessmentOption.createMany({
          data: [
            { questionId: question.id, key: 'a', displayOrder: 1, label: 'صحيح', isCorrect: true },
            { questionId: question.id, key: 'b', displayOrder: 2, label: 'خطأ', isCorrect: false },
          ],
        });
      }

      await send('post', `/api/admin/paths/${pathId}/assessment/publish`, {}, sessionAdmin).expect(
        201,
      );

      const ready = await detail();
      expect(ready.blockers).toEqual([]);

      const published = await send(
        'patch',
        `/api/admin/paths/${pathId}`,
        { status: 'PUBLISHED' },
        sessionAdmin,
      ).expect(200);

      expect((published.body as AdminPathDetail).status).toBe('PUBLISHED');
    });
  });

  describe('a published path with a learner on it', () => {
    let learnerSession: string;
    let learnerId: string;

    beforeAll(async () => {
      learnerId = await account('learner', 'EMPLOYEE');
      learnerSession = await signIn(`apath-${RUN_ID}-learner@ministry.gov.example`);

      await prisma.userPath.create({ data: { userId: learnerId, pathId } });

      const bank = await prisma.pathAssessment.findFirstOrThrow({
        where: { pathId, status: 'ACTIVE' },
        select: {
          id: true,
          questions: { select: { id: true, options: { select: { id: true, isCorrect: true } } } },
        },
      });

      /* Every answer wrong, so they land on the bottom rung and everything above
         it is theirs to do. */
      await send(
        'post',
        `/api/paths/${pathId}/assessment/attempts`,
        {
          assessmentId: bank.id,
          answers: bank.questions.map((question) => ({
            questionId: question.id,
            optionId: question.options.find((option) => !option.isCorrect)!.id,
          })),
        },
        learnerSession,
      ).expect(201);
    });

    it('reflects a move on the learner’s next fetch', async () => {
      /* Acceptance criterion 11, asserted from the learner's own endpoint rather
         than from the admin's — the two agreeing is the actual claim. */
      const path = await detail();
      const from = path.levels.find((level) => level.courses.length > 0)!;
      const to = path.levels.find((level) => level.id !== from.id)!;
      const moving = from.courses[0]!;

      const before = (await get(`/api/paths/${pathId}`, learnerSession).expect(200))
        .body as PathDetail;
      expect(
        before.levels.find((level) => level.id === from.id)!.courses.map((course) => course.id),
      ).toContain(moving.courseId);

      await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${moving.id}/placement`,
        { levelId: to.id },
        sessionAdmin,
      ).expect(200);

      const after = (await get(`/api/paths/${pathId}`, learnerSession).expect(200))
        .body as PathDetail;

      expect(
        after.levels.find((level) => level.id === from.id)!.courses.map((course) => course.id),
      ).not.toContain(moving.courseId);
      expect(
        after.levels.find((level) => level.id === to.id)!.courses.map((course) => course.id),
      ).toContain(moving.courseId);
    });

    it('keeps the learner’s progress across a move', async () => {
      /* §10's open item: progress is keyed on the course, never on the level, so
         a move cannot disturb it. Asserted rather than assumed, because that is
         the whole reason the product decision can be deferred. */
      const path = await detail();
      const from = path.levels.find((level) => level.courses.length > 0)!;
      const moving = from.courses[0]!;

      const course = await prisma.course.findUniqueOrThrow({
        where: { id: moving.courseId },
        select: { moodleCourseId: true },
      });

      await prisma.completion.create({
        data: {
          userId: learnerId,
          moodleCourseId: course.moodleCourseId,
          completed: true,
          passed: true,
          gradePercent: 90,
          syncedAt: new Date(),
        },
      });

      const to = path.levels.find((level) => level.id !== from.id)!;

      await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/${moving.id}/placement`,
        { levelId: to.id },
        sessionAdmin,
      ).expect(200);

      const myPath = (await get('/api/my-path', learnerSession).expect(200)).body as MyPathView;
      const found = myPath.levels
        .flatMap((level) => level.courses)
        .find((row) => row.courseId === moving.courseId)!;

      expect(found.passed).toBe(true);
    });

    it('refuses to delete a rung somebody is standing on', async () => {
      const path = await detail();
      const standing = await prisma.learnerPlacement.findFirstOrThrow({
        where: { pathId },
        select: { levelId: true },
      });

      expect(path.levels.map((level) => level.id)).toContain(standing.levelId);

      await send(
        'delete',
        `/api/admin/paths/${pathId}/levels/${standing.levelId}`,
        {},
        sessionAdmin,
      ).expect(409);
    });

    it('refuses to detach a course the learner is enrolled in', async () => {
      const path = await detail();
      const enrolled = await prisma.enrollment.findFirstOrThrow({
        where: { userId: learnerId },
        select: { courseId: true },
      });

      const membership = membershipOf(path, enrolled.courseId);

      await send(
        'delete',
        `/api/admin/paths/${pathId}/courses/${membership.id}`,
        {},
        sessionAdmin,
      ).expect(409);
    });

    it('refuses to delete a path somebody was assigned, and says so before the attempt', async () => {
      const path = await detail();

      expect(path.canDelete).toBe(false);

      await send('delete', `/api/admin/paths/${pathId}`, {}, sessionAdmin).expect(409);
    });

    it('unpublishes without touching anyone holding it', async () => {
      await send('patch', `/api/admin/paths/${pathId}`, { status: 'DRAFT' }, sessionAdmin).expect(
        200,
      );

      /* The learner's own view is unchanged: My Path reads through `user_paths`
         and never consults `paths.status`, which is the whole of what makes
         unpublishing safe. */
      const myPath = (await get('/api/my-path', learnerSession).expect(200)).body as MyPathView;
      expect(myPath.pathId).toBe(pathId);

      await send(
        'patch',
        `/api/admin/paths/${pathId}`,
        { status: 'PUBLISHED' },
        sessionAdmin,
      ).expect(200);
    });
  });

  describe('the list', () => {
    it('shows how much of each path is still waiting to be placed', async () => {
      const rows = (await get('/api/admin/paths', sessionAdmin).expect(200)).body as AdminPathRow[];
      const row = rows.find((candidate) => candidate.id === pathId)!;

      expect(row.unassignedCourseCount).toBeGreaterThan(0);
      expect(row.placedCourseCount).toBeGreaterThan(0);
      expect(row.assignedLearners).toBe(1);
    });
  });
});
