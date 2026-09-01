import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AdminAssignResult, AssessmentInstrument } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * §4C.2 — assessment assignment (D-130/D-132/D-133): who may take which
 * instrument, written from the manage-account panel (the read side rides on
 * `AdminUsersService.get`).
 *
 * The rules enforced here rather than in the controller:
 *
 *  1. **Only employees are assignable.** An entity or admin account taking a
 *     placement test is a nonsense row every later screen would have to
 *     explain away.
 *  2. **Assignment is idempotent** per (user, instrument) — re-assigning is a
 *     no-op reported as such, never an error and never a duplicate.
 *  3. **A taken assignment cannot be revoked** — a result must never point at
 *     a gate claiming it could not have happened. Results themselves are
 *     append-only and are not touched from here at all.
 *
 * Both directions are audited per employee: "what could this person take,
 * and since when" is the question an incident review asks.
 */
@Injectable()
export class AdminAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assign(
    instrument: AssessmentInstrument,
    userIds: string[],
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssignResult> {
    const distinct = [...new Set(userIds)];

    /* Rule 1: employees only. A 404 rather than a 400 — an id that is not an
       assignable employee is a target that does not exist for this screen. */
    const employees = await this.prisma.user.findMany({
      where: { id: { in: distinct }, role: 'EMPLOYEE' },
      select: { id: true },
    });

    if (employees.length !== distinct.length) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    const existing = await this.prisma.assessmentAssignment.findMany({
      where: { instrument, userId: { in: distinct } },
      select: { userId: true },
    });
    const alreadyAssigned = new Set(existing.map((row) => row.userId));
    const toCreate = distinct.filter((userId) => !alreadyAssigned.has(userId));

    /* skipDuplicates keeps a concurrent double-submit idempotent — the race
       loses quietly, exactly like a repeated click should. */
    await this.prisma.assessmentAssignment.createMany({
      data: toCreate.map((userId) => ({ userId, instrument, assignedById: actorId })),
      skipDuplicates: true,
    });

    for (const userId of toCreate) {
      await this.audit.record({
        action: AuditAction.ADMIN_ASSESSMENT_ASSIGNED,
        outcome: 'SUCCESS',
        actorUserId: actorId,
        ipAddress,
        targetType: 'user',
        targetId: userId,
        detail: { instrument },
      });
    }

    return { created: toCreate.length, alreadyAssigned: alreadyAssigned.size };
  }

  /** Rule 3: refused once taken; otherwise the row is deleted (the audit log
   *  is the history) and the same (user, instrument) is assignable again. */
  async revoke(id: string, actorId: string, ipAddress: string | null): Promise<void> {
    const row = await this.prisma.assessmentAssignment.findUnique({
      where: { id },
      select: { id: true, userId: true, instrument: true },
    });

    if (!row) {
      throw new NotFoundException('ASSIGNMENT_NOT_FOUND');
    }

    const taken =
      row.instrument === 'RIASEC'
        ? await this.prisma.assessmentResult.findFirst({
            where: { userId: row.userId },
            select: { id: true },
          })
        : await this.prisma.englishAssessmentResult.findUnique({
            where: { userId: row.userId },
            select: { id: true },
          });

    if (taken) {
      await this.audit.record({
        action: AuditAction.ADMIN_ASSESSMENT_UNASSIGNED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'user',
        targetId: row.userId,
        reason: AuditReason.ASSIGNMENT_ALREADY_TAKEN,
        detail: { instrument: row.instrument },
      });

      throw new ConflictException('ASSIGNMENT_ALREADY_TAKEN');
    }

    await this.prisma.assessmentAssignment.delete({ where: { id: row.id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_UNASSIGNED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: row.userId,
      detail: { instrument: row.instrument },
    });
  }
}
