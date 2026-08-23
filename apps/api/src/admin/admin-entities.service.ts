import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AdminEntityRow } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdminEntityDto, UpdateAdminEntityDto } from './admin.dto';

/**
 * §4C.2 — the organisations that supply courses.
 *
 * **This is the seam Phase 4 left open.** Until now an entity existed only if
 * `prisma/seed.ts` created one, which meant onboarding a ministry supplier
 * required a developer with database access — the exact thing §4C exists to
 * remove.
 *
 * **There is no delete.** `courses.ownerEntityId` is `Restrict`, so an
 * organisation holding courses cannot be removed anyway (D-063), and one holding
 * none is still the counterparty on an audit trail that must stay resolvable.
 * Suspension is the operational answer: `EntityScopeService` already refuses
 * every request from a suspended organisation's accounts, so suspending is
 * immediate and complete without touching a single row of their data.
 */
@Injectable()
export class AdminEntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q?: string): Promise<AdminEntityRow[]> {
    const entities = await this.prisma.entity.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        contactName: true,
        contactEmail: true,
        status: true,
        createdAt: true,
        /* Both counts, because together they answer the only structural
           question an administrator has about an organisation: whether it is
           actually operating, or a shell somebody created and never staffed. */
        _count: { select: { users: true, courses: true } },
      },
    });

    return entities.map((entity) => ({
      id: entity.id,
      key: entity.key,
      name: entity.name,
      contactName: entity.contactName,
      contactEmail: entity.contactEmail,
      status: entity.status,
      accountCount: entity._count.users,
      courseCount: entity._count.courses,
      createdAt: entity.createdAt.toISOString(),
    }));
  }

  /**
   * Creates an organisation.
   *
   * No account is created with it. The two steps are separate because they
   * answer to different facts: the organisation is a procurement decision, and
   * who speaks for it is a staffing one that changes independently. Bundling
   * them would also mean a failed email send left an organisation half-created.
   */
  async create(
    dto: CreateAdminEntityDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminEntityRow> {
    const key = dto.key.trim().toLowerCase();

    const clash = await this.prisma.entity.findUnique({ where: { key }, select: { id: true } });

    if (clash) {
      throw new ConflictException('ENTITY_KEY_TAKEN');
    }

    const entity = await this.prisma.entity.create({
      data: {
        key,
        name: dto.name,
        contactName: dto.contactName ?? '',
        contactEmail: dto.contactEmail?.toLowerCase() ?? '',
      },
      select: { id: true },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ENTITY_CREATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'Entity',
      targetId: entity.id,
      /* The key, not the contact address. An organisation's key is an
         identifier we chose; the contact is a named person at a supplier. */
      detail: { key },
    });

    return this.require(entity.id);
  }

  async update(
    entityId: string,
    dto: UpdateAdminEntityDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminEntityRow> {
    const existing = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { status: true },
    });

    if (!existing) {
      throw new NotFoundException('ENTITY_NOT_FOUND');
    }

    await this.prisma.entity.update({
      where: { id: entityId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.contactName === undefined ? {} : { contactName: dto.contactName }),
        ...(dto.contactEmail === undefined ? {} : { contactEmail: dto.contactEmail.toLowerCase() }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ENTITY_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'Entity',
      targetId: entityId,
      /* Which fields moved, never their values — a contact name is PII and an
         audit payload is not where it belongs. The status is the exception,
         because suspending a supplier is the change a review looks for.

         Filtered on `!== undefined` rather than taking `Object.keys` whole:
         `ValidationPipe` runs with `transform: true`, so the DTO arrives as a
         class instance on which every declared optional is an own property
         holding `undefined`. Keying off that would have the trail claim all four
         fields changed on every edit, which is worse than recording nothing —
         a reviewer would stop believing the payload. */
      detail: {
        fields: Object.entries(dto)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field)
          .sort()
          .join(','),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    return this.require(entityId);
  }

  private async require(entityId: string): Promise<AdminEntityRow> {
    const rows = await this.list();
    const found = rows.find((row) => row.id === entityId);

    if (!found) {
      throw new NotFoundException('ENTITY_NOT_FOUND');
    }

    return found;
  }
}
