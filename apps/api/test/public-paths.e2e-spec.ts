import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PublicPathSummary } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * `GET /api/public/paths` over real HTTP against a real database (TAM-150).
 *
 * **This is the only route in the product an anonymous caller may read that is
 * not a certificate verification**, so the suite is written as an exposure
 * test rather than a feature test: what comes back with no cookie at all, and
 * what must never be in it.
 *
 * The unit spec covers the caching and the ordering; what can only be proven
 * here is that the global session guard really does let this through — it is
 * fail-closed by default, so `@Public()` working is a property of the running
 * application, not of the controller in isolation.
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

describe('Public paths (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  }, 120_000);

  afterAll(async () => {
    await app.close();
  }, 60_000);

  const server = () => app.getHttpServer() as unknown as App;

  /* No cookie, no header, nothing — the way a visitor arrives. */
  const anonymous = () => request(server()).get('/api/public/paths');

  it('answers an anonymous caller rather than 401', async () => {
    const response = await anonymous().expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect((response.body as PublicPathSummary[]).length).toBeGreaterThan(0);
  });

  it('carries only what a visitor may know', async () => {
    const [path] = (await anonymous().expect(200)).body as PublicPathSummary[];

    expect(Object.keys(path!).sort()).toEqual([
      'courseCount',
      'description',
      'id',
      'name',
      'riasecLetter',
      'skillOutcomes',
      'typicalDurationMinutes',
    ]);

    /* The catalogue itself stays behind the session: how much choice a path
       offers is public, which courses it holds is not. */
    const body = JSON.stringify((await anonymous().expect(200)).body);
    expect(body).not.toContain('moodleCourseId');
    expect(body).not.toContain('"key"');
  });

  it('describes every seeded path, with the outcomes the explorer renders', async () => {
    const paths = (await anonymous().expect(200)).body as PublicPathSummary[];

    /* The front page is the one screen where empty content is visible to
       somebody who has not signed in, so the seed has to carry real text. */
    expect(paths.every((path) => path.description.length > 40)).toBe(true);
    expect(paths.every((path) => path.skillOutcomes.length >= 3)).toBe(true);
    expect(paths.every((path) => path.courseCount > 0)).toBe(true);
  });

  it('offers only active paths', async () => {
    const paths = (await anonymous().expect(200)).body as PublicPathSummary[];
    const active = await prisma.path.count({ where: { isActive: true } });

    expect(paths).toHaveLength(active);
  });

  it('is cacheable by a proxy, so the front page is not a database query', async () => {
    const response = await anonymous().expect(200);

    expect(response.headers['cache-control']).toContain('max-age=');
    expect(response.headers['cache-control']).toContain('public');
  });

  it('exposes no other verb', async () => {
    /* Read-only by construction: Nest has no route for these, so they 404 —
       which is what "there is no write path" looks like from outside. */
    await request(server()).post('/api/public/paths').send({}).expect(404);
    await request(server()).patch('/api/public/paths').send({}).expect(404);
    await request(server()).delete('/api/public/paths').expect(404);
  });

  it('still refuses the authenticated catalogue to an anonymous caller', async () => {
    /* The point of the boundary: one public read does not open the rest. */
    await request(server()).get('/api/paths').expect(401);
    await request(server()).get('/api/courses').expect(401);
  });
});
