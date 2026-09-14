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
 * **Revoking is refused once the learner has been placed.** A placement is the
 * record of an assessment they sat; removing the assignment under it would leave
 * a result pointing at a path the person was never on. Before placement there is
 * nothing to preserve, so the row simply goes — the audit log is the history, as
 * everywhere else.
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
      select: { userId: true },
    });

    const already = new Set(existing.map((row) => row.userId));
    const toCreate = employees.filter((row) => !already.has(row.id));

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

    return { created: toCreate.length, alreadyAssigned: already.size };
  }

  /** Revokes an assignment, unless the learner has already been placed. */
  async revoke(
    userId: string,
    pathId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<void> {
    const assignment = await this.prisma.userPath.findUnique({
      where: { userId_pathId: { userId, pathId } },
      select: { id: true, path: { select: { name: true } } },
    });

    if (!assignment) {
      throw new NotFoundException('PATH_NOT_ASSIGNED');
    }

    const placed = await this.prisma.learnerPlacement.findUnique({
      where: { learnerId_pathId: { learnerId: userId, pathId } },
      select: { id: true },
    });

    if (placed) {
      await this.audit.record({
        action: AuditAction.ADMIN_PATH_UNASSIGNED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'user',
        targetId: userId,
        reason: AuditReason.ASSIGNMENT_ALREADY_STARTED,
        detail: { path: assignment.path.name },
      });

      throw new ConflictException('ASSIGNMENT_ALREADY_STARTED');
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
