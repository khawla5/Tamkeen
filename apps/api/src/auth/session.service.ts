import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';

import { AppConfigService } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { expiryFromNow, generateToken, hashToken } from '../common/secure-token';
import type { UserRole } from '@tamkeen/types';

export const SESSION_COOKIE = 'tamkeen_session';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  role: UserRole;
  sessionId: string;
}

export interface SessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Server-side session lifecycle (D-028).
 *
 * Opaque random tokens rather than JWTs, so revocation is immediate: suspending
 * an account or signing out invalidates the session on the next request instead
 * of waiting for a token to expire.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Issues a session and returns the raw token — the only time it exists. */
  async create(userId: string, context: SessionContext = {}): Promise<string> {
    const token = generateToken();

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: expiryFromNow(this.config.get('SESSION_TTL_MINUTES')),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
      },
    });

    return token;
  }

  /**
   * Resolves a raw token to its user, or null.
   *
   * Rejects expired, revoked and suspended-owner sessions in the same query, so
   * an administrator suspending an account takes effect on the next request
   * rather than at the session's natural expiry.
   */
  async resolve(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            employeeId: true,
            department: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }

    if (session.user.status !== 'ACTIVE') {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      employeeId: session.user.employeeId,
      department: session.user.department,
      role: session.user.role,
      sessionId: session.id,
    };
  }

  /**
   * Slides the expiry forward. Called on authenticated requests so an active
   * user is not signed out mid-task, while an idle session still lapses.
   *
   * `lastSeenAt` is only written when it is more than a minute stale: otherwise
   * every request to every endpoint becomes a database write.
   */
  async touch(sessionId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - 60_000);

    await this.prisma.session.updateMany({
      where: { id: sessionId, lastSeenAt: { lt: staleBefore } },
      data: {
        lastSeenAt: new Date(),
        expiresAt: expiryFromNow(this.config.get('SESSION_TTL_MINUTES')),
      },
    });
  }

  /** Marks a session revoked, keeping the row so it stays visible to an audit. */
  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every session for a user. Used after a password reset: whoever
   * changed the password keeps their new session, and any session an attacker
   * still holds dies with the old credential.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieOptions(): CookieOptions {
    const isProduction = this.config.isProduction;

    return {
      httpOnly: true,
      /* Not readable by JavaScript, so an XSS bug cannot exfiltrate the session. */
      secure: isProduction,
      /* `strict` is viable because the web app and the API are same-site in
         every intended deployment; it removes most CSRF surface on its own, and
         the double-submit token covers the rest. */
      sameSite: 'strict',
      path: '/',
      maxAge: this.config.get('SESSION_TTL_MINUTES') * 60_000,
    };
  }

  attach(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }
}
