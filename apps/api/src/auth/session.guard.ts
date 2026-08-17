import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from './auth.decorators';
import { SESSION_COOKIE, SessionService, type AuthenticatedUser } from './session.service';

/**
 * Authenticates every request from the session cookie.
 *
 * Registered globally and **fail-closed**: an endpoint is protected unless it
 * carries `@Public()`. The alternative — opt-in protection — means a new
 * controller written in a later phase is unauthenticated until someone
 * remembers to guard it, which is a security posture that depends on memory.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];

    /*
     * Public endpoints still resolve the session when one is present, so a
     * handler can behave differently for a signed-in caller (e.g. the courses
     * catalogue, which is browsable before the assessment). They just never
     * require it.
     */
    if (token) {
      const user = await this.sessions.resolve(token);
      if (user) {
        request.user = user;
        await this.sessions.touch(user.sessionId);
      }
    }

    if (isPublic) {
      return true;
    }

    if (!request.user) {
      throw new UnauthorizedException('AUTH_REQUIRED');
    }

    return true;
  }
}
