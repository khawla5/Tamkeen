import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type { Certificate } from '../../generated/prisma';
import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { generateToken } from '../common/secure-token';
import { AppConfigService } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateStorageService } from './certificate-storage.service';
import { renderCertificateHtml } from './certificate-template';
import { PdfRendererService } from './pdf-renderer.service';
import { qrSvgFor, verificationUrlFor } from './qr';

export interface IssueOutcome {
  certificate: Certificate;
  /** False when the certificate already existed — the idempotent path. */
  created: boolean;
}

/** Raised when issuance is asked for something the learner has not earned. */
export class CertificateNotEarnedError extends Error {
  constructor(
    readonly reason: 'NO_PASSING_COMPLETION' | 'UNKNOWN_TARGET' | 'PATH_NOT_FULLY_PASSED',
  ) {
    super(`Certificate not earned: ${reason}`);
    this.name = 'CertificateNotEarnedError';
  }
}

/** How many missed certificates one reconciliation pass will chase. */
const RECONCILE_BATCH = 50;

/**
 * Issues certificates, idempotently (§2, D-006).
 *
 * **Idempotency is enforced here, not inherited.** The caller in
 * `CompletionSyncService.onCoursePassed` only fires on the transition into
 * passing, but D-042 §5 is explicit that this is a guard against *spamming*,
 * not a uniqueness guarantee: a re-run after a partial failure can legitimately
 * arrive twice, and two overlapping sync runs could arrive at the same instant.
 * So three things hold the line, in increasing order of authority — a
 * check-before-issue that makes the common case cheap, a unique index per
 * `(user, type, target)` that makes a duplicate *impossible*, and a caught
 * unique violation that turns the lost race into the same answer the winner got.
 *
 * **Render first, insert second, and the order is load-bearing.** Crashing
 * between the two leaves an orphaned PDF that nothing references — litter, and
 * harmless. The other order leaves a certificate row pointing at bytes that
 * were never written: a credential in the gallery that 500s on download, and
 * one that no retry will ever repair because the row already exists.
 *
 * **Issuance is driven only by synced completions.** Nothing about who earned
 * what comes from a request. The eligibility check reads `completions`, which
 * Phase 2's sync is the only writer of, so a certificate cannot be conjured by
 * asking for one.
 */
@Injectable()
export class CertificateIssuanceService {
  private readonly logger = new Logger(CertificateIssuanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly storage: CertificateStorageService,
    private readonly renderer: PdfRendererService,
  ) {}

