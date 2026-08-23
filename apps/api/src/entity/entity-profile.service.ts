import { Injectable, NotFoundException } from '@nestjs/common';

import type { EntityProfileView } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import type { EntityScope } from './entity-scope.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
