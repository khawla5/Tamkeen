import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminAssignmentsService } from './admin-assignments.service';

/**
 * D-132's administrative rules: employees only, idempotent assignment,
 * revoke refused once taken — each with its audit trail.
 */
interface Row {
  id: string;
  userId: string;
  instrument: string;
  assignedAt: Date;
}

function build(options: {
  employees?: string[];
  assignments?: Row[];
  riasecTakenBy?: string[];
  englishTakenBy?: string[];
}) {
  const employees = options.employees ?? [];
  const assignments: Row[] = [...(options.assignments ?? [])];
  const audits: AuditEntry[] = [];
  let nextId = 100;

  const prisma = {
    user: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => employees.includes(id)).map((id) => ({ id }))),
    },
    assessmentAssignment: {
      findMany: ({ where }: { where?: { instrument?: string; userId?: { in: string[] } } }) =>
        Promise.resolve(
          assignments
            .filter((row) => !where?.instrument || row.instrument === where.instrument)
            .filter((row) => !where?.userId || where.userId.in.includes(row.userId))
            .map((row) => ({
              id: row.id,
              userId: row.userId,
              instrument: row.instrument,
              assignedAt: row.assignedAt,
              user: {
                id: row.userId,
                fullName: 'موظف',
                employeeId: 'EMP-1',
                department: 'الإدارة',
              },
            })),
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(assignments.find((row) => row.id === where.id) ?? null),
      createMany: ({ data }: { data: Array<{ userId: string; instrument: string }> }) => {
        for (const entry of data) {
          assignments.push({
            id: `a-${nextId++}`,
            userId: entry.userId,
            instrument: entry.instrument,
            assignedAt: new Date(),
          });
        }
        return Promise.resolve({ count: data.length });
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = assignments.findIndex((row) => row.id === where.id);
        assignments.splice(index, 1);
        return Promise.resolve({});
      },
    },
    assessmentResult: {
      findMany: ({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(
          (options.riasecTakenBy ?? [])
            .filter((id) => where.userId.in.includes(id))
            .map((userId) => ({ userId })),
        ),
      findFirst: ({ where }: { where: { userId: string } }) =>
        Promise.resolve((options.riasecTakenBy ?? []).includes(where.userId) ? { id: 'r1' } : null),
    },
    englishAssessmentResult: {
      findMany: ({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(
          (options.englishTakenBy ?? [])
            .filter((id) => where.userId.in.includes(id))
            .map((userId) => ({ userId })),
        ),
      findUnique: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          (options.englishTakenBy ?? []).includes(where.userId) ? { id: 'e1' } : null,
        ),
    },
  } as unknown as PrismaService;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  return { service: new AdminAssignmentsService(prisma, audit), assignments, audits };
}

describe('AdminAssignmentsService', () => {
  describe('assign', () => {
    it('assigns each employee once and audits each grant', async () => {
      const { service, assignments, audits } = build({ employees: ['u1', 'u2'] });

      const result = await service.assign('RIASEC', ['u1', 'u2'], 'admin-1', null);

      expect(result).toEqual({ created: 2, alreadyAssigned: 0 });
      expect(assignments).toHaveLength(2);
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({
        action: AuditAction.ADMIN_ASSESSMENT_ASSIGNED,
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        targetType: 'user',
        detail: { instrument: 'RIASEC' },
      });
    });

    it('is idempotent per (user, instrument): re-assignment is a report, not an error', async () => {
      const { service, assignments, audits } = build({
        employees: ['u1', 'u2'],
        assignments: [{ id: 'a-1', userId: 'u1', instrument: 'RIASEC', assignedAt: new Date() }],
      });

      const result = await service.assign('RIASEC', ['u1', 'u2'], 'admin-1', null);

      expect(result).toEqual({ created: 1, alreadyAssigned: 1 });
      expect(assignments).toHaveLength(2);
      /* Only the new grant is audited — nothing changed for the other. */
      expect(audits).toHaveLength(1);
    });

    it('refuses a target that is not an employee', async () => {
      const { service, assignments } = build({ employees: ['u1'] });

      await expect(
        service.assign('RIASEC', ['u1', 'entity-1'], 'admin-1', null),
      ).rejects.toMatchObject({ constructor: NotFoundException, message: 'EMPLOYEE_NOT_FOUND' });
      expect(assignments).toHaveLength(0);
    });
  });

  describe('revoke', () => {
    it('deletes an untaken assignment and audits the revocation', async () => {
      const { service, assignments, audits } = build({
        assignments: [{ id: 'a-1', userId: 'u1', instrument: 'RIASEC', assignedAt: new Date() }],
      });

      await service.revoke('a-1', 'admin-1', null);

      expect(assignments).toHaveLength(0);
      expect(audits[0]).toMatchObject({
        action: AuditAction.ADMIN_ASSESSMENT_UNASSIGNED,
        outcome: 'SUCCESS',
        targetId: 'u1',
        detail: { instrument: 'RIASEC' },
      });
    });

    it('refuses to revoke a taken assignment, and audits the refusal', async () => {
      const { service, assignments, audits } = build({
        assignments: [
          { id: 'a-1', userId: 'u1', instrument: 'ENGLISH_CEFR', assignedAt: new Date() },
        ],
        englishTakenBy: ['u1'],
      });

      await expect(service.revoke('a-1', 'admin-1', null)).rejects.toMatchObject({
        constructor: ConflictException,
        message: 'ASSIGNMENT_ALREADY_TAKEN',
      });
      expect(assignments).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        outcome: 'FAILURE',
        reason: AuditReason.ASSIGNMENT_ALREADY_TAKEN,
      });
    });

    it('404s on an unknown assignment id', async () => {
      const { service } = build({});

      await expect(service.revoke('missing', 'admin-1', null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
