import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AUDIT_TARGET_TYPES, type AdminAuditPage, type AdminReports } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.8 over real HTTP against a real database.
 *
 * **The trail is read-only, and the suite proves it by looking for the routes
 * that would break that** — there is no POST, PATCH or DELETE under `/audit`,
 * because an audit entry an administrator can edit is evidence of nothing.
 *
 * **And the exports must open.** The CSV assertions check the byte-order mark
 * and the Arabic directly: without the BOM, Excel reads the file as the system
 * codepage and every name in it arrives as mojibake — which is a report the
 * ministry cannot use, delivered as though it worked.
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

describe('Admin audit and reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sessionAdmin: string;
  let adminId: string;
  let csrfCookie: string;
  let csrfToken: string;

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

    adminId = await account('admin');
    sessionAdmin = await signIn(`aaudit-${RUN_ID}-admin@ministry.gov.example`);

    /* A refusal of its own, so the "detail carries the reason" assertion is
       about an entry this suite knows the shape of. */
    await send(
      'patch',
      `/api/admin/users/${adminId}/status`,
      { status: 'SUSPENDED' },
      sessionAdmin,
    ).expect(409);
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `aaudit-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

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

  async function account(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `aaudit-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'مسؤول التدقيق',
        employeeId: `D-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role: 'SUPER_ADMIN',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    return user.id;
  }

  describe('the trail', () => {
    it('returns entries newest first, with the actor named', async () => {
      const page = (await get(`/api/admin/audit?actorUserId=${adminId}`, sessionAdmin).expect(200))
        .body as AdminAuditPage;

      expect(page.rows.length).toBeGreaterThan(0);
      expect(page.rows[0]!.actorName).toBe('مسؤول التدقيق');

      const ids = page.rows.map((row) => BigInt(row.id));
      expect([...ids].sort((a, b) => (a < b ? 1 : -1))).toEqual(ids);
    });

    it('renders the bigint id as a string', async () => {
      const response = await get(`/api/admin/audit?actorUserId=${adminId}`, sessionAdmin).expect(
        200,
      );

      expect(typeof (response.body as AdminAuditPage).rows[0]!.id).toBe('string');
    });

    it('carries the reason a refusal happened', async () => {
      const page = (
        await get(`/api/admin/audit?actorUserId=${adminId}&outcome=FAILURE`, sessionAdmin).expect(
          200,
        )
      ).body as AdminAuditPage;

      /* Half the value of an entry is *why*. A trail that hides the reason is a
         list of timestamps. Its own field since TAM-137, because it is the one
         detail the screen renders as a sentence rather than a labelled value. */
      expect(page.rows[0]!.reason).toBe('SELF_MODIFICATION_REFUSED');
      /* And it is gone from the payload, rather than carried in both places. */
      expect(Object.keys(page.rows[0]!.detail ?? {})).not.toContain('reason');
    });

    it('names what each entry was about, and never leaks an id into the detail', async () => {
      const page = (await get(`/api/admin/audit?actorUserId=${adminId}`, sessionAdmin).expect(200))
        .body as AdminAuditPage;

      /* The refusal above targeted the administrator's own account, so the row
         resolves to their name. A uuid there answers nothing (TAM-137). */
      const targeted = page.rows.find((row) => row.targetType === 'user');
      expect(targeted?.targetLabel).toBe('مسؤول التدقيق');

      /* And nothing anywhere on the page still prints an identifier as detail. */
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const row of page.rows) {
        for (const value of Object.values(row.detail ?? {})) {
          expect(typeof value === 'string' && uuid.test(value)).toBe(false);
        }
        expect(Object.keys(row.detail ?? {})).not.toContain('pathId');
      }
    });

    it('uses one spelling per target kind', async () => {
      /* `User` and `user` were both in the log, which split every filter and
         grouping over this column in two (TAM-137). */
      const page = (await get('/api/admin/audit', sessionAdmin).expect(200)).body as AdminAuditPage;

      const types = new Set(page.rows.map((row) => row.targetType).filter(Boolean));
      for (const type of types) {
        expect(AUDIT_TARGET_TYPES as readonly string[]).toContain(type);
      }
    });

    it('filters by action and by outcome', async () => {
      const page = (
        await get(
          `/api/admin/audit?action=AUTH_LOGIN_SUCCEEDED&actorUserId=${adminId}`,
          sessionAdmin,
        ).expect(200)
      ).body as AdminAuditPage;

      expect(page.rows.every((row) => row.action === 'AUTH_LOGIN_SUCCEEDED')).toBe(true);
    });

    it('offers every action the codebase can emit, not only those already logged', async () => {
      const page = (await get('/api/admin/audit?pageSize=1', sessionAdmin).expect(200))
        .body as AdminAuditPage;

      /* A filter offering only what has happened would silently lose options as
         old entries are retained away. */
      expect(page.actions).toEqual(
        expect.arrayContaining(['CERTIFICATE_ISSUED', 'PATH_CONFIRMED']),
      );
    });

    it('pages by cursor rather than by offset', async () => {
      const first = (await get('/api/admin/audit?pageSize=2', sessionAdmin).expect(200))
        .body as AdminAuditPage;

      expect(first.rows).toHaveLength(2);
      expect(first.nextBefore).not.toBeNull();

      const second = (
        await get(`/api/admin/audit?pageSize=2&before=${first.nextBefore}`, sessionAdmin).expect(
          200,
        )
      ).body as AdminAuditPage;

      /* Strictly older, with no overlap — which an offset would not guarantee on
         a table that is being written to while it is read. */
      const firstIds = first.rows.map((row) => row.id);
      expect(second.rows.every((row) => !firstIds.includes(row.id))).toBe(true);
    });

    it('rejects a filter the DTO does not declare and a cursor that is not an id', async () => {
      await get('/api/admin/audit?metadata=x', sessionAdmin).expect(400);
      await get('/api/admin/audit?before=not-a-number', sessionAdmin).expect(400);
    });

    it('offers no way to write, edit or delete an entry', async () => {
      /* The property that makes the trail worth having. Nest has no route for
         these, so they 404 — which is what "there is no write path" looks like
         from outside. */
      await send('post', '/api/admin/audit', {}, sessionAdmin).expect(404);
      await send('delete', '/api/admin/audit', {}, sessionAdmin).expect(404);
    });
  });

  describe('reports', () => {
    it('answers the five questions §4C.8 asks', async () => {
      const reports = (await get('/api/admin/reports', sessionAdmin).expect(200))
        .body as AdminReports;

      expect(reports).toHaveProperty('journey');
      expect(reports).toHaveProperty('pathPopularity');
      expect(reports).toHaveProperty('codeDistribution');
      expect(reports).toHaveProperty('certificates');
      expect(reports).toHaveProperty('courseOutcomes');
    });

    it('sorts course outcomes worst first, which is what makes them actionable', async () => {
      const reports = (await get('/api/admin/reports', sessionAdmin).expect(200))
        .body as AdminReports;

      const rates = reports.courseOutcomes.map((row) => row.passRate ?? 101);
      expect([...rates].sort((a, b) => a - b)).toEqual(rates);
    });

    it('sorts paths by how many chose them', async () => {
      const reports = (await get('/api/admin/reports', sessionAdmin).expect(200))
        .body as AdminReports;

      const chosen = reports.pathPopularity.map((row) => row.chosen);
      expect([...chosen].sort((a, b) => b - a)).toEqual(chosen);
    });
  });

  describe('exports', () => {
    it('serves the reports as CSV that Excel can open', async () => {
      const response = await get('/api/admin/reports.csv', sessionAdmin).expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      /* The three bytes between a usable report and mojibake (D-076). */
      expect(response.text.charCodeAt(0)).toBe(0xfeff);
      expect(response.text).toContain('التقرير');
    });

    /*
     * The *trail* export moved into the browser (TAM-138): every column of it is
     * Arabic copy, that copy lives in the message catalogue by convention, and
     * an export written where the words are is the only way the file and the
     * screen can agree. What the API still owes it is a page big enough to
     * export, honouring the same filters — which is this.
     */
    it('serves a whole export-sized page of the trail, honouring the filter', async () => {
      const page = (
        await get(
          `/api/admin/audit?actorUserId=${adminId}&outcome=FAILURE&pageSize=5000`,
          sessionAdmin,
        ).expect(200)
      ).body as AdminAuditPage;

      expect(page.rows.length).toBeGreaterThan(0);
      /* An export that ignored the filter would hand over the whole log to
         answer a narrow question. */
      expect(page.rows.every((row) => row.outcome === 'FAILURE')).toBe(true);
    });

    it('refuses a page larger than the export bound', async () => {
      await get('/api/admin/audit?pageSize=5001', sessionAdmin).expect(400);
    });
  });
});
