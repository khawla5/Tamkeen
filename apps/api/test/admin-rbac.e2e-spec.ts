import { randomBytes } from 'node:crypto';

import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { ADMIN_CONTROLLERS } from '../src/admin/admin.controllers';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The super-admin portal is closed to everyone else (§4C, D-062, D-075).
 *
 * **The route list is reflected off the controller, not written out by hand.**
 * A hand-maintained list is a list that goes stale: the endpoint added in a
 * later sub-phase is exactly the one nobody remembers to add to the test, and it
 * would ship unproven while the suite stayed green. Reading Nest's own routing
 * metadata means every handler on `AdminController` — including ones that do not
 * exist yet — is asserted against all three unauthorised callers automatically.
 *
 * **Each denial is checked for its reason, not only its status.** A 403 for a
 * missing CSRF token and a 403 for the wrong role look identical from the
 * outside, and one of them would mean the role check never ran. Every request
 * below carries a valid CSRF token so the only thing left to refuse is the role.
 */

class EmailCapture {
  verifications = new Map<string, string>();

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.set(to, token);
    return Promise.resolve();
  }

  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
}

interface AdminRoute {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
}

const VERBS: Record<number, AdminRoute['method']> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
};

/**
 * Every route Nest will register for every admin controller.
 *
 * Driven off `ADMIN_CONTROLLERS`, the same array `AdminModule` registers, so a
 * controller added in a later sub-phase is covered the moment it is routable.
 */
function adminRoutes(): AdminRoute[] {
  return ADMIN_CONTROLLERS.flatMap((controller) => {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const prototype = controller.prototype as unknown as Record<string, unknown>;

    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    );

    return methodNames.flatMap((name) => {
      const handler = prototype[name] as object;
      const suffix = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;

      if (suffix === undefined || verb === undefined || VERBS[verb] === undefined) {
        return [];
      }

      /* Route params are filled with a well-formed uuid so that a ParseUUIDPipe
         cannot answer 400 before the guard answers 403 — though in practice
         guards run first, and a test relying on that ordering would be testing
         Nest rather than us. */
      const path = `/api/${base}/${suffix}`
        .replace(/\/+/g, '/')
        .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000')
        .replace(/\/$/, '');

      return [{ method: VERBS[verb]!, path }];
    });
  });
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

describe('Admin portal RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  let sessionEmployee: string;
  let sessionEntity: string;
  let sessionAdmin: string;
  let entityId: string;

  let csrfCookie: string;
  let csrfToken: string;

  const routes = adminRoutes();

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

    const entity = await prisma.entity.create({
      data: { key: `admin-rbac-${RUN_ID}`, name: 'جهة الاختبار' },
      select: { id: true },
    });
    entityId = entity.id;

    sessionAdmin = await privilegedAccount('admin', 'SUPER_ADMIN', null);
    sessionEntity = await privilegedAccount('entity', 'ENTITY', entity.id);
    sessionEmployee = await employeeAccount('employee');
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `arbac-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
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

  /** Issues the request with a valid CSRF token, so only the role can refuse it. */
  function call(route: AdminRoute, session?: string) {
    const cookies = [csrfCookie, ...(session ? [session] : [])].join('; ');

    /* `const agent = …; agent[verb](…)` rather than chaining off the call:
       prettier breaks the chain before the computed access, and a line starting
       with `[` reads to the parser as an index into the previous line. */
    const agent = request(server());

    return agent[route.method](route.path)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({});
  }

  async function signIn(email: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: PASSWORD })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function privilegedAccount(
    label: string,
    role: 'ENTITY' | 'SUPER_ADMIN',
    entity: string | null,
  ): Promise<string> {
    const email = `arbac-${RUN_ID}-${label}@ministry.gov.example`;

    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: numericEmployeeId(RUN_ID, label),
        department: 'قسم',
        role,
        entityId: entity,
        emailVerifiedAt: new Date(),
      },
    });

    return signIn(email);
  }

  async function employeeAccount(label: string): Promise<string> {
    const email = `arbac-${RUN_ID}-${label}@ministry.gov.example`;

    await request(server())
      .post('/api/auth/register')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        password: PASSWORD,
        fullName: 'موظف تجريبي',
        employeeId: numericEmployeeId(RUN_ID, label),
        department: 'تقنية المعلومات',
      })
      .expect(202);

    await request(server())
      .post('/api/auth/verify-email')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ token: emails.verifications.get(email) })
      .expect(200);

    return signIn(email);
  }

  it('found admin routes to test', () => {
    /* If reflection ever returns nothing — a Nest upgrade changing its metadata
       keys, say — every test below would vacuously pass over an empty list. */
    expect(routes.length).toBeGreaterThan(0);
  });

  describe.each(routes)('$method $path', (route: AdminRoute) => {
    it('refuses an employee with INSUFFICIENT_ROLE', async () => {
      const response = await call(route, sessionEmployee).expect(403);

      expect((response.body as { message: string }).message).toBe('INSUFFICIENT_ROLE');
    });

    it('refuses an entity with INSUFFICIENT_ROLE', async () => {
      /* An entity is the nearer miss of the two: it already holds a privileged
         role and reaches a portal of its own, so a guard that admitted "any
         non-employee" would pass the employee test and fail here. */
      const response = await call(route, sessionEntity).expect(403);

      expect((response.body as { message: string }).message).toBe('INSUFFICIENT_ROLE');
    });

    it('refuses an anonymous caller with 401, not 403', async () => {
      /* 401 rather than 403 matters to the browser: the learner and entity
         providers redirect to /login on a 401 and show an error on a 403, so
         getting this wrong strands a signed-out admin on a dead card (D-067). */
      await call(route).expect(401);
    });

    it('admits a super-admin', async () => {
      const response = await call(route, sessionAdmin);

      /* Not asserting 200: a later sub-phase's write endpoint may legitimately
         answer 400 or 404 for this empty body and placeholder id. What must
         never happen is the *authorisation* refusing the one role the portal
         exists for. */
      expect([401, 403]).not.toContain(response.status);
    });
  });

  it('audits a refused cross-portal read', async () => {
    await call(routes[0]!, sessionEntity).expect(403);

    const denial = await prisma.auditLog.findFirst({
      where: { action: 'AUTHZ_DENIED', outcome: 'FAILURE' },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });

    /* A signed-in account probing another portal is the signal a security review
       wants, and it is invisible unless the denial is recorded. */
    expect(denial?.metadata).toMatchObject({ reason: 'INSUFFICIENT_ROLE' });
  });
});
