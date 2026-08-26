import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { EntityCourseSummary, EntityProfileView } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The portal boundaries, over real HTTP against a real database (§2B, D-062).
 *
 * **This is the suite that would catch scoping enforced only in the browser.**
 * Every assertion below speaks HTTP, so a filter that lives in a React component
 * — or in a controller that forgot to apply it — fails here rather than in
 * production. Two things are proven: that a role cannot reach another portal's
 * endpoints at all, and that an entity which *can* reach an endpoint sees only
 * its own organisation's rows through it.
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

describe('Entity portal scoping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  let entityAId: string;
  let entityBId: string;
  let courseAId: string;
  let courseBId: string;
  let courseUnownedId: string;

  let sessionEntityA: string;
  let sessionEntityB: string;
  let sessionEmployee: string;
  let sessionAdmin: string;
  let sessionOrphanEntity: string;

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

    const issued = await csrf();
    csrfCookie = issued.cookie;
    csrfToken = issued.token;

    const entityA = await prisma.entity.create({
      data: { key: `scope-a-${RUN_ID}`, name: 'جهة أ', contactEmail: 'a@authority.example' },
      select: { id: true },
    });
    const entityB = await prisma.entity.create({
      data: { key: `scope-b-${RUN_ID}`, name: 'جهة ب', contactEmail: 'b@authority.example' },
      select: { id: true },
    });

    entityAId = entityA.id;
    entityBId = entityB.id;

    /*
     * Three courses, and the third is the important one. An entity owning
     * everything in the database would make a scoping bug invisible — every
     * assertion would pass because there is nothing that should have been
     * excluded. `courseUnowned` is what proves the filter is an equality on the
     * caller's own id rather than "anything with an owner".
     */
    courseAId = await createCourse(910_001, entityA.id, 'دورة الجهة أ');
    courseBId = await createCourse(910_002, entityB.id, 'دورة الجهة ب');
    courseUnownedId = await createCourse(910_003, null, 'دورة بلا مالك');

    sessionEntityA = await entityAccount('ent-a', entityA.id);
    sessionEntityB = await entityAccount('ent-b', entityB.id);
    sessionOrphanEntity = await entityAccount('ent-orphan', null);
    sessionAdmin = await privilegedAccount('admin', 'SUPER_ADMIN');
    sessionEmployee = await employeeAccount('emp');
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `scope-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.course.deleteMany({
      where: { id: { in: [courseAId, courseBId, courseUnownedId] } },
    });
    await prisma.entity.deleteMany({ where: { id: { in: [entityAId, entityBId] } } });

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

  function patch(path: string, body: Record<string, unknown>, session: string) {
    return request(server())
      .patch(path)
      .set('Cookie', [csrfCookie, session].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  async function createCourse(
    moodleCourseId: number,
    ownerEntityId: string | null,
    title: string,
  ): Promise<string> {
    const course = await prisma.course.create({
      data: {
        moodleCourseId,
        title,
        summary: 'وصف',
        ownerEntityId,
        publication: 'PUBLISHED',
        status: 'AVAILABLE',
        language: 'AR',
        objectives: [],
      },
      select: { id: true },
    });

    return course.id;
  }

  /** Signs in an account created directly, the way Phase 5's admin portal will. */
  async function signIn(email: string): Promise<string> {
    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function privilegedAccount(
    label: string,
    role: 'ENTITY' | 'SUPER_ADMIN',
    entityId: string | null = null,
  ): Promise<string> {
    const email = `scope-${RUN_ID}-${label}@ministry.gov.example`;

    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `S-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role,
        entityId,
        emailVerifiedAt: new Date(),
      },
    });

    return signIn(email);
  }

  const entityAccount = (label: string, entityId: string | null) =>
    privilegedAccount(label, 'ENTITY', entityId);

  /** Registers through the real self-registration flow, which yields EMPLOYEE. */
  async function employeeAccount(label: string): Promise<string> {
    const email = `scope-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: `S-${RUN_ID}-${label}`.slice(0, 20),
      department: 'تقنية المعلومات',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    return signIn(email);
  }

  describe('an entity cannot read another entity’s courses', () => {
    it('lists only its own', async () => {
      const response = await get('/api/entity/courses', sessionEntityA).expect(200);
      const courses = response.body as EntityCourseSummary[];
      const ids = courses.map((course) => course.id);

      expect(ids).toContain(courseAId);
      expect(ids).not.toContain(courseBId);
    });

    it('does not see courses nobody owns', async () => {
      /*
       * The filter is an equality on the caller's own id, not "anything with an
       * owner" and not "mine or unclaimed". The 40-odd seeded courses no entity
       * authored belong to no entity, and a tempting `{ ownerEntityId: { not:
       * null } }` would have shown one organisation another's catalogue.
       */
      const response = await get('/api/entity/courses', sessionEntityA).expect(200);
      const ids = (response.body as EntityCourseSummary[]).map((course) => course.id);

      expect(ids).not.toContain(courseUnownedId);
    });

    it('sees the mirror image from the other side', async () => {
      /* Asserted from B as well as A: a filter that accidentally hardcoded one
         entity would pass every test written from a single perspective. */
      const response = await get('/api/entity/courses', sessionEntityB).expect(200);
      const ids = (response.body as EntityCourseSummary[]).map((course) => course.id);

      expect(ids).toContain(courseBId);
      expect(ids).not.toContain(courseAId);
    });

    it('cannot widen the query to reach another entity', async () => {
      /* The DTO is whitelisted with forbidNonWhitelisted, so smuggling a filter
         through the query string is rejected outright rather than ignored. */
      await get(`/api/entity/courses?ownerEntityId=${entityBId}`, sessionEntityA).expect(400);
    });

    it('sees its own organisation on the profile endpoint, never another’s', async () => {
      const a = (await get('/api/entity/me', sessionEntityA).expect(200)).body as EntityProfileView;
      const b = (await get('/api/entity/me', sessionEntityB).expect(200)).body as EntityProfileView;

      expect(a.id).toBe(entityAId);
      expect(b.id).toBe(entityBId);
    });
  });

  describe('an entity account with no organisation', () => {
    it('is refused rather than left unscoped', async () => {
      /*
       * The dangerous failure is the quiet one: if a missing scope resolved to
       * "no filter", this half-provisioned account would see every entity's
       * courses, and no happy-path test would notice.
       */
      await get('/api/entity/courses', sessionOrphanEntity).expect(403);
    });
  });

  describe('the entity profile (§4B.6)', () => {
    const body = {
      fullName: 'مسؤولة الجهة أ',
      contactName: 'مكتب التدريب',
      contactEmail: 'training@authority.example',
    };

    it('saves the account name and the organisation contact together, and audits which fields', async () => {
      const response = await patch('/api/entity/me', body, sessionEntityA).expect(200);

      expect(response.body).toMatchObject({
        id: entityAId,
        name: 'جهة أ',
        contactName: 'مكتب التدريب',
        contactEmail: 'training@authority.example',
      });

      const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityAId } });
      expect(entity.contactName).toBe('مكتب التدريب');
      /* The organisation's name is not this endpoint's to change (D-063). */
      expect(entity.name).toBe('جهة أ');

      const me = await get('/api/auth/me', sessionEntityA).expect(200);
      expect((me.body as { fullName: string }).fullName).toBe('مسؤولة الجهة أ');

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ENTITY_PROFILE_UPDATED', targetId: entityAId },
        orderBy: { id: 'desc' },
      });
      expect(entry?.metadata).toMatchObject({ fields: 'contactEmail,contactName,fullName' });
    });

    it('refuses the organisation name through the body', async () => {
      await patch('/api/entity/me', { ...body, name: 'جهة مزيّفة' }, sessionEntityA).expect(400);
    });

    it('refuses an empty account name and a malformed contact address', async () => {
      await patch('/api/entity/me', { ...body, fullName: '   ' }, sessionEntityA).expect(400);
      await patch(
        '/api/entity/me',
        { ...body, contactEmail: 'not-an-address' },
        sessionEntityA,
      ).expect(400);
      /* An absent contact is allowed — an organisation may not have one yet. */
      await patch(
        '/api/entity/me',
        { ...body, contactName: '', contactEmail: '' },
        sessionEntityA,
      ).expect(200);
    });

    it('cannot reach another organisation: the scope, not the body, chooses the row', async () => {
      await patch('/api/entity/me', { ...body, contactName: 'من الجهة ب' }, sessionEntityB).expect(
        200,
      );

      const a = await prisma.entity.findUniqueOrThrow({ where: { id: entityAId } });
      const b = await prisma.entity.findUniqueOrThrow({ where: { id: entityBId } });
      expect(a.contactName).not.toBe('من الجهة ب');
      expect(b.contactName).toBe('من الجهة ب');
    });

    it('is refused for an account with no organisation, rather than half-saved', async () => {
      await patch('/api/entity/me', body, sessionOrphanEntity).expect(403);
      await patch('/api/entity/me', body, sessionAdmin).expect(403);
    });
  });

  describe('role boundaries between portals', () => {
    it('refuses an employee at the entity portal', async () => {
      await get('/api/entity/courses', sessionEmployee).expect(403);
      await get('/api/entity/me', sessionEmployee).expect(403);
    });

    it('refuses an entity account at the learner endpoints', async () => {
      /*
       * The concrete gap Phase 4 closed. RolesGuard shipped in Phase 0 but no
       * endpoint declared a role, so until now an ENTITY account could take the
       * assessment, build a path and confirm it.
       */
      await get('/api/assessment', sessionEntityA).expect(403);
      await get('/api/dashboard', sessionEntityA).expect(403);
      await get('/api/my-path', sessionEntityA).expect(403);
      await get('/api/courses', sessionEntityA).expect(403);
      await get('/api/paths', sessionEntityA).expect(403);
      await get('/api/certificates', sessionEntityA).expect(403);
      await get('/api/cv', sessionEntityA).expect(403);
    });

    it('refuses an entity account the learner write paths too, not merely the reads', async () => {
      await post('/api/my-path/select', { pathId: courseAId }, sessionEntityA).expect(403);
      await post('/api/my-path/confirm', {}, sessionEntityA).expect(403);
    });

    it('does not implicitly grant a super-admin the learner portal', async () => {
      /* D-027: implicit role inheritance is how an admin acquires an employee's
         write path that nobody designed for them. §4C gives them their own. */
      await get('/api/dashboard', sessionAdmin).expect(403);
      await get('/api/assessment', sessionAdmin).expect(403);
    });

    it('admits a super-admin to the entity portal, unscoped', async () => {
      /* §4C.5's global course oversight, honoured by the scope resolver rather
         than by a parallel query Phase 5 would have to keep in step. */
      const response = await get('/api/entity/courses', sessionAdmin).expect(200);
      const ids = (response.body as EntityCourseSummary[]).map((course) => course.id);

      expect(ids).toEqual(expect.arrayContaining([courseAId, courseBId, courseUnownedId]));
    });

    it('gives a super-admin no organisation of their own', async () => {
      const response = await get('/api/entity/me', sessionAdmin).expect(200);

      expect(response.body).toEqual({});
    });
  });

  describe('the public verification route still works under class-level roles', () => {
    it('is reachable without a session', async () => {
      /*
       * A regression guard with teeth. Roles are declared at class level so a
       * handler added later inherits them — but that metadata also reaches the
       * routes that opt out of authentication. Without RolesGuard honouring
       * `@Public()`, putting `@Roles('EMPLOYEE')` on CertificatesController
       * would have taken the public certificate verification page (§2, D-016)
       * offline for the third parties it exists to serve.
       */
      await request(server()).get('/api/certificates/verify/definitely-not-a-real-id').expect(404);
    });
  });

  describe('audit', () => {
    it('records a cross-portal denial', async () => {
      await get('/api/assessment', sessionEntityB).expect(403);

      const denials = await prisma.auditLog.findMany({
        where: { action: 'AUTHZ_DENIED' },
        orderBy: { occurredAt: 'desc' },
        take: 5,
        select: { action: true, outcome: true },
      });

      expect(denials[0]).toMatchObject({ action: 'AUTHZ_DENIED', outcome: 'FAILURE' });
    });
  });
});
