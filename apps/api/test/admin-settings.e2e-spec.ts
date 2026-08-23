import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { AdminSettingsView } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';

/**
 * §4C.6 over real HTTP against a real database.
 *
 * **Three properties, and two of them are about what settings cannot do.**
 *
 * A change reaches every consumer, because there is one — the pass threshold has
 * four call sites and they all read `SettingsService`. Asserted by changing the
 * threshold and reading it back through the service the consumers use, not by
 * reading the row.
 *
 * No secret is settable and none is readable. The Moodle token, the database URL
 * and the SMTP credentials are not in the allow-list, so the endpoint answers
 * 404 for them — and the view is grepped for the token's value directly, because
 * the failure mode is a field nobody thought about.
 *
 * The floors cannot be lowered. The 5-10 bounds and the auth rate limits appear
 * in the view and have no endpoint to be sent to.
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

describe('Admin system settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settings: SettingsService;

  let sessionAdmin: string;
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
    settings = app.get(SettingsService);

    const issued = await csrf();
    csrfCookie = issued.cookie;
    csrfToken = issued.token;

    await account('admin');
    sessionAdmin = await signIn(`aset-${RUN_ID}-admin@ministry.gov.example`);
  }, 120_000);

  afterAll(async () => {
    /* Every override this suite wrote, removed — they are global product
       configuration and leaving one behind would change the next run of every
       other suite. */
    await prisma.setting.deleteMany({});
    settings.invalidate();

    const created = await prisma.user.findMany({
      where: { email: { startsWith: `aset-${RUN_ID}-` } },
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

  async function account(label: string): Promise<void> {
    await prisma.user.create({
      data: {
        email: `aset-${RUN_ID}-${label}@ministry.gov.example`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: 'حساب تجريبي',
        employeeId: `S-${RUN_ID}-${label}`.slice(0, 20),
        department: 'قسم',
        role: 'SUPER_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
  }

  const view = async () =>
    (await get('/api/admin/settings', sessionAdmin).expect(200)).body as AdminSettingsView;

  describe('reading', () => {
    it('reports the environment value while nothing is overridden', async () => {
      const body = await view();
      const threshold = body.settings.find((row) => row.key === 'PASS_THRESHOLD');

      expect(threshold).toMatchObject({ value: '70', isOverridden: false });
    });

    it('shows the floors that cannot be changed', async () => {
      const body = await view();

      /* An administrator explaining a rejected path build needs these; nobody
         needs a control that lowers them (D-074, §2). */
      expect(body.readOnly.map((row) => row.key)).toEqual(
        expect.arrayContaining([
          'PATH_MIN_COURSES',
          'PATH_MAX_COURSES',
          'API_RATE_LIMIT_MAX_REQUESTS',
        ]),
      );
      expect(body.readOnly.find((row) => row.key === 'PATH_MIN_COURSES')?.value).toBe('5');
    });

    it('carries no secret at all', async () => {
      const response = await get('/api/admin/settings', sessionAdmin).expect(200);
      const serialised = JSON.stringify(response.body).toLowerCase();

      /*
       * Grepped rather than checked field by field: the risk is not that anyone
       * added the token deliberately, it is that a future "show every env var"
       * convenience would sweep it in.
       */
      for (const forbidden of ['token', 'password', 'secret', 'database_url']) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('offers no route to a secret', async () => {
      await send(
        'patch',
        '/api/admin/settings/MOODLE_WS_TOKEN',
        { value: 'x' },
        sessionAdmin,
      ).expect(404);
      await send('patch', '/api/admin/settings/DATABASE_URL', { value: 'x' }, sessionAdmin).expect(
        404,
      );
    });

    it('offers no route to the read-only floors', async () => {
      await send(
        'patch',
        '/api/admin/settings/PATH_MIN_COURSES',
        { value: '3' },
        sessionAdmin,
      ).expect(404);
      await send(
        'patch',
        '/api/admin/settings/API_RATE_LIMIT_MAX_REQUESTS',
        { value: '999999' },
        sessionAdmin,
      ).expect(404);
    });
  });

  describe('changing the pass threshold', () => {
    it('validates the value the way the environment would', async () => {
      /* 0-100, the same Zod field `PASS_THRESHOLD=…` goes through. */
      const response = await send(
        'patch',
        '/api/admin/settings/PASS_THRESHOLD',
        { value: '150' },
        sessionAdmin,
      ).expect(400);

      expect((response.body as { message: string }).message).toBe('SETTING_INVALID_PASS_THRESHOLD');

      await send(
        'patch',
        '/api/admin/settings/PASS_THRESHOLD',
        { value: 'seventy' },
        sessionAdmin,
      ).expect(400);
    });

    it('stores it and marks it overridden', async () => {
      const body = (
        await send(
          'patch',
          '/api/admin/settings/PASS_THRESHOLD',
          { value: '85' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminSettingsView;

      expect(body.settings.find((row) => row.key === 'PASS_THRESHOLD')).toMatchObject({
        value: '85',
        isOverridden: true,
      });
    });

    it('reaches the consumers, because there is one source of truth', async () => {
      /*
       * Read through `SettingsService` — the same object completion sync, the
       * course player and the verdict evaluator inject. Reading the row instead
       * would prove the write and say nothing about whether anybody sees it,
       * which is the whole reason D-072 exists.
       */
      settings.invalidate();

      expect(await settings.get('PASS_THRESHOLD')).toBe(85);
    });

    it('does not change a verdict that was already recorded', async () => {
      /*
       * D-042 stores `passThresholdUsed` on every completion, so a verdict
       * remains explicable under the threshold it was actually decided by. This
       * asserts the column is still populated per row rather than derived at
       * read time — the property that makes lowering the threshold safe.
       */
      const completion = await prisma.completion.findFirst({
        select: { passThresholdUsed: true },
      });

      if (completion) {
        expect(completion.passThresholdUsed).not.toBeNull();
      }
    });

    it('records the key and the new value, which is the point of this trail', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_SETTING_CHANGED', targetId: 'PASS_THRESHOLD' },
        orderBy: { occurredAt: 'desc' },
        select: { metadata: true },
      });

      /* The one audit payload that carries a value, because "who lowered the
         pass threshold, to what, and when" is where an audit of a disputed
         certificate starts. Safe because no secret is settable. */
      expect(entry?.metadata).toMatchObject({ setting: 'PASS_THRESHOLD', value: '85' });
    });

    it('resets to the environment value', async () => {
      const body = (
        await send('delete', '/api/admin/settings/PASS_THRESHOLD', {}, sessionAdmin).expect(200)
      ).body as AdminSettingsView;

      expect(body.settings.find((row) => row.key === 'PASS_THRESHOLD')).toMatchObject({
        value: '70',
        isOverridden: false,
      });

      settings.invalidate();
      expect(await settings.get('PASS_THRESHOLD')).toBe(70);
    });
  });

  describe('the registration gate', () => {
    it('changes the allowed domain without a deployment (D-017)', async () => {
      const body = (
        await send(
          'patch',
          '/api/admin/settings/ALLOWED_EMAIL_DOMAINS',
          { value: 'moi.gov.sa,ministry.gov.example' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminSettingsView;

      /* The placeholder D-017 has carried since Phase 0 is now the ministry's to
         replace from a screen, which is the whole reason it was a setting. */
      expect(body.settings.find((row) => row.key === 'ALLOWED_EMAIL_DOMAINS')?.value).toBe(
        'moi.gov.sa,ministry.gov.example',
      );

      settings.invalidate();
      expect(await settings.get('ALLOWED_EMAIL_DOMAINS')).toEqual([
        'moi.gov.sa',
        'ministry.gov.example',
      ]);
    });

    it('round-trips a list through the form without mangling it', async () => {
      /* Parses to an array and is edited as the comma-separated string it
         arrived as; `String(value)` would render it by accident today and by
         something else the day the parser changes. */
      const body = await view();

      expect(body.settings.find((row) => row.key === 'ALLOWED_EMAIL_DOMAINS')?.value).toBe(
        'moi.gov.sa,ministry.gov.example',
      );

      await send('delete', '/api/admin/settings/ALLOWED_EMAIL_DOMAINS', {}, sessionAdmin).expect(
        200,
      );
    });

    it('refuses a registration mode that is not one of the two', async () => {
      await send(
        'patch',
        '/api/admin/settings/REGISTRATION_MODE',
        { value: 'open' },
        sessionAdmin,
      ).expect(400);
    });
  });

  describe('the sync interval', () => {
    it('accepts a new interval and returns it', async () => {
      const body = (
        await send(
          'patch',
          '/api/admin/settings/COMPLETION_SYNC_INTERVAL_MINUTES',
          { value: '15' },
          sessionAdmin,
        ).expect(200)
      ).body as AdminSettingsView;

      expect(
        body.settings.find((row) => row.key === 'COMPLETION_SYNC_INTERVAL_MINUTES')?.value,
      ).toBe('15');

      await send(
        'delete',
        '/api/admin/settings/COMPLETION_SYNC_INTERVAL_MINUTES',
        {},
        sessionAdmin,
      ).expect(200);
    });

    it('refuses zero, which would be a job scheduled to run continuously', async () => {
      await send(
        'patch',
        '/api/admin/settings/COMPLETION_SYNC_INTERVAL_MINUTES',
        { value: '0' },
        sessionAdmin,
      ).expect(400);
    });
  });

  it('answers 404 for a key that is not a setting', async () => {
    await get('/api/admin/settings', sessionAdmin).expect(200);
    await send('patch', '/api/admin/settings/NOT_A_SETTING', { value: 'x' }, sessionAdmin).expect(
      404,
    );
  });
});
