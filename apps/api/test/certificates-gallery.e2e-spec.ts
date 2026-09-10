import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { CertificateSummary, UnreadNotificationsView } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { CertificateStorageService } from '../src/certificates/certificate-storage.service';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The learner's own certificate gallery, over HTTP (§4.10).
 *
 * Separate from the public verification suite because the properties are
 * opposite ones: that suite proves a route works with **no** session, this one
 * proves these routes work with **only** the right one. The security assertion
 * that matters is that one learner cannot fetch another's certificate — a
 * property no unit test against a fake Prisma can establish, because the whole
 * question is whether the query is scoped.
 *
 * Certificates are inserted with real bytes on disk rather than rendered:
 * issuance has its own coverage, and requiring Chromium here would buy nothing.
 */

const RUN_ID = randomBytes(4).toString('hex');
const PASSWORD = 'a-sufficiently-long-password';

/** Captures the verification token the way reading the mail sink would. */
class EmailCapture {
  verifications = new Map<string, string>();

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.set(to, token);
    return Promise.resolve();
  }
}

describe('Certificate gallery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: CertificateStorageService;
  let emails: EmailCapture;

  let csrfCookie: string;
  let csrfToken: string;
  let ownerSession: string;
  let strangerSession: string;

  let courseId: string;
  let pathId: string;
  let courseCertificateId: string;

  const server = () => app.getHttpServer() as unknown as App;

  function post(path: string, body: Record<string, unknown>, session?: string) {
    return request(server())
      .post(path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  /** Registers, verifies and signs in; returns the session cookie. */
  async function signedInUser(label: string): Promise<string> {
    const email = `gallery-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'موظف تجريبي',
      employeeId: numericEmployeeId(RUN_ID, label),
      department: 'تقنية المعلومات',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    emails = new EmailCapture();

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
    storage = app.get(CertificateStorageService);

    const csrfResponse = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = csrfResponse.headers['set-cookie'] as unknown as string[];
    csrfCookie = cookies.map((value) => value.split(';')[0]).join('; ');
    csrfToken = (csrfResponse.body as { csrfToken: string }).csrfToken;

    ownerSession = await signedInUser('owner');
    strangerSession = await signedInUser('stranger');

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: `gallery-${RUN_ID}-owner@ministry.gov.example` },
      select: { id: true, fullName: true },
    });

    const course = await prisma.course.create({
      data: {
        moodleCourseId: 970000 + Number.parseInt(RUN_ID.slice(0, 4), 16),
        title: 'أساسيات القيادة الإدارية',
        summary: 'دورة اختبار.',
        objectives: [],
      },
    });
    courseId = course.id;

    const path = await prisma.path.create({
      data: {
        key: `gallery-path-${RUN_ID}`,
        name: 'مسار القيادة الإدارية',
        description: 'مسار اختبار.',
        displayOrder: 997,
        status: 'DRAFT',
      },
    });
    pathId = path.id;

    /* Real bytes on disk with a matching digest, so the download path is
       exercised end to end. */
    const bytes = Buffer.from('%PDF-1.4 a stored certificate');
    const relativePath = `test/${RUN_ID}-course.pdf`;
    const stored = await storage.write(relativePath, bytes);

    const certificate = await prisma.certificate.create({
      data: {
        userId: owner.id,
        type: 'COURSE',
        courseId,
        verificationId: randomBytes(32).toString('base64url'),
        pdfPath: relativePath,
        pdfSha256: stored.sha256,
        pdfBytes: stored.bytes,
        holderName: owner.fullName,
        subjectTitle: 'أساسيات القيادة الإدارية',
        issuedAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    });
    courseCertificateId = certificate.id;

    /* A second, newer certificate so ordering is actually observable. */
    const pathBytes = Buffer.from('%PDF-1.4 a stored path certificate');
    const pathPath = `test/${RUN_ID}-path.pdf`;
    const pathStored = await storage.write(pathPath, pathBytes);

    await prisma.certificate.create({
      data: {
        userId: owner.id,
        type: 'PATH',
        pathId,
        verificationId: randomBytes(32).toString('base64url'),
        pdfPath: pathPath,
        pdfSha256: pathStored.sha256,
        pdfBytes: pathStored.bytes,
        holderName: owner.fullName,
        subjectTitle: 'مسار القيادة الإدارية',
        issuedAt: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
  }, 90_000);

  afterAll(async () => {
    const ids = (
      await prisma.user.findMany({
        where: { email: { startsWith: `gallery-${RUN_ID}-` } },
        select: { id: true },
      })
    ).map((user) => user.id);

    if (ids.length > 0) {
      await prisma.certificate.deleteMany({ where: { userId: { in: ids } } });
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.path.deleteMany({ where: { id: pathId } });
    await app.close();
  }, 60_000);

  it('needs a session', async () => {
    await request(server()).get('/api/certificates').expect(401);
    await request(server()).get(`/api/certificates/${courseCertificateId}/file`).expect(401);
  });

  it('lists the learner’s certificates, newest first', async () => {
    const response = await request(server())
      .get('/api/certificates')
      .set('Cookie', ownerSession)
      .expect(200);

    const body = response.body as CertificateSummary[];

    expect(body).toHaveLength(2);
    expect(body.map((row) => row.type)).toEqual(['PATH', 'COURSE']);
    expect(body[0]).toMatchObject({
      type: 'PATH',
      subjectTitle: 'مسار القيادة الإدارية',
      issuedAt: '2026-08-18T09:00:00.000Z',
    });
  });

  it('carries nothing §4.10 did not ask for', async () => {
    /* "title, date earned, view, download. Nothing else" — so no grade, no
       path context, and not even the verification id, which is already printed
       on the certificate the holder is looking at. */
    const response = await request(server())
      .get('/api/certificates')
      .set('Cookie', ownerSession)
      .expect(200);

    const keys = Object.keys((response.body as CertificateSummary[])[0]!).sort();

    expect(keys).toEqual(['id', 'issuedAt', 'subjectTitle', 'type']);
  });

  it('shows a learner only their own certificates', async () => {
    const response = await request(server())
      .get('/api/certificates')
      .set('Cookie', strangerSession)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('refuses to serve one learner’s certificate to another', async () => {
    /*
     * The security property these routes exist to get right, and the reason
     * the query filters on `userId` rather than checking ownership after a
     * lookup. 404 rather than 403: a learner asking for a certificate that is
     * not theirs learns only that they do not have one.
     */
    await request(server())
      .get(`/api/certificates/${courseCertificateId}/file`)
      .set('Cookie', strangerSession)
      .expect(404);
  });

  it('serves the stored PDF inline for viewing', async () => {
    const response = await request(server())
      .get(`/api/certificates/${courseCertificateId}/file`)
      .set('Cookie', ownerSession)
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(
      Buffer.from(response.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
  });

  it('serves the same bytes as an attachment for downloading', async () => {
    const response = await request(server())
      .get(`/api/certificates/${courseCertificateId}/file?disposition=attachment`)
      .set('Cookie', ownerSession)
      .expect(200);

    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.pdf');
  });

  it('keeps a personal document out of shared caches and search indexes', async () => {
    const response = await request(server())
      .get(`/api/certificates/${courseCertificateId}/file`)
      .set('Cookie', ownerSession)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  /* Last, because it deliberately corrupts the stored file. */
  it('refuses bytes that no longer match the digest recorded at issue time', async () => {
    /*
     * Why `pdfSha256` is on the row. Handing someone a credential that has been
     * truncated, corrupted or altered is worse than telling them it is
     * unavailable — a silently wrong certificate is the failure nobody notices.
     */
    const certificate = await prisma.certificate.findUniqueOrThrow({
      where: { id: courseCertificateId },
      select: { pdfPath: true },
    });

    await storage.write(certificate.pdfPath, Buffer.from('%PDF-1.4 tampered'));

    await request(server())
      .get(`/api/certificates/${courseCertificateId}/file`)
      .set('Cookie', ownerSession)
      .expect(500);
  });
  // The in-app indicator (§2)

  describe('the in-app indicator', () => {
    let ownerUserId: string;

    beforeAll(async () => {
      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: `gallery-${RUN_ID}-owner@ministry.gov.example` },
        select: { id: true },
      });
      ownerUserId = owner.id;

      /* Two unseen certificate notifications, the shape issuance writes. */
      await prisma.notification.createMany({
        data: [
          { userId: ownerUserId, type: 'CERTIFICATE_ISSUED', relatedId: courseCertificateId },
          { userId: ownerUserId, type: 'CERTIFICATE_ISSUED', relatedId: courseCertificateId },
        ],
      });
    });

    it('needs a session', async () => {
      await request(server()).get('/api/notifications/unread').expect(401);
    });

    it('reports what the learner has not seen', async () => {
      const response = await request(server())
        .get('/api/notifications/unread')
        .set('Cookie', ownerSession)
        .expect(200);

      expect(response.body as UnreadNotificationsView).toEqual({ certificates: 2 });
    });

    it('does not leak one learner indicator to another', async () => {
      const response = await request(server())
        .get('/api/notifications/unread')
        .set('Cookie', strangerSession)
        .expect(200);

      expect(response.body as UnreadNotificationsView).toEqual({ certificates: 0 });
    });

    it('clears once the learner marks them seen', async () => {
      await request(server())
        .post('/api/notifications/certificates/read')
        .set('Cookie', [csrfCookie, ownerSession].join('; '))
        .set('X-CSRF-Token', csrfToken)
        .expect(204);

      const response = await request(server())
        .get('/api/notifications/unread')
        .set('Cookie', ownerSession)
        .expect(200);

      expect(response.body as UnreadNotificationsView).toEqual({ certificates: 0 });
    });

    it('does not move readAt on rows that were already read', async () => {
      /*
       * The `readAt: null` filter. Without it a second visit would rewrite the
       * timestamps, losing when the learner actually first saw each
       * certificate — the only thing the column records.
       */
      const before = await prisma.notification.findMany({
        where: { userId: ownerUserId },
        select: { id: true, readAt: true },
        orderBy: { id: 'asc' },
      });

      await request(server())
        .post('/api/notifications/certificates/read')
        .set('Cookie', [csrfCookie, ownerSession].join('; '))
        .set('X-CSRF-Token', csrfToken)
        .expect(204);

      const after = await prisma.notification.findMany({
        where: { userId: ownerUserId },
        select: { id: true, readAt: true },
        orderBy: { id: 'asc' },
      });

      expect(after).toEqual(before);
    });

    it('rejects marking read without the CSRF token', async () => {
      /* It changes state, so it carries the double-submit token every mutating
         request does. */
      await request(server())
        .post('/api/notifications/certificates/read')
        .set('Cookie', ownerSession)
        .expect(403);
    });
  });
});