  /**
   * The course certificate (§2): earned by passing one course's quiz at or above
   * the product threshold (D-007).
   */
  async issueCourseCertificate(userId: string, courseId: string): Promise<IssueOutcome> {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_type_courseId: { userId, type: 'COURSE', courseId } },
    });

    if (existing) {
      return { certificate: existing, created: false };
    }

    const [user, course] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: { title: true, moodleCourseId: true },
      }),
    ]);

    if (!user || !course) {
      throw new CertificateNotEarnedError('UNKNOWN_TARGET');
    }

    /* The gate. `completions` is written only by the sync job reading the LMS,
       so this is the one place the right to a certificate can come from. */
    const completion = await this.prisma.completion.findUnique({
      where: { userId_moodleCourseId: { userId, moodleCourseId: course.moodleCourseId } },
      select: { passed: true },
    });

    if (completion?.passed !== true) {
      throw new CertificateNotEarnedError('NO_PASSING_COMPLETION');
    }

    /* Presentational only, and absent for a course reached outside the user's
       path — which is why it is nullable rather than an error. */
    const userPath = await this.prisma.userPath.findUnique({
      where: { userId },
      select: { path: { select: { name: true } } },
    });

    return this.render({
      userId,
      type: 'COURSE',
      courseId,
      pathId: null,
      holderName: user.fullName,
      subjectTitle: course.title,
      pathName: userPath?.path.name ?? null,
      courseCount: null,
      findExisting: () =>
        this.prisma.certificate.findUnique({
          where: { userId_type_courseId: { userId, type: 'COURSE', courseId } },
        }),
    });
  }

  /**
   * The path certificate (§2, §4.10): the larger award, earned when every course
   * the learner chose has been passed.
   *
   * **Gated on passes, not on statuses.** `UserPathCourse.status` becomes
   * `COMPLETED` from the LMS's completion signal alone — a learner can finish a
   * course in Moodle and score below the threshold, and Phase 2 records that as
   * completed-but-not-passed, correctly (D-042 §4). Reading the status here
   * would certify a path nobody passed.
   */
  async issuePathCertificate(userId: string, pathId: string): Promise<IssueOutcome> {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_type_pathId: { userId, type: 'PATH', pathId } },
    });

    if (existing) {
      return { certificate: existing, created: false };
    }

    const [user, path] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.path.findUnique({ where: { id: pathId }, select: { name: true } }),
    ]);

    if (!user || !path) {
      throw new CertificateNotEarnedError('UNKNOWN_TARGET');
    }

    const passedCount = await this.countPassedPathCourses(userId, pathId);

    if (passedCount === null) {
      throw new CertificateNotEarnedError('PATH_NOT_FULLY_PASSED');
    }

    return this.render({
      userId,
      type: 'PATH',
      courseId: null,
      pathId,
      holderName: user.fullName,
      subjectTitle: path.name,
      pathName: null,
      courseCount: passedCount,
      findExisting: () =>
        this.prisma.certificate.findUnique({
          where: { userId_type_pathId: { userId, type: 'PATH', pathId } },
        }),
    });
  }

  /**
   * How many of the learner's chosen courses they have passed, or `null` if the
   * path is not theirs, not confirmed, or not finished.
   *
   * `completions.passed` is our verdict against the product threshold (D-007)
   * and already requires the LMS's completion signal, so it is the whole test —
   * a course cannot be passed without having been completed.
   */
  private async countPassedPathCourses(userId: string, pathId: string): Promise<number | null> {
    const userPath = await this.prisma.userPath.findUnique({
      where: { userId },
      select: {
        pathId: true,
        confirmedAt: true,
        courses: { select: { course: { select: { moodleCourseId: true } } } },
      },
    });

    /* A path the learner never committed to, or a different one — one path per
       user (D-002), so this is a mismatch rather than a lookup. */
    if (!userPath || userPath.pathId !== pathId || userPath.confirmedAt === null) {
      return null;
    }

    const moodleCourseIds = userPath.courses.map((chosen) => chosen.course.moodleCourseId);

    /* An empty path must never read as "finished" — the 5-10 rule (§2) makes
       this unreachable, which is exactly why it is cheap to rule out. */
    if (moodleCourseIds.length === 0) {
      return null;
    }

    const passed = await this.prisma.completion.count({
      where: { userId, moodleCourseId: { in: moodleCourseIds }, passed: true },
    });

    return passed === moodleCourseIds.length ? passed : null;
  }

  /**
   * Renders, stores, and inserts — the half every certificate type shares.
   *
   * `findExisting` is passed in rather than derived because the two types are
   * unique on different columns, and losing the insert race has to be answered
   * with the row that won it.
   */
  private async render(input: {
    userId: string;
    type: 'COURSE' | 'PATH';
    courseId: string | null;
    pathId: string | null;
    holderName: string;
    subjectTitle: string;
    pathName: string | null;
    courseCount: number | null;
    findExisting: () => Promise<Certificate | null>;
  }): Promise<IssueOutcome> {
    /* Generated up front so the storage path is known before the row exists —
       and so the file is named after the private id, never the public one. */
    const id = randomUUID();
    const verificationId = generateToken();
    const issuedAt = new Date();

    const verificationUrl = verificationUrlFor(
      this.config.get('CERT_VERIFICATION_BASE_URL'),
      verificationId,
    );

    const html = renderCertificateHtml({
      type: input.type,
      holderName: input.holderName,
      subjectTitle: input.subjectTitle,
      pathName: input.pathName,
      courseCount: input.courseCount,
      issuedAt,
      verificationId,
      verificationUrl,
      qrSvg: await qrSvgFor(verificationUrl),
    });

    const pdf = await this.renderer.render(html, { landscape: true });
    const relativePath = this.storage.pathFor(id, issuedAt);
    const stored = await this.storage.write(relativePath, pdf);

    try {
      const certificate = await this.prisma.certificate.create({
        data: {
          id,
          userId: input.userId,
          type: input.type,
          courseId: input.courseId,
          pathId: input.pathId,
          verificationId,
          pdfPath: relativePath,
          pdfSha256: stored.sha256,
          pdfBytes: stored.bytes,
          holderName: input.holderName,
          subjectTitle: input.subjectTitle,
          issuedAt,
        },
      });

      await this.afterIssue(certificate);

      return { certificate, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        /* The row never landed, so the bytes belong to nothing. */
        await this.storage.removeQuietly(relativePath);
        throw error;
      }

      /* Another run got there first — the outcome we wanted, reached by someone
         else. Drop our render and answer with theirs. */
      await this.storage.removeQuietly(relativePath);
      const winner = await input.findExisting();

      if (!winner) {
        /* A unique violation with nothing to show for it means the constraint
           that fired is not the one we reasoned about. Surfacing it is right:
           silently returning "already issued" would hide a schema mismatch. */
        throw error;
      }

      this.logger.log(
        `Certificate ${winner.id} was issued concurrently; discarded the duplicate render`,
      );

      return { certificate: winner, created: false };
    }
  }

  /** Audit and the in-app indicator — everything that follows a real issuance. */
  private async afterIssue(certificate: Certificate): Promise<void> {
    await this.audit.record({
      action: AuditAction.CERTIFICATE_ISSUED,
      outcome: 'SUCCESS',
      actorUserId: certificate.userId,
      ipAddress: null,
      targetType: 'certificate',
      targetId: certificate.id,
      detail: { type: certificate.type },
    });

    /* §2 keeps in-app notification to a light indicator. No copy is stored: the
       Arabic is rendered from the message catalogue at read time (D-024), so
       rewording it later is not a data migration. */
    await this.prisma.notification.create({
      data: {
        userId: certificate.userId,
        type: 'CERTIFICATE_ISSUED',
        relatedId: certificate.id,
      },
    });
  }

  /**
   * Issues certificates for passes that never got one.
   *
   * This exists because of a gap the transition guard creates. `onCoursePassed`
   * fires exactly once, on the run where a course becomes passed — so if
   * rendering fails at that moment (Chromium down, disk full), the guard has
   * already been spent and **no later sync will ever try again**. The learner
   * would be permanently owed a certificate with nothing in the system that
   * knows it.
   *
   * The same reasoning produced `retryPendingEnrolments` for best-effort
   * enrolment (D-041): a side effect allowed to fail is only defensible if
   * something comes back for the leftovers. Bounded per run so one bad batch
   * cannot monopolise the scheduler, and safe to run at any time.
   */
  async reconcileMissingCertificates(): Promise<{ issued: number; failed: number }> {
    const courses = await this.reconcileCourseCertificates();
    const paths = await this.reconcilePathCertificates();

    const issued = courses.issued + paths.issued;
    const failed = courses.failed + paths.failed;

    if (issued > 0 || failed > 0) {
      this.logger.log(
        `Certificate reconciliation: ${courses.issued} course, ${paths.issued} path, ` +
          `${failed} failed`,
      );
    }

    return { issued, failed };
  }

  private async reconcileCourseCertificates(): Promise<{ issued: number; failed: number }> {
    const passed = await this.prisma.completion.findMany({
      where: { passed: true },
      select: { userId: true, moodleCourseId: true },
      take: RECONCILE_BATCH * 4,
      orderBy: { updatedAt: 'asc' },
    });

    let issued = 0;
    let failed = 0;

    for (const completion of passed) {
      if (issued + failed >= RECONCILE_BATCH) break;

      const course = await this.prisma.course.findUnique({
        where: { moodleCourseId: completion.moodleCourseId },
        select: { id: true },
      });

      /* A completion whose catalogue row was retired has nothing to name on a
         certificate. Not an error — the learner keeps the completion. */
      if (!course) continue;

      const already = await this.prisma.certificate.findUnique({
        where: {
          userId_type_courseId: {
            userId: completion.userId,
            type: 'COURSE',
            courseId: course.id,
          },
        },
        select: { id: true },
      });

      if (already) continue;

      try {
        const outcome = await this.issueCourseCertificate(completion.userId, course.id);
        if (outcome.created) issued += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Could not issue the missing certificate for user ${completion.userId}, course ` +
            `${course.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return { issued, failed };
  }

  /**
   * The path half of the same gap.
   *
   * `onPathCompleted` fires on the run that flips the path to `COMPLETED`, and
   * `refreshPathStatus` returns early ever after — so a render that failed
   * there is never retried either. Finished paths are few, so this scans them
   * all rather than paging.
   */
  private async reconcilePathCertificates(): Promise<{ issued: number; failed: number }> {
    const finished = await this.prisma.userPath.findMany({
      where: { status: 'COMPLETED', confirmedAt: { not: null } },
      select: { userId: true, pathId: true },
      take: RECONCILE_BATCH,
    });

    let issued = 0;
    let failed = 0;

    for (const userPath of finished) {
      const already = await this.prisma.certificate.findUnique({
        where: {
          userId_type_pathId: { userId: userPath.userId, type: 'PATH', pathId: userPath.pathId },
        },
        select: { id: true },
      });

      if (already) continue;

      try {
        const outcome = await this.issuePathCertificate(userPath.userId, userPath.pathId);
        if (outcome.created) issued += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Could not issue the missing path certificate for user ${userPath.userId}, path ` +
            `${userPath.pathId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return { issued, failed };
  }
}

/**
 * Duck-typed rather than `instanceof`.
 *
 * The generated client can be loaded through more than one module instance in a
 * monorepo, and an `instanceof` that silently stops matching would turn the
 * idempotency path into a thrown error under exactly the concurrency it exists
 * to handle. The error code is the stable contract.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
