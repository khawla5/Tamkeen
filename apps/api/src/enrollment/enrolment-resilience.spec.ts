import type { AssessmentAssignmentResolutionService } from '../assessment-assignment/assessment-assignment-resolution.service';
import { AuditAction } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { JourneyStateService } from '../journey/journey-state.service';
import type { LmsPort } from '../moodle/lms.port';
import { LmsOperationError, LmsUnavailableError } from '../moodle/lms.types';
import type { PrismaService } from '../prisma/prisma.service';
import { EnrollmentService } from './enrollment.service';

/**
 * How enrolment behaves when the LMS misbehaves.
 *
 * Phase 1 covered enrolment through the journey integration suite, where the
 * mock never failed — so none of this was reachable. Against a real Moodle it is
 * the normal case: a course is refused, a call times out, the whole instance is
 * briefly down. Each of those has a right answer, and getting it wrong leaves a
 * learner half-enrolled in a path they cannot switch out of (D-002).
 *
 * Driven through `retryPendingEnrolments`, which is the public entry into the
 * same enrolment path the confirm gate uses.
 */

interface Row {
  id: string;
  userPathId: string;
  courseId: string;
  moodleCourseId: number;
  enrolledAt: Date | null;
}

function harness(options: {
  rows: Row[];
  enrol?: (lmsCourseId: number) => void;
  moodleUserId?: number | null;
  provisionThrows?: boolean;
}) {
  const rows = options.rows;
  const audits: AuditEntry[] = [];
  const attempted: number[] = [];

  const prisma = {
    userPathCourse: {
      findMany: (args: {
        where: { userPathId?: string; courseId?: { in: string[] } };
      }): Promise<unknown[]> => {
        const pending = rows.filter((row) => row.enrolledAt === null);

        /* The service makes two differently-shaped reads; the per-path one is
           the only one scoped to a userPathId. */
        if (args.where.userPathId !== undefined) {
          const ids = args.where.courseId?.in ?? [];
          return Promise.resolve(
            pending
              .filter(
                (row) => row.userPathId === args.where.userPathId && ids.includes(row.courseId),
              )
              .map((row) => ({ id: row.id, course: { moodleCourseId: row.moodleCourseId } })),
          );
        }

        return Promise.resolve(
          pending.map((row) => ({
            courseId: row.courseId,
            userPathId: row.userPathId,
            userPath: { userId: 'user-1' },
          })),
        );
      },
      update: (args: { where: { id: string }; data: { enrolledAt: Date } }) => {
        const row = rows.find((candidate) => candidate.id === args.where.id);
        if (row) row.enrolledAt = args.data.enrolledAt;
        return Promise.resolve({});
      },
      count: () => Promise.resolve(rows.filter((row) => row.enrolledAt === null).length),
    },
    user: {
      findUniqueOrThrow: () =>
        Promise.resolve({
          id: 'user-1',
          email: 'learner@ministry.gov.example',
          fullName: 'متدرب',
          /* `?? 5001` would be wrong: null is a meaningful value here, meaning
             "no LMS account yet", which is what sends the service to provision
             one. Nullish coalescing would swallow exactly the case under test. */
          moodleUserId: options.moodleUserId === null ? null : (options.moodleUserId ?? 5001),
        }),
      update: () => Promise.resolve({}),
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  const lms = {
    enrol: ({ lmsCourseId }: { lmsUserId: number; lmsCourseId: number }) => {
      attempted.push(lmsCourseId);
      options.enrol?.(lmsCourseId);
      return Promise.resolve();
    },
    provisionUser: () => {
      if (options.provisionThrows) {
        return Promise.reject(new LmsUnavailableError('UNREACHABLE'));
      }
      return Promise.resolve({ lmsUserId: 5001, email: 'learner@ministry.gov.example' });
    },
  } as unknown as LmsPort;

  const journey = {} as unknown as JourneyStateService;
  const assignments = {} as unknown as AssessmentAssignmentResolutionService;

  return {
    service: new EnrollmentService(prisma, journey, audit, assignments, lms),
    rows,
    audits,
    attempted,
  };
}

const row = (id: string, moodleCourseId: number, userPathId = 'path-1'): Row => ({
  id,
  userPathId,
  courseId: `course-${id}`,
  moodleCourseId,
  enrolledAt: null,
});

describe('enrolment resilience', () => {
  it('enrols every course and records the success', async () => {
    const { service, rows, audits } = harness({
      rows: [row('a', 101), row('b', 102), row('c', 103)],
    });

    await expect(service.retryPendingEnrolments()).resolves.toMatchObject({
      paths: 1,
      enrolled: 3,
      stillPending: 0,
    });

    expect(rows.every((entry) => entry.enrolledAt !== null)).toBe(true);
    expect(audits[0]).toMatchObject({
      action: AuditAction.PATH_ENROLMENT_REQUESTED,
      outcome: 'SUCCESS',
      detail: { requested: 3, enrolled: 3, failed: 0 },
    });
  });

  it('keeps going when one course is refused', async () => {
    /* The defect this prevents: one refusal abandoning every course after it,
       leaving a half-enrolled path the user cannot switch out of, and an audit
       entry claiming the whole batch failed. */
    const { service, rows, attempted } = harness({
      rows: [row('a', 101), row('b', 102), row('c', 103)],
      enrol: (lmsCourseId) => {
        if (lmsCourseId === 102) throw new LmsOperationError('ENROL');
      },
    });

    await service.retryPendingEnrolments();

    expect(attempted).toEqual([101, 102, 103]);
    expect(rows.find((entry) => entry.moodleCourseId === 101)!.enrolledAt).not.toBeNull();
    expect(rows.find((entry) => entry.moodleCourseId === 102)!.enrolledAt).toBeNull();
    expect(rows.find((entry) => entry.moodleCourseId === 103)!.enrolledAt).not.toBeNull();
  });

  it('audits a partial failure as FAILURE, with the counts', async () => {
    /* "2 of 3 enrolled" has to be recoverable from the audit trail; an
       undifferentiated FAILURE would send someone to re-enrol all three. */
    const { service, audits } = harness({
      rows: [row('a', 101), row('b', 102), row('c', 103)],
      enrol: (lmsCourseId) => {
        if (lmsCourseId === 102) throw new LmsOperationError('ENROL');
      },
    });

    await service.retryPendingEnrolments();

    expect(audits[0]).toMatchObject({
      outcome: 'FAILURE',
      detail: { requested: 3, enrolled: 2, failed: 1 },
    });
  });

  it('never throws, whatever the LMS does', async () => {
    /* The commitment is already recorded and irreversible. Throwing here would
       tell the user their decision did not take, when it did (D-036). */
    const { service } = harness({
      rows: [row('a', 101)],
      enrol: () => {
        throw new LmsUnavailableError('UNREACHABLE');
      },
    });

    await expect(service.retryPendingEnrolments()).resolves.toBeDefined();
  });

  it('does not attempt any course when provisioning fails', async () => {
    /* Without an LMS account there is nothing to enrol into, so this is the one
       whole-batch failure that remains correct. */
    const { service, attempted, audits } = harness({
      rows: [row('a', 101), row('b', 102)],
      moodleUserId: null,
      provisionThrows: true,
    });

    await service.retryPendingEnrolments();

    expect(attempted).toEqual([]);
    expect(audits[0]).toMatchObject({
      outcome: 'FAILURE',
      detail: { requested: 2, enrolled: 0, failed: 2 },
    });
  });

  it('leaves an already-enrolled course alone, so a retry cannot double-enrol', async () => {
    const enrolledAt = new Date('2026-08-01T00:00:00.000Z');
    const done = { ...row('a', 101), enrolledAt };

    const { service, attempted } = harness({ rows: [done, row('b', 102)] });

    await service.retryPendingEnrolments();

    expect(attempted).toEqual([102]);
    expect(done.enrolledAt).toBe(enrolledAt);
  });

  it('is a no-op when nothing is pending', async () => {
    const { service, audits, attempted } = harness({
      rows: [{ ...row('a', 101), enrolledAt: new Date() }],
    });

    await expect(service.retryPendingEnrolments()).resolves.toEqual({
      paths: 0,
      enrolled: 0,
      stillPending: 0,
    });

    expect(attempted).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('reconciles several paths in one run', async () => {
    const { service, audits } = harness({
      rows: [row('a', 101, 'path-1'), row('b', 102, 'path-2')],
    });

    await expect(service.retryPendingEnrolments()).resolves.toMatchObject({ paths: 2 });
    expect(audits).toHaveLength(2);
  });

  it('attributes a background reconciliation to no IP address', async () => {
    /* It is not a user action. Inventing an address would make the audit trail
       claim someone did something they did not. */
    const { service, audits } = harness({ rows: [row('a', 101)] });

    await service.retryPendingEnrolments();

    expect(audits[0]!.ipAddress).toBeNull();
  });
});
