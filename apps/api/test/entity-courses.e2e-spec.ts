import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type {
  CourseSummary,
  EntityCourseDetail,
  EntityDashboardView,
  EntityLearnerRow,
  EntityUnpublishResult,
} from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { MockLmsService } from '../src/moodle/mock/mock-lms.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The §4B course lifecycle, over real HTTP against a real database (§2B).
 *
 * Create the shell → author in Moodle → set the product metadata → publish →
 * it reaches the learner catalogue → review the learners on it. Every rule that
 * matters is asserted through the API rather than against a service, because a
 * rule enforced only in a component is a rule that is not enforced.
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

describe('Entity course lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;
  let lms: MockLmsService;

  let entityId: string;
  let otherEntityId: string;
  let session: string;
  let otherSession: string;
  let employeeSession: string;
  let pathId: string;
  let levelId: string;

  /** Courses created during the run, torn down at the end. */
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
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
    lms = app.get(MockLmsService);

    const issued = await csrf();
    csrfCookie = issued.cookie;
    csrfToken = issued.token;

    const entity = await prisma.entity.create({
      data: { key: `life-a-${RUN_ID}`, name: 'جهة الدورات' },
      select: { id: true },
    });
    const other = await prisma.entity.create({
      data: { key: `life-b-${RUN_ID}`, name: 'جهة أخرى' },
      select: { id: true },
    });

    entityId = entity.id;
    otherEntityId = other.id;

    session = await entityAccount('owner', entity.id);
    otherSession = await entityAccount('other', other.id);
    employeeSession = await employeeAccount('learner');

    /*
     * The suite's own path, not a seeded one.
     *
     * Publishing a course here places it on a rung, which changes what that
     * path offers — and a seeded path is something the journey suite counts.
     * Borrowing one made this suite's ordering decide whether that one passed,
     * which is a failure that reads as a defect in the code under test and is
     * nothing of the kind. Published directly rather than through the gate:
     * the gate is `admin-paths`' subject, and what is needed here is a real
     * published path with a rung to place onto.
     */
    const path = await prisma.path.create({
      data: {
        key: `life-${RUN_ID}`,
        name: 'مسار اختبار دورات الجهات',
        description: 'مسار أُنشئ لاختبار دورة حياة دورات الجهة.',
        displayOrder: 810,
        status: 'PUBLISHED',
        levels: { create: [{ name: 'المرحلة الأولى', position: 1 }] },
      },
      select: { id: true, levels: { orderBy: { position: 'asc' }, select: { id: true } } },
    });

    pathId = path.id;
    levelId = path.levels[0]!.id;
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `life-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    if (createdCourseIds.length > 0) {
      await prisma.enrollment.deleteMany({ where: { courseId: { in: createdCourseIds } } });
      await prisma.pathCourse.deleteMany({ where: { courseId: { in: createdCourseIds } } });
      await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
    }

    if (pathId) {
      await prisma.pathCourse.deleteMany({ where: { pathId } });
      await prisma.userPath.deleteMany({ where: { pathId } });
      await prisma.level.deleteMany({ where: { pathId } });
      await prisma.path.deleteMany({ where: { id: pathId } });
    }

    await prisma.entity.deleteMany({ where: { id: { in: [entityId, otherEntityId] } } });

    await app.close();
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

  function post(path: string, body: Record<string, unknown>, sessionCookie?: string) {
    return request(server())
      .post(path)
      .set('Cookie', [csrfCookie, ...(sessionCookie ? [sessionCookie] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  function patch(path: string, body: Record<string, unknown>, sessionCookie: string) {
    return request(server())
      .patch(path)
      .set('Cookie', [csrfCookie, sessionCookie].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  function get(path: string, sessionCookie: string) {
    return request(server()).get(path).set('Cookie', sessionCookie);
  }

  async function signIn(email: string): Promise<string> {
    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function entityAccount(label: string, forEntityId: string): Promise<string> {
    const email = `life-${RUN_ID}-${label}@ministry.gov.example`;

    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'مسؤول الجهة',
        employeeId: numericEmployeeId(RUN_ID, label),
        department: 'قسم',
        role: 'ENTITY',
        entityId: forEntityId,
        emailVerifiedAt: new Date(),
      },
    });

    return signIn(email);
  }

  async function employeeAccount(label: string): Promise<string> {
    const email = `life-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: numericEmployeeId(RUN_ID, label),
      department: 'تقنية المعلومات',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    return signIn(email);
  }

  /** Creates a shell through the API and remembers it for teardown. */
  async function createCourse(
    body: Record<string, unknown> = {},
    sessionCookie = session,
  ): Promise<EntityCourseDetail> {
    const response = await post(
      '/api/entity/courses',
      { title: `دورة ${randomBytes(3).toString('hex')}`, summary: 'وصف', ...body },
      sessionCookie,
    ).expect(201);

    const course = response.body as EntityCourseDetail;
    createdCourseIds.push(course.id);

    return course;
  }

  /** Fills in everything the publish gate needs, and simulates the authoring. */
  /**
   * Everything the publish gate asks for, including the half an entity cannot do.
   *
   * The gate counts *placed* memberships (D-134): an entity offers the course to
   * a path, and until an administrator puts it on a rung it reaches no learner,
   * so a course sitting unassigned in three paths is not publishable. The
   * placement is written directly here because it is the administrator's
   * decision and `admin-paths` is the suite that proves the endpoint.
   */
  async function makePublishable(course: EntityCourseDetail): Promise<EntityCourseDetail> {
    lms.simulateAuthoring(course.moodleCourseId);

    await patch(
      `/api/entity/courses/${course.id}`,
      {
        pathIds: [pathId],
        durationMinutes: 120,
        objectives: ['هدف أول', 'هدف ثانٍ'],
        language: 'AR',
      },
      session,
    ).expect(200);

    return place(course.id);
  }

  /** The administrator's half: put the membership on the path's first rung. */
  async function place(courseId: string): Promise<EntityCourseDetail> {
    const membership = await prisma.pathCourse.findFirstOrThrow({
      where: { pathId, courseId },
      select: { id: true },
    });
    const taken = await prisma.pathCourse.aggregate({
      where: { levelId },
      _max: { position: true },
    });

    await prisma.pathCourse.update({
      where: { id: membership.id },
      data: { levelId, position: (taken._max.position ?? 0) + 1, placedAt: new Date() },
    });

    return (await get(`/api/entity/courses/${courseId}`, session).expect(200))
      .body as EntityCourseDetail;
  }

  describe('creating the shell (§4B.3, D-060)', () => {
    it('creates it in the LMS, not only in our catalogue', async () => {
      /*
       * The whole reason the shell lives in Moodle: a row with no LMS
       * counterpart would be withdrawn by the next catalogue sync, minutes after
       * the entity created it.
       */
      const course = await createCourse();

      expect(course.moodleCourseId).toBeGreaterThan(0);
      await expect(lms.getCourse(course.moodleCourseId)).resolves.toMatchObject({
        lmsCourseId: course.moodleCourseId,
      });
    });

    it('starts as a DRAFT, invisible to learners', async () => {
      const course = await createCourse();

      expect(course.publication).toBe('DRAFT');
      expect(course.status).toBe('DRAFT');
    });

    it('belongs to the creating entity, and is invisible to another', async () => {
      const course = await createCourse();

      await get(`/api/entity/courses/${course.id}`, otherSession).expect(404);
    });

    it('enrols the author with editing rights', async () => {
      /* Landing on the course page is only useful if Moodle's Edit mode is
         available there, which the editingteacher enrolment is what confers
         (D-060). */
      const course = await createCourse();

      const owner = await prisma.user.findFirstOrThrow({
        where: { email: `life-${RUN_ID}-owner@ministry.gov.example` },
        select: { moodleUserId: true },
      });

      expect(lms.isAuthorEnrolment(owner.moodleUserId!, course.moodleCourseId)).toBe(true);
    });

    it('audits the creation', async () => {
      const course = await createCourse();

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_CREATED', targetId: course.id },
        select: { outcome: true },
      });

      expect(entry).toMatchObject({ outcome: 'SUCCESS' });
    });

    it('rejects a title that is only whitespace-thin', async () => {
      await post('/api/entity/courses', { title: 'ا', summary: 'وصف' }, session).expect(400);
    });
  });

  describe('product metadata (§4B.3, D-035)', () => {
    it('stores objectives, prerequisites, duration and language', async () => {
      const course = await createCourse();

      const updated = (
        await patch(
          `/api/entity/courses/${course.id}`,
          {
            durationMinutes: 90,
            objectives: ['هدف'],
            prerequisites: 'لا يوجد',
            language: 'EN',
          },
          session,
        ).expect(200)
      ).body as EntityCourseDetail;

      expect(updated).toMatchObject({
        durationMinutes: 90,
        objectives: ['هدف'],
        prerequisites: 'لا يوجد',
        language: 'EN',
      });
    });

    it('patches rather than replaces — an absent field is left alone', async () => {
      /* The form saves one section at a time; a PUT would silently clear
         whatever the caller did not resend. */
      const course = await createCourse();

      await patch(`/api/entity/courses/${course.id}`, { objectives: ['هدف'] }, session).expect(200);

      const updated = (
        await patch(`/api/entity/courses/${course.id}`, { durationMinutes: 60 }, session).expect(
          200,
        )
      ).body as EntityCourseDetail;

      expect(updated.objectives).toEqual(['هدف']);
      expect(updated.durationMinutes).toBe(60);
    });

    describe('path membership: an entity offers, an administrator places (D-134)', () => {
      /**
       * Five published paths of this suite's own.
       *
       * The seed publishes two — the two with an authored placement bank — and
       * only published paths are offered to an entity, so the cap of three
       * cannot be exercised against the catalogue as it ships. Created directly
       * rather than through the publish gate: the gate is `admin-paths`' subject,
       * and what is needed here is simply enough attachable paths to have a
       * fourth.
       */
      const extraPathIds: string[] = [];

      beforeAll(async () => {
        for (let index = 0; index < 5; index += 1) {
          const created = await prisma.path.create({
            data: {
              key: `life-cap-${RUN_ID}-${index}`,
              name: `مسار سعة ${index + 1}`,
              description: 'مسار أُنشئ لاختبار حد العضويات.',
              displayOrder: 800 + index,
              status: 'PUBLISHED',
            },
            select: { id: true },
          });
          extraPathIds.push(created.id);
        }
      }, 60_000);

      afterAll(async () => {
        await prisma.pathCourse.deleteMany({ where: { pathId: { in: extraPathIds } } });
        await prisma.path.deleteMany({ where: { id: { in: extraPathIds } } });
      });

      /** Every published path, in display order — this suite's own first. */
      async function publishedPaths(): Promise<string[]> {
        const rows = await prisma.path.findMany({
          where: { status: 'PUBLISHED' },
          select: { id: true },
          orderBy: { displayOrder: 'asc' },
        });
        const own = rows.filter((row) => extraPathIds.includes(row.id)).map((row) => row.id);
        const rest = rows.filter((row) => !extraPathIds.includes(row.id)).map((row) => row.id);
        return [...own, ...rest];
      }

      /* Criterion 1 — an entity's membership lands unassigned, always. */
      it('lands every membership unassigned, reaching no learner until placed', async () => {
        const course = await createCourse();
        const ids = (await publishedPaths()).slice(0, 2);

        const updated = (
          await patch(`/api/entity/courses/${course.id}`, { pathIds: ids }, session).expect(200)
        ).body as {
          paths: Array<{ placement: string; level: unknown }>;
          pathRules: { frozen: boolean; maxPaths: number };
        };

        expect(updated.paths).toHaveLength(ids.length);
        expect(updated.paths.every((row) => row.placement === 'UNASSIGNED')).toBe(true);
        expect(updated.paths.every((row) => row.level === null)).toBe(true);
        expect(updated.pathRules).toMatchObject({ frozen: false, maxPaths: 3 });

        /* And the database agrees: both halves of the placement are null, which
           is what the CHECK constraint permits and the learner queries skip. */
        const rows = await prisma.pathCourse.findMany({
          where: { courseId: course.id },
          select: { levelId: true, position: true, placedAt: true },
        });
        expect(rows).toHaveLength(ids.length);
        expect(rows.every((row) => row.levelId === null && row.position === null)).toBe(true);
        expect(rows.every((row) => row.placedAt === null)).toBe(true);
      });

      /* Criterion 2 — an entity may not choose a level or a position. */
      it('refuses a levelId outright, with 422 and no membership written', async () => {
        const course = await createCourse();
        const ids = (await publishedPaths()).slice(0, 1);

        const refused = await patch(
          `/api/entity/courses/${course.id}`,
          { pathIds: ids, levelId },
          session,
        ).expect(400);

        expect(refused.body).toBeDefined();
        expect(await prisma.pathCourse.count({ where: { courseId: course.id } })).toBe(0);
      });

      it('refuses a position on a membership just as firmly', async () => {
        const course = await createCourse();
        const ids = (await publishedPaths()).slice(0, 1);

        await patch(
          `/api/entity/courses/${course.id}`,
          { pathIds: ids, position: 1 },
          session,
        ).expect(400);

        expect(await prisma.pathCourse.count({ where: { courseId: course.id } })).toBe(0);
      });

      /* Criterion 3 — an entity may withdraw only while nobody has placed it. */
      it('lets the entity withdraw a membership nobody has placed', async () => {
        const course = await createCourse();
        const ids = (await publishedPaths()).slice(0, 2);
        await patch(`/api/entity/courses/${course.id}`, { pathIds: ids }, session).expect(200);

        const trimmed = (
          await patch(
            `/api/entity/courses/${course.id}`,
            { pathIds: ids.slice(0, 1) },
            session,
          ).expect(200)
        ).body as { paths: unknown[] };

        expect(trimmed.paths).toHaveLength(1);
      });

      it('refuses to withdraw a membership the administrator has placed', async () => {
        /* Removing it would pull a course out from under the learners standing
           on that rung — the same reason `path_courses` is Restrict beneath. */
        const course = await createCourse();
        await patch(`/api/entity/courses/${course.id}`, { pathIds: [pathId] }, session).expect(200);

        const membership = await prisma.pathCourse.findFirstOrThrow({
          where: { courseId: course.id, pathId },
          select: { id: true, level: { select: { id: true } } },
        });
        const rung = await prisma.level.findFirstOrThrow({
          where: { pathId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        const taken = await prisma.pathCourse.aggregate({
          where: { levelId: rung.id },
          _max: { position: true },
        });
        await prisma.pathCourse.update({
          where: { id: membership.id },
          data: {
            levelId: rung.id,
            position: (taken._max.position ?? 0) + 1,
            placedAt: new Date(),
          },
        });

        const refused = await patch(
          `/api/entity/courses/${course.id}`,
          { pathIds: [] },
          session,
        ).expect(400);
        expect(refused.body).toMatchObject({ message: 'MEMBERSHIP_ALREADY_PLACED' });

        /* Nothing was written: the whole update is refused, not half applied. */
        expect(await prisma.pathCourse.count({ where: { courseId: course.id } })).toBe(1);
      });

      it('refuses a fourth path', async () => {
        const course = await createCourse();
        const ids = (await publishedPaths()).slice(0, 4);

        const response = await patch(
          `/api/entity/courses/${course.id}`,
          { pathIds: ids },
          session,
        ).expect(400);
        expect(response.body).toMatchObject({ message: 'PATH_LIMIT_EXCEEDED' });
      });

      it('lets a grandfathered course remove memberships but not add', async () => {
        const course = await createCourse();
        const all = await publishedPaths();
        const over = all.slice(0, 4);
        /* Planted directly: rows from before the cap existed. */
        await prisma.pathCourse.createMany({
          data: over.map((id) => ({ pathId: id, courseId: course.id })),
        });

        const detail = (await get(`/api/entity/courses/${course.id}`, session).expect(200))
          .body as {
          pathRules: { frozen: boolean };
        };
        expect(detail.pathRules.frozen).toBe(true);

        const fresh = all.find((id) => !over.includes(id))!;
        const refused = await patch(
          `/api/entity/courses/${course.id}`,
          { pathIds: [...over.slice(0, 2), fresh] },
          session,
        ).expect(400);
        expect(refused.body).toMatchObject({ message: 'PATH_MEMBERSHIP_FROZEN' });

        const trimmed = (
          await patch(
            `/api/entity/courses/${course.id}`,
            { pathIds: over.slice(0, 2) },
            session,
          ).expect(200)
        ).body as { paths: unknown[]; pathRules: { frozen: boolean } };
        expect(trimmed.paths).toHaveLength(2);
        expect(trimmed.pathRules.frozen).toBe(false);
      });
    });

    it('refuses a riasecLetter field outright, since no such thing exists', async () => {
      /* The instrument that produced letters is retired (D-134); an unknown
         field is refused rather than ignored, so a stale client learns. */
      const course = await createCourse();

      await patch(`/api/entity/courses/${course.id}`, { riasecLetter: 'S' }, session).expect(400);
    });

    it('refuses an unknown path rather than silently dropping it', async () => {
      /* Dropping it would leave the entity believing the course is in a path it
         is not, and the publish gate would then pass or fail invisibly. */
      const course = await createCourse();

      await patch(
        `/api/entity/courses/${course.id}`,
        { pathIds: ['00000000-0000-4000-8000-000000000000'] },
        session,
      ).expect(404);
    });

    it('cannot be edited by another entity', async () => {
      const course = await createCourse();

      await patch(`/api/entity/courses/${course.id}`, { durationMinutes: 30 }, otherSession).expect(
        404,
      );
    });

    it('audits which fields changed but never their values', async () => {
      /* An audit log is not a copy of the data (§6 PII discipline). */
      const course = await createCourse();

      await patch(
        `/api/entity/courses/${course.id}`,
        { prerequisites: 'نص لا ينبغي أن يظهر في السجل' },
        session,
      ).expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_METADATA_UPDATED', targetId: course.id },
        select: { metadata: true },
      });

      expect(JSON.stringify(entry?.metadata)).toContain('prerequisites');
      expect(JSON.stringify(entry?.metadata)).not.toContain('لا ينبغي');
    });
  });

  describe('the publish gate (§4B.3, D-061)', () => {
    it('refuses a bare shell and says everything that is wrong at once', async () => {
      /* One problem per click would make an entity fix, click, fix, click. */
      const course = await createCourse();

      const response = await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(
        409,
      );

      const body = response.body as { message: string; blockers: string[] };

      /* `message` stays the error code, as everywhere else in this API, so the
         Arabic copy lookup keeps working; the list rides alongside it. */
      expect(body.message).toBe('COURSE_NOT_PUBLISHABLE');
      expect(body.blockers).toEqual(
        expect.arrayContaining(['NO_PATH', 'NO_LANGUAGE', 'NO_OBJECTIVES', 'NO_DURATION']),
      );
    });

    it('refuses a course the LMS says has no completion criteria', async () => {
      /*
       * The D-042 dead end, refused before anyone enrols. Such a course reports
       * `completed: false` forever, so nobody on it could ever pass and no
       * certificate could ever be issued — with nothing in any log to say why.
       */
      const course = await createCourse();

      lms.simulateAuthoring(course.moodleCourseId, {
        activityCount: 3,
        hasQuiz: true,
        completionConfigured: false,
      });

      await patch(
        `/api/entity/courses/${course.id}`,
        { pathIds: [pathId], durationMinutes: 60, objectives: ['هدف'], language: 'AR' },
        session,
      ).expect(200);

      const response = await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(
        409,
      );

      expect((response.body as { blockers: string[] }).blockers).toContain(
        'NO_COMPLETION_CRITERIA',
      );
    });

    it('surfaces the blockers on the manage screen before publish is attempted', async () => {
      const course = await createCourse();

      expect(course.publishBlockers).toContain('NO_PATH');
    });

    it('publishes a course that is fit, and audits it', async () => {
      const course = await makePublishable(await createCourse());

      expect(course.publishBlockers).toEqual([]);

      const published = (
        await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200)
      ).body as EntityCourseDetail;

      expect(published).toMatchObject({ publication: 'PUBLISHED', status: 'AVAILABLE' });

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_PUBLISHED', targetId: course.id, outcome: 'SUCCESS' },
      });

      expect(entry).not.toBeNull();
    });

    it('audits a refusal with its blockers', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(409);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_PUBLISHED', targetId: course.id, outcome: 'FAILURE' },
        select: { metadata: true },
      });

      expect(JSON.stringify(entry?.metadata)).toContain('NO_PATH');
    });

    it('cannot be published by another entity', async () => {
      const course = await makePublishable(await createCourse());

      await post(`/api/entity/courses/${course.id}/publish`, {}, otherSession).expect(404);
    });

    /* `published_at` answers "published since when", so it is set at the first
       publish and never moved afterwards. Nothing renders it yet — §4C.5's
       oversight will — which is exactly why it is asserted here: a column that
       is silently wrong until the screen that reads it is built is a defect
       delivered with a delay. */
    it('dates the first publish, and keeps that date through a withdrawal', async () => {
      const course = await makePublishable(await createCourse());

      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const first = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { publishedAt: true },
      });

      expect(first.publishedAt).not.toBeNull();

      await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200);
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const again = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { publishedAt: true },
      });

      expect(again.publishedAt).toEqual(first.publishedAt);
    });

    /* The endpoint does not refuse a withdrawal of something never published,
       and the manage screen offers no such button — but the state is reachable,
       and a course that reaches PUBLISHED with no date is published with nothing
       saying since when. Asking `publishedAt is null` rather than
       `publication === 'DRAFT'` is what keeps the two questions apart. */
    it('still dates a publish that follows a withdrawal made while it was a draft', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200);

      const withdrawn = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { publication: true, publishedAt: true },
      });

      expect(withdrawn).toMatchObject({ publication: 'UNPUBLISHED', publishedAt: null });

      await makePublishable(course);
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const published = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { publication: true, status: true, publishedAt: true },
      });

      expect(published).toMatchObject({ publication: 'PUBLISHED', status: 'AVAILABLE' });
      expect(published.publishedAt).not.toBeNull();
    });
  });

  describe('publishing bridges to the learner catalogue (§4A)', () => {
    it('makes the course appear for a learner, and not before', async () => {
      /*
       * The §4A bridge, asserted end to end: what an entity publishes is exactly
       * what a learner sees. A draft must be absent from that catalogue, or the
       * DRAFT state would be decorative.
       */
      const course = await makePublishable(await createCourse());

      const before = (await get('/api/courses', employeeSession).expect(200))
        .body as CourseSummary[];
      expect(before.map((entry) => entry.id)).not.toContain(course.id);

      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const after = (await get('/api/courses', employeeSession).expect(200))
        .body as CourseSummary[];
      expect(after.map((entry) => entry.id)).toContain(course.id);
    });

    it('carries the authored language through to the learner catalogue (D-047)', async () => {
      const course = await createCourse({ language: 'EN' });
      lms.simulateAuthoring(course.moodleCourseId);

      /* The authored language is the point of this test, so the metadata is set
         here rather than through `makePublishable`, which writes Arabic. */
      await patch(
        `/api/entity/courses/${course.id}`,
        { pathIds: [pathId], durationMinutes: 60, objectives: ['Objective'] },
        session,
      ).expect(200);
      await place(course.id);
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const listed = (
        (await get('/api/courses', employeeSession).expect(200)).body as CourseSummary[]
      ).find((entry) => entry.id === course.id);

      expect(listed?.language).toBe('EN');
    });
  });

  describe('unpublishing under course-edit protection (§2, D-015, D-059)', () => {
    it('withdraws a course nobody holds', async () => {
      const course = await makePublishable(await createCourse());
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const result = (
        await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200)
      ).body as EntityUnpublishResult;

      expect(result).toMatchObject({
        publication: 'UNPUBLISHED',
        status: 'RETIRED',
        learnersHolding: 0,
      });
    });

    it('keeps it completable for a learner who already holds it, and says so', async () => {
      /*
       * §2/D-015's course-edit protection, and the honesty D-059 requires with
       * it: an entity told nothing would believe they had withdrawn a course
       * learners can still take.
       */
      const course = await makePublishable(await createCourse());
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);

      const learner = await prisma.user.findFirstOrThrow({
        where: { email: `life-${RUN_ID}-learner@ministry.gov.example` },
        select: { id: true },
      });

      const userPath = await prisma.userPath.upsert({
        where: { userId_pathId: { userId: learner.id, pathId } },
        create: { userId: learner.id, pathId, status: 'ACTIVE' },
        update: {},
        select: { id: true },
      });

      /* Holding is an enrolment now, not a chosen row: nobody builds a path, so
         what makes a course undeletable is that somebody was put into it in the
         LMS (D-036/D-134). */
      await prisma.enrollment.create({
        data: { userId: learner.id, courseId: course.id, enrolledAt: new Date() },
      });

      const result = (
        await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200)
      ).body as EntityUnpublishResult;

      expect(result).toMatchObject({ status: 'HIDDEN_BUT_COMPLETABLE', learnersHolding: 1 });

      await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
      await prisma.userPath.delete({ where: { id: userPath.id } });
    });

    it('offers no way to delete a course at all', async () => {
      const course = await createCourse();

      await request(server())
        .delete(`/api/entity/courses/${course.id}`)
        .set('Cookie', [csrfCookie, session].join('; '))
        .set('X-CSRF-Token', csrfToken)
        .expect(404);
    });

    it('survives a catalogue sync — the LMS cannot override the decision', async () => {
      /*
       * The defect D-059 exists to fix, proven against a real database rather
       * than only in the mapping unit tests. Before the split, sync recomputed
       * `status` from the LMS's `visible` flag and would have flipped this
       * course back to AVAILABLE on its next run.
       */
      const course = await makePublishable(await createCourse());
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);
      await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200);

      const sync = app.get(
        (await import('../src/catalog-sync/catalog-sync.service')).CatalogSyncService,
      );
      await sync.sync();

      const row = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { publication: true, status: true },
      });

      expect(row).toMatchObject({ publication: 'UNPUBLISHED', status: 'RETIRED' });
    });
  });

  describe('authoring in Moodle (§4B.4, D-060)', () => {
    it('mints a handoff URL per click', async () => {
      const course = await createCourse();

      const first = (
        await post(`/api/entity/courses/${course.id}/author-launch`, {}, session).expect(200)
      ).body as { url: string };
      const second = (
        await post(`/api/entity/courses/${course.id}/author-launch`, {}, session).expect(200)
      ).body as { url: string };

      /* Single-use by design, so returning the same URL twice would hand back an
         already-spent token (D-045). */
      expect(first.url).not.toBe(second.url);
    });

    it('frames on request, and says which it minted (TAM-129)', async () => {
      const course = await createCourse();

      const framed = (
        await post(
          `/api/entity/courses/${course.id}/author-launch`,
          { embed: true },
          session,
        ).expect(200)
      ).body as { url: string; mode: string };
      const plain = (
        await post(`/api/entity/courses/${course.id}/author-launch`, {}, session).expect(200)
      ).body as { url: string; mode: string };

      expect(framed.mode).toBe('embed');
      expect(framed.url).toMatch(/[?&]embed=author(&|$)/);
      expect(plain.mode).toBe('handoff');
      expect(plain.url).not.toMatch(/embed=/);
    });

    it('rejects a malformed embed flag rather than guessing', async () => {
      const course = await createCourse();

      await post(
        `/api/entity/courses/${course.id}/author-launch`,
        { embed: 'yes' },
        session,
      ).expect(400);
    });

    it('refuses another entity a handoff into a course it does not own', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/author-launch`, {}, otherSession).expect(404);
    });

    it('audits the launch, because it signs someone in somewhere else', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/author-launch`, {}, session).expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_AUTHOR_LAUNCHED', targetId: course.id },
        select: { outcome: true },
      });

      expect(entry).toMatchObject({ outcome: 'SUCCESS' });
    });

    it('reports what Moodle holds, including a missing completion criterion', async () => {
      const course = await createCourse();

      const empty = (await get(`/api/entity/courses/${course.id}/content`, session).expect(200))
        .body as { completionConfigured: boolean; activityCount: number };

      expect(empty).toMatchObject({ activityCount: 0, completionConfigured: false });

      lms.simulateAuthoring(course.moodleCourseId, {
        activityCount: 5,
        hasQuiz: true,
        completionConfigured: true,
      });

      const authored = (await get(`/api/entity/courses/${course.id}/content`, session).expect(200))
        .body as { completionConfigured: boolean; hasQuiz: boolean };

      expect(authored).toMatchObject({ hasQuiz: true, completionConfigured: true });
    });
  });

  describe('resyncing after a live edit (§4B.4, TAM-133)', () => {
    it('picks up a rename made in the frame immediately, not on the next schedule', async () => {
      const course = await createCourse({ title: 'العنوان القديم' });

      lms.simulateSettingsEdit(course.moodleCourseId, { title: 'العنوان الجديد' });

      const resynced = (
        await post(`/api/entity/courses/${course.id}/resync`, {}, session).expect(200)
      ).body as EntityCourseDetail;

      expect(resynced.title).toBe('العنوان الجديد');

      const row = await prisma.course.findUniqueOrThrow({
        where: { id: course.id },
        select: { title: true },
      });
      expect(row.title).toBe('العنوان الجديد');
    });

    it('refreshes the content read-back and the publish blockers in the same response', async () => {
      const course = await makePublishable(await createCourse());
      expect(course.publishBlockers).toEqual([]);

      /* Simulate the entity removing the quiz's completion criteria from
         inside Moodle, then asking this portal to catch up. */
      lms.simulateAuthoring(course.moodleCourseId, {
        activityCount: 3,
        hasQuiz: true,
        completionConfigured: false,
      });

      const resynced = (
        await post(`/api/entity/courses/${course.id}/resync`, {}, session).expect(200)
      ).body as EntityCourseDetail;

      expect(resynced.content).toMatchObject({ completionConfigured: false });
      expect(resynced.publishBlockers).toContain('NO_COMPLETION_CRITERIA');
    });

    it('is refused for another entity’s course, the same as every scoped route', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/resync`, {}, otherSession).expect(404);
    });

    it('the response equals a subsequent GET', async () => {
      const course = await createCourse();

      const resynced = (
        await post(`/api/entity/courses/${course.id}/resync`, {}, session).expect(200)
      ).body as EntityCourseDetail;
      const fetched = (await get(`/api/entity/courses/${course.id}`, session).expect(200))
        .body as EntityCourseDetail;

      expect(resynced).toEqual(fetched);
    });

    it('audits the resync', async () => {
      const course = await createCourse();

      await post(`/api/entity/courses/${course.id}/resync`, {}, session).expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_COURSE_RESYNCED', targetId: course.id },
        select: { outcome: true, metadata: true },
      });

      expect(entry).toMatchObject({ outcome: 'SUCCESS' });
      /* No PII — a course id and a resync outcome are all this is. */
      expect(JSON.stringify(entry)).not.toContain('@ministry.gov.example');
    });

    it('two concurrent resyncs of the same course still leave it correct', async () => {
      /* The unit suite proves the LMS is read once; this proves the outcome a
         caller actually sees is unaffected by the coalescing underneath it. */
      const course = await createCourse({ title: 'دورة متزامنة' });
      lms.simulateSettingsEdit(course.moodleCourseId, { title: 'بعد التزامن' });

      const [first, second] = await Promise.all([
        post(`/api/entity/courses/${course.id}/resync`, {}, session),
        post(`/api/entity/courses/${course.id}/resync`, {}, session),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((first.body as EntityCourseDetail).title).toBe('بعد التزامن');
      expect((second.body as EntityCourseDetail).title).toBe('بعد التزامن');
    });
  });

  describe('learners and review (§4B.5, D-064)', () => {
    let reviewCourseId: string;
    let learnerId: string;
    let userPathId: string;

    beforeAll(async () => {
      const course = await makePublishable(await createCourse());
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);
      reviewCourseId = course.id;

      const learner = await prisma.user.findFirstOrThrow({
        where: { email: `life-${RUN_ID}-learner@ministry.gov.example` },
        select: { id: true },
      });
      learnerId = learner.id;

      const userPath = await prisma.userPath.upsert({
        where: { userId_pathId: { userId: learnerId, pathId } },
        create: { userId: learnerId, pathId, status: 'ACTIVE' },
        update: { status: 'ACTIVE' },
        select: { id: true },
      });
      userPathId = userPath.id;

      /* Progress lives only in `completions`, keyed on `(user, course)`; the
         enrolment is the fact that the learner was put into the course. */
      await prisma.enrollment.create({
        data: { userId: learnerId, courseId: reviewCourseId, enrolledAt: new Date() },
      });

      await prisma.completion.create({
        data: {
          userId: learnerId,
          moodleCourseId: course.moodleCourseId,
          completed: true,
          gradePercent: 88,
          passed: true,
          passThresholdUsed: 70,
          syncedAt: new Date(),
        },
      });
    }, 60_000);

    afterAll(async () => {
      await prisma.completion.deleteMany({ where: { userId: learnerId } });
      await prisma.enrollment.deleteMany({ where: { userId: learnerId } });
      await prisma.userPath.deleteMany({ where: { id: userPathId } });
    });

    it('lists the learner with their progress', async () => {
      const rows = (await get('/api/entity/learners', session).expect(200))
        .body as EntityLearnerRow[];
      const row = rows.find((entry) => entry.courseId === reviewCourseId);

      expect(row).toMatchObject({ gradePercent: 88, passed: true, status: 'COMPLETED' });
    });

    it('exposes no email and no employee ID (D-064)', async () => {
      /*
       * The two identifiers that would make a leaked export directly actionable
       * elsewhere in the ministry, and neither helps a reviewer — name and
       * department already identify a colleague. Asserted on the serialised
       * response so a later `select: { user: true }` cannot widen it quietly.
       */
      const response = await get('/api/entity/learners', session).expect(200);
      const raw = JSON.stringify(response.body);

      expect(raw).not.toContain('@ministry.gov.example');
      expect(raw).not.toContain('employeeId');
      expect(raw).not.toContain(`L-${RUN_ID}-learner`);
    });

    it('exposes no Holland code, path or certificates', async () => {
      const raw = JSON.stringify((await get('/api/entity/learners', session).expect(200)).body);

      for (const forbidden of ['hollandCode', 'riasec', 'pathName', 'certificates']) {
        expect(raw).not.toContain(forbidden);
      }
    });

    it('shows another entity none of these learners', async () => {
      const rows = (await get('/api/entity/learners', otherSession).expect(200))
        .body as EntityLearnerRow[];

      expect(rows.map((entry) => entry.courseId)).not.toContain(reviewCourseId);
    });

    it('yields nothing when another entity names this course explicitly', async () => {
      /* The filter is applied to the query, so naming a course you do not own
         returns nothing rather than its learners. */
      const rows = (
        await get(`/api/entity/learners?courseId=${reviewCourseId}`, otherSession).expect(200)
      ).body as EntityLearnerRow[];

      expect(rows).toEqual([]);
    });

    it('re-derives progress from completions rather than from the LMS’s own verdict', async () => {
      /*
       * A course can be finished in the LMS's sense and still not passed — the
       * defect D-054 corrected in the path certificate. Progress is derived
       * from `completions.passed` against the product threshold (D-007), so a
       * learner who failed the quiz still owes the course: «قيد التنفيذ», never
       * «مكتملة». Calling them complete would be worse than showing nothing.
       */
      await prisma.completion.updateMany({
        where: { userId: learnerId },
        data: { passed: false, gradePercent: 45 },
      });

      const rows = (await get('/api/entity/learners', session).expect(200))
        .body as EntityLearnerRow[];
      const row = rows.find((entry) => entry.courseId === reviewCourseId);

      expect(row?.status).toBe('IN_PROGRESS');
      expect(row?.passed).toBe(false);
      expect(row?.gradePercent).toBe(45);

      await prisma.completion.updateMany({
        where: { userId: learnerId },
        data: { passed: true, gradePercent: 88 },
      });
    });
  });

  describe('the dashboard (§4B.1)', () => {
    it('counts this entity’s courses by publication state', async () => {
      const dashboard = (await get('/api/entity/dashboard', session).expect(200))
        .body as EntityDashboardView;

      expect(dashboard.entityName).toBe('جهة الدورات');
      expect(dashboard.publishedCourses).toBeGreaterThan(0);
      expect(dashboard.draftCourses).toBeGreaterThan(0);
    });

    it('lists drafts that cannot be published, with their reasons', async () => {
      /* The one genuinely actionable thing on the page — §3 forbids a screen of
         counts nobody can act on. */
      const course = await createCourse();

      const dashboard = (await get('/api/entity/dashboard', session).expect(200))
        .body as EntityDashboardView;

      const pending = dashboard.needsAttention.find((entry) => entry.id === course.id);

      expect(pending?.blockers).toContain('NO_PATH');
    });

    it('does not nag about a course the entity withdrew deliberately', async () => {
      /* §2 rules out engagement nagging: an UNPUBLISHED course is a decision,
         not an oversight. */
      const course = await makePublishable(await createCourse());
      await post(`/api/entity/courses/${course.id}/publish`, {}, session).expect(200);
      await post(`/api/entity/courses/${course.id}/unpublish`, {}, session).expect(200);

      const dashboard = (await get('/api/entity/dashboard', session).expect(200))
        .body as EntityDashboardView;

      expect(dashboard.needsAttention.map((entry) => entry.id)).not.toContain(course.id);
    });

    it('shows another entity its own empty dashboard, not this one', async () => {
      const dashboard = (await get('/api/entity/dashboard', otherSession).expect(200))
        .body as EntityDashboardView;

      expect(dashboard.entityName).toBe('جهة أخرى');
      expect(dashboard.publishedCourses).toBe(0);
      expect(dashboard.totalLearners).toBe(0);
    });
  });
});

/**
 * Resync rate limiting (§4B.4, TAM-133), with the real ThrottlerGuard in
 * place. Separate app instance so its counters are not shared with the
 * lifecycle suite above — the same reasoning as `Auth rate limiting (e2e)`
 * in auth.e2e-spec.ts.
 */
describe('Entity course resync rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const RATE_RUN_ID = randomBytes(4).toString('hex');
  let csrfCookie: string;
  let csrfToken: string;
  let session: string;
  let courseId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';

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

    const server = app.getHttpServer() as unknown as App;
    const csrfResponse = await request(server).get('/api/auth/csrf').expect(200);
    csrfCookie = (csrfResponse.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    csrfToken = (csrfResponse.body as { csrfToken: string }).csrfToken;

    const entity = await prisma.entity.create({
      data: { key: `rate-${RATE_RUN_ID}`, name: 'جهة الحد' },
      select: { id: true },
    });

    const email = `rate-${RATE_RUN_ID}@ministry.gov.example`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'مسؤول الجهة',
        employeeId: `R-${RATE_RUN_ID}`.slice(0, 20),
        department: 'قسم',
        role: 'ENTITY',
        entityId: entity.id,
        emailVerifiedAt: new Date(),
      },
    });

    const loginResponse = await request(server)
      .post('/api/auth/login')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: PASSWORD })
      .expect(200);
    session = (loginResponse.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('tamkeen_session='))!
      .split(';')[0]!;

    const courseResponse = await request(server)
      .post('/api/entity/courses')
      .set('Cookie', [csrfCookie, session].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'دورة الحد', summary: 'وصف' })
      .expect(201);
    courseId = (courseResponse.body as EntityCourseDetail).id;
  }, 120_000);

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: {
          in: (
            await prisma.user.findMany({
              where: { email: { startsWith: `rate-${RATE_RUN_ID}` } },
              select: { id: true },
            })
          ).map((user) => user.id),
        },
      },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: `rate-${RATE_RUN_ID}` } } });
    await prisma.entity.deleteMany({ where: { key: `rate-${RATE_RUN_ID}` } });

    await app.close();
  }, 60_000);

  it('returns 429 once the per-user resync limit is exceeded', async () => {
    const server = app.getHttpServer() as unknown as App;

    const attempt = () =>
      request(server)
        .post(`/api/entity/courses/${courseId}/resync`)
        .set('Cookie', [csrfCookie, session].join('; '))
        .set('X-CSRF-Token', csrfToken)
        .send({});

    const statuses: number[] = [];
    /* The resync limit is 30 per minute; the 31st must be refused outright. */
    for (let index = 0; index < 32; index += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toContain(429);
  }, 120_000);
});
