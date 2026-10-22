import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AdminAssignResult } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignPathDto } from './admin.dto';

/**
 * §4C.2 — putting employees on paths (D-130, D-133, D-134).
 *
 * **This is the whole of a learner's entitlement.** Nobody browses paths, nobody
 * chooses one, and nothing recommends one: an employee can see, take the
 * assessment of, and work through exactly the paths an administrator has
 * assigned them here. Which makes this the most consequential write in the admin
 * portal, and the reason both directions of it are audited per employee.
 *
 * **Assignment is an account decision** (D-133): it is made from the
 * manage-account panel in «الحسابات», not on a screen of its own. This service
 * is what that panel calls, and it takes a path with many employees because that
 * is how the work actually arrives — a directorate is put on a path together.
 *
 * **Revoking after placement moves the row to REVOKED rather than deleting it.**
 * A placement is the record of an assessment the learner sat, and completions and
 * certificates can point at courses on this path — deleting the row would strand
 * them. Before placement there is nothing to preserve, so the row is simply
 * removed. Either way the audit log is the history of the decision itself.
 * Assigning the same path again after a revoke reactivates that row (back to
 * ACTIVE) rather than creating a second one — `@@unique([userId, pathId])`
 * allows only one, and the learner's old placement/progress under it is real
 * and picks back up rather than starting over.
 */
@Injectable()
export class AdminPathAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Assigns one path to many employees. Idempotent per pair.
   *
   * Each grant is its own audit event even though the request is one call: the
   * question an incident review asks is "what was this person put on, and
   * since when", and a single entry naming forty people answers it for none of
   * them.
   */
  async assign(
    dto: AssignPathDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssignResult> {
    const path = await this.prisma.path.findUnique({
      where: { id: dto.pathId },
      select: { id: true, name: true, status: true },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    if (path.status !== 'PUBLISHED') {
      /* A draft path has no published assessment or no placed courses — that is
         what draft *means* here — so assigning somebody to it would strand them
         on a screen with nothing to do and no explanation. */
      throw new ConflictException(AuditReason.PATH_NOT_OFFERABLE);
    }

    const employees = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, role: 'EMPLOYEE' },
      select: { id: true },
    });

    if (employees.length !== new Set(dto.userIds).size) {
      /* Employees only, and every id must resolve. Silently dropping the rest
         would leave an administrator believing a directorate was assigned when
         part of it was not. */
      throw new BadRequestException('USER_NOT_FOUND');
    }

    const existing = await this.prisma.userPath.findMany({
      where: { pathId: path.id, userId: { in: employees.map((row) => row.id) } },
      select: { userId: true, status: true },
    });

    const existingByUser = new Map(existing.map((row) => [row.userId, row.status]));
    /* A REVOKED row is a past decision, not a current hold — reassigning
       reactivates the same row (the unique pair allows no other way) rather
       than being told the path is "already assigned". */
    const toReactivate = employees.filter(
      (row) => existingByUser.get(row.id) === 'REVOKED',
    );
    const toCreate = employees.filter((row) => !existingByUser.has(row.id));
    const alreadyHeld = employees.length - toReactivate.length - toCreate.length;

    for (const employee of toCreate) {
      await this.prisma.userPath.create({
        data: { userId: employee.id, pathId: path.id, assignedById: actorId },
      });

      await this.audit.record({
        action: AuditAction.ADMIN_PATH_ASSIGNED,
        outcome: 'SUCCESS',
        actorUserId: actorId,
        ipAddress,
        /* The employee is the target: "what was this person put on" is the
           question, and the path travels in the detail. */
        targetType: 'user',
        targetId: employee.id,
        detail: { path: path.name },
      });
    }

    for (const employee of toReactivate) {
      await this.prisma.userPath.update({
        where: { userId_pathId: { userId: employee.id, pathId: path.id } },
        data: { status: 'ACTIVE', assignedById: actorId, assignedAt: new Date() },
      });

      await this.audit.record({
        action: AuditAction.ADMIN_PATH_ASSIGNED,
        outcome: 'SUCCESS',
        actorUserId: actorId,
        ipAddress,
        targetType: 'user',
        targetId: employee.id,
        detail: { path: path.name, reactivated: true },
      });
    }

    return { created: toCreate.length + toReactivate.length, alreadyAssigned: alreadyHeld };
  }

  /**
   * Revokes an assignment. Before placement the row is simply removed —
   * nothing under it to preserve. After placement it moves to REVOKED
   * instead: the placement, any enrolments, completions and certificates
   * stay real and attributable, and the row itself is what a later
   * reassignment reactivates.
   */
  async revoke(
    userId: string,
    pathId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<void> {
    const assignment = await this.prisma.userPath.findUnique({
      where: { userId_pathId: { userId, pathId } },
      select: { id: true, status: true, path: { select: { name: true } } },
    });

    if (!assignment || assignment.status === 'REVOKED') {
      throw new NotFoundException('PATH_NOT_ASSIGNED');
    }

    const placed = await this.prisma.learnerPlacement.findUnique({
      where: { learnerId_pathId: { learnerId: userId, pathId } },
      select: { id: true },
    });

    if (placed) {
      await this.prisma.userPath.update({
        where: { id: assignment.id },
        data: { status: 'REVOKED' },
      });

      await this.audit.record({
        action: AuditAction.ADMIN_PATH_UNASSIGNED,
        outcome: 'SUCCESS',
        actorUserId: actorId,
        ipAddress,
        targetType: 'user',
        targetId: userId,
        detail: { path: assignment.path.name, hadProgress: true },
      });

      return;
    }

    await this.prisma.userPath.delete({ where: { id: assignment.id } });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_UNASSIGNED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: userId,
      detail: { path: assignment.path.name },
    });
  }
}
