import type { Certificate } from '../../generated/prisma';
import { AuditAction } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { AppConfigService } from '../config/app-config.module';
import type { PrismaService } from '../prisma/prisma.service';
import {
  CertificateIssuanceService,
  CertificateNotEarnedError,
} from './certificate-issuance.service';
import type { CertificateStorageService } from './certificate-storage.service';
import type { PdfRendererService } from './pdf-renderer.service';

/**
 * Issuance, and above all the ways it must refuse to issue twice.
 *
 * The completion sync polls forever and re-enters this code every few minutes,
 * so "usually only once" is the same as "eventually twice". Three mechanisms
 * are meant to hold — the check before issuing, the unique index, and the
 * caught violation when the index fires — and each is exercised here on its own,
 * because a suite that only proves the cheap path would pass while the
 * guarantee was missing.
 */

interface Options {
  /** Seeded certificates, as if a previous run had issued them. */
  existing?: Array<Partial<Certificate> & { userId: string; type: 'COURSE' | 'PATH' }>;
  passed?: boolean;
  completionMissing?: boolean;
  unknownCourse?: boolean;
  unknownUser?: boolean;
  /** Simulates another run inserting the same certificate mid-flight. */
  concurrentInsert?: boolean;
  createError?: { code: string } | Error;
  renderThrows?: boolean;
  /** The learner's confirmed path, and which of its courses they passed. */
  pathCourseIds?: number[];
  passedCourseIds?: number[];
  pathConfirmed?: boolean;
  /** A different path than the one issuance is asked for (D-002 makes this a mismatch). */
  committedPathId?: string;
  /** Finished paths reconciliation should find. */
  finishedPaths?: Array<{ userId: string; pathId: string }>;
}

const COURSE_ID = 'course-1';
const USER_ID = 'user-1';
const PATH_ID = 'path-1';
const MOODLE_COURSE_ID = 101;

