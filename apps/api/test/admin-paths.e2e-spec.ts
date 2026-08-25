import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { AdminPathDetail, AdminPathRow, PathDetail } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { SharedStateLock } from './shared-state-lock';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.4 over real HTTP against a real database.
 *
 * **The properties are about what an administrator cannot accidentally do.**
 *
 * They cannot offer a path a learner could never confirm — the five-course floor
 * is invisible from every screen once the path is live, so it is refused where
 * the path becomes offerable.
 *
 * They cannot strand anybody. Retiring a path leaves every learner who holds it
 * untouched *and* leaves the person still building able to reach their own build
 * page — which is asserted here against the learner's own endpoint, not merely
 * reasoned about. And a course cannot leave a path while learners hold it
 * through that path, because their next save would be refused about a course
 * they chose from that very screen.
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

  /* This suite creates and *offers* a path, which every learner then sees.
     Serialised against the suites that read the catalogue — see
     shared-state-lock.ts. */
  const lock = new SharedStateLock();

  let sessionAdmin: string;

  let csrfCookie: string;
  let csrfToken: string;

  /** The path this suite creates and manages. Removed in afterAll. */
  let pathId: string;
  /** Six catalogue courses, borrowed for membership and never modified. */
  let courseIds: string[];

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
     * catalogue sync — which another suite runs — correctly withdraws it. Their
     * status would then flip out from under the five-course-floor assertions
     * here, failing this suite for a reason that is the product working exactly
     * as designed.
     *
     * Catalogue courses are in the LMS, so sync leaves them alone. Nothing here
     * modifies them; only `path_courses` membership changes, and afterAll
     * removes the path that owns it. The first six by LMS id, deliberately away
     * from the end of the catalogue where `entity-fixtures` borrows.
     */
    const courses = await prisma.course.findMany({
      where: { status: 'AVAILABLE', moodleCourseId: { lt: 900_000 } },
      orderBy: { moodleCourseId: 'asc' },
      take: 6,
      select: { id: true },
    });
    courseIds = courses.map((course) => course.id);
    expect(courseIds).toHaveLength(6);
    /* Generous: the hook waits for the other suites to finish with the shared
       catalogue before it starts. */
  }, 240_000);

  afterAll(async () => {
    if (pathId) {
      await prisma.userPathCourse.deleteMany({ where: { userPath: { pathId } } });
      await prisma.userPath.deleteMany({ where: { pathId } });
      await prisma.pathCourse.deleteMany({ where: { pathId } });
      await prisma.path.deleteMany({ where: { id: pathId } });
    }

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `apath-${RUN_ID}-` } },
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

  describe('creating a path', () => {
    it('creates it inactive, because an empty path cannot be offered', async () => {
      const response = await send(
        'post',
        '/api/admin/paths',
        {
          key: `apath-${RUN_ID}`,
          name: 'مسار الاختبار',
          description: 'مسار أُنشئ لاختبار إدارة المسارات في لوحة الإشراف.',
          riasecLetter: 'C',
          typicalDurationMinutes: 600,
        },
        sessionAdmin,
      ).expect(201);

      const path = response.body as AdminPathDetail;
      pathId = path.id;

      expect(path.isActive).toBe(false);
      expect(path.courses).toHaveLength(0);
      /* And it says why it cannot yet be offered, rather than leaving the
         administrator to discover the floor by trying. */
      expect(path.blockers).toContain('PATH_TOO_FEW_COURSES');
    });

    it('refuses a duplicate key and a key that is not a slug', async () => {
      await send(
        'post',
        '/api/admin/paths',
        {
          key: `apath-${RUN_ID}`,
          name: 'آخر',
          description: 'وصف كافٍ لتجاوز الحد الأدنى للطول.',
          riasecLetter: 'R',
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
          riasecLetter: 'R',
        },
        sessionAdmin,
      ).expect(400);
    });

    it('reports the 5-10 bounds without offering to change them', async () => {
      const response = await get('/api/admin/paths/bounds', sessionAdmin).expect(200);

      /* D-074: shown, never edited. There is no write endpoint for these, and a
         reviewer should be able to see that from the controller. */
      expect(response.body).toEqual({ min: 5, max: 10 });
    });
  });

  describe('the five-course floor', () => {
    it('refuses to activate a path with four courses', async () => {
      for (const courseId of courseIds.slice(0, 4)) {
        await send('post', `/api/admin/paths/${pathId}/courses`, { courseId }, sessionAdmin).expect(
          201,
        );
      }

      const refusal = await send(
        'patch',
        `/api/admin/paths/${pathId}`,
        { isActive: true },
        sessionAdmin,
      ).expect(409);

      expect((refusal.body as { message: string }).message).toBe('PATH_TOO_FEW_COURSES');
    });

    it('audits the refusal with how many were selectable', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_PATH_UPDATED', outcome: 'FAILURE', targetId: pathId },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({
        reason: 'PATH_NOT_OFFERABLE',
        blockers: 'PATH_TOO_FEW_COURSES',
        selectable: 4,
      });
    });

    it('activates once the fifth course is attached', async () => {
      await send(
        'post',
        `/api/admin/paths/${pathId}/courses`,
        { courseId: courseIds[4] },
        sessionAdmin,
      ).expect(201);

      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}`,
        { isActive: true },
        sessionAdmin,
      ).expect(200);

      expect((response.body as AdminPathDetail).isActive).toBe(true);
      expect((response.body as AdminPathDetail).blockers).toEqual([]);
    });

    it('refuses a detach that would drop an active path back below the floor', async () => {
      const refusal = await send(
        'delete',
        `/api/admin/paths/${pathId}/courses/${courseIds[0]}`,
        {},
        sessionAdmin,
      ).expect(409);

      /* The same rule from the other direction. Without it, the floor would
         hold only at the moment of activation and never again. */
      expect((refusal.body as { message: string }).message).toBe('PATH_TOO_FEW_COURSES');
    });

    it('permits the detach once a sixth course gives it room', async () => {
      await send(
        'post',
        `/api/admin/paths/${pathId}/courses`,
        { courseId: courseIds[5] },
        sessionAdmin,
      ).expect(201);

      const response = await send(
        'delete',
        `/api/admin/paths/${pathId}/courses/${courseIds[0]}`,
        {},
        sessionAdmin,
      ).expect(200);

      expect((response.body as AdminPathDetail).courses).toHaveLength(5);
    });

    it('refuses to attach the same course twice', async () => {
      await send(
        'post',
        `/api/admin/paths/${pathId}/courses`,
        { courseId: courseIds[1] },
        sessionAdmin,
      ).expect(409);
    });
  });

  describe('membership and ordering', () => {
    it('reorders by a complete list and refuses a partial one', async () => {
      const before = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;
      const ids = before.courses.map((course) => course.id);

      await send(
        'patch',
        `/api/admin/paths/${pathId}/courses/order`,
        { courseIds: ids.slice(0, 2) },
        sessionAdmin,
      ).expect(409);

      const reversed = [...ids].reverse();
      const after = (
        await send(
          'patch',
          `/api/admin/paths/${pathId}/courses/order`,
          { courseIds: reversed },
          sessionAdmin,
        ).expect(200)
      ).body as AdminPathDetail;

      /* Owed since Phase 4: `display_order` was set from the seed and had no
         editor, while deciding the order the build screen offers courses in. */
      expect(after.courses.map((course) => course.id)).toEqual(reversed);
      expect(after.courses.map((course) => course.displayOrder)).toEqual([1, 2, 3, 4, 5]);
    });

    it('names the supplying organisation, and says so when there is none', async () => {
      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;

      const truth = await prisma.course.findMany({
        where: { id: { in: detail.courses.map((course) => course.id) } },
        select: { id: true, ownerEntity: { select: { name: true } } },
      });
      const expected = new Map(truth.map((row) => [row.id, row.ownerEntity?.name ?? null]));

      /*
       * Checked against the database rather than against an assumption about the
       * seed. An unowned course is a legitimate state (D-063) and one only the
       * admin portal can see — but the seeded catalogue is *partly* owned by the
       * demo organisation, so asserting "all null" would encode a fixture detail
       * as if it were the rule.
       */
      for (const course of detail.courses) {
        expect(course.ownerEntityName).toEqual(expected.get(course.id));
      }
      expect(detail.courses.length).toBeGreaterThan(0);
    });
  });

  describe('a learner holding the path', () => {
    let learnerSession: string;
    let learnerId: string;

    it('appears in the learner counts once they select it', async () => {
      learnerId = await account('learner', 'EMPLOYEE');
      learnerSession = await signIn(`apath-${RUN_ID}-learner@ministry.gov.example`);

      await send('post', '/api/my-path/select', { pathId }, learnerSession).expect(204);

      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;

      expect(detail.learners).toMatchObject({ building: 1, active: 0, completed: 0 });
      /* Not committed, so not counted among the learners D-002 makes permanent. */
      expect(detail.committedLearners).toBe(0);
      expect(learnerId).toBeTruthy();
    });

    it('refuses to detach a course that learner has selected', async () => {
      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;
      const chosen = detail.courses.slice(0, 5).map((course) => course.id);

      /* The build page replaces the whole selection, which is what PUT means
         here — the learner sends what is ticked. */
      await send('put', '/api/my-path/courses', { courseIds: chosen }, learnerSession).expect(200);

      const refusal = await send(
        'delete',
        `/api/admin/paths/${pathId}/courses/${chosen[0]}`,
        {},
        sessionAdmin,
      ).expect(409);

      /*
       * Nothing cascades, so the learner would keep the row — what breaks is the
       * build rules, which validate a selection against path membership. Their
       * next save would be refused with COURSE_NOT_IN_PATH about a course they
       * chose from this very screen.
       */
      expect((refusal.body as { message: string }).message).toBe('COURSE_HELD_BY_LEARNERS');
    });

    it('reports how many hold each course, so the refusal is predictable', async () => {
      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;

      expect(detail.courses.filter((course) => course.heldByLearners > 0)).toHaveLength(5);
    });

    it('lets the learner keep using their build page after the path is retired', async () => {
      await send('patch', `/api/admin/paths/${pathId}`, { isActive: false }, sessionAdmin).expect(
        200,
      );

      /*
       * The stranding this sub-phase set out to prevent. Before the fix, a plain
       * `isActive: true` filter on the build page turned a retirement into a 404
       * for everyone part way through choosing — while `confirm` never checked
       * the flag at all, so they could still commit to a path they could no
       * longer see.
       */
      const detail = (await get(`/api/paths/${pathId}`, learnerSession).expect(200))
        .body as PathDetail;

      expect(detail.id).toBe(pathId);
    });

    it('and lets them confirm it, because they chose it before it was retired', async () => {
      await send('post', '/api/my-path/confirm', {}, learnerSession).expect(200);

      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;

      /* Retirement governs new selections, exactly as course-edit protection
         does. Refusing at the commitment gate would strand somebody who had
         already picked five courses. */
      expect(detail.learners).toMatchObject({ building: 0, active: 1 });
      expect(detail.committedLearners).toBe(1);
    });

    it('hides the retired path from everyone who has not chosen it', async () => {
      await account('browser', 'EMPLOYEE');
      const browsing = await signIn(`apath-${RUN_ID}-browser@ministry.gov.example`);

      await get(`/api/paths/${pathId}`, browsing).expect(404);
    });

    it('audits the retirement with how many were mid-build at the time', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_PATH_RETIRED', targetId: pathId },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      /* The number that made the decision defensible, recorded with it. */
      expect(entry?.metadata).toMatchObject({ buildingLearners: 1 });
    });
  });

  describe('editing content', () => {
    it('changes the RIASEC letter, which is what drives the gold recommendation', async () => {
      const response = await send(
        'patch',
        `/api/admin/paths/${pathId}`,
        { riasecLetter: 'S', name: 'مسار الاختبار المعدّل' },
        sessionAdmin,
      ).expect(200);

      expect(response.body).toMatchObject({
        riasecLetter: 'S',
        name: 'مسار الاختبار المعدّل',
      });
    });

    it('records which fields moved, and not their values', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_PATH_UPDATED', outcome: 'SUCCESS', targetId: pathId },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      /* Filtered on `!== undefined`: a transformed DTO has an own property for
         every declared optional, and 5.2's audit test caught what happens when
         that is taken at face value. */
      expect(entry?.metadata).toMatchObject({ fields: 'name,riasecLetter' });
    });

    it('lists the path with its counts', async () => {
      const rows = (await get('/api/admin/paths', sessionAdmin).expect(200)).body as AdminPathRow[];
      const row = rows.find((candidate) => candidate.id === pathId);

      expect(row).toMatchObject({ courseCount: 5, committedLearners: 1, isActive: false });
    });

    it('answers 404 for an unknown path and 400 for a malformed id', async () => {
      await get('/api/admin/paths/00000000-0000-4000-8000-000000000000', sessionAdmin).expect(404);
      await get('/api/admin/paths/not-a-uuid', sessionAdmin).expect(400);
    });
  });

  /**
   * Deletion, and the one case it is for (D-098).
   *
   * The interesting property is the refusal: `user_paths.path_id` is `Restrict`
   * and a path certificate names the path on a document somebody holds, so a
   * path anybody ever chose cannot be removed without falsifying a credential.
   * What is left is the path created by mistake, which retirement can only hide.
   */
  describe('deleting a path', () => {
    /** A second path, created here to be deleted. Never offered to anyone. */
    let spareId: string;

    it('refuses to delete a path somebody has chosen, and says which operation to use', async () => {
      const refusal = await send('delete', `/api/admin/paths/${pathId}`, {}, sessionAdmin).expect(
        409,
      );

      expect((refusal.body as { message: string }).message).toBe('PATH_HELD_BY_LEARNERS');

      /* Still there, with its learner intact. */
      const detail = (await get(`/api/admin/paths/${pathId}`, sessionAdmin).expect(200))
        .body as AdminPathDetail;

      expect(detail.committedLearners).toBe(1);
      /* Reported before the attempt too, so §4C.4 can show the reason in place
         of a button rather than letting the administrator be refused. */
      expect(detail.canDelete).toBe(false);
    });

    it('audits the refusal with what held it', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_PATH_DELETED', targetId: pathId, outcome: 'FAILURE' },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({ learners: 1, certificates: 0 });
    });

    it('deletes one nobody ever chose, and takes its membership with it', async () => {
      const created = (
        await send(
          'post',
          '/api/admin/paths',
          {
            key: `spare-${RUN_ID}`,
            name: 'مسار أُنشئ بالخطأ',
            description: 'مسار تجريبي يُحذف في هذا الاختبار وحده.',
            riasecLetter: 'C',
          },
          sessionAdmin,
        ).expect(201)
      ).body as AdminPathDetail;

      spareId = created.id;
      expect(created.canDelete).toBe(true);

      await send(
        'post',
        `/api/admin/paths/${spareId}/courses`,
        { courseId: courseIds[0] },
        sessionAdmin,
      ).expect(201);

      await send('delete', `/api/admin/paths/${spareId}`, {}, sessionAdmin).expect(204);

      await get(`/api/admin/paths/${spareId}`, sessionAdmin).expect(404);
      /* `path_courses` cascades — and the course itself is the LMS's, so it is
         still in the catalogue afterwards. */
      expect(await prisma.pathCourse.count({ where: { pathId: spareId } })).toBe(0);
      expect(await prisma.course.count({ where: { id: courseIds[0] } })).toBe(1);
    });

    it('names the path in the audit entry, since the row it points at is gone', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_PATH_DELETED', targetId: spareId, outcome: 'SUCCESS' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({
        key: `spare-${RUN_ID}`,
        name: 'مسار أُنشئ بالخطأ',
        riasecLetter: 'C',
        courses: 1,
      });
    });

    it('answers 404 for a path that is already gone', async () => {
      await send('delete', `/api/admin/paths/${spareId}`, {}, sessionAdmin).expect(404);
    });
  });
});
