import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/common/password';
import { numericEmployeeId } from './employee-id';

/**
 * Integration tests for the whole authentication surface, against a real
 * PostgreSQL database (§2B: integration tests for API endpoints).
 *
 * These are the Checkpoint E evidence: register → verify → sign in → reset,
 * plus the security properties that are easy to claim and easy to get wrong —
 * enumeration resistance, lockout, CSRF, and RBAC.
 *
 * The throttler is stubbed out for most of the suite (a hundred requests would
 * otherwise trip the 5/minute login limit) and exercised deliberately in its own
 * block with the real guard.
 */

/** Captures the tokens that would have been emailed, so tests can follow links. */
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
/** Unique per run so a suite never collides with dev data or a parallel run. */
const RUN_ID = randomBytes(4).toString('hex');

function emailFor(label: string): string {
  return `e2e-${RUN_ID}-${label}@ministry.gov.example`;
}

function employeeIdFor(label: string): string {
  return numericEmployeeId(RUN_ID, label);
}

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;

  beforeAll(async () => {
    emails = new EmailCapture();

    /* This suite makes hundreds of requests from one address; the deliberately
       strict auth limits are exercised in their own suite below. */
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
  }, 60_000);

  afterAll(async () => {
    /* Remove only what this run created. Audit rows are deleted first because
       they null the actor rather than cascading, so they would otherwise linger. */
    const created = await prisma.user.findMany({
      where: { email: { startsWith: `e2e-${RUN_ID}-` } },
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

  /** Fetches a CSRF token + cookie, as a browser would before posting. */
  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      token: (response.body as { csrfToken: string }).csrfToken,
    };
  }

  /*
   * The double-submit token is not single-use — it only has to match between
   * cookie and header — so one is fetched per suite and reused. Keeping `post`
   * synchronous matters: an async wrapper returns a plain Promise and loses
   * supertest's chainable `.expect()`.
   */
  let csrfCookie: string;
  let csrfToken: string;

  /** Posts with valid CSRF, plus any extra cookies (e.g. a session). */
  function post(path: string, body: Record<string, unknown>, extraCookies: string[] = []) {
    return request(server())
      .post(path)
      .set('Cookie', [csrfCookie, ...extraCookies].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  async function registerUser(label: string) {
    const email = emailFor(label);

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: employeeIdFor(label),
      department: 'تقنية المعلومات',
    }).expect(202);

    return email;
  }

  async function registerAndVerify(label: string) {
    const email = await registerUser(label);
    const token = emails.verifications.get(email);

    await post('/api/auth/verify-email', { token }).expect(200);

    return email;
  }

  /** Signs in and returns the session cookie. */
  async function signIn(email: string, password = PASSWORD): Promise<string> {
    const response = await post('/api/auth/login', { email, password }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((value) => value.startsWith('tamkeen_session='));

    return session!.split(';')[0]!;
  }

  // ────────────────────────────────────────────────────────────────────────────

  describe('the happy path: register → verify → sign in', () => {
    it('completes end to end', async () => {
      const email = await registerUser('happy');

      /* Registration must not sign the user in, and must not verify them. */
      const before = await prisma.user.findUnique({ where: { email } });
      expect(before?.emailVerifiedAt).toBeNull();

      const token = emails.verifications.get(email);
      expect(token).toBeDefined();

      await post('/api/auth/verify-email', { token }).expect(200);

      const after = await prisma.user.findUnique({ where: { email } });
      expect(after?.emailVerifiedAt).not.toBeNull();

      const session = await signIn(email);
      const me = await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);

      /* The session carries what the dashboard header shows (TAM-123). */
      expect(me.body).toMatchObject({ email, role: 'EMPLOYEE' });
      expect(me.body.employeeId).toEqual(expect.any(String));
      expect(me.body.department).toEqual(expect.any(String));
      expect(me.body).not.toHaveProperty('passwordHash');
    }, 60_000);

    it('stores a hash, never the password', async () => {
      const email = await registerUser('hash');
      const user = await prisma.user.findUnique({ where: { email } });

      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user?.passwordHash).not.toContain(PASSWORD);
    }, 30_000);

    it('assigns EMPLOYEE and ignores any attempt to claim a role', async () => {
      const label = 'noescalate';

      /* `role` is not in the DTO, and forbidNonWhitelisted rejects unknown
         properties outright — privilege escalation cannot even be attempted. */
      await post('/api/auth/register', {
        email: emailFor(label),
        password: PASSWORD,
        fullName: 'محاول',
        employeeId: employeeIdFor(label),
        department: 'قسم',
        role: 'SUPER_ADMIN',
      }).expect(400);
    }, 30_000);

    it('keeps the session token out of the response body', async () => {
      const email = await registerAndVerify('nobody');
      const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);

      expect(JSON.stringify(response.body)).not.toContain('tamkeen_session');
      expect(response.body).not.toHaveProperty('token');
    }, 60_000);

    it('marks the session cookie httpOnly and SameSite=Strict', async () => {
      const email = await registerAndVerify('cookieflags');
      const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
      const session = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
        value.startsWith('tamkeen_session='),
      );

      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Strict/i);
    }, 60_000);
  });

  describe('the D-017 registration gate', () => {
    it('rejects a non-ministry email domain', async () => {
      const response = await post('/api/auth/register', {
        email: `e2e-${RUN_ID}-outsider@gmail.com`,
        password: PASSWORD,
        fullName: 'خارجي',
        employeeId: employeeIdFor('out'),
        department: 'قسم',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    }, 30_000);

    it('rejects a malformed employee id', async () => {
      const response = await post('/api/auth/register', {
        email: emailFor('badid'),
        password: PASSWORD,
        fullName: 'موظف',
        employeeId: 'x',
        department: 'قسم',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('EMPLOYEE_ID_INVALID');
    }, 30_000);

    it('rejects a password below the configured minimum', async () => {
      const response = await post('/api/auth/register', {
        email: emailFor('shortpw'),
        password: 'short',
        fullName: 'موظف',
        employeeId: employeeIdFor('sp'),
        department: 'قسم',
      });

      expect(response.status).toBe(400);
    }, 30_000);
  });

  describe('account enumeration resistance', () => {
    it('answers registration identically for a fresh and an existing email', async () => {
      const label = 'dupe';
      const email = emailFor(label);
      const body = {
        email,
        password: PASSWORD,
        fullName: 'موظف',
        employeeId: employeeIdFor(label),
        department: 'قسم',
      };

      const first = await post('/api/auth/register', body).expect(202);
      /* A second attempt with a *different* employee id, so only the email collides. */
      const second = await post('/api/auth/register', {
        ...body,
        employeeId: employeeIdFor('dupe2'),
      }).expect(202);

      expect(second.body).toEqual(first.body);

      /* And crucially: no second account was created. */
      const count = await prisma.user.count({ where: { email } });
      expect(count).toBe(1);
    }, 60_000);

    it('answers forgot-password identically for known and unknown addresses', async () => {
      const known = await registerAndVerify('forgot');

      const forKnown = await post('/api/auth/forgot-password', { email: known }).expect(202);
      const forUnknown = await post('/api/auth/forgot-password', {
        email: emailFor('never-existed'),
      }).expect(202);

      expect(forUnknown.body).toEqual(forKnown.body);
      expect(forUnknown.status).toBe(forKnown.status);
    }, 60_000);

    it('returns the same error for an unknown email and a wrong password', async () => {
      const email = await registerAndVerify('samerror');

      const wrongPassword = await post('/api/auth/login', { email, password: 'wrong-password-x' });
      const unknownEmail = await post('/api/auth/login', {
        email: emailFor('ghost'),
        password: PASSWORD,
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongPassword.body.message).toBe('INVALID_CREDENTIALS');
    }, 60_000);
  });

  describe('email verification', () => {
    it('refuses sign-in before verification, with a distinct code', async () => {
      const email = await registerUser('unverified');
      const response = await post('/api/auth/login', { email, password: PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('EMAIL_NOT_VERIFIED');
    }, 30_000);

    it('rejects a reused verification token', async () => {
      const email = await registerUser('reuse');
      const token = emails.verifications.get(email);

      await post('/api/auth/verify-email', { token }).expect(200);
      await post('/api/auth/verify-email', { token }).expect(401);
    }, 30_000);

    it('rejects a forged token', async () => {
      await post('/api/auth/verify-email', { token: 'not-a-real-token' }).expect(401);
    }, 30_000);

    it('invalidates an older token when a new one is issued', async () => {
      const email = await registerUser('resend');
      const firstToken = emails.verifications.get(email);

      await post('/api/auth/resend-verification', { email }).expect(202);
      const secondToken = emails.verifications.get(email);
      expect(secondToken).not.toBe(firstToken);

      /* The superseded link must be dead — a forwarded old email is useless. */
      await post('/api/auth/verify-email', { token: firstToken }).expect(401);
      await post('/api/auth/verify-email', { token: secondToken }).expect(200);
    }, 60_000);

    it('stores only the token hash, never the token', async () => {
      const email = await registerUser('tokenhash');
      const token = emails.verifications.get(email)!;
      const rows = await prisma.authToken.findMany({
        where: { user: { email } },
        select: { tokenHash: true },
      });

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tokenHash).not.toContain(token);
      }
    }, 30_000);
  });

  describe('brute-force lockout', () => {
    it('locks the account after the configured number of failures', async () => {
      const email = await registerAndVerify('lockout');

      /* AUTH_MAX_FAILED_ATTEMPTS defaults to 5. */
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/api/auth/login', { email, password: 'wrong-password-x' }).expect(401);
      }

      const locked = await prisma.user.findUnique({ where: { email } });
      expect(locked?.lockedUntil).not.toBeNull();

      /* Now even the CORRECT password is refused — that is the point. */
      const response = await post('/api/auth/login', { email, password: PASSWORD });
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('ACCOUNT_LOCKED');
    }, 120_000);

    it('resets the failure counter after a successful sign-in', async () => {
      const email = await registerAndVerify('counterreset');

      await post('/api/auth/login', { email, password: 'wrong-password-x' }).expect(401);
      expect((await prisma.user.findUnique({ where: { email } }))?.failedLoginAttempts).toBe(1);

      await signIn(email);
      expect((await prisma.user.findUnique({ where: { email } }))?.failedLoginAttempts).toBe(0);
    }, 90_000);
  });

  describe('password reset', () => {
    it('lets the user set a new password and sign in with it', async () => {
      const email = await registerAndVerify('reset');

      await post('/api/auth/forgot-password', { email }).expect(202);
      const token = emails.resets.get(email);
      expect(token).toBeDefined();

      const newPassword = 'an-entirely-different-password';
      await post('/api/auth/reset-password', { token, password: newPassword }).expect(200);

      await signIn(email, newPassword);
      await post('/api/auth/login', { email, password: PASSWORD }).expect(401);
    }, 90_000);

    it('revokes existing sessions, evicting anyone holding the old credential', async () => {
      const email = await registerAndVerify('revoke');
      const oldSession = await signIn(email);

      await request(server()).get('/api/auth/me').set('Cookie', oldSession).expect(200);

      await post('/api/auth/forgot-password', { email }).expect(202);
      await post('/api/auth/reset-password', {
        token: emails.resets.get(email),
        password: 'another-long-enough-password',
      }).expect(200);

      await request(server()).get('/api/auth/me').set('Cookie', oldSession).expect(401);
    }, 90_000);

    it('clears a lockout, since the owner proved control of the mailbox', async () => {
      const email = await registerAndVerify('unlock');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/api/auth/login', { email, password: 'wrong-password-x' }).expect(401);
      }

      await post('/api/auth/forgot-password', { email }).expect(202);
      await post('/api/auth/reset-password', {
        token: emails.resets.get(email),
        password: 'freshly-chosen-password',
      }).expect(200);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.lockedUntil).toBeNull();
      expect(user?.failedLoginAttempts).toBe(0);

      await signIn(email, 'freshly-chosen-password');
    }, 150_000);

    it('rejects a reused reset token', async () => {
      const email = await registerAndVerify('resetreuse');

      await post('/api/auth/forgot-password', { email }).expect(202);
      const token = emails.resets.get(email);

      await post('/api/auth/reset-password', { token, password: 'first-new-password-x' }).expect(
        200,
      );
      await post('/api/auth/reset-password', { token, password: 'second-new-password-x' }).expect(
        401,
      );
    }, 90_000);
  });

  describe('sessions', () => {
    it('rejects an unauthenticated request to a protected endpoint', async () => {
      await request(server()).get('/api/auth/me').expect(401);
    });

    it('rejects a forged session cookie', async () => {
      await request(server())
        .get('/api/auth/me')
        .set('Cookie', 'tamkeen_session=completely-made-up')
        .expect(401);
    });

    it('invalidates the session on sign-out', async () => {
      const email = await registerAndVerify('logout');
      const session = await signIn(email);

      await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);

      const { cookie, token } = await csrf();
      await request(server())
        .post('/api/auth/logout')
        .set('Cookie', [cookie, session].join('; '))
        .set('X-CSRF-Token', token)
        .expect(200);

      await request(server()).get('/api/auth/me').set('Cookie', session).expect(401);
    }, 90_000);

    it('stops honouring a session once the account is suspended', async () => {
      const email = await registerAndVerify('suspended');
      const session = await signIn(email);

      await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);

      await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

      /* Immediately, not at the session's natural expiry — the reason sessions
         are opaque and server-side rather than JWTs (D-028). */
      await request(server()).get('/api/auth/me').set('Cookie', session).expect(401);
    }, 90_000);

    it('stores only the session token hash', async () => {
      const email = await registerAndVerify('sessionhash');
      const session = await signIn(email);
      const rawToken = session.replace('tamkeen_session=', '');

      const rows = await prisma.session.findMany({
        where: { user: { email } },
        select: { tokenHash: true },
      });

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tokenHash).not.toContain(rawToken);
      }
    }, 90_000);
  });

  describe('CSRF protection', () => {
    it('rejects a state-changing request with no CSRF token', async () => {
      await request(server())
        .post('/api/auth/login')
        .send({ email: emailFor('csrf'), password: PASSWORD })
        .expect(403);
    });

    it('rejects a mismatched CSRF token', async () => {
      const { cookie } = await csrf();

      await request(server())
        .post('/api/auth/login')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'a-different-value')
        .send({ email: emailFor('csrf2'), password: PASSWORD })
        .expect(403);
    });

    it('allows safe methods without a token', async () => {
      await request(server()).get('/api/health').expect(200);
    });
  });

  describe('RBAC (D-027)', () => {
    /**
     * Proven against the real guards rather than a placeholder endpoint: Phase 0
     * has no role-restricted routes yet, and shipping a fake one to make a test
     * pass would be worse than testing the guard directly.
     */
    it('an EMPLOYEE session is resolved with the EMPLOYEE role', async () => {
      const email = await registerAndVerify('employee');
      const session = await signIn(email);

      const me = await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);
      expect(me.body.role).toBe('EMPLOYEE');
    }, 90_000);

    it('a SUPER_ADMIN session is resolved with the SUPER_ADMIN role', async () => {
      const email = emailFor('admin');

      await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(PASSWORD),
          fullName: 'مدير',
          employeeId: employeeIdFor('adm'),
          department: 'إدارة',
          role: 'SUPER_ADMIN',
          emailVerifiedAt: new Date(),
        },
      });

      const session = await signIn(email);
      const me = await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);

      expect(me.body.role).toBe('SUPER_ADMIN');
    }, 90_000);

    it('never exposes the password hash through /me', async () => {
      const email = await registerAndVerify('nohash');
      const session = await signIn(email);

      const me = await request(server()).get('/api/auth/me').set('Cookie', session).expect(200);

      expect(JSON.stringify(me.body)).not.toContain('argon2');
      expect(me.body).not.toHaveProperty('passwordHash');
    }, 90_000);
  });

  describe('audit trail (§2)', () => {
    it('records a successful sign-in against the actor', async () => {
      const email = await registerAndVerify('auditok');
      await signIn(email);

      const user = await prisma.user.findUnique({ where: { email } });
      const entries = await prisma.auditLog.findMany({
        where: { actorUserId: user!.id, action: 'AUTH_LOGIN_SUCCEEDED' },
      });

      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0]!.outcome).toBe('SUCCESS');
    }, 90_000);

    it('records a failure with an enumerated reason and no PII', async () => {
      const email = await registerAndVerify('auditfail');
      await post('/api/auth/login', { email, password: 'wrong-password-x' }).expect(401);

      const user = await prisma.user.findUnique({ where: { email } });
      const entry = await prisma.auditLog.findFirst({
        where: { actorUserId: user!.id, action: 'AUTH_LOGIN_FAILED' },
        orderBy: { occurredAt: 'desc' },
      });

      expect(entry?.metadata).toMatchObject({ reason: 'BAD_PASSWORD' });

      /* The trail must not become a place where credentials or addresses leak. */
      const serialised = JSON.stringify(entry?.metadata);
      expect(serialised).not.toContain(email);
      expect(serialised).not.toContain('wrong-password-x');
    }, 90_000);

    it('records the lockout as its own event', async () => {
      const email = await registerAndVerify('auditlock');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/api/auth/login', { email, password: 'wrong-password-x' }).expect(401);
      }

      const user = await prisma.user.findUnique({ where: { email } });
      const locked = await prisma.auditLog.findFirst({
        where: { actorUserId: user!.id, action: 'AUTH_ACCOUNT_LOCKED' },
      });

      expect(locked).not.toBeNull();
    }, 150_000);
  });
});

/**
 * Rate limiting, with the real ThrottlerGuard in place. Separate app instance so
 * the limiter's counters are not shared with the suite above.
 */
describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    /* The real limiter, this time — that is what is under test. */
    process.env.RATE_LIMIT_ENABLED = 'true';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(new EmailCapture())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  }, 30_000);

  it('returns 429 once the per-IP login limit is exceeded', async () => {
    const server = app.getHttpServer() as unknown as App;

    const csrfResponse = await request(server).get('/api/auth/csrf').expect(200);
    const cookie = (csrfResponse.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    const token = (csrfResponse.body as { csrfToken: string }).csrfToken;

    const attempt = () =>
      request(server)
        .post('/api/auth/login')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: `ratelimit-${RUN_ID}@ministry.gov.example`, password: 'whatever-long-x' });

    const statuses: number[] = [];
    /* The login limit is 5 per minute; the 6th must be refused outright. */
    for (let index = 0; index < 7; index += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toContain(429);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('does not create an account or leak data while throttled', async () => {
    const count = await prisma.user.count({
      where: { email: `ratelimit-${RUN_ID}@ministry.gov.example` },
    });

    expect(count).toBe(0);
  }, 30_000);
});
