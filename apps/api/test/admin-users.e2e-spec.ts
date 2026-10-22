import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type {
  AdminEntityRow,
  AdminInviteResult,
  AdminUserDetail,
  AdminUserPage,
} from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4C.2 over real HTTP against a real database.
 *
 * **The property this suite exists for: no password reaches the administrator.**
 * Provisioning returns an invitation, not a credential, and the only way into
 * the new account is a token read out of the mailbox — which is exactly what the
 * fake email service below captures, the same way the auth suite reads a
 * verification link. If an implementation ever started returning or displaying a
 * generated password, the assertions here would still pass on the happy path,
 * so one of them checks the *response body* for it directly.
 */

class EmailCapture {
  invitations = new Map<string, string>();
  verifications = new Map<string, string>();

  sendInvitation(to: string, _fullName: string, token: string): Promise<void> {
    this.invitations.set(to, token);
    return Promise.resolve();
  }

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.set(to, token);
    return Promise.resolve();
  }

  sendPasswordReset(): Promise<void> {
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const NEW_PASSWORD = 'another-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

describe('Admin user management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  let sessionAdmin: string;
  let adminId: string;
  let secondAdminId: string;
  let employeeId: string;
  let entityId: string;

  let csrfCookie: string;
  let csrfToken: string;

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
      data: { key: `admin-users-${RUN_ID}`, name: 'الهيئة الوطنية للتدريب' },
      select: { id: true },
    });
    entityId = entity.id;

    /*
     * Two administrators, deliberately. Every last-admin assertion is vacuous
     * with one — the guard fires and it looks correct whatever the rule actually
     * says — and impossible to test the *allowed* direction of.
     */
    adminId = await account('admin', 'SUPER_ADMIN');
    secondAdminId = await account('admin2', 'SUPER_ADMIN');
    employeeId = await account('emp', 'EMPLOYEE');

    sessionAdmin = await signIn(`ausers-${RUN_ID}-admin@ministry.gov.example`);
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `ausers-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.authToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.entity.deleteMany({ where: { key: { startsWith: `admin-users-${RUN_ID}` } } });
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
    method: 'post' | 'patch',
    path: string,
    body: Record<string, unknown>,
    session?: string,
  ) {
    /* Bound first: prettier breaks the chain before a computed access, and a
       line starting with `[` reads to the parser as an index into the one
       above it. */
    const agent = request(server());

    return agent[method](path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  const post = (path: string, body: Record<string, unknown>, session?: string) =>
    send('post', path, body, session);
  const patch = (path: string, body: Record<string, unknown>, session?: string) =>
    send('patch', path, body, session);
  const get = (path: string, session: string) => request(server()).get(path).set('Cookie', session);

  async function signIn(email: string): Promise<string> {
    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function account(label: string, role: 'EMPLOYEE' | 'SUPER_ADMIN'): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `ausers-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `U-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    return user.id;
  }

  describe('provisioning an account', () => {
    let invited: AdminInviteResult;
    const invitedEmail = `ausers-${RUN_ID}-invited@authority.example`;

    it('creates the account and returns an invitation, never a password', async () => {
      const response = await post(
        '/api/admin/users',
        {
          email: invitedEmail,
          fullName: 'منسّق الجهة',
          employeeId: `E-${RUN_ID}-1`,
          department: 'التدريب',
          role: 'ENTITY',
          entityId,
        },
        sessionAdmin,
      ).expect(201);

      invited = response.body as AdminInviteResult;

      expect(invited.user.role).toBe('ENTITY');
      expect(invited.user.entity?.id).toBe(entityId);
      expect(invited.invitationSentTo).toBe(invitedEmail);
      /* The account cannot be signed into yet: nothing has proved the mailbox. */
      expect(invited.user.emailVerifiedAt).toBeNull();

      /*
       * The property, checked against the serialised body rather than against
       * named fields — a future refactor that added `temporaryPassword` would
       * satisfy every other assertion in this file.
       */
      expect(JSON.stringify(invited).toLowerCase()).not.toContain('password');
    });

    it('accepts an address outside the ministry domain', async () => {
      /* D-017 gates *self*-registration. An entity contact is by definition not
         at a ministry address, so administrative provisioning must bypass it —
         otherwise a supplier could never be onboarded at all. */
      expect(invited.user.email).toBe(invitedEmail);
    });

    it('emails an invitation carrying a usable token', async () => {
      expect(emails.invitations.get(invitedEmail)).toBeTruthy();
    });

    it('refuses a duplicate email, saying which field clashed', async () => {
      const response = await post(
        '/api/admin/users',
        {
          email: invitedEmail,
          fullName: 'آخر',
          employeeId: `E-${RUN_ID}-2`,
          department: 'التدريب',
          role: 'EMPLOYEE',
        },
        sessionAdmin,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('refuses a duplicate employee id distinctly from a duplicate email', async () => {
      const response = await post(
        '/api/admin/users',
        {
          email: `ausers-${RUN_ID}-other@ministry.gov.example`,
          fullName: 'آخر',
          employeeId: `E-${RUN_ID}-1`,
          department: 'التدريب',
          role: 'EMPLOYEE',
        },
        sessionAdmin,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('EMPLOYEE_ID_ALREADY_REGISTERED');
    });

    it('refuses an entity account with no organisation', async () => {
      await post(
        '/api/admin/users',
        {
          email: `ausers-${RUN_ID}-noent@authority.example`,
          fullName: 'بلا جهة',
          employeeId: `E-${RUN_ID}-3`,
          department: 'التدريب',
          role: 'ENTITY',
        },
        sessionAdmin,
      ).expect(400);
    });

    it('lets the invited person set their own password and sign in', async () => {
      const token = emails.invitations.get(invitedEmail)!;

      await post('/api/auth/reset-password', { token, password: NEW_PASSWORD }).expect(200);

      const response = await post('/api/auth/login', {
        email: invitedEmail,
        password: NEW_PASSWORD,
      }).expect(200);

      /* The whole loop: provisioned by an admin who never knew a password,
         activated from the mailbox, signed in with the person's own choice. */
      expect((response.body as { user: { role: string } }).user.role).toBe('ENTITY');
    });

    it('marks the email verified by the act of redeeming the invitation', async () => {
      const row = await prisma.user.findUnique({
        where: { email: invitedEmail },
        select: { emailVerifiedAt: true },
      });

      /* Redeeming a token sent to an address proves control of that address.
         Without this the invited person would set a password and still be
         refused at sign-in with EMAIL_NOT_VERIFIED — having just proved the
         mailbox is theirs. */
      expect(row?.emailVerifiedAt).not.toBeNull();
    });

    it('refuses to re-invite an account that is already in use', async () => {
      const user = await prisma.user.findUnique({
        where: { email: invitedEmail },
        select: { id: true },
      });

      const response = await post(`/api/admin/users/${user!.id}/invite`, {}, sessionAdmin).expect(
        409,
      );

      /* An "invitation" to somebody who already signed in is a password reset,
         and should be requested as one so the trail says what happened. */
      expect((response.body as { message: string }).message).toBe('ACCOUNT_ALREADY_ACTIVE');
    });
  });

  describe('suspending and reactivating', () => {
    it('revokes live sessions when an account is suspended', async () => {
      const session = await signIn(`ausers-${RUN_ID}-emp@ministry.gov.example`);

      await get('/api/auth/me', session).expect(200);

      await patch(
        `/api/admin/users/${employeeId}/status`,
        { status: 'SUSPENDED' },
        sessionAdmin,
      ).expect(200);

      await get('/api/auth/me', session).expect(401);

      const live = await prisma.session.count({
        where: { userId: employeeId, revokedAt: null },
      });

      /*
       * Revoked, not merely refused. SessionGuard already rejects a suspended
       * owner, so the 401 above would pass either way — but without revoking,
       * reactivating the account would silently hand back every session that was
       * live at suspension, including whichever one caused the suspension.
       */
      expect(live).toBe(0);
    });

    it('does not resurrect old sessions on reactivation', async () => {
      const session = await signIn(`ausers-${RUN_ID}-emp@ministry.gov.example`).catch(() => null);
      /* Suspended accounts cannot sign in, so there is nothing to resurrect. */
      expect(session).toBeNull();

      await patch(
        `/api/admin/users/${employeeId}/status`,
        { status: 'ACTIVE' },
        sessionAdmin,
      ).expect(200);

      const live = await prisma.session.count({
        where: { userId: employeeId, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('refuses an administrator suspending themselves', async () => {
      const response = await patch(
        `/api/admin/users/${adminId}/status`,
        { status: 'SUSPENDED' },
        sessionAdmin,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('CANNOT_MODIFY_SELF');
    });

    it('allows suspending another administrator while one remains', async () => {
      await patch(
        `/api/admin/users/${secondAdminId}/status`,
        { status: 'SUSPENDED' },
        sessionAdmin,
      ).expect(200);
    });

    it('audits the refusal, not only the change', async () => {
      const refusal = await prisma.auditLog.findFirst({
        where: {
          action: 'ADMIN_USER_STATUS_CHANGED',
          outcome: 'FAILURE',
          actorUserId: adminId,
        },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true, targetId: true },
      });

      expect(refusal?.metadata).toMatchObject({ reason: 'SELF_MODIFICATION_REFUSED' });
      expect(refusal?.targetId).toBe(adminId);
    });

    it('reactivates the second administrator', async () => {
      await patch(
        `/api/admin/users/${secondAdminId}/status`,
        { status: 'ACTIVE' },
        sessionAdmin,
      ).expect(200);
    });
  });

  describe('listing and inspecting', () => {
    it('finds a person by name, email or employee id in one search box', async () => {
      const response = await get(
        `/api/admin/users?q=${encodeURIComponent(`U-${RUN_ID}-emp`)}`,
        sessionAdmin,
      ).expect(200);

      const page = response.body as AdminUserPage;
      expect(page.rows.map((row) => row.id)).toContain(employeeId);
      expect(page.total).toBeGreaterThan(0);
    });

    it('filters by role', async () => {
      const response = await get('/api/admin/users?role=SUPER_ADMIN', sessionAdmin).expect(200);
      const page = response.body as AdminUserPage;

      expect(page.rows.every((row) => row.role === 'SUPER_ADMIN')).toBe(true);
    });

    it('refuses a page size beyond the ceiling rather than silently capping it', async () => {
      /* An unbounded page size is an export endpoint nobody designed. §4C.8 is
         where exporting happens deliberately. */
      await get('/api/admin/users?pageSize=5000', sessionAdmin).expect(400);
    });

    it('rejects a filter the DTO does not declare', async () => {
      await get('/api/admin/users?passwordHash=1', sessionAdmin).expect(400);
    });

    it('shows a person’s journey without reproducing their screens', async () => {
      const response = await get(`/api/admin/users/${employeeId}`, sessionAdmin).expect(200);
      const detail = response.body as AdminUserDetail;

      expect(detail.id).toBe(employeeId);
      expect(detail).toHaveProperty('certificateCount');
      expect(detail).toHaveProperty('activeSessions');
      /* The paths the ministry assigned and where each placed them (D-134) —
         a summary, never the learner's own screens. */
      expect(detail.paths).toEqual([]);
    });

    it('answers 404 for an unknown id and 400 for a malformed one', async () => {
      await get('/api/admin/users/00000000-0000-4000-8000-000000000000', sessionAdmin).expect(404);
      await get('/api/admin/users/not-a-uuid', sessionAdmin).expect(400);
    });

    it('reports the registration policy in force', async () => {
      const response = await get('/api/admin/registration-policy', sessionAdmin).expect(200);

      expect(response.body).toMatchObject({ mode: expect.any(String) });
    });
  });

  describe('organisations', () => {
    let created: AdminEntityRow;

    it('creates one, filling the seam Phase 4 left', async () => {
      const response = await post(
        '/api/admin/entities',
        {
          key: `admin-users-${RUN_ID}-new`,
          name: 'معهد الإدارة',
          contactName: 'مسؤول التنسيق',
          contactEmail: `contact-${RUN_ID}@authority.example`,
        },
        sessionAdmin,
      ).expect(201);

      created = response.body as AdminEntityRow;
      expect(created.name).toBe('معهد الإدارة');
      /* A shell nobody has staffed yet — the two counts are what make that
         visible rather than something to discover later. */
      expect(created.accountCount).toBe(0);
      expect(created.courseCount).toBe(0);
    });

    it('refuses a duplicate key', async () => {
      const response = await post(
        '/api/admin/entities',
        { key: `admin-users-${RUN_ID}-new`, name: 'آخر' },
        sessionAdmin,
      ).expect(409);

      expect((response.body as { message: string }).message).toBe('ENTITY_KEY_TAKEN');
    });

    it('refuses a key that is not a slug', async () => {
      await post('/api/admin/entities', { key: 'مفتاح عربي', name: 'جهة' }, sessionAdmin).expect(
        400,
      );
    });

    it('suspends one, and audits the status rather than the contact', async () => {
      await patch(
        `/api/admin/entities/${created.id}`,
        { status: 'SUSPENDED' },
        sessionAdmin,
      ).expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ENTITY_UPDATED', targetId: created.id },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      expect(entry?.metadata).toMatchObject({ status: 'SUSPENDED', fields: 'status' });
    });

    it('records which fields moved, never a contact name', async () => {
      await patch(
        `/api/admin/entities/${created.id}`,
        { contactName: 'اسم جديد' },
        sessionAdmin,
      ).expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ENTITY_UPDATED', targetId: created.id },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      /* §2 keeps PII out of audit payloads. A contact is a named person at a
         supplier, so the trail records that the field changed and no more. */
      expect(JSON.stringify(entry?.metadata)).not.toContain('اسم جديد');
      expect(entry?.metadata).toMatchObject({ fields: 'contactName' });
    });
  });
});
