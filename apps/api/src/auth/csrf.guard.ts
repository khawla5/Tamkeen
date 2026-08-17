import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { tokensMatch } from '../common/secure-token';

export const CSRF_COOKIE = 'tamkeen_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection (§2 security baseline).
 *
 * The session cookie is `SameSite=strict`, which already blocks cross-site
 * requests in every modern browser. This is the second layer, for the cases
 * SameSite does not cover: an older browser, or a same-site subdomain that
 * becomes attacker-controlled.
 *
 * The token is a random value set in a **readable** cookie and echoed back in a
 * header. An attacker's page can cause a request to be sent, but the same-origin
 * policy stops it reading our cookie, so it cannot produce the header. No server
 * state is needed, which is why this is a cookie/header pair rather than a
 * per-form nonce.
 *
 * Safe methods are exempt: they must not change state, so forging one achieves
 * nothing.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.[CSRF_COOKIE];
    const headerValue = request.headers[CSRF_HEADER];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenException('CSRF_TOKEN_INVALID');
    }

    return true;
  }
}
