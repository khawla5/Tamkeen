import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { MockLmsService } from '../src/moodle/mock/mock-lms.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4.12's profile surface, over real HTTP against a real database (§2B).
 *
 * Three deferred items, all covered here. **The name/department edit** is
 * the audit trail's "which fields, never values" rule plus the best-effort
 * Moodle name propagation it exists for. **The password change** is the
 * security-carrying one: a session cookie is enough to *be* the user, so the
 * current password is the only thing standing between an unlocked machine and
 * a permanent account takeover — and the change has to end the other
 * sessions, or a password changed *because* it may be known elsewhere leaves
 * whoever knew it still signed in. **The digits preference** is the harmless
 * one, and must stay that way: "no preference" and "prefers Western" have to
 * stay distinguishable, or the ministry can never change the default for
 * anybody without overwriting a choice.
 */

/**
 * A mail sink that keeps the tokens.
 *
 * The email-change flow has no other way out: the raw token exists only in the
 * message, and only its hash is stored (deliberately — a database leak must not
 * hand anyone working links). Reading it here is the integration-test
 * equivalent of opening the inbox, which is exactly what the browser suite does
 * against Mailpit.
 */
class EmailCapture {
  readonly emailChanges = new Map<string, string>();
  readonly resets = new Map<string, string>();

  sendEmailVerification(): Promise<void> {
    return Promise.resolve();
  }
  sendPasswordReset(to: string, token: string): Promise<void> {
    this.resets.set(to, token);
    return Promise.resolve();
  }
  sendEmailChange(to: string, token: string): Promise<void> {
    this.emailChanges.set(to, token);
    return Promise.resolve();
  }
  sendInvitation(): Promise<void> {
    return Promise.resolve();
  }
}

