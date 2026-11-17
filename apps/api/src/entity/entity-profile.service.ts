import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { EntityProfileView } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import type { EntityScope } from './entity-scope.service';
import type { UpdateEntityProfileDto } from './entity.dto';

/**
 * §4B.6 — the organisation's own record. Deliberately minimal.
 *
 * This is procurement information the ministry already holds about a supplier,
 * not new personal data collected from an individual: an organisation name and
 * a departmental contact. There is no per-user profile here, because the account
 * belongs to the organisation rather than the reverse (D-063).
 */
@Injectable()
export class EntityProfileService {
  private readonly logger = new Logger(EntityProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async get(scope: EntityScope): Promise<EntityProfileView | null> {
    /*
     * Null rather than 404 for a super-admin. They legitimately have no
     * organisation, and §4C gives them their own portal — so "there is nothing
     * here for you" is a normal state to render, not a failure to report.
     */
    if (scope.entityId === null) {
      return null;
    }

    const entity = await this.prisma.entity.findUnique({
      where: { id: scope.entityId },
      select: { id: true, name: true, contactName: true, contactEmail: true },
    });

    if (!entity) {
      /* The scope resolver already proved this row exists, so reaching here
         means it was deleted between two queries in the same request. */
      throw new NotFoundException('ENTITY_NOT_FOUND');
    }

    return entity;
  }

  /**
   * §4B.6's edit, mirroring §4.12's for the employee: the account holder's own
   * name and the organisation's contact, saved together. The organisation's
   * name stays the ministry's to change (D-063, §4C.2).
   *
   * Refused for an account with no organisation — a super-admin visiting, or a
   * half-provisioned entity account — rather than saving the name alone: the
   * form the caller submitted is one thing, and half of it silently landing
   * would be worse than a refusal that says why.
   *
   * A name change also reaches the LMS, best-effort, as the employee's does:
   * an entity author's name is what Moodle shows beside everything they
   * publish there.
   */
  async update(
    scope: EntityScope,
    userId: string,
    dto: UpdateEntityProfileDto,
    ipAddress: string | null,
  ): Promise<EntityProfileView> {
    if (scope.entityId === null) {
      throw new ForbiddenException(AuditReason.ENTITY_REQUIRED);
    }

    const [user, entity] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { fullName: true, moodleUserId: true },
      }),
      this.prisma.entity.findUniqueOrThrow({
        where: { id: scope.entityId },
        select: { id: true, name: true, contactName: true, contactEmail: true },
      }),
    ]);

    const changed = [
      ...(dto.fullName !== user.fullName ? ['fullName'] : []),
      ...(dto.contactName !== entity.contactName ? ['contactName'] : []),
      ...(dto.contactEmail !== entity.contactEmail ? ['contactEmail'] : []),
    ];

    if (changed.length === 0) {
      /* Resubmitting unchanged values is a valid no-op, not an error — nothing
         to write, nothing to audit. */
      return entity;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { fullName: dto.fullName } }),
      this.prisma.entity.update({
        where: { id: entity.id },
        data: { contactName: dto.contactName, contactEmail: dto.contactEmail },
      }),
    ]);

    await this.audit.record({
      action: AuditAction.ENTITY_PROFILE_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'entity',
      targetId: entity.id,
      /* Which fields changed, never their values (§6 PII discipline). */
      detail: { fields: changed.sort().join(',') },
    });

    if (changed.includes('fullName') && user.moodleUserId !== null) {
      await this.propagateNameToLms(userId, user.moodleUserId, dto.fullName, ipAddress);
    }

    return {
      id: entity.id,
      name: entity.name,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
    };
  }

  /** Best-effort, exactly as `ProfileService` does it: the save above has
   *  already committed, so a failure here is audited and left for D-036's
   *  reconciliation, never surfaced as a failure the save did not have. */
  private async propagateNameToLms(
    userId: string,
    moodleUserId: number,
    fullName: string,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      await this.lms.updateUser({ lmsUserId: moodleUserId, fullName });
    } catch (error) {
      this.logger.error(
        `Failed to propagate an entity name change to Moodle for user ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      await this.audit.record({
        action: AuditAction.PROFILE_LMS_SYNC_FAILED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'user',
        targetId: userId,
        detail: { field: 'fullName' },
      });
    }
  }
}
