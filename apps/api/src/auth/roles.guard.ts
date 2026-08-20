import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { UserRole } from '@tamkeen/types';
import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from './auth.decorators';
import type { AuthenticatedUser } from './session.service';

/**
 * Enforces role requirements declared with `@Roles(...)` (D-027, D-062).
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
    /*
     * A public endpoint has no role requirement by definition, and this check
     * has to come first.
     *
     * `@Roles(...)` is declared at *class* level so that a handler added later
     * inherits it rather than being unguarded until someone remembers — which
     * is the same fail-closed reasoning SessionGuard uses. But class-level
     * metadata also reaches the handlers that opt out of authentication, and
     * those have no user for a role to be checked against. Without this branch,
     * marking a controller `@Roles('EMPLOYEE')` would silently take down its
     * `@Public()` routes: the public certificate verification page (D-016) is
     * one such route, and it is consulted by third parties who have no account
     * here at all.
     */
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

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
