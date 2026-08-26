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
        newPassword: 'another-long-password',
      }).expect(401);
    });

    it('refuses a wrong current password, and records the attempt', async () => {
      const email = await account('wrong');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: 'not-the-password', newPassword: 'another-long-password' },
        session,
      ).expect(401);

      /* An attempt to change a password with a guess is exactly the event a
         ministry wants in the trail (§2). */
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_PASSWORD_CHANGED', outcome: 'FAILURE' },
        orderBy: { id: 'desc' },
      });
      expect(entry).not.toBeNull();

      /* And the old password must still work — a failed change that locked the
         account out would be worse than the attack it refused. */
      await signIn(email);
    });

    it('refuses a new password identical to the old one', async () => {
      const email = await account('same');
      const session = await signIn(email);

      const response = await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: PASSWORD },
        session,
      ).expect(400);

      /* Refused rather than accepted as a no-op: somebody who believes they have
         rotated a compromised password and has not is worse off than somebody
         told they did not. */
      expect((response.body as { message: string }).message).toBe('PASSWORD_UNCHANGED');
    });

    it('refuses a new password under the minimum length', async () => {
      const email = await account('short');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'short' },
        session,
      ).expect(400);
    });

    it('changes the password, and the old one stops working', async () => {
      const email = await account('rotate');
      const session = await signIn(email);
      const next = 'a-brand-new-long-password';

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: next },
        session,
      ).expect(204);

      await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(401);
      await signIn(email, next);
    });

    it('ends the other sessions but keeps the one doing the changing', async () => {
      const email = await account('sessions');
      const elsewhere = await signIn(email);
      const here = await signIn(email);

      await get('/api/auth/me', elsewhere).expect(200);

      await send(
        'post',
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'yet-another-long-password' },
        here,
      ).expect(204);

      /* The point of the change. Whoever knew the old password is signed out. */
      await get('/api/auth/me', elsewhere).expect(401);
      /* And the person who just did it is not — being logged out of the page you
         are standing on reads as a failure, and invites a second change. */
      await get('/api/auth/me', here).expect(200);
    });
  });

  describe('the digits preference (D-018)', () => {
    it('refuses an unauthenticated request', async () => {
      await send('patch', '/api/auth/me/preferences', { numberFormat: 'arabic-indic' }).expect(401);
    });

    it('starts as null, meaning "follow whatever the system is set to"', async () => {
      const session = await signIn(await account('default'));

      const me = (await get('/api/auth/me', session).expect(200)).body as {
        numberFormat: string | null;
      };
      expect(me.numberFormat).toBeNull();
    });

    it('stores a choice and hands it back on the session', async () => {
      const session = await signIn(await account('choose'));

      await send(
        'patch',
        '/api/auth/me/preferences',
        { numberFormat: 'arabic-indic' },
        session,
      ).expect(204);

      const me = (await get('/api/auth/me', session).expect(200)).body as {
        numberFormat: string | null;
      };
      expect(me.numberFormat).toBe('arabic-indic');
    });

    it('clears back to null rather than storing a third literal', async () => {
      const session = await signIn(await account('clear'));

      await send('patch', '/api/auth/me/preferences', { numberFormat: 'western' }, session).expect(
        204,
      );
      await send('patch', '/api/auth/me/preferences', { numberFormat: null }, session).expect(204);

      /* Null and "western" must stay distinguishable: null is what lets §4C.6
         change the default for everyone without overwriting a preference. */
      const me = (await get('/api/auth/me', session).expect(200)).body as {
        numberFormat: string | null;
      };
      expect(me.numberFormat).toBeNull();
    });

    it('refuses a format nothing can render', async () => {
      const session = await signIn(await account('bogus'));

      /* Validated against the shared list, so an unknown value cannot reach the
         column and surface later as a formatting crash on somebody's dashboard. */
      await send('patch', '/api/auth/me/preferences', { numberFormat: 'roman' }, session).expect(
        400,
      );
    });

    it('is scoped to the caller — there is no route to set somebody else’s', async () => {
      const session = await signIn(await account('scope'));
      const other = await account('victim');
      const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other } });

      /* The endpoint takes no user id at all; a body that smuggles one is
         rejected by the whitelist rather than quietly ignored. */
      await send(
        'patch',
        '/api/auth/me/preferences',
        { numberFormat: 'arabic-indic', userId: otherUser.id },
        session,
      ).expect(400);

      const untouched = await prisma.user.findUniqueOrThrow({ where: { id: otherUser.id } });
      expect(untouched.numberFormat).toBeNull();
    });
  });

  describe('changing the address the account signs in with (§4.12)', () => {
    /** The pending address a request parked on its token, if any. */
    async function pendingFor(email: string): Promise<string | null> {
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const token = await prisma.authToken.findFirst({
        where: { userId: user.id, type: 'EMAIL_CHANGE', consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      return token?.newEmail ?? null;
    }

    it('refuses an unauthenticated request', async () => {
      await send('post', '/api/auth/change-email', {
        newEmail: `prof-${RUN_ID}-x@ministry.gov.example`,
        currentPassword: PASSWORD,
      }).expect(401);
    });

    it('refuses a wrong current password, and parks nothing', async () => {
      const email = await account('em-badpass');
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: `prof-${RUN_ID}-moved@ministry.gov.example`, currentPassword: 'wrong' },
        session,
      ).expect(401);

      /* Whoever can move the address can then reset the password and own the
         account outright, with the real employee locked out — so the password
         check is the whole gate, and a failed attempt must leave nothing
         pending behind it. */
      expect(await pendingFor(email)).toBeNull();
    });

    it('refuses an address outside the ministry domain', async () => {
      const email = await account('em-domain');
      const session = await signIn(email);

      const response = await send(
        'post',
        '/api/auth/change-email',
        { newEmail: 'someone@gmail.example', currentPassword: PASSWORD },
        session,
      ).expect(400);

      /* D-017 through the back door: an employee who could walk a ministry
         account to a personal inbox would defeat restricted registration one
         profile edit at a time. */
      expect((response.body as { message: string }).message).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
      expect(await pendingFor(email)).toBeNull();
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
      const target = `prof-${RUN_ID}-em-pending-new@ministry.gov.example`;
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: target, currentPassword: PASSWORD },
        session,
      ).expect(202);

      /* The address is on the TOKEN, and `users.email` has not moved. Anything
         else leaves a window in which the account points at an inbox nobody has
         proved they can read. */
      expect(await pendingFor(email)).toBe(target);

      const me = (await get('/api/auth/me', session).expect(200)).body as { email: string };
      expect(me.email).toBe(email);
    });

    it('answers a taken address exactly as it answers a free one', async () => {
      const email = await account('em-taken');
      const other = await account('em-victim');
      const session = await signIn(email);

      /*
       * The caller is authenticated, but answering "that address already has an
       * account" would turn the profile form into the address oracle the
       * registration endpoint refuses to be. Same status, and nothing parked.
       */
      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: other, currentPassword: PASSWORD },
        session,
      ).expect(202);

      expect(await pendingFor(email)).toBeNull();
    });

    it('supersedes an earlier pending request rather than stacking them', async () => {
      const email = await account('em-super');
      const session = await signIn(email);
      const first = `prof-${RUN_ID}-em-super-1@ministry.gov.example`;
      const second = `prof-${RUN_ID}-em-super-2@ministry.gov.example`;

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: first, currentPassword: PASSWORD },
        session,
      ).expect(202);
      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: second, currentPassword: PASSWORD },
        session,
      ).expect(202);

      /* Only the newest link works — a forwarded older one must not still be
         able to move the account somewhere the person changed their mind
         about. */
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const live = await prisma.authToken.findMany({
        where: { userId: user.id, type: 'EMAIL_CHANGE', consumedAt: null },
      });

      expect(live).toHaveLength(1);
      expect(live[0]!.newEmail).toBe(second);
    });
  });

  describe('confirming the change', () => {
    /** Requests a change and returns the token as the recipient would have it. */
    async function requestChange(email: string, target: string): Promise<string> {
      const session = await signIn(email);

      await send(
        'post',
        '/api/auth/change-email',
        { newEmail: target, currentPassword: PASSWORD },
        session,
      ).expect(202);

      const sent = mail.emailChanges.get(target);
      if (!sent) throw new Error(`No change email captured for ${target}`);

      return sent;
    }

    it('refuses an unknown token', async () => {
      await send('post', '/api/auth/confirm-email-change', { token: 'nope' }).expect(401);
    });

    it('refuses a token issued for something else', async () => {
      const email = await account('em-wrongtype');

      /* A password-reset token is perfectly valid — for resetting a password.
         Presented here it must be refused, and left unconsumed so its own flow
         still works. */
      await send('post', '/api/auth/forgot-password', { email }).expect(202);

      const reset = mail.resets.get(email);
      expect(reset).toBeDefined();

      await send('post', '/api/auth/confirm-email-change', { token: reset! }).expect(401);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const stillLive = await prisma.authToken.findFirst({
        where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
      });
      expect(stillLive).not.toBeNull();
    });

    it('moves the address, and the new one is the one that signs in', async () => {
      const email = await account('em-move');
      const target = `prof-${RUN_ID}-em-move-new@ministry.gov.example`;
      const token = await requestChange(email, target);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      const moved = await prisma.user.findUnique({ where: { email: target } });
      expect(moved).not.toBeNull();
      /* Verified by the act itself: the link only arrives in an inbox the
         person can read, which is the same proof registration asks for. */
      expect(moved!.emailVerifiedAt).not.toBeNull();

      await signIn(target);
      await send('post', '/api/auth/login', { email, password: PASSWORD }).expect(401);
    });

    it('ends every session, because the identifier just changed', async () => {
      const email = await account('em-sessions');
      const target = `prof-${RUN_ID}-em-sessions-new@ministry.gov.example`;
      const session = await signIn(email);
      const token = await requestChange(email, target);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      /* Including the one that asked. Leaving it authenticated against an
         address that no longer exists is the confusing outcome — and if the
         request was not the owner's, this ends the attacker's session too. */
      await get('/api/auth/me', session).expect(401);
    });

    it('will not spend the same token twice', async () => {
      const email = await account('em-reuse');
      const target = `prof-${RUN_ID}-em-reuse-new@ministry.gov.example`;
      const token = await requestChange(email, target);

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

    it('updates Moodle’s email for a provisioned user, and leaves the username stable (D-038 addendum)', async () => {
      const email = await account('em-lms-sync');
      const target = `prof-${RUN_ID}-em-lms-sync-new@ministry.gov.example`;
      const userId = await userIdFor(await signIn(email));

      const provisioned = await lms.provisionUser({
        email,
        fullName: 'موظف مزود',
        externalUserId: userId,
      });
      await prisma.user.update({
        where: { id: userId },
        data: { moodleUserId: provisioned.lmsUserId },
      });

      const token = await requestChange(email, target);
      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      /* The account is still reachable by the *original* address — its
         Moodle username was derived once, at provisioning, and this change
         must not have moved it (D-038 addendum). */
      const byOriginal = await lms.findUserByEmail(email);
      expect(byOriginal?.lmsUserId).toBe(provisioned.lmsUserId);

      /* And not reachable by the new one: no account holds a username
         derived from it, since re-deriving on an email change is exactly
         what D-038 forbids. This is the real adapter's constraint too, not
         a mock-only quirk. */
      expect(await lms.findUserByEmail(target)).toBeNull();
    });

    it('does not touch Moodle for a user who was never provisioned', async () => {
      const email = await account('em-unprovisioned');
      const target = `prof-${RUN_ID}-em-unprovisioned-new@ministry.gov.example`;
      const token = await requestChange(email, target);

      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      /* Never provisioned in the mock at all — if the service had reached
         for moodle.updateUser regardless, there would be a record to find. */
      expect(await lms.findUserByEmail(email)).toBeNull();
      expect(await lms.findUserByEmail(target)).toBeNull();
    });

    it('confirms successfully and audits the failure when Moodle propagation fails', async () => {
      const email = await account('em-lms-fail');
      const target = `prof-${RUN_ID}-em-lms-fail-new@ministry.gov.example`;
      const userId = await userIdFor(await signIn(email));

      /* An id the mock never provisioned — updateUser refuses it exactly as
         a real Moodle would refuse an unknown account, without this test
         having to fabricate an outage. */
      await prisma.user.update({ where: { id: userId }, data: { moodleUserId: 8_888_887 } });

      const token = await requestChange(email, target);

      /* The confirmation itself is unaffected by the LMS refusing — that is
         the whole point of best-effort propagation (§4.12, D-036). */
      await send('post', '/api/auth/confirm-email-change', { token }).expect(200);

      const moved = await prisma.user.findUnique({ where: { email: target } });
      expect(moved).not.toBeNull();

      const failure = await prisma.auditLog.findFirst({
        where: { actorUserId: userId, action: 'PROFILE_LMS_SYNC_FAILED' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(failure).toMatchObject({
        outcome: 'FAILURE',
        targetType: 'user',
        targetId: userId,
        metadata: { field: 'email' },
      });
    });
  });
});
