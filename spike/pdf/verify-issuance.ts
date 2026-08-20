import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env'], quiet: true });

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AuditService } from '../../apps/api/src/audit/audit.service';
import { hashPassword } from '../../apps/api/src/common/password';
import { CertificateIssuanceService } from '../../apps/api/src/certificates/certificate-issuance.service';
import { CertificateStorageService } from '../../apps/api/src/certificates/certificate-storage.service';
import { PdfRendererService } from '../../apps/api/src/certificates/pdf-renderer.service';
import { AppConfigService } from '../../apps/api/src/config/app-config.module';
import { validateEnv } from '../../apps/api/src/config/env.schema';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

/**
 * Issues a real course certificate and a real path certificate, through the
 * real services, against the real database — then checks the claims the unit
 * tests can only assert against fakes: that the bytes reach the disk, that a
 * second call produces no second row, that the pass gate actually holds, and
 * that Postgres refuses what the schema says it must.
 *
 *     npx tsx spike/pdf/verify-issuance.ts        # cleans up after itself
 *     KEEP=1 npx tsx spike/pdf/verify-issuance.ts # keeps the fixtures + PDFs
 */

const config = new AppConfigService(validateEnv(process.env));
const prisma = new PrismaService();
const storage = new CertificateStorageService(config);
const renderer = new PdfRendererService();
const audit = new AuditService(prisma);
const issuance = new CertificateIssuanceService(prisma, audit, config, storage, renderer);

const SUFFIX = process.env.VERIFY_SUFFIX ?? 'c1';
const FIXTURE_PASSWORD = 'a-sufficiently-long-password';
const ROOT = resolve(config.get('CERT_STORAGE_DIR'));

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
}

function inspectPdf(relativePath: string, expectedBytes: number, label: string): void {
  const absolute = join(ROOT, relativePath);
  check(`${label}: the PDF reached the disk`, existsSync(absolute), relativePath);

  if (!existsSync(absolute)) return;

  const bytes = readFileSync(absolute);
  check(
    `${label}: it is a PDF of the recorded size`,
    bytes.subarray(0, 5).toString() === '%PDF-' && bytes.byteLength === expectedBytes,
    `${(bytes.byteLength / 1024).toFixed(0)} KB`,
  );
  check(`${label}: the typeface is embedded`, /IBMPlexSansArabic/.test(bytes.toString('latin1')));
}