function harness(options: Options = {}) {
  const certificates: Certificate[] = (options.existing ?? []).map(
    (seed, index) =>
      ({
        id: seed.id ?? `seeded-${index}`,
        userId: seed.userId,
        type: seed.type,
        courseId: seed.courseId ?? (seed.type === 'COURSE' ? COURSE_ID : null),
        pathId: seed.pathId ?? null,
        verificationId: seed.verificationId ?? `seeded-verification-${index}`,
        pdfPath: seed.pdfPath ?? `2026/seeded-${index}.pdf`,
        pdfSha256: 'seeded',
        pdfBytes: 1,
        holderName: 'سارة',
        subjectTitle: 'دورة',
        issuedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }) as Certificate,
  );

  const audits: AuditEntry[] = [];
  const notifications: Array<{ userId: string; relatedId: string | null }> = [];
  const written: Array<{ path: string; bytes: number }> = [];
  const removed: string[] = [];
  let renders = 0;

  const findCourseCert = (userId: string, courseId: string) =>
    certificates.find(
      (row) => row.userId === userId && row.type === 'COURSE' && row.courseId === courseId,
    ) ?? null;

  const findPathCert = (userId: string, pathId: string) =>
    certificates.find(
      (row) => row.userId === userId && row.type === 'PATH' && row.pathId === pathId,
    ) ?? null;

  const pathCourseIds = options.pathCourseIds ?? [MOODLE_COURSE_ID, 102];
  const passedCourseIds = options.passedCourseIds ?? pathCourseIds;

  const prisma = {
    certificate: {
      findUnique: (args: {
        where: {
          userId_type_courseId?: { userId: string; type: string; courseId: string };
          userId_type_pathId?: { userId: string; type: string; pathId: string };
        };
      }) => {
        const courseKey = args.where.userId_type_courseId;
        if (courseKey) {
          return Promise.resolve(findCourseCert(courseKey.userId, courseKey.courseId));
        }

        const pathKey = args.where.userId_type_pathId;
        return Promise.resolve(pathKey ? findPathCert(pathKey.userId, pathKey.pathId) : null);
      },
      create: (args: { data: Certificate }) => {
        if (options.createError) {
          return Promise.reject(options.createError);
        }

        if (options.concurrentInsert) {
          /* The race, made deterministic: another run inserted between our
             check and our create, so the index fires. */
          certificates.push({ ...args.data, id: 'winner' } as Certificate);
          return Promise.reject({ code: 'P2002' });
        }

        const row = { ...args.data, createdAt: new Date(), updatedAt: new Date() } as Certificate;
        certificates.push(row);
        return Promise.resolve(row);
      },
    },
    user: {
      findUnique: () =>
        Promise.resolve(options.unknownUser ? null : { fullName: 'سارة بنت أحمد القحطاني' }),
    },
    course: {
      findUnique: () =>
        Promise.resolve(
          options.unknownCourse
            ? null
            : { id: COURSE_ID, title: 'أساسيات القيادة', moodleCourseId: MOODLE_COURSE_ID },
        ),
    },
    completion: {
      findUnique: () =>
        Promise.resolve(options.completionMissing ? null : { passed: options.passed ?? true }),
      findMany: () => Promise.resolve([{ userId: USER_ID, moodleCourseId: MOODLE_COURSE_ID }]),
      count: (args: { where: { moodleCourseId: { in: number[] } } }) =>
        Promise.resolve(
          passedCourseIds.filter((id) => args.where.moodleCourseId.in.includes(id)).length,
        ),
    },
    userPath: {
      findUnique: () =>
        Promise.resolve({
          path: { name: 'مسار القيادة الإدارية' },
          pathId: options.committedPathId ?? PATH_ID,
          confirmedAt: options.pathConfirmed === false ? null : new Date('2026-06-01'),
          courses: pathCourseIds.map((moodleCourseId) => ({ course: { moodleCourseId } })),
        }),
      findMany: () => Promise.resolve(options.finishedPaths ?? []),
    },
    path: {
      findUnique: () => Promise.resolve({ name: 'مسار القيادة الإدارية' }),
    },
    notification: {
      create: (args: { data: { userId: string; relatedId: string | null } }) => {
        notifications.push({ userId: args.data.userId, relatedId: args.data.relatedId });
        return Promise.resolve({});
      },
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  const config = {
    get: (key: string) =>
      key === 'CERT_VERIFICATION_BASE_URL' ? 'https://tamkeen.gov.example/verify/' : undefined,
  } as unknown as AppConfigService;

  const storage = {
    pathFor: (id: string, issuedAt: Date) => `${issuedAt.getUTCFullYear()}/${id}.pdf`,
    write: (path: string, bytes: Buffer) => {
      written.push({ path, bytes: bytes.byteLength });
      return Promise.resolve({ sha256: 'digest', bytes: bytes.byteLength });
    },
    removeQuietly: (path: string) => {
      removed.push(path);
      return Promise.resolve();
    },
  } as unknown as CertificateStorageService;

  const renderer = {
    render: () => {
      renders += 1;
      if (options.renderThrows) return Promise.reject(new Error('chromium down'));
      return Promise.resolve(Buffer.from('%PDF-1.4 pretend'));
    },
  } as unknown as PdfRendererService;

  return {
    service: new CertificateIssuanceService(prisma, audit, config, storage, renderer),
    certificates,
    audits,
    notifications,
    written,
    removed,
    renderCount: () => renders,
  };
}

describe('CertificateIssuanceService', () => {
  describe('issuing a course certificate', () => {
    it('issues one for a completion our sync recorded as passed', async () => {
      const { service, certificates } = harness();

      const outcome = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(outcome.created).toBe(true);
      expect(certificates).toHaveLength(1);
      expect(outcome.certificate).toMatchObject({
        userId: USER_ID,
        type: 'COURSE',
        courseId: COURSE_ID,
        pathId: null,
      });
    });

    it('stores the holder name and title as printed, not as a join', async () => {
      /* The bytes are immutable; a renamed person or a re-synced course title
         must not make the verification page contradict the paper (D-040). */
      const { service } = harness();

      const { certificate } = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(certificate.holderName).toBe('سارة بنت أحمد القحطاني');
      expect(certificate.subjectTitle).toBe('أساسيات القيادة');
    });

    it('mints an unguessable verification id', async () => {
      const { service } = harness();

      const { certificate } = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      /* 32 CSPRNG bytes, base64url — 43 characters, no padding, URL- and
         QR-safe. Short or structured would make certificates enumerable. */
      expect(certificate.verificationId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('names the stored file after the row id, never the public verification id', async () => {
      /* The verification id travels on paper. Naming files after it would let
         anyone holding one fetch the PDF straight out of a storage root that
         was ever exposed. */
      const { service, written } = harness();

      const { certificate } = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(written).toHaveLength(1);
      expect(written[0]!.path).toContain(certificate.id);
      expect(written[0]!.path).not.toContain(certificate.verificationId);
    });

    it('audits the issuance and raises the in-app indicator', async () => {
      const { service, audits, notifications } = harness();

      const { certificate } = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(audits).toContainEqual(
        expect.objectContaining({
          action: AuditAction.CERTIFICATE_ISSUED,
          outcome: 'SUCCESS',
          targetId: certificate.id,
        }),
      );
      expect(notifications).toEqual([{ userId: USER_ID, relatedId: certificate.id }]);
    });
  });

  describe('refusing to issue what was not earned', () => {
    it('refuses when no completion has been synced', async () => {
      /* Issuance is driven only by what the sync wrote. Nothing about who
         earned what may come from a request. */
      const { service, certificates } = harness({ completionMissing: true });

      await expect(service.issueCourseCertificate(USER_ID, COURSE_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
      expect(certificates).toHaveLength(0);
    });

    it('refuses when the completion exists but did not pass the threshold', async () => {
      const { service, certificates, renderCount } = harness({ passed: false });

      await expect(service.issueCourseCertificate(USER_ID, COURSE_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
      expect(certificates).toHaveLength(0);
      expect(renderCount()).toBe(0);
    });

    it('refuses for an unknown course or user', async () => {
      await expect(
        harness({ unknownCourse: true }).service.issueCourseCertificate(USER_ID, COURSE_ID),
      ).rejects.toThrow(CertificateNotEarnedError);

      await expect(
        harness({ unknownUser: true }).service.issueCourseCertificate(USER_ID, COURSE_ID),
      ).rejects.toThrow(CertificateNotEarnedError);
    });
  });

  describe('issuing a path certificate', () => {
    it('issues one when every chosen course has been passed', async () => {
      const { service, certificates } = harness();

      const outcome = await service.issuePathCertificate(USER_ID, PATH_ID);

      expect(outcome.created).toBe(true);
      expect(outcome.certificate).toMatchObject({
        type: 'PATH',
        pathId: PATH_ID,
        courseId: null,
        subjectTitle: 'مسار القيادة الإدارية',
      });
      expect(certificates).toHaveLength(1);
    });

    it('refuses when a course was completed but not passed', async () => {
      /*
       * The whole reason this gate reads `completions.passed` rather than
       * `UserPathCourse.status`: a course can be COMPLETED in the LMS and below
       * the product threshold (D-042 §4). Certifying that path would attest to
       * something that did not happen.
       */
      const { service, certificates, renderCount } = harness({
        pathCourseIds: [101, 102],
        passedCourseIds: [101],
      });

      await expect(service.issuePathCertificate(USER_ID, PATH_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
      expect(certificates).toHaveLength(0);
      expect(renderCount()).toBe(0);
    });

    it('refuses when the path was never confirmed', async () => {
      const { service } = harness({ pathConfirmed: false });

      await expect(service.issuePathCertificate(USER_ID, PATH_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
    });

    it('refuses a path the learner did not commit to', async () => {
      /* One path per user (D-002), so being asked about another one is a
         mismatch rather than a second path to check. */
      const { service } = harness({ committedPathId: 'some-other-path' });

      await expect(service.issuePathCertificate(USER_ID, PATH_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
    });

    it('refuses an empty path rather than reading it as finished', async () => {
      const { service } = harness({ pathCourseIds: [], passedCourseIds: [] });

      await expect(service.issuePathCertificate(USER_ID, PATH_ID)).rejects.toThrow(
        CertificateNotEarnedError,
      );
    });

    it('yields exactly one path certificate across repeated issuance', async () => {
      const { service, certificates } = harness();

      const first = await service.issuePathCertificate(USER_ID, PATH_ID);
      const second = await service.issuePathCertificate(USER_ID, PATH_ID);

      expect(certificates).toHaveLength(1);
      expect(second.created).toBe(false);
      expect(second.certificate.id).toBe(first.certificate.id);
    });

    it('does not collide with the course certificate for the same learner', async () => {
      /* Two unique indexes, each inert for the type it does not describe. A
         learner holds a course certificate and a path certificate at once. */
      const { service, certificates } = harness();

      await service.issueCourseCertificate(USER_ID, COURSE_ID);
      await service.issuePathCertificate(USER_ID, PATH_ID);

      expect(certificates).toHaveLength(2);
      expect(certificates.map((row) => row.type).sort()).toEqual(['COURSE', 'PATH']);
    });
  });

  describe('idempotency', () => {
    it('returns the existing certificate without rendering again', async () => {
      const { service, certificates, renderCount } = harness({
        existing: [{ userId: USER_ID, type: 'COURSE', id: 'already-issued' }],
      });

      const outcome = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(outcome.created).toBe(false);
      expect(outcome.certificate.id).toBe('already-issued');
      expect(certificates).toHaveLength(1);
      expect(renderCount()).toBe(0);
    });

    it('yields exactly one certificate across repeated issuance', async () => {
      /* A re-run after a partial failure legitimately arrives here twice
         (D-042 §5) — the transition guard upstream is about not spamming. */
      const { service, certificates } = harness();

      const first = await service.issueCourseCertificate(USER_ID, COURSE_ID);
      const second = await service.issueCourseCertificate(USER_ID, COURSE_ID);
      const third = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(certificates).toHaveLength(1);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(third.created).toBe(false);
      expect(second.certificate.id).toBe(first.certificate.id);
      expect(third.certificate.id).toBe(first.certificate.id);
    });

    it('answers with the winner when a concurrent run takes the unique index', async () => {
      /* Two sync runs overlapping is the case the application check cannot
         cover: both see no certificate, both render, one insert loses. Losing
         must produce the same answer as winning, not an error. */
      const { service, certificates } = harness({ concurrentInsert: true });

      const outcome = await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(outcome.created).toBe(false);
      expect(outcome.certificate.id).toBe('winner');
      expect(certificates).toHaveLength(1);
    });

    it('discards its own render after losing the race', async () => {
      /* Otherwise every lost race leaves a PDF nothing references. */
      const { service, removed, written } = harness({ concurrentInsert: true });

      await service.issueCourseCertificate(USER_ID, COURSE_ID);

      expect(removed).toEqual([written[0]!.path]);
    });
  });

  describe('failure handling', () => {
    it('leaves nothing behind when the insert fails for an unrelated reason', async () => {
      /* A row is not created, so the bytes belong to nothing and must go. */
      const { service, removed, written } = harness({ createError: new Error('connection lost') });

      await expect(service.issueCourseCertificate(USER_ID, COURSE_ID)).rejects.toThrow(
        'connection lost',
      );

      expect(removed).toEqual([written[0]!.path]);
    });

    it('does not write a row when rendering fails', async () => {
      /* Render first, insert second: a crash here costs a retry, never a
         certificate row pointing at bytes that were never written. */
      const { service, certificates, written } = harness({ renderThrows: true });

      await expect(service.issueCourseCertificate(USER_ID, COURSE_ID)).rejects.toThrow(
        'chromium down',
      );

      expect(certificates).toHaveLength(0);
      expect(written).toHaveLength(0);
    });
  });

  describe('reconciliation', () => {
    it('issues a certificate for a pass that never got one', async () => {
      /* The transition guard fires once. If issuance failed at that moment, no
         later sync re-enters it — so something has to come back for the
         leftovers, the same reasoning as retryPendingEnrolments (D-041). */
      const { service, certificates } = harness();

      const result = await service.reconcileMissingCertificates();

      expect(result).toEqual({ issued: 1, failed: 0 });
      expect(certificates).toHaveLength(1);
    });

    it('does nothing when the certificate already exists', async () => {
      const { service, renderCount } = harness({
        existing: [{ userId: USER_ID, type: 'COURSE' }],
      });

      const result = await service.reconcileMissingCertificates();

      expect(result).toEqual({ issued: 0, failed: 0 });
      expect(renderCount()).toBe(0);
    });

    it('counts a failure without abandoning the pass', async () => {
      const { service, certificates } = harness({ renderThrows: true });

      const result = await service.reconcileMissingCertificates();

      expect(result).toEqual({ issued: 0, failed: 1 });
      expect(certificates).toHaveLength(0);
    });

    it('issues a path certificate for a finished path that never got one', async () => {
      /* `onPathCompleted` fires on the run that flips the path to COMPLETED and
         `refreshPathStatus` returns early ever after, so a render that failed
         there is never retried by the sync either. */
      const { service, certificates } = harness({
        finishedPaths: [{ userId: USER_ID, pathId: PATH_ID }],
      });

      const result = await service.reconcileMissingCertificates();

      expect(result.issued).toBe(2); // the course certificate, and the path one
      expect(certificates.filter((row) => row.type === 'PATH')).toHaveLength(1);
    });

    it('leaves a finished path alone once its certificate exists', async () => {
      const { service } = harness({
        finishedPaths: [{ userId: USER_ID, pathId: PATH_ID }],
        existing: [
          { userId: USER_ID, type: 'COURSE' },
          { userId: USER_ID, type: 'PATH', pathId: PATH_ID },
        ],
      });

      const result = await service.reconcileMissingCertificates();

      expect(result).toEqual({ issued: 0, failed: 0 });
    });
  });
});
