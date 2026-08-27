import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';

import { CV_MAX_SKILLS, type CvView } from '@tamkeen/types';

import { AppModule } from '../src/app.module';
import { PdfRendererService } from '../src/certificates/pdf-renderer.service';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { numericEmployeeId } from './employee-id';

/**
 * The CV builder over HTTP (§4.11, D-050).
 *
 * Two things can only be proven here. That the **bounds are enforced by the
 * server**, not merely by the form — §2B requires product rules on both sides,
 * and a JSON column is exactly where an unvalidated shape stops being obvious.
 * And that a learner **cannot post themselves a certification**: the DTO does
 * not declare the system-known fields, so the global pipe rejects them rather
 * than quietly storing them.
 */

const RUN_ID = randomBytes(4).toString('hex');
const PASSWORD = 'a-sufficiently-long-password';

class EmailCapture {
  verifications = new Map<string, string>();

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.set(to, token);
    return Promise.resolve();
  }
}

/** Captures what the PDF pipeline was asked to render. See the export suite. */
class RendererStub {
  lastHtml: string | null = null;
  lastLandscape: boolean | null = null;

  render(html: string, options: { landscape: boolean }): Promise<Buffer> {
    this.lastHtml = html;
    this.lastLandscape = options.landscape;
    return Promise.resolve(Buffer.from('%PDF-1.4 stub'));
  }

  reset(): void {
    this.lastHtml = null;
    this.lastLandscape = null;
  }
}

const BASE_CV = {
  fullName: 'Abdullah Al-Damati',
  jobTitle: 'Training Officer',
  department: 'إدارة الموارد البشرية',
  email: 'abdullah@ministry.gov.example',
  phone: '',
  summary: 'Training officer with seven years in the public sector.',
  experience: [
    {
      id: 'exp-1',
      role: 'Training Officer',
      organization: 'وزارة الداخلية',
      startDate: '2021-03',
      endDate: null,
      description: 'Designed internal development programmes.',
    },
  ],
  education: [
    {
      id: 'edu-1',
      qualification: 'BSc, Business Administration',
      institution: 'جامعة الملك سعود',
      startYear: 2013,
      endYear: 2017,
    },
  ],
  skills: ['Curriculum design', 'Moodle administration'],
  externalCertifications: [
    { id: 'ext-1', title: 'Project Management Professional', issuer: 'PMI', issuedOn: '2024-11' },
  ],
  showCareerProfile: true,
};