async function main(): Promise<void> {
  await prisma.$connect();

  // ── Fixtures ───────────────────────────────────────────────────────────────

  const user = await prisma.user.upsert({
    where: { email: `cert-verify-${SUFFIX}@ministry.gov.example` },
    update: {},
    create: {
      email: `cert-verify-${SUFFIX}@ministry.gov.example`,
      /* A real hash, so `KEEP=1` leaves an account that can actually sign in
         and have its gallery looked at. */
      passwordHash: await hashPassword(FIXTURE_PASSWORD),
      fullName: 'عبدالله بن محمد الدماطي',
      employeeId: `CERTV${SUFFIX.toUpperCase()}`,
      department: 'إدارة الموارد البشرية',
      emailVerifiedAt: new Date(),
    },
  });

  const path = await prisma.path.upsert({
    where: { key: `cert-verify-path-${SUFFIX}` },
    update: {},
    create: {
      key: `cert-verify-path-${SUFFIX}`,
      name: 'مسار القيادة الإدارية',
      description: 'مسار تجريبي للتحقق من إصدار الشهادات.',
      riasecLetter: 'E',
      typicalDurationMinutes: 600,
      displayOrder: 999,
      isActive: false,
    },
  });

  const titles = [
    'أساسيات القيادة الإدارية',
    'إدارة الفرق والتواصل الفعّال',
    'التخطيط الاستراتيجي',
    'إدارة الأداء المؤسسي',
    'اتخاذ القرار وحل المشكلات',
  ];

  const courses = [];
  for (const [index, title] of titles.entries()) {
    courses.push(
      await prisma.course.upsert({
        where: { moodleCourseId: 990100 + index },
        update: {},
        create: {
          moodleCourseId: 990100 + index,
          title,
          summary: 'دورة تجريبية للتحقق من إصدار الشهادات.',
          durationMinutes: 120,
          objectives: ['هدف أول', 'هدف ثانٍ', 'هدف ثالث'],
        },
      }),
    );
  }

  await prisma.certificate.deleteMany({ where: { userId: user.id } });
  await prisma.userPath.deleteMany({ where: { userId: user.id } });

  const userPath = await prisma.userPath.create({
    data: {
      userId: user.id,
      pathId: path.id,
      status: 'ACTIVE',
      confirmedAt: new Date(),
      courses: {
        create: courses.map((course, index) => ({
          courseId: course.id,
          displayOrder: index,
          status: 'COMPLETED',
        })),
      },
    },
  });

  /* The gate issuance reads. Written by hand because Phase 2's sync is the only
     thing that writes it in production — which is the property being relied on.
     The last course starts *below* the threshold so the pass gate can be shown
     to hold before it is satisfied. */
  for (const [index, course] of courses.entries()) {
    const isLast = index === courses.length - 1;
    await prisma.completion.upsert({
      where: { userId_moodleCourseId: { userId: user.id, moodleCourseId: course.moodleCourseId } },
      update: { passed: !isLast, completed: true, gradePercent: isLast ? 45 : 88 },
      create: {
        userId: user.id,
        moodleCourseId: course.moodleCourseId,
        completed: true,
        completedAt: new Date(),
        gradePercent: isLast ? 45 : 88,
        passed: !isLast,
        passThresholdUsed: config.get('PASS_THRESHOLD'),
        syncedAt: new Date(),
      },
    });
  }

  console.log(`\nIssuing for ${user.fullName}\n`);

  // ── Course certificate ─────────────────────────────────────────────────────

  const first = await issuance.issueCourseCertificate(user.id, courses[0]!.id);

  check('course: a certificate was created', first.created);
  inspectPdf(first.certificate.pdfPath, first.certificate.pdfBytes, 'course');
  check(
    'course: the file is named after the row id, not the public verification id',
    first.certificate.pdfPath.includes(first.certificate.id) &&
      !first.certificate.pdfPath.includes(first.certificate.verificationId),
  );
  check(
    'course: the printed name and title were stored',
    first.certificate.holderName === user.fullName &&
      first.certificate.subjectTitle === courses[0]!.title,
  );

  const second = await issuance.issueCourseCertificate(user.id, courses[0]!.id);
  const courseRows = await prisma.certificate.count({
    where: { userId: user.id, type: 'COURSE' },
  });
  check('course: re-issuing creates nothing', !second.created && courseRows === 1);

  // ── The pass gate, before it is satisfied ──────────────────────────────────

  let refused = false;
  try {
    await issuance.issuePathCertificate(user.id, path.id);
  } catch {
    refused = true;
  }
  check(
    'path: refused while one course is completed but below the threshold',
    refused,
    'grade 45 vs threshold ' + String(config.get('PASS_THRESHOLD')),
  );

  /* Every UserPathCourse already says COMPLETED — so a gate reading statuses
     rather than passes would have certified the path a moment ago. */
  const allCompleted = await prisma.userPathCourse.count({
    where: { userPathId: userPath.id, status: 'COMPLETED' },
  });
  check(
    'path: ...even though every chosen course reads COMPLETED',
    allCompleted === courses.length,
    `${allCompleted}/${courses.length} COMPLETED`,
  );

  // ── Path certificate, once the last course actually passes ─────────────────

  const last = courses[courses.length - 1]!;
  await prisma.completion.update({
    where: { userId_moodleCourseId: { userId: user.id, moodleCourseId: last.moodleCourseId } },
    data: { passed: true, gradePercent: 91 },
  });

  const pathCert = await issuance.issuePathCertificate(user.id, path.id);

  check('path: a certificate was created once every course passed', pathCert.created);
  check(
    'path: it is a PATH certificate for the right path',
    pathCert.certificate.type === 'PATH' &&
      pathCert.certificate.pathId === path.id &&
      pathCert.certificate.courseId === null,
  );
  inspectPdf(pathCert.certificate.pdfPath, pathCert.certificate.pdfBytes, 'path');

  const again = await issuance.issuePathCertificate(user.id, path.id);
  const pathRows = await prisma.certificate.count({ where: { userId: user.id, type: 'PATH' } });
  check('path: re-issuing creates nothing', !again.created && pathRows === 1);

  const total = await prisma.certificate.count({ where: { userId: user.id } });
  check('a learner holds both a course and a path certificate', total === 2, `${total} rows`);

  // ── Reconciliation ─────────────────────────────────────────────────────────

  await prisma.userPath.update({ where: { id: userPath.id }, data: { status: 'COMPLETED' } });

  /* Only one of the five course certificates was issued explicitly above, so
     the other four are exactly the shape this exists for: a pass whose
     transition has been spent with no certificate to show for it. */
  const caughtUp = await issuance.reconcileMissingCertificates();
  check(
    'reconciliation issues the certificates the transition never produced',
    caughtUp.issued === courses.length - 1 && caughtUp.failed === 0,
    JSON.stringify(caughtUp),
  );

  const secondPass = await issuance.reconcileMissingCertificates();
  check(
    'reconciliation is itself idempotent',
    secondPass.issued === 0 && secondPass.failed === 0,
    JSON.stringify(secondPass),
  );

  await prisma.certificate.deleteMany({ where: { userId: user.id, type: 'PATH' } });
  const reconciled = await issuance.reconcileMissingCertificates();
  const afterReconcile = await prisma.certificate.count({
    where: { userId: user.id, type: 'PATH' },
  });
  check(
    'reconciliation re-issues a path certificate that went missing',
    afterReconcile === 1 && reconciled.issued === 1,
    JSON.stringify(reconciled),
  );

  // ── The database's own guarantees ──────────────────────────────────────────

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

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO certificates (id, user_id, type, course_id, path_id, verification_id,
         pdf_path, pdf_sha256, pdf_bytes, holder_name, subject_title, issued_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'PATH', $2::uuid, $3::uuid, 'bogus-both-test',
         'x', 'x', 1, 'x', 'x', now(), now(), now())`,
      user.id,
      courses[0]!.id,
      path.id,
    );
    check(
      'the database refuses a certificate for both a course and a path',
      false,
      'insert succeeded',
    );
  } catch {
    check('the database refuses a certificate for both a course and a path', true);
  }

  const stored = await prisma.certificate.findMany({
    where: { userId: user.id },
    select: { type: true, verificationId: true, pdfPath: true },
    orderBy: { type: 'asc' },
  });

  console.log('');
  for (const row of stored) {
    console.log(`${row.type.padEnd(7)} ${row.verificationId}  ->  ${join(ROOT, row.pdfPath)}`);
  }

  /*
   * Always clean up, and this is not tidiness.
   *
   * This writes into the *dev* database, which is the same one the API
   * integration suite runs against. An earlier version left its fixture course
   * behind and a Phase 1 test asserting that catalogue courses have objectives
   * started failing — a passing suite broken by a verification script is the
   * worst kind of red, because it looks like the feature.
   */
  if (process.env.KEEP !== '1') {
    await prisma.certificate.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.completion.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
    await prisma.userPath.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.course.deleteMany({ where: { moodleCourseId: { gte: 990000 } } });
    await prisma.path.delete({ where: { id: path.id } });
    console.log('\nfixtures removed (KEEP=1 to retain them)');
  } else {
    console.log(
      `\nsign in as: cert-verify-${SUFFIX}@ministry.gov.example / ${FIXTURE_PASSWORD}\n` +
        'to look at the gallery these certificates land in.',
    );
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
