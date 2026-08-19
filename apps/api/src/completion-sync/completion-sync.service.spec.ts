import { AuditAction } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import type { AppConfigService } from '../config/app-config.module';
import type { EmailService } from '../email/email.service';
import type { LmsPort } from '../moodle/lms.port';
import { LmsUnavailableError, type LmsCourseProgress } from '../moodle/lms.types';
import type { PrismaService } from '../prisma/prisma.service';
import { CompletionSyncService } from './completion-sync.service';

/**
 * What the sync writes, and — more importantly — what it does *not* write on a
 * second run.
 *
 * This polls, so every one of these paths is re-entered every few minutes
 * forever. Anything that is not idempotent here becomes a duplicate row, a
 * repeated email, or a certificate issued twice in Phase 3.
 */

interface CompletionRow {
  userId: string;
  moodleCourseId: number;
  completed: boolean;
  passed: boolean;
  gradePercent: number | null;
  passThresholdUsed: number | null;
}

interface ChosenRow {
  id: string;
  moodleCourseId: number;
  status: string;
}

function harness(options: {
  progress?: LmsCourseProgress[];
  completions?: CompletionRow[];
  chosen?: ChosenRow[];
  learners?: Array<{ id: string; email: string; moodleUserId: number | null }>;
  passThreshold?: number;
  listProgressThrows?: boolean;
  emailThrows?: boolean;
  issuanceThrows?: boolean;
  pathConfirmed?: boolean;
}) {
  const completions = options.completions ?? [];
  const chosen = options.chosen ?? [];
  const audits: AuditEntry[] = [];
  const emails: Array<{ to: string; title: string; certificateIssued: boolean }> = [];
  const issued: Array<{ userId: string; courseId: string }> = [];
  const pathUpdates: string[] = [];

  const learners = options.learners ?? [
    { id: 'user-1', email: 'learner@ministry.gov.example', moodleUserId: 5001 },
  ];

  const prisma = {
    user: { findMany: () => Promise.resolve(learners) },
    completion: {
      findUnique: (args: {
        where: { userId_moodleCourseId: { userId: string; moodleCourseId: number } };
      }) => {
        const key = args.where.userId_moodleCourseId;
        return Promise.resolve(
          completions.find(
            (row) => row.userId === key.userId && row.moodleCourseId === key.moodleCourseId,
          ) ?? null,
        );
      },
      upsert: (args: {
        where: { userId_moodleCourseId: { userId: string; moodleCourseId: number } };
        create: CompletionRow;
        update: Partial<CompletionRow>;
      }) => {
        const key = args.where.userId_moodleCourseId;
        const existing = completions.find(
          (row) => row.userId === key.userId && row.moodleCourseId === key.moodleCourseId,
        );

        if (existing) {
          Object.assign(existing, args.update);
        } else {
          completions.push({ ...args.create });
        }

        return Promise.resolve({});
      },
    },
    userPathCourse: {
      findMany: (args: { where: { course?: { moodleCourseId?: number } } }) =>
        Promise.resolve(
          chosen
            .filter((row) => row.moodleCourseId === args.where.course?.moodleCourseId)
            .map((row) => ({ id: row.id, status: row.status })),
        ),
      update: (args: { where: { id: string }; data: { status: string } }) => {
        const row = chosen.find((candidate) => candidate.id === args.where.id);
        if (row) row.status = args.data.status;
        return Promise.resolve({});
      },
    },
    userPath: {
      findUnique: () =>
        Promise.resolve({
          id: 'path-1',
          status: 'ACTIVE',
          confirmedAt: options.pathConfirmed === false ? null : new Date(),
          courses: chosen.map((row) => ({ status: row.status })),
        }),
      update: (args: { where: { id: string } }) => {
        pathUpdates.push(args.where.id);
        return Promise.resolve({});
      },
    },
    course: { findUnique: () => Promise.resolve({ id: 'course-1', title: 'دورة الأمن' }) },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  const config = {
    get: (key: string) => (key === 'PASS_THRESHOLD' ? (options.passThreshold ?? 70) : undefined),
  } as unknown as AppConfigService;

  const email = {
    sendCoursePassed: (
      to: string,
      title: string,
      opts: { certificateIssued: boolean } = { certificateIssued: false },
    ) => {
      if (options.emailThrows) return Promise.reject(new Error('smtp down'));
      emails.push({ to, title, certificateIssued: opts.certificateIssued });
      return Promise.resolve();
    },
  } as unknown as EmailService;

  /* Issuance has its own suite; here it only has to prove the seam is called
     once per transition and that a failure to issue does not fail the sync. */
  const certificates = {
    issueCourseCertificate: (userId: string, courseId: string) => {
      if (options.issuanceThrows) return Promise.reject(new Error('chromium down'));
      issued.push({ userId, courseId });
      return Promise.resolve({ certificate: { id: 'cert-1' }, created: true });
    },
  } as unknown as CertificateIssuanceService;

  const lms = {
    listProgressForUser: () => {
      if (options.listProgressThrows) {
        return Promise.reject(new LmsUnavailableError('UNREACHABLE'));
      }
      return Promise.resolve(options.progress ?? []);
    },
  } as unknown as LmsPort;

  return {
    service: new CompletionSyncService(prisma, audit, config, email, certificates, lms),
    completions,
    chosen,
    audits,
    emails,
    issued,
    pathUpdates,
  };
}

const passed = (moodleCourseId = 101): LmsCourseProgress => ({
  lmsUserId: 5001,
  lmsCourseId: moodleCourseId,
  completed: true,
  completedAt: new Date('2026-08-18T13:57:59.000Z'),
  gradePercent: 100,
});

describe('CompletionSyncService', () => {
  describe('recording completions', () => {
    it('writes a completion with our verdict and the threshold it used', async () => {
      /* Storing the threshold alongside the verdict means a later change to the
         product setting cannot make a historical pass unexplainable. */
      const { service, completions } = harness({ progress: [passed()] });

      await service.sync();

      expect(completions).toHaveLength(1);
      expect(completions[0]).toMatchObject({
        moodleCourseId: 101,
        completed: true,
        passed: true,
        gradePercent: 100,
        passThresholdUsed: 70,
      });
    });

    it('records a failing grade as a completion that did not pass', async () => {
      const { service, completions } = harness({
        progress: [{ ...passed(), gradePercent: 45 }],
      });

      await service.sync();

      expect(completions[0]).toMatchObject({ completed: true, passed: false, gradePercent: 45 });
    });

    it('never writes a second row for the same course', async () => {
      /* The (user, moodle_course_id) key is what makes polling safe. */
      const { service, completions } = harness({ progress: [passed()] });

      await service.sync();
      await service.sync();
      await service.sync();

      expect(completions).toHaveLength(1);
    });
  });

  describe('the certificate seam', () => {
    it('issues the course certificate on the run that turns the course into a pass', async () => {
      const { service, issued } = harness({ progress: [passed()] });

      await service.sync();

      expect(issued).toEqual([{ userId: 'user-1', courseId: 'course-1' }]);
    });

    it('does not re-enter issuance on later runs', async () => {
      /* Not the uniqueness guarantee — that is the unique index, and issuance
         checks for itself (D-042 §5). This only asserts the cheap path stays
         cheap: a polled job must not re-render a PDF every few minutes. */
      const { service, issued } = harness({ progress: [passed()] });

      await service.sync();
      await service.sync();

      expect(issued).toHaveLength(1);
    });

    it('issues nothing for a course that has not passed', async () => {
      const { service, issued } = harness({ progress: [{ ...passed(), gradePercent: 40 }] });

      await service.sync();

      expect(issued).toEqual([]);
    });

    it('still records the completion when issuance fails', async () => {
      /* Rendering needs Chromium and a writable disk. Neither is worth failing
         a sync over: the pass is true regardless, and reconciliation owns the
         retry. */
      const { service, completions } = harness({ progress: [passed()], issuanceThrows: true });

      await service.sync();

      expect(completions).toHaveLength(1);
      expect(completions[0]).toMatchObject({ passed: true });
    });

    it('still emails the learner when issuance fails, without promising a certificate', async () => {
      /* The learner passed. Telling them so is right; linking to a certificate
         that was never produced is not. */
      const { service, emails } = harness({ progress: [passed()], issuanceThrows: true });

      await service.sync();

      expect(emails).toEqual([
        { to: 'learner@ministry.gov.example', title: 'دورة الأمن', certificateIssued: false },
      ]);
    });
  });

  describe('the course-passed email', () => {
    it('is sent once, on the run that turns the course into a pass', async () => {
      const { service, emails } = harness({ progress: [passed()] });

      await service.sync();

      expect(emails).toEqual([
        { to: 'learner@ministry.gov.example', title: 'دورة الأمن', certificateIssued: true },
      ]);
    });

    it('is NOT re-sent on later runs', async () => {
      /* The single irreversible side effect in a job that runs every few
         minutes. Without the transition check a learner would be emailed about
         the same course forever. */
      const { service, emails } = harness({ progress: [passed()] });

      await service.sync();
      await service.sync();
      await service.sync();

      expect(emails).toHaveLength(1);
    });

    it('is not sent for a course that has not passed', async () => {
      const { service, emails } = harness({ progress: [{ ...passed(), gradePercent: 40 }] });

      await service.sync();

      expect(emails).toEqual([]);
    });

    it('does not fail the sync when the mail server is down', async () => {
      /* The completion is true regardless, and the next run must not
         re-process it just because SMTP was unavailable. */
      const { service, completions } = harness({ progress: [passed()], emailThrows: true });

      await expect(service.sync()).resolves.toMatchObject({ newlyPassed: 1 });
      expect(completions[0]!.passed).toBe(true);
    });
  });

  describe('mirroring onto the chosen courses', () => {
    it('marks the learner’s chosen course complete', async () => {
      const { service, chosen } = harness({
        progress: [passed()],
        chosen: [{ id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' }],
      });

      await service.sync();

      expect(chosen[0]!.status).toBe('COMPLETED');
    });

    it('reuses one completion across every route to the same course (D-003)', async () => {
      /* A course can belong to more than one path. Matching on moodle_course_id
         is what makes the completion count wherever it is reachable, so nothing
         is ever re-taken. */
      const { service, chosen } = harness({
        progress: [passed()],
        chosen: [
          { id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' },
          { id: 'upc-2', moodleCourseId: 101, status: 'NOT_STARTED' },
        ],
      });

      await service.sync();

      expect(chosen.map((row) => row.status)).toEqual(['COMPLETED', 'COMPLETED']);
    });

    it('marks an attempted-but-unfinished course in progress', async () => {
      const { service, chosen } = harness({
        progress: [{ ...passed(), completed: false, gradePercent: 40 }],
        chosen: [{ id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' }],
      });

      await service.sync();

      expect(chosen[0]!.status).toBe('IN_PROGRESS');
    });

    it('leaves an untouched course alone rather than inventing progress', async () => {
      const { service, chosen } = harness({
        progress: [{ ...passed(), completed: false, gradePercent: null }],
        chosen: [{ id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' }],
      });

      await service.sync();

      expect(chosen[0]!.status).toBe('NOT_STARTED');
    });
  });

  describe('path completion', () => {
    it('marks the path complete once every course is', async () => {
      const { service, pathUpdates } = harness({
        progress: [passed(101), passed(102)],
        chosen: [
          { id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' },
          { id: 'upc-2', moodleCourseId: 102, status: 'NOT_STARTED' },
        ],
      });

      await expect(service.sync()).resolves.toMatchObject({ pathsCompleted: 1 });
      expect(pathUpdates).toEqual(['path-1']);
    });

    it('does not complete a path with a course still outstanding', async () => {
      const { service, pathUpdates } = harness({
        progress: [passed(101)],
        chosen: [
          { id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' },
          { id: 'upc-2', moodleCourseId: 102, status: 'NOT_STARTED' },
        ],
      });

      await service.sync();

      expect(pathUpdates).toEqual([]);
    });

    it('audits path completion', async () => {
      const { service, audits } = harness({
        progress: [passed(101)],
        chosen: [{ id: 'upc-1', moodleCourseId: 101, status: 'NOT_STARTED' }],
      });

      await service.sync();

      expect(audits).toContainEqual(
        expect.objectContaining({ action: AuditAction.PATH_COMPLETED }),
      );
    });
  });

  describe('failure handling', () => {
    it('keeps going when one learner’s sync fails', async () => {
      /* An LMS refusing a single account must not stop the whole ministry. */
      const { service } = harness({
        listProgressThrows: true,
        learners: [
          { id: 'user-1', email: 'a@ministry.gov.example', moodleUserId: 5001 },
          { id: 'user-2', email: 'b@ministry.gov.example', moodleUserId: 5002 },
        ],
      });

      await expect(service.sync()).resolves.toMatchObject({ users: 2, failures: 2 });
    });

    it('audits a run with failures as FAILURE, with counts', async () => {
      const { service, audits } = harness({ listProgressThrows: true });

      await service.sync();

      expect(audits).toContainEqual(
        expect.objectContaining({
          action: AuditAction.LMS_COMPLETION_SYNCED,
          outcome: 'FAILURE',
        }),
      );
    });

    it('audits a clean run as SUCCESS', async () => {
      const { service, audits } = harness({ progress: [passed()] });

      await service.sync();

      expect(audits).toContainEqual(
        expect.objectContaining({
          action: AuditAction.LMS_COMPLETION_SYNCED,
          outcome: 'SUCCESS',
        }),
      );
    });

    it('puts no grade or learner name in the audit trail', async () => {
      const { service, audits } = harness({ progress: [passed()] });

      await service.sync();

      const serialised = JSON.stringify(audits);
      expect(serialised).not.toContain('learner@ministry.gov.example');
      expect(serialised).not.toContain('دورة الأمن');
    });
  });
});
