import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { MockLmsService } from '../src/moodle/mock/mock-lms.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4.12's profile edit, over real HTTP against a real database and the mock
 * LMS (§2B) — validation, the audit trail's "which fields, never values" rule,
 * and the best-effort Moodle name propagation this feature exists for.
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

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;
  let lms: MockLmsService;

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
  }, 60_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `profile-${RUN_ID}-` } },
      select: { id: true },
    });
    const ids = created.map((user) => user.id);

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

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

  /** A fresh, verified employee, signed in. Returns the session cookie, id and email. */
  async function employeeAccount(
    label: string,
  ): Promise<{ session: string; userId: string; email: string }> {
    const email = `profile-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'الاسم الأصلي',
      employeeId: `PR-${RUN_ID}-${label}`.slice(0, 20),
      department: 'الإدارة الأصلية',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    const session = await signIn(email);
    const me = await get('/api/auth/me', session).expect(200);
    const userId = (me.body as { id: string }).id;

    return { session, userId, email };
  }

  it('exposes employeeId and department on the session user', async () => {
    const { session } = await employeeAccount('me-fields');

    const response = await get('/api/auth/me', session).expect(200);

    expect(response.body).toMatchObject({
      fullName: 'الاسم الأصلي',
      department: 'الإدارة الأصلية',
      employeeId: expect.stringContaining(`PR-${RUN_ID}`) as string,
      role: 'EMPLOYEE',
    });
  });

  it('requires a session', async () => {
    await request(server())
      .patch('/api/me/profile')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ fullName: 'اسم جديد', department: 'إدارة جديدة' })
      .expect(401);
  });

  it('rejects an empty full name', async () => {
    const { session } = await employeeAccount('empty-name');

    const response = await patch(
      '/api/me/profile',
      { fullName: '   ', department: 'إدارة جديدة' },
      session,
    ).expect(400);

    expect(JSON.stringify(response.body)).toContain('FULL_NAME_REQUIRED');
  });

  it('rejects an empty department', async () => {
    const { session } = await employeeAccount('empty-dept');

    const response = await patch(
      '/api/me/profile',
      { fullName: 'اسم جديد', department: '' },
      session,
    ).expect(400);

    expect(JSON.stringify(response.body)).toContain('DEPARTMENT_REQUIRED');
  });

  it('refuses to change the employee id or role through the body', async () => {
    const { session } = await employeeAccount('whitelist');

    /* forbidNonWhitelisted (§2 security baseline): a field this DTO does not
       declare is a rejected request, not a silently ignored one. */
    await patch(
      '/api/me/profile',
      { fullName: 'اسم جديد', department: 'إدارة جديدة', role: 'SUPER_ADMIN', employeeId: 'X' },
      session,
    ).expect(400);
  });

  it('updates the name and department, and returns the saved view', async () => {
    const { session } = await employeeAccount('update');

    const response = await patch(
      '/api/me/profile',
      { fullName: 'اسم محدّث', department: 'إدارة محدّثة' },
      session,
    ).expect(200);

    expect(response.body).toMatchObject({
      fullName: 'اسم محدّث',
      department: 'إدارة محدّثة',
    });

    const again = await get('/api/auth/me', session).expect(200);
    expect(again.body).toMatchObject({ fullName: 'اسم محدّث', department: 'إدارة محدّثة' });
  });

  it('audits which fields changed, never their values', async () => {
    const { session, userId } = await employeeAccount('audit-fields');

    /* Only the department actually changes here — the full name is resent
       unchanged, and the audit trail must not claim it did. */
    await patch(
      '/api/me/profile',
      { fullName: 'الاسم الأصلي', department: 'إدارة مغايرة' },
      session,
    ).expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { actorUserId: userId, action: 'PROFILE_UPDATED' },
      orderBy: { occurredAt: 'desc' },
    });

    expect(entry).toMatchObject({ outcome: 'SUCCESS', targetType: 'user', targetId: userId });
    /* The field name, and only the field name — never "إدارة مغايرة" or any
       other value, which would be exactly the PII an audit log must not hold. */
    expect(entry?.metadata).toEqual({ fields: 'department' });
  });

  it('is a no-op when resubmitted with unchanged values — no audit entry', async () => {
    const { session, userId } = await employeeAccount('noop');

    const before = await prisma.auditLog.count({
      where: { actorUserId: userId, action: 'PROFILE_UPDATED' },
    });

    await patch(
      '/api/me/profile',
      { fullName: 'الاسم الأصلي', department: 'الإدارة الأصلية' },
      session,
    ).expect(200);

    const after = await prisma.auditLog.count({
      where: { actorUserId: userId, action: 'PROFILE_UPDATED' },
    });

    expect(after).toBe(before);
  });

  it('propagates a name change to Moodle for a provisioned user', async () => {
    const { session, userId, email } = await employeeAccount('lms-sync');

    const provisioned = await lms.provisionUser({
      email,
      fullName: 'الاسم الأصلي',
      externalUserId: userId,
    });
    await prisma.user.update({
      where: { id: userId },
      data: { moodleUserId: provisioned.lmsUserId },
    });

    await patch(
      '/api/me/profile',
      { fullName: 'اسم تمكيني', department: 'الإدارة الأصلية' },
      session,
    ).expect(200);

    /* The property this whole feature exists for: the course player renders
       the learner's name from Moodle's own record, so the LMS side must
       actually hold the new name, not just our database. */
    const onLms = await lms.findUserByEmail(email);
    expect(onLms?.fullName).toBe('اسم تمكيني');
  });

  it('does not touch Moodle for a user who was never provisioned', async () => {
    const { session, email } = await employeeAccount('unprovisioned');

    await patch(
      '/api/me/profile',
      { fullName: 'اسم آخر', department: 'الإدارة الأصلية' },
      session,
    ).expect(200);

    /* Never provisioned in the mock at all — if the service had reached for
       moodle.updateUser regardless, there would be a record to find here. */
    expect(await lms.findUserByEmail(email)).toBeNull();
  });

  it('saves successfully and audits the failure when Moodle propagation fails', async () => {
    const { session, userId } = await employeeAccount('lms-fail');

    /* An id the mock never provisioned — updateUser refuses it exactly as a
       real Moodle would refuse an unknown account, without this test having
       to fabricate an outage. */
    await prisma.user.update({ where: { id: userId }, data: { moodleUserId: 8_888_888 } });

    const response = await patch(
      '/api/me/profile',
      { fullName: 'اسم رغم الفشل', department: 'الإدارة الأصلية' },
      session,
    ).expect(200);

    /* The save itself is unaffected by the LMS refusing — that is the whole
       point of best-effort propagation. */
    expect(response.body).toMatchObject({ fullName: 'اسم رغم الفشل' });

    const failure = await prisma.auditLog.findFirst({
      where: { actorUserId: userId, action: 'PROFILE_LMS_SYNC_FAILED' },
    });
    expect(failure).toMatchObject({ outcome: 'FAILURE', targetType: 'user', targetId: userId });
  });
});
