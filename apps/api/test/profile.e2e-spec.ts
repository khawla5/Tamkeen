import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * §4.12's two deferred items, over real HTTP against a real database.
 *
 * **The password change is the security-carrying half.** A session cookie is
 * enough to *be* the user, so the current password is the only thing standing
 * between an unlocked machine and a permanent account takeover — and the change
 * has to end the other sessions, or a password changed *because* it may be known
 * elsewhere leaves whoever knew it still signed in.
 *
 * **The preference is the harmless half, and must stay that way.** It is written
 * by the same person it describes and read only by the formatting layer, so the
 * assertions here are about the null case: "no preference" and "prefers Western"
 * have to stay distinguishable, or the ministry can never change the default for
 * anybody without overwriting a choice.
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

describe('Profile — password and preferences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  /** A fresh account per test, so a password change in one cannot reach another. */
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
});
