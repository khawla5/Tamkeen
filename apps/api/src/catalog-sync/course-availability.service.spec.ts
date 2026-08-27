import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { availabilityWindowFrom, availabilityWindowUntil } from './catalog-mapping';
import { CourseAvailabilityService } from './course-availability.service';

/**
 * The refresh that turns a date the ministry set into a course actually being
 * hidden (§4C.5, TAM-134).
 *
 * Against fakes rather than a database: what is worth asserting here is which
 * courses it *reads*, which it *writes*, and that it writes nothing when the
 * derivation already agrees — the last of which would be invisible in an
 * integration test that only checked the final status.
 */
type CourseRow = {
  id: string;
  title: string;
  status: 'DRAFT' | 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';
  publication: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  lmsPresent: boolean;
  lmsVisible: boolean;
  availableFrom: Date | null;
  availableUntil: Date | null;
  _count: { userPathCourses: number };
};

const course = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: 'course-1',
  title: 'أساسيات الأمن السيبراني',
  status: 'AVAILABLE',
  publication: 'PUBLISHED',
  lmsPresent: true,
  lmsVisible: true,
  availableFrom: null,
  availableUntil: availabilityWindowUntil('2026-09-30'),
  _count: { userPathCourses: 0 },
  ...overrides,
});

function harness(rows: CourseRow[]) {
  const writes: Array<{ id: unknown; status: unknown }> = [];
  const audited: Array<Record<string, unknown>> = [];
  let where: unknown = null;

  const prisma = {
    course: {
      findMany: (args: { where: unknown }) => {
        where = args.where;
        return Promise.resolve(rows);
      },
      updateMany: (args: { where: { id: string }; data: { status: string } }) => {
        writes.push({ id: args.where.id, status: args.data.status });
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: Record<string, unknown>) => {
      audited.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  return {
    service: new CourseAvailabilityService(prisma, audit),
    writes,
    audited,
    where: () => where,
  };
}

describe('CourseAvailabilityService', () => {
  const duringWindow = new Date('2026-09-15T09:00:00Z');
  const afterWindow = new Date('2026-10-02T09:00:00Z');

  it('hides a course whose period has ended', () => {
    const { service, writes } = harness([course()]);

    return service.refresh(afterWindow).then((result) => {
      expect(writes).toEqual([{ id: 'course-1', status: 'HIDDEN_BUT_COMPLETABLE' }]);
      expect(result).toEqual({ scanned: 1, changed: 1 });
    });
  });

  it('writes nothing while the period is still open', async () => {
    /* A refresh that rewrote every row every few minutes would fill the audit
       trail with events in which nothing happened. */
    const { service, writes, audited } = harness([course()]);

    const result = await service.refresh(duringWindow);

    expect(writes).toEqual([]);
    expect(audited).toEqual([]);
    expect(result).toEqual({ scanned: 1, changed: 0 });
  });

  it('brings a course back when its period opens', async () => {
    const { service, writes } = harness([
      course({
        status: 'HIDDEN_BUT_COMPLETABLE',
        availableFrom: availabilityWindowFrom('2026-09-01'),
        availableUntil: null,
      }),
    ]);

    await service.refresh(duringWindow);

    expect(writes).toEqual([{ id: 'course-1', status: 'AVAILABLE' }]);
  });

  it('leaves a course a learner holds completable', async () => {
    /* §2/D-015 through the derivation, not through a check here: an expired
       window never produces RETIRED, held or not. */
    const { service, writes } = harness([course({ _count: { userPathCourses: 3 } })]);

    await service.refresh(afterWindow);

    expect(writes).toEqual([{ id: 'course-1', status: 'HIDDEN_BUT_COMPLETABLE' }]);
  });

  it('does not restore a course the entity withdrew', async () => {
    const { service, writes } = harness([
      course({ publication: 'UNPUBLISHED', status: 'RETIRED' }),
    ]);

    await service.refresh(duringWindow);

    expect(writes).toEqual([]);
  });

  it('reads only courses that have a window', async () => {
    /* The catalogue is roughly fifty courses and this runs every few minutes;
       a course with no bounds can never change status because of one. */
    const { service, where } = harness([]);

    await service.refresh(duringWindow);

    expect(where()).toEqual({
      OR: [{ availableFrom: { not: null } }, { availableUntil: { not: null } }],
    });
  });

  it("records the change as nobody's action", async () => {
    /* The clock reached a date somebody set earlier, and the entry that set it
       is already in the trail — so an actor here would name the wrong person. */
    const { service, audited } = harness([course()]);

    await service.refresh(afterWindow);

    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      action: 'COURSE_AVAILABILITY_APPLIED',
      actorUserId: null,
      targetType: 'course',
      targetId: 'course-1',
      detail: { from: 'AVAILABLE', to: 'HIDDEN_BUT_COMPLETABLE' },
    });
  });
});
