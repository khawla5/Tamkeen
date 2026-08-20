import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuditAction } from '../audit/audit.actions';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from './auth.decorators';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from './session.service';

/**
 * The portal boundaries (D-062).
 *
 * `RolesGuard` shipped in Phase 0 and, until Phase 4, guarded nothing at all —
 * no endpoint declared a role, so an ENTITY account could take the assessment
 * and confirm a path. These tests pin the behaviour now that every controller
 * declares one.
 */

const user = (role: AuthenticatedUser['role']): AuthenticatedUser => ({
  id: 'user-1',
  email: 'someone@ministry.gov.example',
  fullName: 'مستخدم',
  role,
  sessionId: 'session-1',
});

function harness(
  options: {
    required?: string[];
    isPublic?: boolean;
    user?: AuthenticatedUser;
  } = {},
) {
  const audits: AuditEntry[] = [];

  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return options.isPublic;
      if (key === REQUIRED_ROLES_KEY) return options.required;
      return undefined;
    },
  } as unknown as Reflector;

  const audit = {
    record: (entry: AuditEntry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: options.user,
        ip: '198.51.100.7',
        path: '/api/assessment',
        method: 'GET',
      }),
    }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector, audit), context, audits };
}

describe('RolesGuard', () => {
  it('admits a caller holding a required role', async () => {
    const { guard, context } = harness({ required: ['EMPLOYEE'], user: user('EMPLOYEE') });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses an entity account reaching a learner endpoint', async () => {
    /* The concrete gap Phase 4 closed: before any controller declared a role,
       this passed. */
    const { guard, context } = harness({ required: ['EMPLOYEE'], user: user('ENTITY') });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an employee reaching an entity endpoint', async () => {
    const { guard, context } = harness({
      required: ['ENTITY', 'SUPER_ADMIN'],
      user: user('EMPLOYEE'),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant a super-admin an employee-only endpoint implicitly', async () => {
    /*
     * D-027 rejected implicit role inheritance outright: it is how an admin
     * acquires an employee's write path that was never designed for them. An
     * admin endpoint says SUPER_ADMIN explicitly.
     */
    const { guard, context } = harness({ required: ['EMPLOYEE'], user: user('SUPER_ADMIN') });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admits a super-admin to an endpoint that names the role', async () => {
    const { guard, context } = harness({
      required: ['ENTITY', 'SUPER_ADMIN'],
      user: user('SUPER_ADMIN'),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('lets a @Public() route through a controller that declares a role', async () => {
    /*
     * The regression this guards against is severe and easy to cause. Roles are
     * declared at *class* level so a handler added later inherits them rather
     * than being unguarded — but that metadata also reaches the routes which opt
     * out of authentication, and those have no user for a role to be checked
     * against. Without the public branch, putting @Roles('EMPLOYEE') on
     * CertificatesController would have taken down the public certificate
     * verification page (§2, D-016) — consulted by third parties who have no
     * account here at all.
     */
    const { guard, context } = harness({ required: ['EMPLOYEE'], isPublic: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses an unauthenticated caller on a role-restricted endpoint', async () => {
    const { guard, context } = harness({ required: ['EMPLOYEE'] });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an endpoint that declares no role at all', async () => {
    const { guard, context } = harness({ user: user('EMPLOYEE') });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('audits a denial, because a user probing another portal is a security signal', async () => {
    const { guard, context, audits } = harness({ required: ['EMPLOYEE'], user: user('ENTITY') });

    await expect(guard.canActivate(context)).rejects.toThrow();

    expect(audits).toContainEqual(
      expect.objectContaining({
        action: AuditAction.AUTHZ_DENIED,
        outcome: 'FAILURE',
        actorUserId: 'user-1',
      }),
    );
  });
});
