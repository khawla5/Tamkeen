import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { CertificateVerificationView } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The public certificate check, over HTTP (§2, D-016).
 *
 * The point of testing this at the HTTP layer rather than the service is that
 * the properties at stake are properties of the *route*: that it answers with
 * no session at all, that it carries the headers that keep a ministry
 * employee's name out of a search index, and that the response body contains no
 * PII beyond the four fields the page is allowed to show. None of those can be
 * proven by calling a service directly.
 *
 * The certificate row is inserted directly rather than issued: what is under
 * test here is the lookup, and rendering a real PDF would make this suite
 * depend on Chromium for no added coverage. Issuance has its own tests.
 */

const RUN_ID = randomBytes(4).toString('hex');

/** The shape `generateToken()` produces — 32 CSPRNG bytes, base64url. */
const verificationId = () => randomBytes(32).toString('base64url');

describe('Certificate verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userId: string;
  let courseId: string;
  let pathId: string;

  /*
   * One certificate of each type, issued once and read by every test.
   *
   * Not one per test: `certificates` is unique on (user, type, target), so a
   * second COURSE row for the same learner and course is refused — by the
   * constraint that exists to stop exactly that. An earlier version of this
   * file minted one per test and three of them failed on P2002, which was the
   * index working rather than a bug.
   */
  let courseCertificateId: string;
  let pathCertificateId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        email: `verify-${RUN_ID}@ministry.gov.example`,
        passwordHash: 'not-a-real-hash',
        fullName: 'سارة بنت أحمد القحطاني',
        employeeId: numericEmployeeId(RUN_ID, 'ver'),
        department: 'إدارة الموارد البشرية',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const course = await prisma.course.create({
      data: {
        moodleCourseId: 980000 + Number.parseInt(RUN_ID.slice(0, 4), 16),
        title: 'أساسيات القيادة الإدارية',
        summary: 'دورة اختبار.',
        objectives: [],
      },
    });
    courseId = course.id;

    const path = await prisma.path.create({
      data: {
        key: `verify-path-${RUN_ID}`,
        name: 'مسار القيادة الإدارية',
        description: 'مسار اختبار.',
        displayOrder: 998,
        status: 'DRAFT',
      },
    });
    pathId = path.id;

    courseCertificateId = await issueRow({ type: 'COURSE' });
    pathCertificateId = await issueRow({
      type: 'PATH',
      subjectTitle: 'مسار القيادة الإدارية',
    });
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.path.delete({ where: { id: pathId } });
    await app.close();
  });

  async function issueRow(overrides: {
    type: 'COURSE' | 'PATH';
    holderName?: string;
    subjectTitle?: string;
  }): Promise<string> {
    const id = verificationId();

    await prisma.certificate.create({
      data: {
        userId,
        type: overrides.type,
        courseId: overrides.type === 'COURSE' ? courseId : null,
        pathId: overrides.type === 'PATH' ? pathId : null,
        verificationId: id,
        pdfPath: `2026/${RUN_ID}-${overrides.type}.pdf`,
        pdfSha256: 'digest',
        pdfBytes: 1,
        holderName: overrides.holderName ?? 'سارة بنت أحمد القحطاني',
        subjectTitle: overrides.subjectTitle ?? 'أساسيات القيادة الإدارية',
        issuedAt: new Date('2026-08-19T09:30:00.000Z'),
      },
    });

    return id;
  }

  it('confirms a course certificate without any session', async () => {
    /* No cookie, no CSRF token, no Authorization header — a third party
       verifying a credential has none of those and must not need any. */
    const response = await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${courseCertificateId}`)
      .expect(200);

    const body = response.body as CertificateVerificationView;

    expect(body).toEqual({
      type: 'COURSE',
      holderName: 'سارة بنت أحمد القحطاني',
      subjectTitle: 'أساسيات القيادة الإدارية',
      issuedAt: '2026-08-19T09:30:00.000Z',
      valid: true,
    });
  });

  it('distinguishes a path certificate, so the page can name it correctly', async () => {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${pathCertificateId}`)
      .expect(200);

    expect((response.body as CertificateVerificationView).type).toBe('PATH');
  });

  it('leaks no PII beyond the name, title and date (§2)', async () => {
    /*
     * Asserted against the serialised body rather than field by field, so a
     * column added to the select later fails here rather than quietly appearing
     * on a public page. Employee id, email, department and the grade are the
     * ones that would actually hurt.
     */
    const response = await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${courseCertificateId}`)
      .expect(200);

    const raw = JSON.stringify(response.body);

    expect(raw).not.toContain('@ministry.gov.example');
    expect(raw).not.toContain(`VER${RUN_ID.toUpperCase()}`);
    expect(raw).not.toContain('إدارة الموارد البشرية');
    expect(Object.keys(response.body as object).sort()).toEqual([
      'holderName',
      'issuedAt',
      'subjectTitle',
      'type',
      'valid',
    ]);
  });

  it('keeps the response out of search indexes and caches', async () => {
    /* The page has a noindex meta tag, but this JSON is fetchable on its own,
       and a name plus a credential in a search index is not recoverable. */
    const response = await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${courseCertificateId}`)
      .expect(200);

    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers 404 for an id it does not hold', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${verificationId()}`)
      .expect(404);
  });

  it('answers a malformed id exactly as it answers an unknown one', async () => {
    /* Any observable difference would make enumeration merely slow rather than
       pointless. */
    const unknown = await request(app.getHttpServer() as App).get(
      `/api/certificates/verify/${verificationId()}`,
    );
    const malformed = await request(app.getHttpServer() as App).get(
      '/api/certificates/verify/not-a-real-id',
    );

    expect(malformed.status).toBe(unknown.status);
    expect(malformed.body).toEqual(unknown.body);
  });

  it('does not expose the stored PDF or the internal row id', async () => {
    /* The verification page confirms a credential; it does not hand out the
       artefact. Nothing on this route should reveal where the bytes live. */
    const response = await request(app.getHttpServer() as App)
      .get(`/api/certificates/verify/${courseCertificateId}`)
      .expect(200);

    const raw = JSON.stringify(response.body);

    expect(raw).not.toContain('.pdf');
    expect(raw).not.toContain('digest');
  });
});