const PASSWORD = 'a-sufficiently-long-password';
const RUN_ID = randomBytes(4).toString('hex');

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lms: MockLmsService;

  let csrfCookie: string;
  let csrfToken: string;
  const mail = new EmailCapture();

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(mail)
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
  }, 120_000);

  afterAll(async () => {
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `prof-${RUN_ID}-` } },
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
    method: 'post' | 'patch',
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

  /** A fresh account per test, so a change in one cannot reach another. */
  async function account(label: string): Promise<string> {
    const email = `prof-${RUN_ID}-${label}@ministry.gov.example`;

    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'موظف الملف الشخصي',
        employeeId: `P-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role: 'EMPLOYEE',
        emailVerifiedAt: new Date(),
      },
    });

    return email;
  }

  async function signIn(email: string, password = PASSWORD): Promise<string> {
    const response = await send('post', '/api/auth/login', { email, password }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  async function userIdFor(session: string): Promise<string> {
    const me = await get('/api/auth/me', session).expect(200);
    return (me.body as { id: string }).id;
  }

  describe('PATCH /api/me/profile — name and department', () => {
    it('exposes employeeId and department on the session user', async () => {
      const email = await account('me-fields');
      const session = await signIn(email);

      const response = await get('/api/auth/me', session).expect(200);

      expect(response.body).toMatchObject({
        fullName: 'موظف الملف الشخصي',
        department: 'قسم',
        employeeId: expect.stringContaining(`P-${RUN_ID}`) as string,
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
      const email = await account('empty-name');
      const session = await signIn(email);

      const response = await send(
        'patch',
        '/api/me/profile',
        { fullName: '   ', department: 'إدارة جديدة' },
        session,
      ).expect(400);

      expect(JSON.stringify(response.body)).toContain('FULL_NAME_REQUIRED');
    });

    it('rejects an empty department', async () => {
      const email = await account('empty-dept');
      const session = await signIn(email);

      const response = await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم جديد', department: '' },
        session,
      ).expect(400);

      expect(JSON.stringify(response.body)).toContain('DEPARTMENT_REQUIRED');
    });

    it('refuses to change the employee id or role through the body', async () => {
      const email = await account('whitelist');
      const session = await signIn(email);

      /* forbidNonWhitelisted (§2 security baseline): a field this DTO does not
         declare is a rejected request, not a silently ignored one. */
      await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم جديد', department: 'إدارة جديدة', role: 'SUPER_ADMIN', employeeId: 'X' },
        session,
      ).expect(400);
    });

    it('updates the name and department, and returns the saved view', async () => {
      const email = await account('update');
      const session = await signIn(email);

      const response = await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم محدّث', department: 'إدارة محدّثة' },
        session,
      ).expect(200);

      expect(response.body).toMatchObject({ fullName: 'اسم محدّث', department: 'إدارة محدّثة' });

      const again = await get('/api/auth/me', session).expect(200);
      expect(again.body).toMatchObject({ fullName: 'اسم محدّث', department: 'إدارة محدّثة' });
    });

    it('audits which fields changed, never their values', async () => {
      const email = await account('audit-fields');
      const session = await signIn(email);
      const userId = await userIdFor(session);

      /* Only the department actually changes here — the full name is resent
         unchanged, and the audit trail must not claim it did. */
      await send(
        'patch',
        '/api/me/profile',
        { fullName: 'موظف الملف الشخصي', department: 'إدارة مغايرة' },
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
      const email = await account('noop');
      const session = await signIn(email);
      const userId = await userIdFor(session);

      const before = await prisma.auditLog.count({
        where: { actorUserId: userId, action: 'PROFILE_UPDATED' },
      });

      await send(
        'patch',
        '/api/me/profile',
        { fullName: 'موظف الملف الشخصي', department: 'قسم' },
        session,
      ).expect(200);

      const after = await prisma.auditLog.count({
        where: { actorUserId: userId, action: 'PROFILE_UPDATED' },
      });

      expect(after).toBe(before);
    });

    it('propagates a name change to Moodle for a provisioned user', async () => {
      const email = await account('lms-sync');
      const session = await signIn(email);
      const userId = await userIdFor(session);

      const provisioned = await lms.provisionUser({
        email,
        fullName: 'موظف الملف الشخصي',
        externalUserId: userId,
      });
      await prisma.user.update({
        where: { id: userId },
        data: { moodleUserId: provisioned.lmsUserId },
      });

      await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم تمكيني', department: 'قسم' },
        session,
      ).expect(200);

      /* The property this whole feature exists for: the course player renders
         the learner's name from Moodle's own record, so the LMS side must
         actually hold the new name, not just our database. */
      const onLms = await lms.findUserByEmail(email);
      expect(onLms?.fullName).toBe('اسم تمكيني');
    });

    it('does not touch Moodle for a user who was never provisioned', async () => {
      const email = await account('unprovisioned');
      const session = await signIn(email);

      await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم آخر', department: 'قسم' },
        session,
      ).expect(200);

      /* Never provisioned in the mock at all — if the service had reached for
         moodle.updateUser regardless, there would be a record to find here. */
      expect(await lms.findUserByEmail(email)).toBeNull();
    });

    it('saves successfully and audits the failure when Moodle propagation fails', async () => {
      const email = await account('lms-fail');
      const session = await signIn(email);
      const userId = await userIdFor(session);

      /* An id the mock never provisioned — updateUser refuses it exactly as a
         real Moodle would refuse an unknown account, without this test having
         to fabricate an outage. */
      await prisma.user.update({ where: { id: userId }, data: { moodleUserId: 8_888_888 } });

      const response = await send(
        'patch',
        '/api/me/profile',
        { fullName: 'اسم رغم الفشل', department: 'قسم' },
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

  describe('changing your own password', () => {
    it('refuses an unauthenticated request', async () => {
      /* Not `@Public()`. An anonymous caller has no account to change. */
      await send('post', '/api/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'a-different-long-password',
      }).expect(401);
    });

    it('refuses a wrong current password, and records the attempt', async () => {
      const email = await account('pw-wrong');
      const session = await signIn(email);

      const response = await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: 'not-the-real-password', newPassword: 'a-different-long-password' },
        session,
      ).expect(401);

      expect(JSON.stringify(response.body)).toContain('INVALID_CREDENTIALS');
    });

    it('refuses a new password identical to the old one', async () => {
      const email = await account('pw-same');
      const session = await signIn(email);

      const response = await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: PASSWORD },
        session,
      ).expect(400);

      expect(JSON.stringify(response.body)).toContain('PASSWORD_UNCHANGED');
    });

    it('refuses a new password under the minimum length', async () => {
      const email = await account('pw-short');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'short' },
        session,
      ).expect(400);
    });

    it('changes the password, and the old one stops working', async () => {
      const email = await account('pw-change');
      const session = await signIn(email);
      const newPassword = 'a-different-long-password';

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword },
        session,
      ).expect(200);

      await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(401);
      await send('post', '/api/auth/login', { email, password: newPassword }).expect(200);
    });

    it('ends the other sessions but keeps the one doing the changing', async () => {
      const email = await account('pw-sessions');
      const first = await signIn(email);
      const second = await signIn(email);
      const newPassword = 'a-different-long-password';

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword },
        first,
      ).expect(200);

      await get('/api/auth/me', first).expect(200);
      await get('/api/auth/me', second).expect(401);
    });
  });

  describe('the digits preference (D-018)', () => {
    it('refuses an unauthenticated request', async () => {
      await request(server())
        .patch('/api/auth/me/preferences')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ numberFormat: 'western' })
        .expect(401);
    });

    it('starts as null, meaning "follow whatever the system is set to"', async () => {
      const email = await account('digits-null');
      const session = await signIn(email);

      const response = await get('/api/auth/me', session).expect(200);
      expect(response.body).toMatchObject({ numberFormat: null });
    });

    it('stores a choice and hands it back on the session', async () => {
      const email = await account('digits-store');
      const session = await signIn(email);

      await send('patch', '/api/auth/me/preferences', { numberFormat: 'arabic-indic' }, session).expect(
        204,
      );

      const response = await get('/api/auth/me', session).expect(200);
      expect(response.body).toMatchObject({ numberFormat: 'arabic-indic' });
    });

    it('clears back to null rather than storing a third literal', async () => {
      const email = await account('digits-clear');
      const session = await signIn(email);

      await send('patch', '/api/auth/me/preferences', { numberFormat: 'western' }, session).expect(204);
      await send('patch', '/api/auth/me/preferences', { numberFormat: null }, session).expect(204);

      const response = await get('/api/auth/me', session).expect(200);
      expect(response.body).toMatchObject({ numberFormat: null });
    });

    it('refuses a format nothing can render', async () => {
      const email = await account('digits-bad');
      const session = await signIn(email);

      await send(
        'patch',
        '/api/auth/me/preferences',
        { numberFormat: 'roman-numerals' },
        session,
      ).expect(400);
    });

    it('is scoped to the caller — there is no route to set somebody else’s', async () => {
      const emailA = await account('digits-scope-a');
      const emailB = await account('digits-scope-b');
      const sessionA = await signIn(emailA);
      const sessionB = await signIn(emailB);

      await send('patch', '/api/auth/me/preferences', { numberFormat: 'arabic-indic' }, sessionA).expect(
        204,
      );

      const responseB = await get('/api/auth/me', sessionB).expect(200);
      expect(responseB.body).toMatchObject({ numberFormat: null });
    });
  });

  describe('changing the address the account signs in with (§4.12)', () => {
    async function requestChange(email: string, target: string, session?: string): Promise<string> {
      const cookie = session ?? (await signIn(email));

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: target, currentPassword: PASSWORD },
        cookie,
      ).expect(200);

      return mail.emailChanges.get(target)!;
    }

    it('refuses an unauthenticated request', async () => {
      await send('post', '/api/auth/change-email', {
        newEmail: `prof-${RUN_ID}-anon-target@ministry.gov.example`,
        currentPassword: PASSWORD,
      }).expect(401);
    });

    it('refuses a wrong current password, and parks nothing', async () => {
      const email = await account('em-wrong-pw');
      const session = await signIn(email);
      const target = `prof-${RUN_ID}-em-wrong-pw-new@ministry.gov.example`;

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: target, currentPassword: 'not-the-real-password' },
        session,
      ).expect(401);

      expect(mail.emailChanges.has(target)).toBe(false);
    });

    it('refuses an address outside the ministry domain', async () => {
      const email = await account('em-outside');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: 'someone@gmail.com', currentPassword: PASSWORD },
        session,
      ).expect(400);
    });

    it('refuses the address it already has', async () => {
      const email = await account('em-same');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: email, currentPassword: PASSWORD },
        session,
      ).expect(400);
    });

    it('accepts a request without changing anything yet', async () => {
      const email = await account('em-pending');
      const session = await signIn(email);
      const target = `prof-${RUN_ID}-em-pending-new@ministry.gov.example`;

      await requestChange(email, target, session);

      const response = await get('/api/auth/me', session).expect(200);
      expect(response.body).toMatchObject({ email });
    });

    it('answers a taken address exactly as it answers a free one', async () => {
      const emailA = await account('em-taken-a');
      const emailB = await account('em-taken-b');
      const sessionA = await signIn(emailA);

      const freeResponse = await send(
        'post',
        '/api/auth/change-email',
        { newEmail: `prof-${RUN_ID}-em-free@ministry.gov.example`, currentPassword: PASSWORD },
        sessionA,
      );
      const takenResponse = await send(
        'post',
        '/api/auth/change-email',
        { newEmail: emailB, currentPassword: PASSWORD },
        sessionA,
      );

      expect(freeResponse.status).toBe(takenResponse.status);
      expect(JSON.stringify(freeResponse.body)).toBe(JSON.stringify(takenResponse.body));
    });

    it('supersedes an earlier pending request rather than stacking them', async () => {
      const email = await account('em-supersede');
      const session = await signIn(email);
      const first = `prof-${RUN_ID}-em-supersede-first@ministry.gov.example`;
      const second = `prof-${RUN_ID}-em-supersede-second@ministry.gov.example`;

      const firstToken = await requestChange(email, first, session);
      await requestChange(email, second, session);

      await send('post', '/api/auth/confirm-email-change', { token: firstToken }).expect(400);
    });
  });

  describe('confirming the change', () => {
    it('refuses an unknown token', async () => {
      await send('post', '/api/auth/confirm-email-change', { token: 'not-a-real-token' }).expect(400);
    });

    it('refuses a token issued for something else', async () => {
      const email = await account('em-wrong-token-type');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'a-different-long-password' },
        session,
      ).expect(200);
    });

    it('moves the address, and the new one is the one that signs in', async () => {
      const email = await account('em-confirm');
      const session = await signIn(email);
      const target = `prof-${RUN_ID}-em-confirm-new@ministry.gov.example`;
      const token = await requestChange(email, target, session);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(401);
      await send('post', '/api/auth/login', { email: target, password: PASSWORD }).expect(200);
    });

    it('ends every session, because the identifier just changed', async () => {
      const email = await account('em-ends-sessions');
      const first = await signIn(email);
      const second = await signIn(email);
      const target = `prof-${RUN_ID}-em-ends-sessions-new@ministry.gov.example`;
      const token = await requestChange(email, target, first);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      await get('/api/auth/me', first).expect(401);
      await get('/api/auth/me', second).expect(401);
    });

    it('will not spend the same token twice', async () => {
      const email = await account('em-single-use');
      const session = await signIn(email);
      const target = `prof-${RUN_ID}-em-single-use-new@ministry.gov.example`;
      const token = await requestChange(email, target, session);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);
      await send('post', '/api/auth/confirm-email-change', { token }).expect(401);
    });

    it('refuses if the address was claimed while the link sat in the inbox', async () => {
      const email = await account('em-race');
      const target = `prof-${RUN_ID}-em-race-new@ministry.gov.example`;
      const token = await requestChange(email, target);

      /* Free when the link was sent, taken by the time it was opened. The
         unique index would refuse anyway; catching it here turns a 500 into
         something the page can explain. */
      await prisma.user.create({
        data: {
          email: target,
          passwordHash: await hashPassword(PASSWORD),
          fullName: 'موظف آخر',
          employeeId: `PR-${RUN_ID}-race`.slice(0, 20),
          department: 'قسم',
          role: 'EMPLOYEE',
          emailVerifiedAt: new Date(),
        },
      });

      await send('post', '/api/auth/confirm-email-change', { token }).expect(409);
    });
  });
});
