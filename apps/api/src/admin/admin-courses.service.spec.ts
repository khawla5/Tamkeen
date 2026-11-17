import { ConflictException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service';
import type { LmsPort } from '../moodle/lms.port';
import { LmsOperationError, LmsUnavailableError } from '../moodle/lms.types';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminCoursesService } from './admin-courses.service';

/**
 * §4C.5 — deleting a course, and what the administrator is told when it fails.
 *
 * The rule worth pinning down is the *wording of the refusal*. The transport
 * reports Moodle's "not allowed" (`accessexception`, `nopermissions`, an invalid
 * token) as `LmsUnavailableError('UNAUTHORISED')`, the same class it throws when
 * Moodle is genuinely down. An administrator who is told the platform is
 * *unreachable* when Moodle answered "no" waits for an outage that is not
 * happening, and the missing grant on the integration role is never fixed — the
 * message that shipped, and the reason these tests exist.
 *
 * The other half of the rule is the ordering that makes a refusal safe: the LMS
 * is asked first and our row is deleted second, so a refusal leaves the
 * catalogue and the LMS agreeing.
 */

const COURSE = { id: 'c1', moodleCourseId: 42, title: 'دورة تجريبية' };

function harness(options: { held?: number; deleteCourse?: () => Promise<void> } = {}) {
  const deleted: string[] = [];
  const audited: Array<{ outcome: string; reason?: string }> = [];

  const group = (field: string, count: number) =>
    Promise.resolve(
      count > 0
        ? [{ [field]: field === 'moodleCourseId' ? 42 : 'c1', _count: { _all: count } }]
        : [],
    );

  const prisma = {
    course: {
      findUnique: () => Promise.resolve(COURSE),
      delete: ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);

        return Promise.resolve(COURSE);
      },
    },
    enrollment: { groupBy: () => group('courseId', options.held ?? 0) },
    certificate: { groupBy: () => group('courseId', 0) },
    completion: { groupBy: () => group('moodleCourseId', 0) },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: { outcome: string; reason?: string }) => {
      audited.push(entry);

      return Promise.resolve();
    },
  } as unknown as AuditService;

  const lmsCalls: number[] = [];
  const lms = {
    deleteCourse: (id: number) => {
      lmsCalls.push(id);

      return (options.deleteCourse ?? (() => Promise.resolve()))();
    },
  } as unknown as LmsPort;

  return { service: new AdminCoursesService(prisma, audit, lms), deleted, audited, lmsCalls };
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);

    return (error as ConflictException).message;
  }

  throw new Error('expected a refusal');
}

describe('AdminCoursesService.remove', () => {
  it('deletes the LMS course first and then our row', async () => {
    const { service, deleted, lmsCalls } = harness();

    await service.remove('c1', 'admin-1', null);

    expect(lmsCalls).toEqual([42]);
    expect(deleted).toEqual(['c1']);
  });

  it('says the LMS did not allow it — not that it is unreachable — when Moodle refuses the call', async () => {
    const { service, deleted } = harness({
      deleteCourse: () => Promise.reject(new LmsUnavailableError('UNAUTHORISED')),
    });

    expect(await refusal(service.remove('c1', 'admin-1', null))).toBe('COURSE_LMS_DELETE_FAILED');
    /* A refusal must not leave the catalogue and the LMS disagreeing. */
    expect(deleted).toEqual([]);
  });

  it('says the LMS did not allow it when Moodle answers with a warning instead of an error', async () => {
    const { service, deleted } = harness({
      deleteCourse: () => Promise.reject(new LmsOperationError('DELETE_COURSE')),
    });

    expect(await refusal(service.remove('c1', 'admin-1', null))).toBe('COURSE_LMS_DELETE_FAILED');
    expect(deleted).toEqual([]);
  });

  it.each(['UNREACHABLE', 'UNEXPECTED_RESPONSE'] as const)(
    'still says the LMS is unavailable when it really is (%s)',
    async (failureCode) => {
      const { service, deleted } = harness({
        deleteCourse: () => Promise.reject(new LmsUnavailableError(failureCode)),
      });

      expect(await refusal(service.remove('c1', 'admin-1', null))).toBe('LMS_UNAVAILABLE');
      expect(deleted).toEqual([]);
    },
  );

  it('audits the refusal, whichever way the LMS refused', async () => {
    const { service, audited } = harness({
      deleteCourse: () => Promise.reject(new LmsUnavailableError('UNAUTHORISED')),
    });

    await refusal(service.remove('c1', 'admin-1', null));

    expect(audited).toEqual([
      expect.objectContaining({ outcome: 'FAILURE', reason: 'LMS_COURSE_DELETE_FAILED' }),
    ]);
  });

  it('refuses a course learners hold without asking the LMS at all', async () => {
    const { service, lmsCalls, deleted } = harness({ held: 3 });

    expect(await refusal(service.remove('c1', 'admin-1', null))).toBe('COURSE_IN_USE');
    expect(lmsCalls).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
