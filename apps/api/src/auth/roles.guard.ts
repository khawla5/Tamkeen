import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { UserRole } from '@tamkeen/types';
import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { REQUIRED_ROLES_KEY } from './auth.decorators';
import type { AuthenticatedUser } from './session.service';

/**
 * Enforces role requirements declared with `@Roles(...)` (D-027).
 *
 * Runs after SessionGuard, so `request.user` is already resolved. A denial is
 * audited: a signed-in user probing another portal's endpoints is exactly the
 * signal a security review wants, and it is invisible without this.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    /* No user on a role-restricted endpoint means SessionGuard was bypassed or
       the endpoint is wrongly marked @Public(). Refuse rather than assume. */
    if (!user || !required.includes(user.role)) {
      await this.audit.record({
        action: AuditAction.AUTHZ_DENIED,
        outcome: 'FAILURE',
        actorUserId: user?.id ?? null,
        ipAddress: request.ip ?? null,
        reason: AuditReason.INSUFFICIENT_ROLE,
        detail: { path: request.path, method: request.method },
      });

      throw new ForbiddenException('INSUFFICIENT_ROLE');
    }

    return true;
  }
}
