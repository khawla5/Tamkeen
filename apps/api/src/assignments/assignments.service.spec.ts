import { ForbiddenException } from '@nestjs/common';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';

/**
 * The D-132 gate: an employee may only TAKE an assigned instrument. The
 * refusal is a 403 with a stable code; a submission refusal is audited, a
 * plain read refusal is not.
 */
function build(assigned: Array<{ userId: string; instrument: string }>) {
  const audits: AuditEntry[] = [];

  const prisma = {
    assessmentAssignment: {
      findUnique: ({
        where,
      }: {
        where: { userId_instrument: { userId: string; instrument: string } };
      }) => {
        const hit = assigned.find(
          (row) =>
            row.userId === where.userId_instrument.userId &&
            row.instrument === where.userId_instrument.instrument,
        );
        return Promise.resolve(hit ? { id: 'assignment-1' } : null);
      },
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          assigned
            .filter((row) => row.userId === where.userId)
            .map((row) => ({ instrument: row.instrument })),
        ),
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  return { service: new AssignmentsService(prisma, audit), audits };
}

describe('AssignmentsService', () => {
  it('lists the instruments assigned to the employee', async () => {
    const { service } = build([
      { userId: 'u1', instrument: 'RIASEC' },
      { userId: 'u1', instrument: 'ENGLISH_CEFR' },
      { userId: 'u2', instrument: 'RIASEC' },
    ]);

    await expect(service.listInstruments('u1')).resolves.toEqual(['RIASEC', 'ENGLISH_CEFR']);
    await expect(service.listInstruments('u3')).resolves.toEqual([]);
  });

  it('passes silently when the instrument is assigned', async () => {
    const { service, audits } = build([{ userId: 'u1', instrument: 'RIASEC' }]);

    await expect(service.assertAssigned('u1', 'RIASEC')).resolves.toBeUndefined();
    expect(audits).toHaveLength(0);
  });

  it('refuses an unassigned instrument with 403 ASSESSMENT_NOT_ASSIGNED', async () => {
    const { service } = build([{ userId: 'u1', instrument: 'ENGLISH_CEFR' }]);

    await expect(service.assertAssigned('u1', 'RIASEC')).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'ASSESSMENT_NOT_ASSIGNED',
    });
  });

  it('audits the refusal only when an audit context is given (submit paths)', async () => {
    const { service, audits } = build([]);

    await expect(service.assertAssigned('u1', 'RIASEC')).rejects.toBeInstanceOf(ForbiddenException);
    expect(audits).toHaveLength(0);

    await expect(
      service.assertAssigned('u1', 'RIASEC', {
        action: AuditAction.ASSESSMENT_SUBMITTED,
        ipAddress: '10.0.0.1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: AuditAction.ASSESSMENT_SUBMITTED,
      outcome: 'FAILURE',
      actorUserId: 'u1',
      reason: AuditReason.ASSESSMENT_NOT_ASSIGNED,
      detail: { instrument: 'RIASEC' },
    });
  });
});
