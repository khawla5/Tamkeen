import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/session.service';
import type { PrismaService } from '../prisma/prisma.service';
import { EntityScopeService, type EntityScope } from './entity-scope.service';

/**
 * The scoping rules (D-062), tested against a fake Prisma.
 *
 * What matters here is the *filter that gets built* and the refusals, not the
 * database's behaviour — the integration suite proves the filter actually
 * excludes another entity's rows from a real query. These tests exist to pin
 * down the decisions a reader of the filter cannot see: what happens when the
 * scope is missing, and whether an unowned course counts as anyone's.
 */

interface CourseRow {
  id: string;
  ownerEntityId: string | null;
}

function harness(
  options: {
    entityId?: string | null;
    entityStatus?: 'ACTIVE' | 'SUSPENDED';
    courses?: CourseRow[];
  } = {},
) {
  const courses = options.courses ?? [];
  const findFirstArgs: unknown[] = [];

  const prisma = {
    user: {
      findUnique: () =>
        Promise.resolve({
          entityId: options.entityId === undefined ? 'entity-a' : options.entityId,
          entity: options.entityId === null ? null : { status: options.entityStatus ?? 'ACTIVE' },
        }),
    },
    course: {
      findFirst: (args: { where: { id: string; ownerEntityId?: string } }) => {
        findFirstArgs.push(args.where);

        const match = courses.find(
          (row) =>
            row.id === args.where.id &&
            (args.where.ownerEntityId === undefined ||
              row.ownerEntityId === args.where.ownerEntityId),
        );

        return Promise.resolve(match ? { id: match.id } : null);
      },
    },
  } as unknown as PrismaService;

  return { service: new EntityScopeService(prisma), findFirstArgs };
}

const account = (role: AuthenticatedUser['role'], id = 'user-1'): AuthenticatedUser => ({
  id,
  email: 'someone@authority.gov.example',
  fullName: 'حساب',
  employeeId: 'EMP-1',
  department: 'الإدارة',
  role,
  sessionId: 'session-1',
});

describe('EntityScopeService', () => {
  describe('resolve', () => {
    it('scopes an entity account to its own organisation', async () => {
      const { service } = harness({ entityId: 'entity-a' });

      await expect(service.resolve(account('ENTITY'))).resolves.toEqual({
        entityId: 'entity-a',
        isSuperAdmin: false,
      });
    });

    it('refuses an entity account with no organisation rather than leaving it unscoped', async () => {
      /*
       * The failure mode this exists to prevent is the quiet one. If a missing
       * scope resolved to "no filter", a half-provisioned account would see
       * every entity's courses and learners — and no test of the happy path
       * would notice, because the happy path is unaffected.
       */
      const { service } = harness({ entityId: null });

      await expect(service.resolve(account('ENTITY'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a suspended organisation', async () => {
      const { service } = harness({ entityId: 'entity-a', entityStatus: 'SUSPENDED' });

      await expect(service.resolve(account('ENTITY'))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('leaves a super-admin deliberately unscoped', async () => {
      /* §4C.5 needs global oversight. The null is a decision, not an omission —
         see the comment on EntityScope. */
      const { service } = harness();

      await expect(service.resolve(account('SUPER_ADMIN'))).resolves.toEqual({
        entityId: null,
        isSuperAdmin: true,
      });
    });

    it('refuses an employee even though the guard should never let one through', async () => {
      /* Defence in depth: the service must be safe when called from a job or a
         Phase 5 controller whose author forgot the decorator. */
      const { service } = harness();

      await expect(service.resolve(account('EMPLOYEE'))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('courseFilter', () => {
    const scopeFor = (entityId: string | null): EntityScope => ({
      entityId,
      isSuperAdmin: entityId === null,
    });

    it('restricts an entity to an equality on its own id', () => {
      const { service } = harness();

      expect(service.courseFilter(scopeFor('entity-a'))).toEqual({ ownerEntityId: 'entity-a' });
    });

    it('does not include unowned courses in an entity’s filter', () => {
      /*
       * A tempting mistake is `{ ownerEntityId: { not: null } }` or a "mine or
       * unclaimed" filter, either of which would show one entity the 40 seeded
       * courses nobody authored. A course with no owner belongs to no entity.
       */
      const { service } = harness();
      const filter = service.courseFilter(scopeFor('entity-a'));

      expect(filter).not.toHaveProperty('ownerEntityId.not');
      expect(filter.ownerEntityId).toBe('entity-a');
    });

    it('applies no filter for a super-admin', () => {
      const { service } = harness();

      expect(service.courseFilter(scopeFor(null))).toEqual({});
    });
  });

  describe('requireOwnedCourse', () => {
    const catalogue: CourseRow[] = [
      { id: 'course-a', ownerEntityId: 'entity-a' },
      { id: 'course-b', ownerEntityId: 'entity-b' },
      { id: 'course-unowned', ownerEntityId: null },
    ];

    const scopeA: EntityScope = { entityId: 'entity-a', isSuperAdmin: false };

    it('returns a course the entity owns', async () => {
      const { service } = harness({ courses: catalogue });

      await expect(service.requireOwnedCourse(scopeA, 'course-a')).resolves.toEqual({
        id: 'course-a',
      });
    });

    it('reports another entity’s course as absent, not as forbidden', async () => {
      /*
       * The distinction leaks. A 403 confirms the id exists and belongs to
       * someone; a 404 tells a prober nothing they did not already know. This is
       * the same reasoning D-045 used for COURSE_NOT_ENROLLED.
       */
      const { service } = harness({ courses: catalogue });

      await expect(service.requireOwnedCourse(scopeA, 'course-b')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reports an unowned course as absent too', async () => {
      const { service } = harness({ courses: catalogue });

      await expect(service.requireOwnedCourse(scopeA, 'course-unowned')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('filters in the query rather than checking after the read', async () => {
      /*
       * Asserted on the query itself because the difference is invisible in the
       * result: fetching by id and comparing afterwards returns the same 404
       * while having already read another entity's row into memory, one
       * forgotten `if` away from returning it.
       */
      const { service, findFirstArgs } = harness({ courses: catalogue });

      await expect(service.requireOwnedCourse(scopeA, 'course-b')).rejects.toThrow();
      expect(findFirstArgs).toEqual([{ id: 'course-b', ownerEntityId: 'entity-a' }]);
    });

    it('lets a super-admin reach any course, including an unowned one', async () => {
      const { service } = harness({ courses: catalogue });
      const admin: EntityScope = { entityId: null, isSuperAdmin: true };

      await expect(service.requireOwnedCourse(admin, 'course-b')).resolves.toEqual({
        id: 'course-b',
      });
      await expect(service.requireOwnedCourse(admin, 'course-unowned')).resolves.toEqual({
        id: 'course-unowned',
      });
    });
  });
});
