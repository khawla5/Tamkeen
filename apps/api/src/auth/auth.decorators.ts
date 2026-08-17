import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { UserRole } from '@tamkeen/types';
import type { AuthenticatedUser } from './session.service';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const REQUIRED_ROLES_KEY = 'auth:requiredRoles';

/**
 * Opts an endpoint out of authentication.
 *
 * Authentication is on by default via a global guard, so forgetting a decorator
 * leaves an endpoint *protected* rather than open. Exposure is then always a
 * deliberate, greppable act — `@Public()` — instead of an oversight.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts an endpoint to the given roles (D-027).
 *
 * SUPER_ADMIN is not implicitly granted every role: an admin-only endpoint says
 * so explicitly. Implicit inheritance is how an admin accidentally acquires an
 * employee's write path that was never designed for them.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);

/** Injects the authenticated user resolved by the session guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    return context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
  },
);