describe('CV builder (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emails: EmailCapture;
  let renderer: RendererStub;

  let csrfCookie: string;
  let csrfToken: string;
  let ownerSession: string;
  let strangerSession: string;
  let ownerUserId: string;
  let courseId: string;

  const server = () => app.getHttpServer() as unknown as App;

  function post(path: string, body: Record<string, unknown>, session?: string) {
    return request(server())
      .post(path)
      .set('Cookie', [csrfCookie, ...(session ? [session] : [])].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  function put(path: string, body: Record<string, unknown>, session: string) {
    return request(server())
      .put(path)
      .set('Cookie', [csrfCookie, session].join('; '))
      .set('X-CSRF-Token', csrfToken)
      .send(body);
  }

  async function signedInUser(label: string): Promise<string> {
    const email = `cv-${RUN_ID}-${label}@ministry.gov.example`;

    await post('/api/auth/register', {
      email,
      password: PASSWORD,
      fullName: 'عبدالله بن محمد الدماطي',
      employeeId: numericEmployeeId(RUN_ID, label),
      department: 'إدارة الموارد البشرية',
    }).expect(202);

    await post('/api/auth/verify-email', { token: emails.verifications.get(email) }).expect(200);

    const response = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];

    return cookies.find((value) => value.startsWith('tamkeen_session='))!.split(';')[0]!;
  }

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    emails = new EmailCapture();
    renderer = new RendererStub();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(emails)
      .overrideProvider(PdfRendererService)
      .useValue(renderer)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const csrfResponse = await request(server()).get('/api/auth/csrf').expect(200);
    const cookies = csrfResponse.headers['set-cookie'] as unknown as string[];
    csrfCookie = cookies.map((value) => value.split(';')[0]).join('; ');
    csrfToken = (csrfResponse.body as { csrfToken: string }).csrfToken;

    ownerSession = await signedInUser('owner');
    strangerSession = await signedInUser('stranger');

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: `cv-${RUN_ID}-owner@ministry.gov.example` },
      select: { id: true, fullName: true },
    });
    ownerUserId = owner.id;

    const course = await prisma.course.create({
      data: {
        moodleCourseId: 960000 + Number.parseInt(RUN_ID.slice(0, 4), 16),
        title: 'أساسيات القيادة الإدارية',
        summary: 'دورة اختبار.',
        objectives: [],
      },
    });
    courseId = course.id;

    await prisma.certificate.create({
      data: {
        userId: ownerUserId,
        type: 'COURSE',
        courseId,
        verificationId: randomBytes(32).toString('base64url'),
        pdfPath: `test/${RUN_ID}-cv.pdf`,
        pdfSha256: 'digest',
        pdfBytes: 1,
        holderName: owner.fullName,
        subjectTitle: 'أساسيات القيادة الإدارية',
        issuedAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    });
  }, 90_000);

  afterAll(async () => {
    const ids = (
      await prisma.user.findMany({
        where: { email: { startsWith: `cv-${RUN_ID}-` } },
        select: { id: true },
      })
    ).map((user) => user.id);

    if (ids.length > 0) {
      await prisma.cvProfile.deleteMany({ where: { userId: { in: ids } } });
      await prisma.certificate.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.course.deleteMany({ where: { id: courseId } });
    await app.close();
  }, 60_000);

  it('needs a session', async () => {
    await request(server()).get('/api/cv').expect(401);

    /*
     * With the CSRF token but no session — the guards run cheapest-first
     * (throttle, CSRF, session), so a bare PUT is refused as 403 before
     * authentication is even considered. Supplying the token is what makes
     * this assert the *session* requirement rather than re-testing CSRF, which
     * the last case in this file covers on its own.
     */
    await request(server())
      .put('/api/cv')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send(BASE_CV)
      .expect(401);
  });

  it('hands a new learner a pre-filled document (§4.11)', async () => {
    const response = await request(server())
      .get('/api/cv')
      .set('Cookie', strangerSession)
      .expect(200);

    const view = response.body as CvView;

    expect(view.savedAt).toBeNull();
    expect(view.profile.fullName).toBe('عبدالله بن محمد الدماطي');
    expect(view.profile.department).toBe('إدارة الموارد البشرية');
    expect(view.autofill.certifications).toEqual([]);
  });

  it('lists the learner’s real certificates without them typing anything', async () => {
    /* The CV's core value: the certifications section is not self-reported. */
    const response = await request(server()).get('/api/cv').set('Cookie', ownerSession).expect(200);

    const view = response.body as CvView;

    expect(view.autofill.certifications).toHaveLength(1);
    expect(view.autofill.certifications[0]).toMatchObject({
      type: 'COURSE',
      title: 'أساسيات القيادة الإدارية',
    });
  });

  it('saves what the learner authored and reads it back', async () => {
    const saved = await put('/api/cv', BASE_CV, ownerSession).expect(200);
    const view = saved.body as CvView;

    expect(view.profile.jobTitle).toBe('Training Officer');
    expect(view.profile.experience).toHaveLength(1);
    expect(view.savedAt).not.toBeNull();

    const reloaded = await request(server()).get('/api/cv').set('Cookie', ownerSession).expect(200);

    expect((reloaded.body as CvView).profile.skills).toEqual([
      'Curriculum design',
      'Moodle administration',
    ]);
  });

  it('keeps one CV per learner however many times they save', async () => {
    await put('/api/cv', { ...BASE_CV, jobTitle: 'Senior Officer' }, ownerSession).expect(200);
    await put('/api/cv', { ...BASE_CV, jobTitle: 'Lead Officer' }, ownerSession).expect(200);

    const rows = await prisma.cvProfile.count({ where: { userId: ownerUserId } });
    expect(rows).toBe(1);

    const view = (await request(server()).get('/api/cv').set('Cookie', ownerSession))
      .body as CvView;
    expect(view.profile.jobTitle).toBe('Lead Officer');
  });

  it('does not show one learner another’s CV', async () => {
    const response = await request(server())
      .get('/api/cv')
      .set('Cookie', strangerSession)
      .expect(200);

    expect((response.body as CvView).profile.jobTitle).toBe('');
    expect((response.body as CvView).savedAt).toBeNull();
  });

  it('refuses a body claiming a certification', async () => {
    /*
     * The security property. Certifications are read from `certificates`, so
     * the DTO does not declare them — and `forbidNonWhitelisted` turns an
     * attempt to send them into a 400 rather than something silently dropped.
     */
    await put(
      '/api/cv',
      { ...BASE_CV, certifications: [{ title: 'Invented Certificate' }] },
      ownerSession,
    ).expect(400);
  });

  it('refuses a body claiming a career profile', async () => {
    await put(
      '/api/cv',
      { ...BASE_CV, careerProfile: { pathName: 'مسار مخترع', hollandCode: ['S'] } },
      ownerSession,
    ).expect(400);
  });

  it('enforces the section bounds server-side, not just in the form (§2B)', async () => {
    const tooManySkills = Array.from({ length: CV_MAX_SKILLS + 1 }, (_, i) => `skill-${i}`);

    await put('/api/cv', { ...BASE_CV, skills: tooManySkills }, ownerSession).expect(400);
  });

  it('rejects a date it could not format', async () => {
    /* Dates go through `format.ts` (D-018), which needs `YYYY-MM` rather than
       whatever a text field would accept. */
    await put(
      '/api/cv',
      {
        ...BASE_CV,
        experience: [{ ...BASE_CV.experience[0], startDate: 'March 2021' }],
      },
      ownerSession,
    ).expect(400);
  });

  it('accepts a current role, which has no end date', async () => {
    const response = await put(
      '/api/cv',
      { ...BASE_CV, experience: [{ ...BASE_CV.experience[0], endDate: null }] },
      ownerSession,
    ).expect(200);

    expect((response.body as CvView).profile.experience[0]!.endDate).toBeNull();
  });

  it('rejects an oversized summary', async () => {
    await put('/api/cv', { ...BASE_CV, summary: 'x'.repeat(5000) }, ownerSession).expect(400);
  });

  it('requires the CSRF token to save', async () => {
    await request(server()).put('/api/cv').set('Cookie', ownerSession).send(BASE_CV).expect(403);
  });
  describe('the PDF export (§4.11)', () => {
    /*
     * The renderer is stubbed here, and the reason is a constraint rather than
     * a preference: Puppeteer 25 is ESM-only and Jest's CommonJS runtime cannot
     * load it, which is the same reason `PdfRendererService` imports it lazily
     * in the first place. The *real* render is proven where it can be — against
     * the built API in the browser end-to-end suite, and by the spike script
     * against a real Chromium.
     *
     * What a stub proves better than a real render, though, is the **contract**:
     * exactly what HTML the pipeline is handed. A failure in these assertions
     * is a document defect; a failure in Chromium is an environment one, and
     * conflating them makes both harder to read.
     */
    it('needs a session', async () => {
      await request(server()).get('/api/cv/export').expect(401);
    });

    it('serves the PDF as an attachment, uncached and unindexed', async () => {
      await put('/api/cv', BASE_CV, ownerSession).expect(200);

      const response = await request(server())
        .get('/api/cv/export')
        .set('Cookie', ownerSession)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      /* An ASCII slug of the name, or `cv.pdf` — never a raw Arabic filename,
         which needs RFC 5987 encoding not every client handles. */
      expect(response.headers['content-disposition']).toMatch(/filename="cv[a-z0-9-]*\.pdf"/);
      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    });

    it('hands the pipeline an English LTR document with the typeface embedded', async () => {
      await put('/api/cv', BASE_CV, ownerSession).expect(200);
      renderer.reset();

      await request(server()).get('/api/cv/export').set('Cookie', ownerSession).expect(200);

      const html = renderer.lastHtml!;

      expect(html).toContain('<html lang="en" dir="ltr">');
      /* A container has no Arabic system font; an unembedded face degrades to
         tofu or to unshaped letters, not to something merely different. */
      expect(html).toContain('data:font/woff2;base64,');
      expect(html).not.toMatch(/https?:\/\/fonts\./);
      expect(renderer.lastLandscape).toBe(false);
    });

    it('carries the learner’s own words and the Arabic proper nouns beside them', async () => {
      await put('/api/cv', BASE_CV, ownerSession).expect(200);
      renderer.reset();

      await request(server()).get('/api/cv/export').set('Cookie', ownerSession).expect(200);

      const html = renderer.lastHtml!;

      expect(html).toContain('Training Officer');
      /* D-050: proper nouns pass through as authored, marked RTL so they sit
         correctly inside the English flow. */
      expect(html).toContain('<span dir="rtl" lang="ar">وزارة الداخلية</span>');
      /* The certificate the learner never typed — read from `certificates`. */
      expect(html).toContain('أساسيات القيادة الإدارية');
      expect(html).toContain('Course certificate');
    });

    it('exports the saved document, not a stale one', async () => {
      await put('/api/cv', { ...BASE_CV, jobTitle: 'First Title' }, ownerSession).expect(200);
      await put('/api/cv', { ...BASE_CV, jobTitle: 'Second Title' }, ownerSession).expect(200);
      renderer.reset();

      await request(server()).get('/api/cv/export').set('Cookie', ownerSession).expect(200);

      expect(renderer.lastHtml).toContain('Second Title');
      expect(renderer.lastHtml).not.toContain('First Title');
    });

    it('exports each learner their own CV', async () => {
      await put('/api/cv', { ...BASE_CV, jobTitle: 'Owner Only' }, ownerSession).expect(200);
      renderer.reset();

      await request(server()).get('/api/cv/export').set('Cookie', strangerSession).expect(200);

      expect(renderer.lastHtml).not.toContain('Owner Only');
    });
  });
});
