import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Which rows a caller of the entity portal may see (§4B, D-062, closing D-027).
 *
 * **Role and scope are two different questions and this answers only the
 * second.** `@Roles('ENTITY', 'SUPER_ADMIN')` decides whether an account may
 * call an endpoint at all; this decides which of that endpoint's rows belong to
 * them. Trying to express the second as a guard would mean the guard had to run
 * the query in order to know whether to allow it.
 *
 * **It lives in the service layer, not the controller**, for the same reason the
 * audit log does: a second caller of the same logic must not be able to reach
 * the data by a route that skipped the filter.
 */

/**
 * A resolved scope.
 *
 * `entityId: null` means **deliberately unscoped**, which only a super-admin
 * ever gets. It is a distinct value rather than an absent filter so that an
 * unscoped read is a visible branch in the code — an audit reading this should
 * be able to find every place the filter is skipped, and "the variable happened
 * to be undefined" is not findable.
 */
export interface EntityScope {
  entityId: string | null;
  isSuperAdmin: boolean;
}

@Injectable()
export class EntityScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the caller's scope, or refuses.
   *
   * **Fails closed.** An ENTITY account with no `entity_id` — half-provisioned,
   * or its organisation deleted out from under it — throws rather than falling
   * through to an unfiltered query. Returning "no filter" for a missing scope is
   * precisely how a scoping bug becomes a data breach: the account that should
   * see nothing sees everything, and every test still passes because the happy
   * path is unaffected.
   */
  async resolve(user: AuthenticatedUser): Promise<EntityScope> {
    if (user.role === 'SUPER_ADMIN') {
      /* §4C.5's global course oversight. Phase 5 builds the screens; the scope
         is honoured here so those screens do not need a parallel code path. */
      return { entityId: null, isSuperAdmin: true };
    }

    if (user.role !== 'ENTITY') {
      /* Unreachable through the guard, which admits only these two roles.
         Refusing anyway means the service is safe when called from anywhere —
         a job, a script, a controller written in Phase 5 that forgot @Roles. */
      throw new ForbiddenException('INSUFFICIENT_ROLE');
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { entityId: true, entity: { select: { status: true } } },
    });

    if (!row?.entityId) {
      throw new ForbiddenException('ENTITY_SCOPE_MISSING');
    }

    /* A suspended organisation keeps its data and its audit trail but stops
       acting — the operational answer to a supplier whose contract lapsed,
       since deleting an entity that owns courses is refused by the schema. */
    if (row.entity?.status === 'SUSPENDED') {
      throw new ForbiddenException('ENTITY_SUSPENDED');
    }

    return { entityId: row.entityId, isSuperAdmin: false };
  }

  /**
   * The `where` fragment restricting a `courses` query to this scope.
   *
   * Returning `{}` for a super-admin is the one place an empty filter is
   * correct, and it is written here rather than at each call site so that every
   * caller reads the same and none of them has to remember the exception.
   *
   * Note what an entity's filter is **not**: it is not `ownerEntityId: { not:
   * null }`. A course nobody owns belongs to no entity, so it is invisible to
   * all of them — an equality on their own id, never a "mine or unclaimed".
   */
  courseFilter(scope: EntityScope): { ownerEntityId?: string } {
    return scope.entityId === null ? {} : { ownerEntityId: scope.entityId };
  }

  /**
   * Asserts that a specific course is inside the scope, and returns it.
   *
   * Every single-course entity endpoint goes through this rather than fetching
   * by id and checking afterwards. The difference matters: a `findUnique` whose
   * result is checked later has already read another entity's row into memory,
   * and the check is one `return` away from being forgotten in a later edit.
   *
   * **A course outside the scope is reported as absent, not as forbidden.**
   * Distinguishing them would confirm that a given id exists, which is exactly
   * what an entity probing for a competitor's catalogue would be asking.
   */
  async requireOwnedCourse(scope: EntityScope, courseId: string): Promise<{ id: string }> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, ...this.courseFilter(scope) },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    return course;
  }
}
