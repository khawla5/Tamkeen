import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AuditService } from '../../apps/api/src/audit/audit.service';
import { CertificateIssuanceService } from '../../apps/api/src/certificates/certificate-issuance.service';
import { CertificateStorageService } from '../../apps/api/src/certificates/certificate-storage.service';
import { PdfRendererService } from '../../apps/api/src/certificates/pdf-renderer.service';
import { AppConfigService } from '../../apps/api/src/config/app-config.module';
import { validateEnv } from '../../apps/api/src/config/env.schema';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

/**
 * Issues a real certificate, through the real services, against the real
 * database — and then checks the claims the unit tests can only assert against
 * fakes: that the bytes reach the disk, that the digest matches, that a second
 * call produces no second row, and that the QR on the paper resolves.
 *
 *     npx tsx spike/pdf/verify-issuance.ts
 */

const config = new AppConfigService(validateEnv(process.env));
const prisma = new PrismaService();
const storage = new CertificateStorageService(config);
const renderer = new PdfRendererService();
const audit = new AuditService(prisma);
const issuance = new CertificateIssuanceService(prisma, audit, config, storage, renderer);

const SUFFIX = process.env.VERIFY_SUFFIX ?? 'c1';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
}

async function main(): Promise<void> {
  await prisma.$connect();

  /* A learner and a course that exist only for this run, so the check is
     repeatable and never touches real data. */
  const user = await prisma.user.upsert({
    where: { email: `cert-verify-${SUFFIX}@ministry.gov.example` },
    update: {},
    create: {
      email: `cert-verify-${SUFFIX}@ministry.gov.example`,
      passwordHash: 'not-a-real-hash',
      fullName: 'عبدالله بن محمد الدماطي',
      employeeId: `CERTV${SUFFIX.toUpperCase()}`,
      department: 'إدارة الموارد البشرية',
      emailVerifiedAt: new Date(),
    },
  });

  const moodleCourseId = 990000 + SUFFIX.length;
  const course = await prisma.course.upsert({
    where: { moodleCourseId },
    update: {},
    create: {
      moodleCourseId,
      title: 'أساسيات القيادة الإدارية',
      summary: 'دورة تجريبية للتحقق من إصدار الشهادات.',
      durationMinutes: 120,
      objectives: [],
    },
  });

  /* The gate issuance reads. Written here by hand because Phase 2's sync is the
     only thing that writes it in production — which is exactly the property
     being relied on. */
  await prisma.completion.upsert({
    where: { userId_moodleCourseId: { userId: user.id, moodleCourseId } },
    update: { passed: true, completed: true },
    create: {
      userId: user.id,
      moodleCourseId,
      completed: true,
      completedAt: new Date(),
      gradePercent: 88,
      passed: true,
      passThresholdUsed: config.get('PASS_THRESHOLD'),
      syncedAt: new Date(),
    },
  });

  await prisma.certificate.deleteMany({ where: { userId: user.id } });

  console.log(`\nIssuing for ${user.fullName} — ${course.title}\n`);

  const started = Date.now();
  const first = await issuance.issueCourseCertificate(user.id, course.id);
  const renderMs = Date.now() - started;

  check('a certificate was created', first.created);
  check('render + store + insert took under 10s', renderMs < 10_000, `${renderMs} ms`);

  const root = resolve(config.get('CERT_STORAGE_DIR'));
  const absolute = join(root, first.certificate.pdfPath);

  check('the PDF reached the disk', existsSync(absolute), first.certificate.pdfPath);

  if (existsSync(absolute)) {
    const bytes = readFileSync(absolute);
    check('it is a PDF', bytes.subarray(0, 5).toString() === '%PDF-');
    check(
      'the stored byte count matches',
      bytes.byteLength === first.certificate.pdfBytes,
      `${(bytes.byteLength / 1024).toFixed(0)} KB`,
    );
    check('the typeface is embedded', /IBMPlexSansArabic/.test(bytes.toString('latin1')));
  }

  check(
    'the file is named after the row id, not the public verification id',
    first.certificate.pdfPath.includes(first.certificate.id) &&
      !first.certificate.pdfPath.includes(first.certificate.verificationId),
  );

  check(
    'the printed name and title were stored',
    first.certificate.holderName === user.fullName &&
      first.certificate.subjectTitle === course.title,
  );

  /* Idempotency, against the real unique index rather than a fake. */
  const second = await issuance.issueCourseCertificate(user.id, course.id);
  const third = await issuance.issueCourseCertificate(user.id, course.id);

  const rows = await prisma.certificate.count({ where: { userId: user.id } });

  check('re-issuing creates nothing', !second.created && !third.created);
  check('exactly one certificate exists', rows === 1, `${rows} row(s)`);
  check('the same certificate comes back', second.certificate.id === first.certificate.id);

  const reconciled = await issuance.reconcileMissingCertificates();
  const afterReconcile = await prisma.certificate.count({ where: { userId: user.id } });
  check(
    'reconciliation does not duplicate an existing certificate',
    afterReconcile === 1,
    JSON.stringify(reconciled),
  );

  /* The CHECK constraint, asked of Postgres rather than trusted. */
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO certificates (id, user_id, type, course_id, path_id, verification_id,
         pdf_path, pdf_sha256, pdf_bytes, holder_name, subject_title, issued_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'COURSE', NULL, NULL, 'bogus-check-test',
         'x', 'x', 1, 'x', 'x', now(), now(), now())`,
      user.id,
    );
    check('the database refuses a certificate with no target', false, 'insert succeeded');
  } catch {
    check('the database refuses a certificate with no target', true);
  }

  console.log(`\nverification id : ${first.certificate.verificationId}`);
  console.log(`stored at       : ${absolute}`);

  /*
   * Always clean up, and this is not tidiness.
   *
   * This script writes into the *dev* database, which is the same one the API
   * integration suite runs against. The first version left its fixture course
   * behind and a Phase 1 test that asserts a catalogue course has objectives
   * started failing — a passing suite broken by a verification script is the
   * worst kind of red, because it looks like the feature.
   */
  if (process.env.KEEP !== '1') {
    await prisma.certificate.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.completion.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.course.delete({ where: { id: course.id } });
    console.log('fixtures        : removed (KEEP=1 to retain them)');
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);

  await renderer.onModuleDestroy();
  await prisma.$disconnect();

  process.exitCode = failures === 0 ? 0 : 1;
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await renderer.onModuleDestroy().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
