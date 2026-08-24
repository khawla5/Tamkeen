import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { AdminCoursePage, AdminCourseRow } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.5 over real HTTP against a real database.
 *
 * **What this suite is really testing is that the administrator is powerful and
 * still cannot strand anybody.** They see every organisation's courses and the
 * unowned catalogue; they can hide a course, restore it, and place it with a
 * supplier. What they cannot do is assign `status` — it is derived — so hiding a
 * course a learner holds lands on HIDDEN_BUT_COMPLETABLE rather than RETIRED,
 * and that is not a choice on the screen.
 *
 * Its courses are its own, created and removed here, so nothing it hides is a
 * course another suite is reading.
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

/** Above the range the mock LMS assigns to portal-created courses. */
const COURSE_ID_BASE = 970_000 + (parseInt(RUN_ID, 16) % 20_000);

describe('Admin course oversight (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sessionAdmin: string;
  let csrfCookie: string;
  let csrfToken: string;

  let entityId: string;
  /** Published, held by nobody. */
  let plainCourseId: string;
  /** Published, and held by a learner through a path. */
  let heldCourseId: string;
  let pathId: string;

  beforeAll(async () => {
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
    sessionAdmin = await signIn(`acourse-${RUN_ID}-admin@ministry.gov.example`);

    const entity = await prisma.entity.create({
      data: { key: `acourse-${RUN_ID}`, name: 'جهة الإشراف' },
      select: { id: true },
    });
    entityId = entity.id;

    plainCourseId = await course(0, 'دورة بلا متدربين');
    heldCourseId = await course(1, 'دورة يحتفظ بها متدرب');

    /*
     * A learner holding the second course, which is the only way to exercise the
     * rule that matters: hiding a held course must degrade rather than retire.
     * The path is this suite's own — attaching to a real one would change what
     * every learner is offered.
     */
    const path = await prisma.path.create({
      data: {
        key: `acourse-${RUN_ID}`,
        name: 'مسار الإشراف',
        description: 'مسار أُنشئ لاختبار الإشراف على الدورات.',
        riasecLetter: 'C',
        displayOrder: 900,
        isActive: false,
        pathCourses: { create: [{ courseId: heldCourseId, displayOrder: 1 }] },
      },
      select: { id: true },
    });
    pathId = path.id;

    const learnerId = await account('learner', 'EMPLOYEE');
    await prisma.userPath.create({
      data: {
        userId: learnerId,
        pathId,
        courses: { create: [{ courseId: heldCourseId, displayOrder: 1 }] },
      },
    });
  }, 180_000);

  afterAll(async () => {
    await prisma.userPathCourse.deleteMany({ where: { userPath: { pathId } } });
    await prisma.userPath.deleteMany({ where: { pathId } });
    await prisma.pathCourse.deleteMany({ where: { pathId } });
    await prisma.path.deleteMany({ where: { id: pathId } });
    await prisma.course.deleteMany({ where: { id: { in: [plainCourseId, heldCourseId] } } });

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `acourse-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.entity.deleteMany({ where: { id: entityId } });
    await app.close();
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
        email: `acourse-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `C-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    return user.id;
  }

  async function course(offset: number, title: string): Promise<string> {
    const created = await prisma.course.create({
      data: {
        moodleCourseId: COURSE_ID_BASE + offset,
        title: `${title} ${RUN_ID}`,
        summary: 'دورة أُنشئت لاختبار الإشراف.',
        status: 'AVAILABLE',
        publication: 'PUBLISHED',
        language: 'AR',
        objectives: [],
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    return created.id;
  }

  describe('the global view', () => {
    it('shows courses no organisation supplies, which no entity portal can', async () => {
      const response = await get(
        `/api/admin/courses?q=${encodeURIComponent(RUN_ID)}`,
        sessionAdmin,
      ).expect(200);
      const page = response.body as AdminCoursePage;

      expect(page.rows.map((row) => row.id).sort()).toEqual([plainCourseId, heldCourseId].sort());
      expect(page.rows.every((row) => row.ownerEntityName === null)).toBe(true);
      /* A standing piece of work, counted unfiltered — the seeded catalogue's
         unowned courses plus these two. */
      expect(page.unownedTotal).toBeGreaterThanOrEqual(2);
    });

    it('carries the LMS facts beside the derived status', async () => {
      const row = (await get(`/api/admin/courses/${plainCourseId}`, sessionAdmin).expect(200))
        .body as AdminCourseRow;

      /* "Why can nobody see this course" is answered by these three disagreeing,
         so all three are on the row rather than only the conclusion. */
      expect(row).toMatchObject({
        publication: 'PUBLISHED',
        status: 'AVAILABLE',
        lmsPresent: true,
        lmsVisible: true,
      });
    });

    it('reads publishedAt, which nothing has rendered since Phase 4 wrote it', async () => {
      const row = (await get(`/api/admin/courses/${plainCourseId}`, sessionAdmin).expect(200))
        .body as AdminCourseRow;

      expect(row.publishedAt).not.toBeNull();
    });

    it('reports how many learners hold a course', async () => {
      const row = (await get(`/api/admin/courses/${heldCourseId}`, sessionAdmin).expect(200))
        .body as AdminCourseRow;

      expect(row.heldByLearners).toBe(1);
      expect(row.paths.map((path) => path.id)).toContain(pathId);
    });

    it('filters to the unowned without a sentinel in the entity filter', async () => {
      const page = (
        await get('/api/admin/courses?unowned=true&pageSize=100', sessionAdmin).expect(200)
      ).body as AdminCoursePage;

      expect(page.rows.every((row) => row.ownerEntityId === null)).toBe(true);
    });

    it('rejects a filter the DTO does not declare, and an oversized page', async () => {
      await get('/api/admin/courses?ownerEntityId=x', sessionAdmin).expect(400);
      await get('/api/admin/courses?pageSize=5000', sessionAdmin).expect(400);
    });
  });

  describe('intervening', () => {
    it('places an unowned course with an organisation', async () => {
      const row = (
        await send(
          'patch',
          `/api/admin/courses/${plainCourseId}`,
          { ownerEntityId: entityId },
          sessionAdmin,
        ).expect(200)
      ).body as AdminCourseRow;

      /* The only route by which the seeded catalogue ever acquires a supplier
         (D-063): an entity cannot claim a course, and nothing else assigns one. */
      expect(row.ownerEntityId).toBe(entityId);
      expect(row.ownerEntityName).toBe('جهة الإشراف');
    });

    it('hides a course nobody holds, retiring it outright', async () => {
      const row = (
        await send(
          'patch',
          `/api/admin/courses/${plainCourseId}`,
          { publication: 'UNPUBLISHED' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminCourseRow;

      expect(row).toMatchObject({ publication: 'UNPUBLISHED', status: 'RETIRED' });
    });

    it('degrades rather than retires a course a learner holds', async () => {
      const row = (
        await send(
          'patch',
          `/api/admin/courses/${heldCourseId}`,
          { publication: 'UNPUBLISHED' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminCourseRow;

      /*
       * The rule §2/D-015 exists for, reached through the administrator's most
       * powerful action. `status` is not a field this endpoint accepts —
       * `effectiveCourseStatus` decides it — so this outcome is not a choice
       * anybody made and cannot be overridden from the screen.
       */
      expect(row).toMatchObject({
        publication: 'UNPUBLISHED',
        status: 'HIDDEN_BUT_COMPLETABLE',
      });
    });

    it('audits the intervention with the resulting status', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_COURSE_INTERVENED', targetId: heldCourseId },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      /* An intervention that degraded and one that retired outright are
         different events, and the trail says which. */
      expect(entry?.metadata).toMatchObject({
        status: 'HIDDEN_BUT_COMPLETABLE',
        fields: 'publication',
      });
    });

    it('restores a hidden course to the catalogue', async () => {
      const row = (
        await send(
          'patch',
          `/api/admin/courses/${plainCourseId}`,
          { publication: 'PUBLISHED' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminCourseRow;

      expect(row).toMatchObject({ publication: 'PUBLISHED', status: 'AVAILABLE' });
    });

    it('refuses to send a published course back to DRAFT', async () => {
      const response = await send(
        'patch',
        `/api/admin/courses/${plainCourseId}`,
        { publication: 'DRAFT' },
        sessionAdmin,
      ).expect(409);

      /* DRAFT is reachable forward only. Going back would take the course out of
         the catalogue by a route that never reaches HIDDEN_BUT_COMPLETABLE, so a
         learner holding it would lose it. */
      expect((response.body as { message: string }).message).toBe('COURSE_CANNOT_RETURN_TO_DRAFT');
    });

    it('places a course back with nobody', async () => {
      const row = (
        await send(
          'patch',
          `/api/admin/courses/${plainCourseId}`,
          { ownerEntityId: null },
          sessionAdmin,
        ).expect(200)
      ).body as AdminCourseRow;

      expect(row.ownerEntityId).toBeNull();
    });

    it('refuses an organisation that does not exist', async () => {
      await send(
        'patch',
        `/api/admin/courses/${plainCourseId}`,
        { ownerEntityId: '00000000-0000-4000-8000-000000000000' },
        sessionAdmin,
      ).expect(404);
    });

    it('offers no way to write the status directly', async () => {
      /* The DTO is whitelisted with forbidNonWhitelisted, so this is refused
         rather than ignored — which is what keeps the derivation the only
         author of `courses.status` (D-059). */
      await send(
        'patch',
        `/api/admin/courses/${plainCourseId}`,
        { status: 'AVAILABLE' },
        sessionAdmin,
      ).expect(400);
    });

    it('answers 404 for an unknown course and 400 for a malformed id', async () => {
      await get('/api/admin/courses/00000000-0000-4000-8000-000000000000', sessionAdmin).expect(
        404,
      );
      await get('/api/admin/courses/not-a-uuid', sessionAdmin).expect(400);
    });
  });
});
